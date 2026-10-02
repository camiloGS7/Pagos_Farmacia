"""
Escucha permanente: mantiene una conexion IMAP abierta contra Gmail en modo
IDLE y registra el pago en Neon a los pocos segundos de que llegue el correo
de Nequi, en vez de esperar el proximo ciclo programado.

Que cambia frente a procesar_pagos.py:

    procesar_pagos.py   corre, pregunta "hay algo nuevo?", guarda y se muere.
                        Lo lanza GitHub Actions cada 5-10 minutos.
    escuchar_pagos.py   no se muere: le dice a Gmail "avisame cuando llegue
                        algo" y se queda ahi. Pensado para Railway.

Toda la logica de parseo y de guardado se reutiliza de procesar_pagos.py por
import: aqui no hay una segunda copia del parser que se pueda quedar atras el
dia que Nequi cambie la plantilla del correo.

Los dos pueden convivir, y de hecho conviene: este reacciona rapido, y el de
GitHub Actions queda como red de seguridad para lo que este se pierda mientras
estuvo caido o reiniciandose. Correr los dos no duplica nada -- el UNIQUE en
numero_transaccion lo impide.

Igual que ellos, este script mira TODOS los correos de la ventana, leidos y no
leidos: que alguien abra la notificacion en el celular antes de que el pago
quede guardado no lo deja afuera. Lo unico que decide si un pago ya se
registro es el UNIQUE en numero_transaccion, nunca la bandera de leido.

Requiere las mismas tres variables que procesar_pagos.py (GMAIL_ACCOUNT,
GMAIL_APP_PASSWORD, NEON_CONEXION_STR). En Railway se configuran como
variables del servicio; en tu computador salen del .env de esta carpeta.

Uso:
    pip install -r requirements.txt
    python escuchar_pagos.py       # queda corriendo hasta que lo pares con Ctrl-C
"""

import email
import logging
import signal
import sys
import time
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone

import psycopg2
from imapclient import SEEN, IMAPClient
from imapclient.exceptions import LoginError

from procesar_pagos import (
    APP_PASSWORD,
    CONEXION_STR,
    DIAS_DE_MARGEN,
    EMAIL_ACCOUNT,
    IMAP_PORT,
    IMAP_SERVER,
    REMITENTE_NEQUI,
    asunto_de,
    crear_tabla,
    es_notificacion_ignorable,
    extraer_datos,
    extraer_html,
    guardar_transaccion,
    numeros_ya_guardados,
)

# Cada cuanto cortar el IDLE y volver a abrirlo. Gmail corta por su cuenta un
# IDLE que lleve demasiado tiempo (la documentacion habla de ~29 minutos), y
# una conexion cortada por el servidor no siempre avisa: se queda muda. Aqui se
# refresca mucho antes a proposito, porque cada refresco es tambien una
# revision completa de la bandeja: si un aviso de IDLE se perdiera por lo que
# sea, el pago no espera mas de este rato en registrarse.
SEGUNDOS_REFRESCO_IDLE = 10 * 60

# Timeout de socket para los comandos normales (login, search, fetch). No
# afecta al IDLE: imapclient espera ahi con poll(), no con el timeout del
# socket. Sirve para que un comando contra un servidor que dejo de responder
# falle en un minuto y entre al camino de reconexion, en vez de colgarse.
SEGUNDOS_TIMEOUT_SOCKET = 60

# Reconexion: se empieza en 30 segundos y se va doblando hasta el tope. Si
# Gmail esta rechazando conexiones, insistir cada 30 segundos para siempre solo
# sirve para que nos empiece a bloquear.
SEGUNDOS_REINTENTO = 30
SEGUNDOS_REINTENTO_MAX = 5 * 60

# Las respuestas de IDLE que significan "entro algo a la bandeja". Las demas
# (el "Still here" con que Gmail mantiene viva la conexion, los cambios de
# bandera cuando abres un correo en el celular) no ameritan ir a buscar.
AVISOS_DE_CORREO_NUEVO = (b"EXISTS", b"RECENT")

