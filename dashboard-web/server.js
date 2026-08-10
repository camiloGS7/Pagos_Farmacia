/**
 * Dashboard de pagos, en un solo proceso: responde las rutas /api/* leyendo la
 * tabla `transacciones` que llena procesar_pagos.py, y ademas sirve el build de
 * React. Un unico servicio desplegable, un solo dominio.
 *
 * Las credenciales salen del .env de la RAIZ del proyecto, el mismo que usan
 * los scripts de Python. Una sola copia de la cadena de Neon: si algun dia la
 * rotas, la cambias en un solo lugar. En Railway no hay .env y no importa:
 * dotenv no falla si el archivo no existe, y las variables llegan del entorno.
 *
 * Local:    npm install && npm run build && npm start   -> http://localhost:3001
 * Railway:  detecta el script build y despues corre start.
 */

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const express = require("express");
const { Pool } = require("pg");

const PUERTO = process.env.PORT || 3001;
const CONEXION_STR = process.env.NEON_CONEXION_STR;

if (!CONEXION_STR) {
  console.error(
    "Falta NEON_CONEXION_STR.\n" +
      "Revisa el archivo .env en la raiz del proyecto (una carpeta arriba de esta)."
  );
  process.exit(1);
}

if (!CONEXION_STR.startsWith("postgres")) {
  console.error(
    "NEON_CONEXION_STR no parece una cadena de conexion valida.\n" +
      "Abre el .env de la raiz del proyecto y reemplaza el marcador por la\n" +
      "cadena real de Neon (empieza por postgresql:// y termina en ?sslmode=require)."
  );
  process.exit(1);
}

// Neon usa certificados de una CA publica, asi que dejamos la verificacion
// activada (no uses rejectUnauthorized:false, eso abre la puerta a un MITM).
//
// Al arrancar, la libreria pg imprime un aviso sobre sslmode=require y como va
// a cambiar su significado en pg v9. Es inofensivo aqui: este bloque ssl es
// explicito y le gana a lo que diga la cadena de conexion, asi que la
// verificacion estricta se mantiene pase lo que pase.
const pool = new Pool({
  connectionString: CONEXION_STR,
  ssl: { rejectUnauthorized: true },
  max: 5,
});

const app = express();

// Sin CORS a proposito: el frontend y la API salen del mismo proceso y del
// mismo dominio, asi que el navegador ni siquiera considera esto una peticion
// cruzada. Habilitarlo seria abrir un permiso que nadie necesita.

// Las fechas se guardan como hora local de Colombia (vienen asi en el correo
// de Nequi), por eso "ahora" tiene que calcularse en esa misma zona y no en
// UTC: con CURRENT_DATE el servidor en UTC cambiaria de dia a las 7pm.
const AHORA = "(now() AT TIME ZONE 'America/Bogota')";
const HOY = `${AHORA}::date`;

// Solo cuentan las ventas aprobadas; un rechazo o una reversion no es ingreso.
const APROBADA = "estado = 'Aprobada'";

/** Envuelve un handler async para que un error no tumbe el proceso. */
function ruta(handler) {
  return (req, res) => {
    handler(req, res).catch((error) => {
      console.error(error);
      const faltaTabla = error.code === "42P01";
      res.status(faltaTabla ? 503 : 500).json({
        error: faltaTabla
          ? "La tabla 'transacciones' todavia no existe. Corre procesar_pagos.py una vez."
          : "Error consultando la base de datos.",
      });
    });
  };
}

/** Numero entero dentro de un rango, con valor por defecto si viene basura. */
function entero(valor, porDefecto, minimo, maximo) {
  const n = Number.parseInt(valor, 10);
  if (Number.isNaN(n)) return porDefecto;
  return Math.min(Math.max(n, minimo), maximo);
}

/**
 * Totales de hoy, de ayer (para el delta) y de los ultimos 7 dias.
 */
