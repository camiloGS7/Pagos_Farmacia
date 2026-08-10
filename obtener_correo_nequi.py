"""
Herramienta de diagnostico: baja el correo mas reciente de Nequi y guarda su
HTML en un archivo, sin tocar nada mas.

No hace falta para el funcionamiento normal. Sirve el dia que el parser deje
de encontrar los datos -- casi siempre porque Nequi cambio la plantilla del
correo. Con el HTML real a la vista se ajusta extraer_datos() en minutos, en
vez de adivinar.

Es de solo lectura por partida doble: abre la bandeja con readonly=True y usa
BODY.PEEK, asi que no marca ningun correo como leido ni interfiere con
procesar_pagos.py.

Uso:
    python obtener_correo_nequi.py

Las credenciales salen del archivo .env de la raiz del proyecto, el mismo que
usa procesar_pagos.py.
"""

import email
import imaplib

# Reutilizamos la configuracion y la carga del .env de procesar_pagos, para no
# tener dos copias de lo mismo (ni credenciales sueltas en este archivo).
from procesar_pagos import (
    APP_PASSWORD,
    EMAIL_ACCOUNT,
    IMAP_PORT,
    IMAP_SERVER,
    REMITENTE_NEQUI,
    extraer_html,
)

ARCHIVO_SALIDA = "correo_nequi_crudo.html"


def conectar():
    conexion = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
    conexion.login(EMAIL_ACCOUNT, APP_PASSWORD)
    return conexion


def traer_ultimo_correo_nequi(conexion):
    # readonly=True: solo estamos mirando, no marcamos nada como leido
    conexion.select("INBOX", readonly=True)

    typ, mensajes = conexion.search(None, "FROM", f'"{REMITENTE_NEQUI}"')
    if typ != "OK":
        raise RuntimeError("La busqueda IMAP fallo.")

    ids = mensajes[0].split()
    if not ids:
        print(f"No se encontro ningun correo de {REMITENTE_NEQUI}.")
        return None

    ultimo_id = ids[-1]  # el mas reciente
    typ, datos = conexion.fetch(ultimo_id, "(BODY.PEEK[])")
    if typ != "OK" or not datos or datos[0] is None:
        raise RuntimeError("No se pudo descargar el correo.")

    return email.message_from_bytes(datos[0][1])


def main():
    conexion = conectar()
    try:
        mensaje = traer_ultimo_correo_nequi(conexion)
        if mensaje is None:
            return

        html = extraer_html(mensaje)
        if not html:
            print("El correo no tiene una parte HTML; revisalo a mano.")
            return

        with open(ARCHIVO_SALIDA, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"Listo. Guardado en {ARCHIVO_SALIDA} - abrelo para ver la estructura real.")
    finally:
        conexion.logout()


if __name__ == "__main__":
    main()