# Colombia no usa horario de verano desde 1993, asi que el desfase es fijo. Se
# pone explicito porque Railway corre en UTC: sin esto los logs irian cinco
# horas adelante de la hora de la farmacia y comparar un log con un pago seria
# un ejercicio de aritmetica mental.
ZONA_COLOMBIA = timezone(timedelta(hours=-5))


class ParadaSolicitada(Exception):
    """Nos pidieron parar: un Ctrl-C, o el SIGTERM de Railway al redesplegar."""


def _pedir_parada(numero_de_senal, _marco):
    """Convierte la senal en una excepcion para cortar la espera del IDLE.

    Sin esto el proceso seguiria bloqueado en idle_check hasta el proximo
    refresco, y Railway lo mataria a lo bruto a los pocos segundos. Lanzar
    desde el manejador interrumpe la espera al instante y deja que el cierre
    ordenado (logout) alcance a correr.
    """
    raise ParadaSolicitada(signal.Signals(numero_de_senal).name)


class FormatoConHoraLocal(logging.Formatter):
    def formatTime(self, registro, datefmt=None):
        momento = datetime.fromtimestamp(registro.created, ZONA_COLOMBIA)
        return momento.strftime("%Y-%m-%d %H:%M:%S")


def configurar_log():
    """Logs por stdout, con hora de Colombia.

    Este proceso vive en un servidor sin pantalla: los logs son la unica forma
    de saber que esta pasando. line_buffering fuerza que cada linea salga en el
    momento: cuando stdout no es una terminal, Python acumula hasta llenar un
    buffer de 8 KB, y en Railway eso se ve como un proceso mudo durante horas.

    Las funciones que se reutilizan de procesar_pagos.py imprimen con print en
    vez de logging, asi que sus lineas salen sin hora. Es a proposito: no vale
    la pena tocar el script que ya funciona en produccion por un detalle de
    formato, y aparecen igual en el log de Railway.
    """
    sys.stdout.reconfigure(line_buffering=True)
    salida = logging.StreamHandler(sys.stdout)
    salida.setFormatter(FormatoConHoraLocal("%(asctime)s  %(message)s"))
    logging.basicConfig(level=logging.INFO, handlers=[salida])


@contextmanager
def base_de_datos():
    """Una conexion a Neon de un solo uso, abierta solo mientras se necesita.

    A proposito no se guarda una conexion abierta durante toda la vida del
    proceso: entre pago y pago pueden pasar horas, y el pooler de Neon cierra
    las conexiones ociosas. La conexion guardada estaria muerta justo cuando
    llega el pago que hay que registrar. Abrir una por tanda cuesta unos
    milisegundos y nunca esta rancia.
    """
    conexion = psycopg2.connect(CONEXION_STR)
    try:
        yield conexion
    finally:
        conexion.close()


def conectar():
    cliente = IMAPClient(
        IMAP_SERVER, port=IMAP_PORT, ssl=True, timeout=SEGUNDOS_TIMEOUT_SOCKET
    )
    cliente.login(EMAIL_ACCOUNT, APP_PASSWORD)

    # Sin IDLE no hay nada que hacer aqui; mejor decirlo claro que quedarse
    # esperando un aviso que el servidor nunca va a mandar.
    if not cliente.has_capability("IDLE"):
        raise RuntimeError("El servidor IMAP no ofrece IDLE; este script no sirve contra el.")

    cliente.select_folder("INBOX")
    logging.info(
        "Conectado a %s como %s; bandeja INBOX seleccionada.", IMAP_SERVER, EMAIL_ACCOUNT
    )
    return cliente


def cerrar(cliente):
    """Cierra la sesion sin estorbar: si ya estaba caida, da igual."""
    if cliente is None:
        return
    try:
        cliente.logout()
    except Exception:
        # Un logout sobre una conexion ya rota (o en pleno IDLE) falla. No
        # importa: lo unico que queda por hacer es soltar el socket.
        try:
            cliente.shutdown()
        except Exception:
            pass


