"""
Script de produccion: revisa los correos de Nequi de los ultimos dias, los
parsea, y guarda en Neon los que falten. Pensado para correr repetidamente
(cada 5-10 minutos) via GitHub Actions.

Mira TODOS los correos de la ventana, leidos y no leidos. Lo que decide si un
pago ya se registro es la base de datos (el UNIQUE en numero_transaccion), no
la bandera de leido de Gmail: esa bandera cambia sola cada vez que abres una
notificacion en el celular, y fiarse de ella dejaba pagos sin registrar.

Requiere tres variables (no hay credenciales escritas aqui):
    GMAIL_ACCOUNT        -> tu correo de gmail
    GMAIL_APP_PASSWORD   -> la contrasena de aplicacion de Google
    NEON_CONEXION_STR    -> la cadena de conexion de Neon (con pooling)

De donde salen esas variables:
    - En tu computador: del archivo .env que esta junto a este script.
    - En GitHub Actions: de los secrets del repositorio.

Instala las librerias necesarias una vez:
    pip install -r requirements.txt
"""

import os
import imaplib
import email
from email.header import decode_header, make_header
from datetime import date, datetime, timedelta
from pathlib import Path

import psycopg2
import psycopg2.errors
from bs4 import BeautifulSoup

# En GitHub Actions las credenciales ya vienen como variables de entorno reales
# y python-dotenv ni siquiera esta instalado, por eso el import es opcional.
# load_dotenv nunca pisa una variable que ya exista, asi que los dos modos
# (local con .env / Actions con secrets) conviven sin estorbarse.
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).with_name(".env"))
except ImportError:
    pass


def variable_requerida(nombre):
    valor = os.environ.get(nombre)
    if not valor:
        raise SystemExit(
            f"\nFalta la variable {nombre}.\n\n"
            f"  En tu computador: abre el archivo .env que esta junto a este\n"
            f"  script y llena esa linea. Si nunca instalaste python-dotenv:\n"
            f"      pip install python-dotenv\n\n"
            f"  En GitHub Actions: agregala como secret del repositorio.\n"
        )
    return valor


EMAIL_ACCOUNT = variable_requerida("GMAIL_ACCOUNT")
APP_PASSWORD = variable_requerida("GMAIL_APP_PASSWORD")
CONEXION_STR = variable_requerida("NEON_CONEXION_STR")

IMAP_SERVER = "imap.gmail.com"
IMAP_PORT = 993
REMITENTE_NEQUI = "notificaciones@nequi.com.co"
# Cuantos dias hacia atras mirar en cada corrida. Uno sobra para cubrir el
# desfase UTC vs Colombia (5 horas); barridos mas amplios los hace reconciliar.py
# una vez al dia. Subirlo aqui solo hace cada corrida mas lenta.
DIAS_DE_MARGEN = 1

MESES_IMAP = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Nequi usa el mismo remitente para cosas que NO son ventas. La conocida hasta
# hoy es el aviso de cuando TU envias plata desde la cuenta ("Enviaste plata
# por Bre-B"): no es un ingreso y no trae la tabla detalleVenta.
#
# Se listan uno por uno a proposito. La regla facil seria "si no parsea, se
# ignora", pero entonces el dia que Nequi cambie la plantilla de las ventas
# esas ventas se colarian por el mismo desague y dejarian de registrarse en
# silencio. Asi, lo desconocido da la cara.
ASUNTOS_QUE_NO_SON_VENTAS = ("enviaste plata",)


def fecha_imap(dia):
    """Formatea una fecha como la espera IMAP: 05-Aug-2026.

    A proposito no usamos strftime("%d-%b-%Y"): el %b depende del locale del
    sistema, y en un equipo configurado en espanol devolveria "ago", que el
    servidor rechaza. El fallo seria silencioso y raro de diagnosticar.
    """
    return f"{dia.day:02d}-{MESES_IMAP[dia.month - 1]}-{dia.year}"


def conectar_gmail():
    conexion = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
    conexion.login(EMAIL_ACCOUNT, APP_PASSWORD)
    return conexion


