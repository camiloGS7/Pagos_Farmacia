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

// Datos del negocio. Van por variable de entorno para que cambiar el nombre no
// obligue a tocar el codigo ni a recompilar el frontend.
const NEGOCIO = process.env.NEGOCIO || "Farmacias Glosar";
const ADMINISTRADORA = process.env.ADMINISTRADORA || "Gloria Sarmiento";
const META_DIARIA = Number(process.env.META_DIARIA) || 1800000;

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

// Solo cuentan las ventas aprobadas; un rechazo o una reversion no es ingreso.
const APROBADA = "estado = 'Aprobada'";

/* ------------------------------------------------------------------ *
 * Fechas
 *
 * Todo el calculo de rangos se hace aqui en JavaScript, no en SQL. Las
 * fechas se guardan como hora local de Colombia (vienen asi en el correo
 * de Nequi), asi que "hoy" tiene que calcularse en esa zona: si usaramos
 * CURRENT_DATE, el servidor en UTC cambiaria de dia a las 7 de la noche.
 * ------------------------------------------------------------------ */

/** La fecha de hoy en Colombia, como texto YYYY-MM-DD. */
function hoyBogota() {
  // en-CA formatea como YYYY-MM-DD, que es justo lo que espera Postgres.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
}

function sumarDias(fechaTexto, dias) {
  const [anio, mes, dia] = fechaTexto.split("-").map(Number);
  // Date.UTC evita que el huso del servidor corra la fecha un dia.
  const d = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return d.toISOString().slice(0, 10);
}

function diasEntre(desde, hasta) {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86400000) + 1;
}

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

function esFecha(valor) {
  return typeof valor === "string" && FECHA_VALIDA.test(valor);
}

/** Numero entero dentro de un rango, con valor por defecto si viene basura. */
function entero(valor, porDefecto, minimo, maximo) {
  const n = Number.parseInt(valor, 10);
  if (Number.isNaN(n)) return porDefecto;
  return Math.min(Math.max(n, minimo), maximo);
}

/**
 * Traduce los parametros de la peticion a un rango concreto de fechas.
 *
 * Acepta dos formas:
 *   ?dias=7                          -> los ultimos 7 dias, hoy incluido
 *   ?desde=2026-08-01&hasta=2026-08-10  -> rango exacto
 *
 * Devuelve tambien el periodo inmediatamente anterior, del mismo largo, que
 * es contra lo que se comparan los porcentajes de las tarjetas.
 */
function rangoDe(req) {
  const hoy = hoyBogota();
  const { desde, hasta } = req.query;

  let inicio;
  let fin;
  let personalizado = false;

  if (esFecha(desde) && esFecha(hasta) && desde <= hasta) {
    inicio = desde;
    fin = hasta;
    personalizado = true;
  } else {
    const dias = entero(req.query.dias, 1, 1, 365);
    fin = hoy;
    inicio = sumarDias(hoy, -(dias - 1));
  }

  const dias = diasEntre(inicio, fin);

  return {
    hoy,
    desde: inicio,
    hasta: fin,
    dias,
    personalizado,
    // El periodo anterior termina justo el dia antes de que empiece este.
    desdePrevio: sumarDias(inicio, -dias),
    hastaPrevio: sumarDias(inicio, -1),
  };
}

/**
 * Variacion relativa entre dos numeros, como fraccion (0.12 = +12%).
 * Devuelve null cuando no hay contra que comparar: dividir por cero no da
 * un porcentaje util, y mostrar "+Infinito%" seria peor que no mostrar nada.
 */
function variacion(actual, anterior) {
  if (!anterior) return null;
  return (actual - anterior) / anterior;
}

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

/**
 * Datos fijos del negocio. El frontend los pide al arrancar para no tener el
 * nombre de la farmacia ni la meta escritos a mano dentro del codigo.
 */
app.get("/api/config", (_req, res) => {
  res.json({
    negocio: NEGOCIO,
    administradora: ADMINISTRADORA,
    metaDiaria: META_DIARIA,
  });
});

