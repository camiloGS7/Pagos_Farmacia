/**
 * Estado de la captura de pagos y el boton "Revisar correo ahora".
 *
 * GET  /api/captura           Ultimo pago registrado y ultima revision a mano.
 * POST /api/captura/revisar   Fuerza una lectura del correo.
 *
 * La lectura NO se reimplementa aqui: se corre procesar_pagos.py, el mismo
 * script que lanza GitHub Actions. Asi hay un solo parser del correo de Nequi
 * y no dos que se puedan desincronizar el dia que cambie la plantilla.
 *
 * Si el servidor no tiene Python (puede pasar en Railway), y estan definidas
 * GITHUB_TOKEN y GITHUB_REPO, se dispara el workflow procesar-pagos.yml por
 * workflow_dispatch: tarda un par de minutos pero no necesita nada local.
 */

const express = require("express");
const path = require("path");
const { spawn } = require("child_process");

const { ruta, ErrorHttp } = require("../lib/http");
const { APROBADA } = require("../lib/ventas");
const { leerConfiguracion, guardarCambios } = require("../lib/configuracion");

const RAIZ = path.join(__dirname, "..", "..");
const PYTHON = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const TIEMPO_MAXIMO_MS = 120000;
// La ruta no tiene login (asi lo pidio el negocio), asi que se limita a una
// revision por minuto: nadie puede ponerse a lanzar procesos en el servidor.
const ESPERA_MINIMA_MS = 60000;

let revisionEnCurso = null;
let ultimaRevisionMs = 0;

function correrScript(conexionStr) {
  return new Promise((resolve) => {
    let salida = "";
    let proceso;
    try {
      proceso = spawn(PYTHON, ["procesar_pagos.py"], {
        cwd: RAIZ,
        // NEON_CONEXION_STR se pasa explicito: con --prueba el script tiene que
        // escribir en la misma base que esta mirando el tablero. load_dotenv
        // nunca pisa una variable que ya existe, asi que esta gana.
        env: { ...process.env, NEON_CONEXION_STR: conexionStr, PYTHONIOENCODING: "utf-8" },
        windowsHide: true,
      });
    } catch (error) {
      resolve({ disponible: false, error });
      return;
    }

    const reloj = setTimeout(() => proceso.kill(), TIEMPO_MAXIMO_MS);
    proceso.stdout.on("data", (d) => (salida += d));
    proceso.stderr.on("data", (d) => (salida += d));
    proceso.on("error", (error) => {
      clearTimeout(reloj);
      resolve({ disponible: false, error });
    });
    proceso.on("close", (codigo) => {
      clearTimeout(reloj);
      resolve({ disponible: true, codigo, salida });
    });
  });
}

async function dispararWorkflow() {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) return false;
  const respuesta = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/procesar-pagos.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: process.env.GITHUB_RAMA || "main" }),
    }
  );
  return respuesta.status === 204;
}

async function contarPagos(db) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM transacciones WHERE ${APROBADA}`);
  return rows[0].n;
}

async function revisar(db, conexionStr) {
  const antes = await contarPagos(db);
  const resultado = await correrScript(conexionStr);

  if (!resultado.disponible) {
    if (await dispararWorkflow()) return { modo: "en-cola", nuevos: null };
    throw new ErrorHttp(503, "No hay como leer el correo desde este servidor.", {
      codigo: "sin-lector",
    });
  }

  // procesar_pagos.py sale con codigo 1 cuando algun correo no se pudo leer
  // (por ejemplo los traslados por Bre-B, que no son ventas). La revision si
  // ocurrio; lo que importa aqui es cuantos pagos entraron.
  if (resultado.codigo !== 0) {
    console.warn(`procesar_pagos.py termino con codigo ${resultado.codigo}:\n${resultado.salida}`);
  }
  const despues = await contarPagos(db);
  return { modo: "listo", nuevos: Math.max(0, despues - antes) };
}

module.exports = function rutasCaptura(db, { conexionStr }) {
  const router = express.Router();

  router.get(
    "/api/captura",
    ruta(async (_req, res) => {
      const [ultimo, config] = await Promise.all([
        db.query(
          `SELECT MAX(fecha_hora) AS fecha_hora,
                  FLOOR(EXTRACT(EPOCH FROM (
                    (now() AT TIME ZONE 'America/Bogota') - MAX(fecha_hora)
                  )) / 60)::int AS minutos
             FROM transacciones WHERE ${APROBADA}`
        ),
        leerConfiguracion(db),
      ]);
      const u = ultimo.rows[0];
      res.json({
        ultimoPago: u.fecha_hora ? { fechaHora: u.fecha_hora, minutos: Math.max(0, u.minutos) } : null,
        ultimaRevision: config.captura_ultima_revision || null,
        revisando: Boolean(revisionEnCurso),
      });
    })
  );

  router.post(
    "/api/captura/revisar",
    ruta(async (_req, res) => {
      if (!revisionEnCurso) {
        const faltan = ESPERA_MINIMA_MS - (Date.now() - ultimaRevisionMs);
        if (faltan > 0) {
          throw new ErrorHttp(429, "Espera un momento antes de revisar otra vez.", {
            codigo: "espera",
            segundos: Math.ceil(faltan / 1000),
          });
        }
        ultimaRevisionMs = Date.now();
        revisionEnCurso = revisar(db, conexionStr).finally(() => {
          revisionEnCurso = null;
        });
      }
      // Si ya habia una revision corriendo (otra pestaña), se espera esa misma
      // en vez de lanzar una segunda.
      const resultado = await revisionEnCurso;
      const cuando = new Date().toISOString();
      await guardarCambios(db, { captura_ultima_revision: cuando }).catch(() => {});
      res.json({ ...resultado, revisadoEn: cuando });
    })
  );

  return router;
};