def buscar_recientes(cliente):
    """UIDs de los correos de Nequi de los ultimos dias, leidos y no leidos.

    A proposito NO se filtra por UNSEEN, igual que en procesar_pagos.py y
    reconciliar.py. La bandera de leido no es nuestra: la cambias tu cada vez
    que abres una notificacion en el celular, o Gmail en el navegador al
    mostrarte la bandeja. Un correo que alguien alcanzo a abrir antes de que
    este script lo procesara dejaba de ser UNSEEN y se volvia invisible para
    siempre, aunque el pago nunca hubiera llegado a Neon. Rapido no es lo
    mismo que inmediato: la ventana era de segundos, pero existia.

    Lo que decide si un pago ya se registro es el UNIQUE en numero_transaccion.
    Eso si es nuestro y nadie mas lo toca.

    El SINCE no es un filtro de duplicados, es solo un tope: sin el, cada ciclo
    de 10 minutos volveria a escanear la bandeja entera, y la corrida se iria
    alargando sola para siempre. Con DIAS_DE_MARGEN=1 la ventana son entre 24
    y 48 horas (SINCE trabaja por dias, no por horas), de sobra para cubrir el
    desfase UTC vs Colombia; los barridos mas amplios los hace reconciliar.py.

    La fecha va como objeto date y la convierte imapclient, que trae su propia
    tabla de meses en ingles: no depende del idioma del sistema.
    """
    desde = date.today() - timedelta(days=DIAS_DE_MARGEN)
    return cliente.search(["FROM", REMITENTE_NEQUI, "SINCE", desde])


def cuerpo_crudo(respuesta):
    """El correo completo en bytes, dentro de la respuesta de un fetch.

    Se pide BODY.PEEK[] pero el servidor contesta bajo la llave BODY[] (el
    PEEK solo le dice "no me lo marques como leido"). Se miran las dos llaves,
    y RFC822 por si algun dia el servidor contesta a la antigua.
    """
    for llave in (b"BODY[]", b"BODY.PEEK[]", b"RFC822"):
        if llave in respuesta:
            return respuesta[llave]
    return None


def procesar_correo(cliente, conexion_db, uid, ya_guardados):
    """Guarda el pago de un correo y lo marca como leido. Devuelve True si
    quedo resuelto; False solo cuando algo merece que alguien lo mire.

    Es la misma secuencia de procesar_pagos.py, traducida a imapclient: traer
    con PEEK, guardar, y marcar como leido unicamente si el guardado salio
    bien.

    Marcar como leido ya no decide nada -- la busqueda ignora esa bandera --,
    pero se sigue haciendo por dos razones: te deja la bandeja limpia de lo que
    ya quedo cobrado, y mantiene el mismo comportamiento de procesar_pagos.py.
    El orden (marcar solo despues de guardar) tambien se mantiene: asi lo que
    ves sin leer en el telefono es de verdad lo que nadie pudo registrar.
    """
    respuesta = cliente.fetch([uid], ["BODY.PEEK[]"]).get(uid)
    crudo = cuerpo_crudo(respuesta) if respuesta else None
    if crudo is None:
        logging.warning("No se pudo traer el correo UID %s; queda sin leer.", uid)
        return False

    mensaje = email.message_from_bytes(crudo)
    asunto = asunto_de(mensaje)

    html = extraer_html(mensaje)
    if not html:
        logging.warning("El correo UID %s (%r) no tiene parte HTML.", uid, asunto)
        return False

    datos = extraer_datos(html)
    if not datos:
        # Sin tabla de detalle no hay nada que guardar. Puede ser una
        # notificacion que no es una venta (normal, se descarta) o una venta
        # cuya plantilla cambio (grave, hay que mirarla).
        if es_notificacion_ignorable(asunto):
            cliente.add_flags([uid], [SEEN])
            logging.info("UID %s: %r no es una venta; marcado como leido.", uid, asunto)
            return True

        logging.error(
            "ATENCION: correo de Nequi sin tabla de detalle y con asunto desconocido: %r. "
            "Puede que hayan cambiado la plantilla; corre obtener_correo_nequi.py para ver "
            "el HTML nuevo. Lo dejo sin leer para que no se pierda.",
            asunto,
        )
        return False

    # Atajo: ya lo tenemos, no hay que volver a escribir en la base. Mismo
    # criterio que procesar_pagos.py. Ahora que la busqueda trae los correos
    # leidos tambien, sin este atajo cada ciclo intentaria reinsertar todos los
    # pagos del dia para que el UNIQUE los rebote uno por uno: cientos de
    # escrituras fallidas por hora contra Neon, para nada.
    if datos.get("Número de transacción") in ya_guardados:
        cliente.add_flags([uid], [SEEN])
        return True

    # guardar_transaccion devuelve True tambien cuando el pago ya estaba en la
    # base (choca contra el UNIQUE): ya quedo procesado, se puede marcar igual.
    if guardar_transaccion(conexion_db, datos):
        cliente.add_flags([uid], [SEEN])
        return True

    logging.warning("UID %s no se pudo guardar; queda sin leer para revisarlo.", uid)
    return False