/**
 * Las cuatro tarjetas de arriba, la meta del dia y la hora del ultimo pago.
 * Todo en una sola consulta: son agregados sobre la misma tabla, y separarlos
 * en cuatro consultas serian cuatro viajes a Neon para nada.
 */
app.get(
  "/api/resumen",
  ruta(async (req, res) => {
    const r = rangoDe(req);

    const { rows } = await pool.query(
      `
      SELECT
        COALESCE(SUM(monto) FILTER (WHERE fecha_hora::date BETWEEN $1 AND $2), 0)::bigint AS total,
        COUNT(*)            FILTER (WHERE fecha_hora::date BETWEEN $1 AND $2)::int        AS transacciones,

        COALESCE(SUM(monto) FILTER (WHERE fecha_hora::date BETWEEN $3 AND $4), 0)::bigint AS total_previo,
        COUNT(*)            FILTER (WHERE fecha_hora::date BETWEEN $3 AND $4)::int        AS transacciones_previo,

        -- "Total de la semana" son siempre los ultimos 7 dias, no dependen del
        -- rango que el usuario tenga seleccionado arriba.
        COALESCE(SUM(monto) FILTER (WHERE fecha_hora::date >  $5::date - 7), 0)::bigint   AS total_semana,
        COALESCE(SUM(monto) FILTER (
          WHERE fecha_hora::date >  $5::date - 14
            AND fecha_hora::date <= $5::date - 7
        ), 0)::bigint                                                                     AS total_semana_previo,

        -- La meta es siempre del dia de hoy, tampoco depende del rango.
        COALESCE(SUM(monto) FILTER (WHERE fecha_hora::date = $5::date), 0)::bigint        AS total_hoy,

        to_char(MAX(fecha_hora), 'YYYY-MM-DD HH24:MI:SS')                                 AS ultimo_pago
      FROM transacciones
      WHERE ${APROBADA}
      `,
      [r.desde, r.hasta, r.desdePrevio, r.hastaPrevio, r.hoy]
    );

    const f = rows[0];
    const total = Number(f.total);
    const transacciones = f.transacciones;
    const totalPrevio = Number(f.total_previo);
    const transaccionesPrevio = f.transacciones_previo;
    const totalHoy = Number(f.total_hoy);

    const ticket = transacciones > 0 ? Math.round(total / transacciones) : 0;
    const ticketPrevio =
      transaccionesPrevio > 0
        ? Math.round(totalPrevio / transaccionesPrevio)
        : 0;

    res.json({
      rango: {
        desde: r.desde,
        hasta: r.hasta,
        dias: r.dias,
        personalizado: r.personalizado,
        esHoy: !r.personalizado && r.dias === 1,
      },

      total,
      transacciones,
      ticketPromedio: ticket,
      totalSemana: Number(f.total_semana),

      // null cuando el periodo anterior estaba vacio: sin base no hay
      // porcentaje que mostrar.
      variacion: {
        total: variacion(total, totalPrevio),
        transacciones: variacion(transacciones, transaccionesPrevio),
        ticketPromedio: variacion(ticket, ticketPrevio),
        totalSemana: variacion(
          Number(f.total_semana),
          Number(f.total_semana_previo)
        ),
      },

      meta: {
        objetivo: META_DIARIA,
        logrado: totalHoy,
        // Se recorta a 1 para que el anillo no de mas de una vuelta.
        porcentaje: META_DIARIA > 0 ? Math.min(1, totalHoy / META_DIARIA) : 0,
        restante: Math.max(0, META_DIARIA - totalHoy),
      },

      // Sirve para notar que el pipeline se murio: si esto dice "hace 2 dias"
      // es que dejaron de entrar correos.
      ultimoPago: f.ultimo_pago,
    });
  })
);

/**
 * Serie para la grafica de barras: un punto por dia, incluidos los dias sin
 * ventas. El generate_series es lo que evita que la linea se salte los ceros.
 */
