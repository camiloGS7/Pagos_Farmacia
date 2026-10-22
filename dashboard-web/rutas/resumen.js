/**
 * GET /api/resumen/hoy
 *
 * Todo lo que la pantalla de Resumen muestra de hoy, en una sola respuesta:
 * total, numero de pagos, promedio, pago mas alto, variaciones frente a ayer a
 * esta misma hora, meta, desglose por banco y los ultimos 5 pagos.
 */

const express = require("express");

const { ahoraBogota, sumarDias } = require("../lib/fechas");
const { ruta } = require("../lib/http");
const { APROBADA } = require("../lib/ventas");
const { leerConfiguracion } = require("../lib/configuracion");
const { filaPago } = require("./pagos");

/**
 * Variacion relativa como fraccion (0.12 = +12 %). null cuando no hay contra
 * que comparar: un "+100 %" frente a cero no significa nada.
 */
function variacion(actual, anterior) {
  if (!anterior) return null;
  return (actual - anterior) / anterior;
}

async function cierreDeHoyGuardado(db, hoy) {
  try {
    const { rows } = await db.query("SELECT 1 FROM cierres_caja WHERE fecha = $1", [hoy]);
    return rows.length > 0;
  } catch (error) {
    if (error.code === "42P01") return false;
    throw error;
  }
}

module.exports = function rutasResumen(db) {
  const router = express.Router();

  router.get(
    "/api/resumen/hoy",
    ruta(async (_req, res) => {
      const ahora = ahoraBogota();
      const hoy = ahora.fecha;
      const ayer = sumarDias(hoy, -1);
      const delDia = `${APROBADA} AND fecha_hora >= $1::date AND fecha_hora < $1::date + 1`;

      const [totales, masAlto, porBanco, ultimos, ultimoPago, config, cerrado] =
        await Promise.all([
          db.query(
            `SELECT
               COALESCE(SUM(monto) FILTER (WHERE fecha_hora >= $1::date), 0)::bigint AS total,
               COUNT(*)            FILTER (WHERE fecha_hora >= $1::date)::int        AS pagos,
               -- "Ayer a esta hora": de la medianoche de ayer hasta la misma hora
               -- de hoy. Comparar contra el dia completo de ayer haria ver mal
               -- cualquier mañana.
               COALESCE(SUM(monto) FILTER (WHERE fecha_hora <  $1::date), 0)::bigint AS total_ayer,
               COUNT(*)            FILTER (WHERE fecha_hora <  $1::date)::int        AS pagos_ayer
             FROM transacciones
             WHERE ${APROBADA}
               AND (
                 (fecha_hora >= $1::date AND fecha_hora < $1::date + 1)
                 OR (fecha_hora >= $2::date AND fecha_hora <= $2::date + $3::time)
               )`,
            [hoy, ayer, ahora.hora]
          ),
          db.query(
            `SELECT id, numero_transaccion, monto, fecha_hora, pagador, banco, referencia
               FROM transacciones WHERE ${delDia}
              ORDER BY monto DESC, fecha_hora DESC LIMIT 1`,
            [hoy]
          ),
          db.query(
            `SELECT COALESCE(banco, '') AS banco, SUM(monto)::bigint AS total, COUNT(*)::int AS pagos
               FROM transacciones WHERE ${delDia}
              GROUP BY 1 ORDER BY 2 DESC`,
            [hoy]
          ),
          db.query(
            `SELECT id, numero_transaccion, monto, fecha_hora, pagador, banco, referencia
               FROM transacciones WHERE ${APROBADA}
              ORDER BY fecha_hora DESC, id DESC LIMIT 5`
          ),
          // Los minutos se calculan en la base, contra su reloj en hora de
          // Bogota: asi no dependen de la hora del celular de quien mira.
          db.query(
            `SELECT MAX(fecha_hora) AS fecha_hora,
                    FLOOR(EXTRACT(EPOCH FROM (
                      (now() AT TIME ZONE 'America/Bogota') - MAX(fecha_hora)
                    )) / 60)::int AS minutos
               FROM transacciones WHERE ${APROBADA}`
          ),
          leerConfiguracion(db),
          cierreDeHoyGuardado(db, hoy),
        ]);

      const t = totales.rows[0];
      const promedio = t.pagos ? Math.round(t.total / t.pagos) : 0;
      const promedioAyer = t.pagos_ayer ? Math.round(t.total_ayer / t.pagos_ayer) : 0;
      const ultimo = ultimoPago.rows[0];

      res.json({
        fecha: hoy,
        hora: ahora.hora,
        total: t.total,
        pagos: t.pagos,
        promedio,
        masAlto: masAlto.rows.length ? filaPago(masAlto.rows[0]) : null,
        ayerALaHora: { total: t.total_ayer, pagos: t.pagos_ayer, promedio: promedioAyer },
        variacion: {
          total: variacion(t.total, t.total_ayer),
          pagos: variacion(t.pagos, t.pagos_ayer),
          promedio: variacion(promedio, promedioAyer),
        },
        meta: Number(config.meta_diaria) || 0,
        porBanco: porBanco.rows,
        ultimos: ultimos.rows.map(filaPago),
        ultimoPago: ultimo.fecha_hora
          ? { fechaHora: ultimo.fecha_hora, minutos: Math.max(0, ultimo.minutos) }
          : null,
        cierreGuardado: cerrado,
      });
    })
  );

  return router;
};