def buscar_correos_recientes(conexion):
    """Todos los correos de Nequi de los ultimos dias, leidos o no.

    A proposito NO se filtra por UNSEEN. La bandera de leido de Gmail no es
    nuestra: la cambias tu cada vez que abres una notificacion en el celular.
    Usarla como marca de "ya procesado" costo 18 pagos sin registrar en un
    solo dia -- los que se abrieron en el telefono antes de que corriera el
    script quedaban invisibles para siempre.

    La marca real de "ya procesado" es la base de datos, via el UNIQUE en
    numero_transaccion. Eso si es nuestro y nadie mas lo toca.
    """
    typ, _ = conexion.select("INBOX")
    if typ != "OK":
        raise RuntimeError("No se pudo abrir la bandeja de entrada (INBOX).")

    # La ventana solo evita escanear anos de historial. Con un dia de margen
    # sobra para cubrir el desfase UTC vs Colombia (5 horas), y reconciliar.py
    # barre una ventana mas amplia una vez al dia.
    fecha_desde = fecha_imap(date.today() - timedelta(days=DIAS_DE_MARGEN))

    typ, mensajes = conexion.search(
        None, "SINCE", fecha_desde, "FROM", f'"{REMITENTE_NEQUI}"'
    )
    if typ != "OK":
        raise RuntimeError("La busqueda IMAP fallo.")
    return mensajes[0].split()


def numeros_ya_guardados(conexion_db):
    """Los numeros de transaccion que ya estan en la base, dentro de la ventana
    que vamos a revisar.

    Se consultan de una sola vez para poder saltarse los correos ya conocidos
    sin lanzar un INSERT por cada uno que despues rebote contra el UNIQUE. Con
    una corrida cada 10 minutos eso serian miles de escrituras fallidas al dia
    contra Neon, para nada.

    El UNIQUE sigue siendo la garantia de verdad; esto es solo un atajo.
    """
    with conexion_db.cursor() as cur:
        cur.execute(
            """
            SELECT numero_transaccion FROM transacciones
            WHERE fecha_hora >= (now() AT TIME ZONE 'America/Bogota')::date - %s
            """,
            (DIAS_DE_MARGEN + 1,),
        )
        return {fila[0] for fila in cur.fetchall()}


def extraer_html(mensaje):
    if mensaje.is_multipart():
        for parte in mensaje.walk():
            if parte.get_content_type() == "text/html":
                return parte.get_payload(decode=True).decode(errors="ignore")
        return None
    return mensaje.get_payload(decode=True).decode(errors="ignore")


def asunto_de(mensaje):
    """El asunto en texto legible (viene codificado en MIME)."""
    bruto = mensaje.get("Subject", "")
    try:
        return str(make_header(decode_header(bruto)))
    except Exception:
        return bruto


def es_notificacion_ignorable(asunto):
    minusculas = asunto.lower()
    return any(patron in minusculas for patron in ASUNTOS_QUE_NO_SON_VENTAS)


def extraer_datos(html_correo):
    soup = BeautifulSoup(html_correo, "html.parser")
    tabla = soup.find("table", class_="detalleVenta")
    if tabla is None:
        return {}
    datos = {}
    for fila in tabla.find_all("tr"):
        etiqueta = fila.find("th")
        valor = fila.find("td")
        if etiqueta and valor:
            clave = etiqueta.get_text(strip=True).rstrip(":")
            datos[clave] = valor.get_text(strip=True)
    return datos


def parsear_monto(texto_monto):
    limpio = texto_monto.replace("$", "").strip()
    limpio = limpio.replace(".", "").replace(",", ".")  # por si algun dia hay centavos
    return int(float(limpio))


def parsear_fecha(fecha_texto):
    return datetime.strptime(fecha_texto, "%d/%m/%Y %H:%M:%S")