app.get(
  "/api/ventas-por-dia",
  ruta(async (req, res) => {
    const r = rangoDe(req);

    const { rows } = await pool.query(
      `
      WITH calendario AS (
        SELECT generate_series($1::date, $2::date, '1 day')::date AS dia
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
      [r.desde, r.hasta]
    );

    // total llega como string porque bigint no cabe garantizado en un number de
    // JS; los montos de una farmacia si caben, asi que lo convertimos aqui.
    res.json({
      rango: { desde: r.desde, hasta: r.hasta, dias: r.dias },
      hoy: r.hoy,
      dias: rows.map((x) => ({ ...x, total: Number(x.total) })),
    });
  })
);

/**
 * Reparto por banco, para la dona. Se devuelven todos los bancos con su
 * participacion ya calculada; agrupar los ultimos en "Otros" es decision de
 * presentacion y la toma el frontend.
 */
app.get(
  "/api/ventas-por-banco",
  ruta(async (req, res) => {
    const r = rangoDe(req);

    const { rows } = await pool.query(
      `
      SELECT
        COALESCE(NULLIF(banco, ''), 'Sin identificar') AS banco,
        COALESCE(SUM(monto), 0)::bigint                AS total,
        COUNT(*)::int                                  AS transacciones
      FROM transacciones
      WHERE ${APROBADA}
        AND fecha_hora::date BETWEEN $1 AND $2
      GROUP BY 1
      ORDER BY 2 DESC
      `,
      [r.desde, r.hasta]
    );

    const total = rows.reduce((suma, x) => suma + Number(x.total), 0);

    res.json({
      rango: { desde: r.desde, hasta: r.hasta, dias: r.dias },
      total,
      bancos: rows.map((x) => ({
        banco: x.banco,
        total: Number(x.total),
        transacciones: x.transacciones,
        porcentaje: total > 0 ? Number(x.total) / total : 0,
      })),
    });
  })
);

/**
 * Listado de pagos. Incluye el estado sin filtrar para que puedas ver ahi si
 * entro algo que no fue aprobado.
 */
app.get(
  "/api/transacciones",
  ruta(async (req, res) => {
    const limite = entero(req.query.limite, 25, 1, 500);
    const busqueda = (req.query.q || "").trim();

    // Solo se filtra por fecha cuando la peticion lo pide. La tabla del
    // resumen quiere "los ultimos N pagos" sin importar el rango de arriba.
    const filtrarPorFecha = esFecha(req.query.desde) && esFecha(req.query.hasta);
    const r = filtrarPorFecha ? rangoDe(req) : null;

    const condiciones = [];
    const valores = [];

    if (r) {
      valores.push(r.desde, r.hasta);
      condiciones.push(
        `fecha_hora::date BETWEEN $${valores.length - 1} AND $${valores.length}`
      );
    }

    if (busqueda) {
      // ILIKE con parametro: el texto del usuario nunca se concatena al SQL.
      valores.push(`%${busqueda}%`);
      const i = valores.length;
      condiciones.push(
        `(pagador ILIKE $${i} OR banco ILIKE $${i} OR referencia ILIKE $${i} OR numero_transaccion ILIKE $${i})`
      );
    }

    valores.push(limite);
    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `
      -- fecha_hora sale como texto a proposito: si lo dejamos como Date, al
      -- serializarlo a JSON se convierte a UTC y la hora se corre 5 horas.
      SELECT numero_transaccion, monto, estado,
             to_char(fecha_hora, 'YYYY-MM-DD HH24:MI:SS') AS fecha_hora,
             pagador, banco, referencia, metodo_pago
      FROM transacciones
      ${where}
      ORDER BY fecha_hora DESC
      LIMIT $${valores.length}
      `,
      valores
    );

    res.json(rows.map((x) => ({ ...x, monto: Number(x.monto) })));
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
// No hace falta un catch-all hacia index.html: el dashboard cambia de vista sin
// tocar la URL, asi que express.static resuelve todo lo que se pide.
const DIRECTORIO_FRONTEND = path.join(__dirname, "frontend", "dist");
app.use(express.static(DIRECTORIO_FRONTEND));

app.listen(PUERTO, () => {
  console.log(`Dashboard y API en http://localhost:${PUERTO}`);
});
