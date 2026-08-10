"""
Barrido hacia atras: revisa los correos de Nequi de los ultimos N dias y
guarda en Neon los que falten.

Hace lo mismo que procesar_pagos.py, con dos diferencias:

  1. Ventana configurable. procesar_pagos.py mira solo 2 dias porque corre
     cada 10 minutos y tiene que ser rapido. Aqui puedes pedir 7, 30 o los
     que necesites.
  2. Nunca marca nada como leido: abre la bandeja en modo solo lectura.

Para que sirve: recuperar pagos despues de una caida de Neon, de varios dias
con GitHub Actions fallando, o cuando simplemente quieres confirmar que no
falta nada en la ultima semana.

Es seguro correrlo cuantas veces quieras: el UNIQUE en numero_transaccion
impide duplicados, y los que ya estaban simplemente se saltan.

Uso:
    python reconciliar.py        # ultimos 2 dias
    python reconciliar.py 7      # ultimos 7 dias

Las credenciales salen del .env de la raiz del proyecto.
"""

import argparse
import email

import psycopg2

from procesar_pagos import (
    CONEXION_STR,
    REMITENTE_NEQUI,
    asunto_de,
    conectar_gmail,
    crear_tabla,
    es_notificacion_ignorable,
    extraer_datos,
    extraer_html,
    fecha_imap,
    guardar_transaccion,
)

from datetime import date, timedelta

DIAS_POR_DEFECTO = 2


def buscar_todos_los_correos(conexion, dias):
    typ, _ = conexion.select("INBOX", readonly=True)
    if typ != "OK":
        raise RuntimeError("No se pudo abrir la bandeja de entrada (INBOX).")

    fecha_desde = fecha_imap(date.today() - timedelta(days=dias))
    # sin UNSEEN a proposito: aqui queremos TODOS, leidos o no
    typ, mensajes = conexion.search(
        None, "SINCE", fecha_desde, "FROM", f'"{REMITENTE_NEQUI}"'
    )
    if typ != "OK":
        raise RuntimeError("La busqueda IMAP fallo.")
    return mensajes[0].split()


def revisar_correo(conexion_gmail, conexion_db, id_correo):
    """Guarda el correo si falta. Devuelve True si quedo resuelto."""
    typ, datos_correo = conexion_gmail.fetch(id_correo, "(BODY.PEEK[])")
    if typ != "OK" or not datos_correo or datos_correo[0] is None:
        print(f"No se pudo traer el correo {id_correo}.")
        return False

    mensaje = email.message_from_bytes(datos_correo[0][1])
    html = extraer_html(mensaje)
    if not html:
        print(f"El correo {id_correo} no tiene parte HTML.")
        return False

    datos = extraer_datos(html)
    if not datos:
        # Mismo criterio que procesar_pagos.py: las notificaciones que no son
        # ventas se descartan sin ruido; lo desconocido se reporta.
        asunto = asunto_de(mensaje)
        if es_notificacion_ignorable(asunto):
            return True
        print(f"ATENCION: correo con asunto desconocido: {asunto!r}.")
        return False

    return guardar_transaccion(conexion_db, datos)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument(
        "dias",
        nargs="?",
        type=int,
        default=DIAS_POR_DEFECTO,
        help=f"cuantos dias hacia atras revisar (por defecto {DIAS_POR_DEFECTO})",
    )
    args = parser.parse_args()

    if args.dias < 1:
        raise SystemExit("El numero de dias debe ser 1 o mas.")

    # La bandeja se abre en readonly: este script nunca cambia la bandera de
    # leido. Solo lee correos y completa lo que falte en la base de datos.
    conexion_gmail = None
    conexion_db = None
    fallidos = 0
    try:
        conexion_gmail = conectar_gmail()
        conexion_db = psycopg2.connect(CONEXION_STR)
        crear_tabla(conexion_db)

        ids = buscar_todos_los_correos(conexion_gmail, args.dias)
        print(
            f"Revisando {len(ids)} correo(s) de los ultimos {args.dias} dia(s), "
            f"leidos y no leidos..."
        )

        for id_correo in ids:
            try:
                if not revisar_correo(conexion_gmail, conexion_db, id_correo):
                    fallidos += 1
            except Exception as e:
                # un correo raro no debe tumbar el resto de la reconciliacion
                print(f"Error inesperado con el correo {id_correo}: {e}")
                fallidos += 1

        print(f"\nResumen: {len(ids) - fallidos} en la base, {fallidos} con problemas.")

    finally:
        if conexion_gmail is not None:
            conexion_gmail.logout()
        if conexion_db is not None:
            conexion_db.close()

    if fallidos:
        raise SystemExit(f"{fallidos} correo(s) no se pudieron guardar; revisalos.")


if __name__ == "__main__":
    main()