def crear_tabla(conexion_db):
    with conexion_db.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS transacciones (
                id SERIAL PRIMARY KEY,
                numero_transaccion TEXT NOT NULL UNIQUE,
                monto BIGINT NOT NULL,
                estado TEXT NOT NULL,
                fecha_hora TIMESTAMP NOT NULL,
                pagador TEXT,
                banco TEXT,
                referencia TEXT,
                metodo_pago TEXT,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
    conexion_db.commit()


def guardar_transaccion(conexion_db, datos):
    campos_obligatorios = ["Monto", "Número de transacción", "Fecha", "Estado"]
    faltantes = [c for c in campos_obligatorios if c not in datos]
    if faltantes:
        print(f"Correo sin los campos esperados {faltantes}; se deja sin marcar para revisarlo a mano.")
        return False

    try:
        monto = parsear_monto(datos["Monto"])
        fecha = parsear_fecha(datos["Fecha"])

        with conexion_db.cursor() as cur:
            cur.execute("""
                INSERT INTO transacciones
                    (numero_transaccion, monto, estado, fecha_hora, pagador, banco, referencia, metodo_pago)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                datos["Número de transacción"], monto, datos["Estado"], fecha,
                datos.get("Pagador"), datos.get("Banco"),
                datos.get("Referencia"), datos.get("Método de pago"),
            ))
        conexion_db.commit()
        print(f"Guardado: {datos.get('Pagador')} pago {monto}")
        return True

    except psycopg2.errors.UniqueViolation:
        conexion_db.rollback()
        print("Ya estaba guardada, no se duplico.")
        return True  # ya quedo procesada antes, se puede marcar como leida igual

    except Exception as e:
        conexion_db.rollback()
        print(f"No se pudo guardar este correo ({e}); se deja sin marcar para revisarlo a mano.")
        return False


def marcar_leido(conexion_gmail, id_correo):
    conexion_gmail.store(id_correo, "+FLAGS", "\\Seen")


def procesar_correo(conexion_gmail, conexion_db, id_correo, ya_guardados):
    """Devuelve (resuelto, guardado_ahora).

    resuelto = False solo cuando algo merece que alguien lo mire.
    """
    # BODY.PEEK[] en vez de RFC822: RFC822 marca el correo como leido
    # apenas se pide, sin importar si despues falla el guardado.
    # PEEK trae el mismo contenido sin tocar esa bandera.
    typ, datos_correo = conexion_gmail.fetch(id_correo, "(BODY.PEEK[])")
    if typ != "OK" or not datos_correo or datos_correo[0] is None:
        print(f"No se pudo traer el correo {id_correo}.")
        return False, False

    mensaje = email.message_from_bytes(datos_correo[0][1])
    asunto = asunto_de(mensaje)

    html = extraer_html(mensaje)
    if not html:
        print(f"El correo {id_correo} no tiene parte HTML.")
        return False, False

    datos = extraer_datos(html)
    if not datos:
        # Sin tabla de detalle no hay nada que guardar. Puede ser una
        # notificacion que no es una venta (normal, se descarta) o una venta
        # cuya plantilla cambio (grave, hay que mirarla).
        if es_notificacion_ignorable(asunto):
            marcar_leido(conexion_gmail, id_correo)
            return True, False

        print(
            f"ATENCION: correo de Nequi sin tabla de detalle y con asunto "
            f"desconocido: {asunto!r}. Puede que hayan cambiado la plantilla; "
            f"corre obtener_correo_nequi.py para ver el HTML nuevo."
        )
        return False, False

    # Atajo: ya lo tenemos, no hay que volver a escribir en la base.
    if datos.get("Número de transacción") in ya_guardados:
        marcar_leido(conexion_gmail, id_correo)
        return True, False

    if guardar_transaccion(conexion_db, datos):
        marcar_leido(conexion_gmail, id_correo)
        return True, True
    return False, False


def main():
    conexion_gmail = None
    conexion_db = None
    fallidos = 0
    try:
        conexion_gmail = conectar_gmail()
        conexion_db = psycopg2.connect(CONEXION_STR)
        crear_tabla(conexion_db)

        ya_guardados = numeros_ya_guardados(conexion_db)
        ids = buscar_correos_recientes(conexion_gmail)
        print(
            f"{len(ids)} correo(s) de Nequi en los ultimos "
            f"{DIAS_DE_MARGEN + 1} dia(s); {len(ya_guardados)} ya en la base."
        )

        nuevos = 0
        for id_correo in ids:
            try:
                resuelto, guardado = procesar_correo(
                    conexion_gmail, conexion_db, id_correo, ya_guardados
                )
                if guardado:
                    nuevos += 1
                if not resuelto:
                    fallidos += 1
            except Exception as e:
                # un correo raro no debe tumbar el resto de la corrida
                print(f"Error inesperado con el correo {id_correo}: {e}")
                fallidos += 1

        print(f"Resumen: {nuevos} pago(s) nuevo(s), {fallidos} sin procesar.")

    finally:
        if conexion_gmail is not None:
            conexion_gmail.logout()
        if conexion_db is not None:
            conexion_db.close()

    # Salir con codigo != 0 hace que GitHub Actions marque la corrida en rojo y
    # te mande un correo. Sin esto, el dia que Nequi cambie la plantilla del
    # correo el parser dejaria de encontrar los datos en silencio: los correos
    # quedarian sin marcar (bien, no se pierde nada) pero nadie se enteraria.
    if fallidos:
        raise SystemExit(
            f"{fallidos} correo(s) no se pudieron procesar. Quedaron sin marcar "
            f"como leidos, asi que no se perdio nada: revisalos y vuelve a correr."
        )


if __name__ == "__main__":
    main()