def revisar_bandeja(cliente, motivo, resueltos):
    """Procesa los correos de la ventana que no se hayan resuelto ya en esta
    conexion. Nunca deja subir el error de un correo suelto: el proceso tiene
    que seguir escuchando los que vienen.

    'resueltos' es el conjunto de UIDs que ya se dieron por terminados desde
    que se abrio esta conexion. Es solo una optimizacion para no volver a
    bajar de Gmail los mismos correos cada diez minutos: sin el, en estado
    estable cada ciclo descargaria todos los correos del dia completos (unos
    16 KB cada uno) para terminar descubriendo que ya estaban todos.

    No es un mecanismo de "ya procesado" -- ese sigue siendo el UNIQUE en la
    base. La diferencia con la bandera de leido, que es justo lo que acabamos
    de dejar de usar, es que esto es nuestro: solo entra aqui un UID que esta
    funcion dio por resuelto, nadie lo cambia desde un celular, y al
    reconectar arranca vacio y se verifica todo otra vez contra Neon.
    """
    uids = buscar_recientes(cliente)
    nuevos = [uid for uid in uids if uid not in resueltos]
    if not nuevos:
        logging.info(
            "Nada nuevo: %d correo(s) en la ventana, todos ya resueltos (%s).",
            len(uids),
            motivo,
        )
        return

    logging.info(
        "%d correo(s) por revisar de %d en la ventana (%s).", len(nuevos), len(uids), motivo
    )
    with base_de_datos() as conexion_db:
        # Una sola consulta para saber que pagos ya estan en Neon, en vez de un
        # INSERT por correo que el UNIQUE tenga que rebotar.
        ya_guardados = numeros_ya_guardados(conexion_db)
        for uid in nuevos:
            try:
                if procesar_correo(cliente, conexion_db, uid, ya_guardados):
                    resueltos.add(uid)
            except Exception:
                # Un correo raro no puede tumbar el proceso. Queda el detalle
                # completo en el log, el correo sin resolver (asi se reintenta
                # en el proximo ciclo), y seguimos.
                logging.exception(
                    "Error inesperado con el correo UID %s; sigo escuchando.", uid
                )


def hay_correo_nuevo(respuestas):
    for respuesta in respuestas:
        for parte in respuesta:
            if isinstance(parte, bytes) and parte.upper() in AVISOS_DE_CORREO_NUEVO:
                return True
    return False