app.get(
  "/api/resumen",
  ruta(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(monto) FILTER (WHERE fecha_hora::date = ${HOY}), 0)::bigint       AS total_hoy,
        COUNT(*)            FILTER (WHERE fecha_hora::date = ${HOY})::int              AS transacciones_hoy,
        COALESCE(SUM(monto) FILTER (WHERE fecha_hora::date = ${HOY} - 1), 0)::bigint   AS total_ayer,
        -- Ayer, pero solo hasta la hora que es ahora. Comparar medio dia de hoy
        -- contra el dia completo de ayer daria siempre una caida enorme.
        COALESCE(SUM(monto) FILTER (
          WHERE fecha_hora::date = ${HOY} - 1
            AND fecha_hora::time <= ${AHORA}::time
        ), 0)::bigint                                                                  AS total_ayer_a_esta_hora,
        COALESCE(SUM(monto) FILTER (WHERE fecha_hora::date > ${HOY} - 7), 0)::bigint   AS total_semana,
        COUNT(*)            FILTER (WHERE fecha_hora::date > ${HOY} - 7)::int          AS transacciones_semana,
        to_char(MAX(fecha_hora), 'YYYY-MM-DD HH24:MI:SS')                              AS ultimo_pago
      FROM transacciones
      WHERE ${APROBADA}
    `);

    const f = rows[0];
    const totalHoy = Number(f.total_hoy);
    const totalAyerAEstaHora = Number(f.total_ayer_a_esta_hora);

    // El delta se calla en dos casos, porque seria mas confuso que util:
    // sin ventas hoy todavia (marcaria -100% cada manana) y sin ventas ayer a
    // esta hora (no hay contra que dividir).
    const hayComparacion = f.transacciones_hoy > 0 && totalAyerAEstaHora > 0;

    res.json({
      totalHoy,
      transaccionesHoy: f.transacciones_hoy,
      totalAyer: Number(f.total_ayer),
      totalAyerAEstaHora,
      variacionVsAyer: hayComparacion
        ? (totalHoy - totalAyerAEstaHora) / totalAyerAEstaHora
        : null,
      totalSemana: Number(f.total_semana),
      transaccionesSemana: f.transacciones_semana,
      ticketPromedioHoy:
        f.transacciones_hoy > 0 ? Math.round(totalHoy / f.transacciones_hoy) : 0,
      // Sirve para notar que el pipeline se murio: si esto dice "hace 2 dias"
      // es que dejaron de entrar correos.
      ultimoPago: f.ultimo_pago,
    });
  })
);

/**
 * Serie para la grafica: un punto por dia, incluidos los dias sin ventas.
 * El generate_series es lo que evita que la linea se salte los dias en cero.
 */
app.get(
  "/api/ventas-por-dia",
  ruta(async (req, res) => {
    const dias = entero(req.query.dias, 14, 1, 365);

    const { rows } = await pool.query(
      `
      WITH calendario AS (
        SELECT generate_series(${HOY} - ($1::int - 1), ${HOY}, '1 day')::date AS dia
      )
      SELECT
        to_char(c.dia, 'YYYY-MM-DD')      AS dia,
        COALESCE(SUM(t.monto), 0)::bigint AS total,
        COUNT(t.id)::int                  AS transacciones
      FROM calendario c
      LEFT JOIN transacciones t
        ON t.fecha_hora::date = c.dia
       AND t.${APROBADA}
      GROUP BY c.dia
      ORDER BY c.dia
    `,
      [dias]
    );

    // total llega como string porque bigint no cabe garantizado en un number de
    // JS; los montos de una farmacia si caben, asi que lo convertimos aqui.
    res.json(rows.map((r) => ({ ...r, total: Number(r.total) })));
  })
);

/**
 * Ultimos pagos, para la tabla. Incluye el estado sin filtrar para que puedas
 * ver ahi si entro algo que no fue aprobado.
 */
app.get(
  "/api/transacciones",
  ruta(async (req, res) => {
    const limite = entero(req.query.limite, 25, 1, 200);

    const { rows } = await pool.query(
      `
      -- fecha_hora sale como texto a proposito: si lo dejamos como Date, al
      -- serializarlo a JSON se convierte a UTC y la hora se corre 5 horas.
      SELECT numero_transaccion, monto, estado,
             to_char(fecha_hora, 'YYYY-MM-DD HH24:MI:SS') AS fecha_hora,
             pagador, banco, referencia, metodo_pago
      FROM transacciones
      ORDER BY fecha_hora DESC
      LIMIT $1
    `,
      [limite]
    );

    res.json(rows.map((r) => ({ ...r, monto: Number(r.monto) })));
  })
);

// El build de React. Va DESPUES de las rutas /api a proposito: Express prueba
// los middlewares en el orden en que se registran, y si el estatico fuera
// primero podria contestar una peticion que le tocaba a la API.
//
// La ruta se arma con __dirname (absoluta) y no como texto relativo: en Railway
// el proceso no necesariamente arranca parado en esta carpeta, y "frontend/dist"
// a secas se resolveria contra el directorio de trabajo equivocado.
//
// No hace falta un catch-all hacia index.html: el dashboard es una sola pagina
// sin router de cliente, asi que express.static resuelve todo lo que se pide.
const DIRECTORIO_FRONTEND = path.join(__dirname, "frontend", "dist");
app.use(express.static(DIRECTORIO_FRONTEND));

app.listen(PUERTO, () => {
  console.log(`Dashboard y API en http://localhost:${PUERTO}`);
});