def escuchar(cliente):
    """Bucle de escucha. Solo sale lanzando: o se cayo la conexion, o nos
    pidieron parar.
    """
    # UIDs ya resueltos, solo mientras viva esta conexion. Al reconectar
    # arranca vacio a proposito: una conexion nueva vuelve a contrastar toda
    # la ventana contra Neon, sin fiarse de nada que quedara en memoria.
    resueltos = set()

    # Primera pasada antes de entrar en IDLE: recupera lo que llego mientras no
    # habia nadie escuchando (un redeploy de Railway, un corte de red, la
    # primera vez que arranca), lo hayan abierto en el celular o no.
    revisar_bandeja(cliente, "al conectar", resueltos)

    while True:
        cliente.idle()
        logging.info(
            "En IDLE, esperando correos de Nequi (refresco en %d minuto(s)).",
            SEGUNDOS_REFRESCO_IDLE // 60,
        )

        empezo = time.monotonic()
        respuestas = cliente.idle_check(timeout=SEGUNDOS_REFRESCO_IDLE)
        esperados = time.monotonic() - empezo

        # idle_check devuelve una lista vacia en dos casos muy distintos: se
        # acabo el plazo sin novedades, o el servidor cerro la conexion por
        # debajo. La pista es el reloj: un socket cerrado contesta "no hay
        # nada" al instante, no al final del plazo. Sin esta comprobacion el
        # proceso se quedaria girando en vacio contra una conexion muerta,
        # creyendo que simplemente no han entrado pagos.
        if not respuestas and esperados < SEGUNDOS_REFRESCO_IDLE / 2:
            raise ConnectionError(
                f"El IDLE volvio vacio a los {esperados:.1f}s de un plazo de "
                f"{SEGUNDOS_REFRESCO_IDLE}s: la conexion parece cerrada."
            )

        # El DONE arrastra los avisos que llegaron entre el idle_check y este
        # momento. Se suman para no perder un correo que entre justo ahi.
        _, pendientes = cliente.idle_done()
        respuestas += pendientes
        logging.info(
            "Salgo de IDLE tras %.0f s (%d respuesta(s)).", esperados, len(respuestas)
        )

        if hay_correo_nuevo(respuestas):
            revisar_bandeja(cliente, "aviso de IDLE", resueltos)
        else:
            # Se revisa igual en cada refresco. Cuesta una busqueda cada diez
            # minutos y cubre el caso de un aviso perdido.
            revisar_bandeja(cliente, "refresco de IDLE", resueltos)


def bucle_principal():
    espera = SEGUNDOS_REINTENTO
    while True:
        cliente = None
        try:
            cliente = conectar()
            espera = SEGUNDOS_REINTENTO  # conexion buena: se reinicia el backoff
            escuchar(cliente)

        except ParadaSolicitada:
            cerrar(cliente)
            raise

        except LoginError as error:
            # Credenciales malas: reintentar cada 30 segundos no las va a
            # arreglar, y Google empieza a bloquear la cuenta por los intentos
            # fallidos. Mejor morir con el motivo claro en el log.
            cerrar(cliente)
            raise SystemExit(
                f"Gmail rechazo el login ({error}). Revisa GMAIL_ACCOUNT y "
                f"GMAIL_APP_PASSWORD: la contrasena de aplicacion se revoca sola "
                f"si cambias la clave de la cuenta."
            )

        except Exception:
            # Cae aqui cualquier cosa que corte la escucha: Gmail cerro la
            # conexion, se fue la red, o Neon no contesto. El traceback
            # completo queda en el log; el camino a seguir es el mismo en
            # todos los casos, reconectar de cero.
            logging.exception("Se corto la escucha.")
            cerrar(cliente)
            logging.info("Reconecto en %d segundo(s).", espera)
            time.sleep(espera)
            espera = min(espera * 2, SEGUNDOS_REINTENTO_MAX)


def main():
    configurar_log()
    signal.signal(signal.SIGINT, _pedir_parada)
    signal.signal(signal.SIGTERM, _pedir_parada)

    logging.info("Arrancando el escucha de pagos de Nequi.")
    with base_de_datos() as conexion_db:
        crear_tabla(conexion_db)
    logging.info("Tabla transacciones lista en Neon.")

    try:
        bucle_principal()
    except ParadaSolicitada as senal:
        logging.info("Recibi %s: cierro la conexion y salgo.", senal)


if __name__ == "__main__":
    main()
