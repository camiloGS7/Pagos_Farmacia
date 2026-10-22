/**
 * GET /api/ventas/serie     La serie de la grafica del Resumen (solo Bre-B).
 * GET /api/ventas/resumen   Ventas totales del negocio: Bre-B + tarjeta +
 *                           efectivo, egresos y neto, por dia.
 */

const express = require("express");

const { acotarRango, ahoraBogota, diasEntre, sumarDias } = require("../lib/fechas");
const { ruta } = require("../lib/http");
const { APROBADA, resumenVentas } = require("../lib/ventas");

const MAX_DIAS_GRAFICA = 90;
// Cuantos dias hacia atras se pueden consultar en Ventas totales (v1).
const MAX_DIAS_VENTAS = Number(process.env.VENTAS_MAX_DIAS) || 60;
// Desde que hora se dibuja la grafica de hoy aunque no haya pagos todavia.
const HORA_APERTURA = 7;

function variacion(actual, anterior) {
  if (!anterior) return null;
  return (actual - anterior) / anterior;
}

/**
 * Totales que acompañan a la grafica. El promedio usa todas las barras, la de
 * hoy incluida; el "mas bajo" deja por fuera la barra en curso, que siempre
 * pareceria la peor del rango aunque el dia apenas empiece.
 */
function estadisticas(puntos) {
  const total = puntos.reduce((s, p) => s + p.total, 0);
  const pagos = puntos.reduce((s, p) => s + p.pagos, 0);
  const cerrados = puntos.filter((p) => !p.actual);
  const candidatos = cerrados.length ? cerrados : puntos;
  const masAlto = puntos.reduce((a, p) => (p.total > a.total ? p : a), puntos[0]);
  const masBajo = candidatos.reduce((a, p) => (p.total < a.total ? p : a), candidatos[0]);
  return {
    total,
    pagos,
    promedio: puntos.length ? Math.round(total / puntos.length) : 0,
    masAlto: masAlto ? { clave: masAlto.clave, total: masAlto.total } : null,
    masBajo: masBajo ? { clave: masBajo.clave, total: masBajo.total } : null,
  };
}

module.exports = function rutasVentas(db) {
  const router = express.Router();

  router.get(
    "/api/ventas/serie",
    ruta(async (req, res) => {
      const ahora = ahoraBogota();
      const hoy = ahora.fecha;
      const rango = ["hoy", "7d", "30d", "personalizado"].includes(req.query.rango)
        ? req.query.rango
        : "7d";

      if (rango === "hoy") {
        const { rows } = await db.query(
          `SELECT EXTRACT(HOUR FROM fecha_hora)::int AS hora,
                  SUM(monto)::bigint AS total, COUNT(*)::int AS pagos
             FROM transacciones
            WHERE ${APROBADA} AND fecha_hora >= $1::date AND fecha_hora < $1::date + 1
            GROUP BY 1 ORDER BY 1`,
          [hoy]
        );
        const porHora = new Map(rows.map((f) => [f.hora, f]));
        const horas = rows.map((f) => f.hora);
        const inicio = Math.min(HORA_APERTURA, ahora.h, ...horas);
        const fin = Math.max(ahora.h, ...horas);
        const puntos = [];
        for (let h = inicio; h <= fin; h += 1) {
          const f = porHora.get(h);
          puntos.push({ clave: h, total: f ? f.total : 0, pagos: f ? f.pagos : 0, actual: h === ahora.h });
        }
        res.json({
          rango,
          unidad: "hora",
          desde: hoy,
          hasta: hoy,
          recortado: false,
          puntos,
          variacion: null,
          ...estadisticas(puntos),
        });
        return;
      }

      let desde;
      let hasta = hoy;
      let recortado = false;
      if (rango === "personalizado") {
        ({ desde, hasta, recortado } = acotarRango(req.query.desde, req.query.hasta, {
          hoy,
          maximo: MAX_DIAS_GRAFICA,
        }));
      } else {
        desde = sumarDias(hoy, rango === "30d" ? -29 : -6);
      }
      const dias = diasEntre(desde, hasta);
      const desdePrevio = sumarDias(desde, -dias);
      const hastaPrevio = sumarDias(desde, -1);

      const [serie, previo] = await Promise.all([
        // El generate_series es lo que mete los dias sin ventas como ceros: sin
        // el, la grafica se saltaria los domingos cerrados.
        db.query(
          `SELECT g.dia::date AS fecha,
                  COALESCE(SUM(t.monto), 0)::bigint AS total,
                  COUNT(t.id)::int AS pagos
             FROM generate_series($1::date, $2::date, interval '1 day') AS g(dia)
             LEFT JOIN transacciones t
               ON t.fecha_hora >= g.dia AND t.fecha_hora < g.dia + interval '1 day'
              AND t.${APROBADA}
            GROUP BY g.dia ORDER BY g.dia`,
          [desde, hasta]
        ),
        db.query(
          `SELECT COALESCE(SUM(monto), 0)::bigint AS total FROM transacciones
            WHERE ${APROBADA} AND fecha_hora >= $1::date AND fecha_hora < $2::date + 1`,
          [desdePrevio, hastaPrevio]
        ),
      ]);

      const puntos = serie.rows.map((f) => ({
        clave: f.fecha,
        total: f.total,
        pagos: f.pagos,
        actual: f.fecha === hoy,
      }));
      const stats = estadisticas(puntos);

      res.json({
        rango,
        unidad: "dia",
        desde,
        hasta,
        recortado,
        puntos,
        // Contra un periodo personalizado no se compara: "frente a los 23 dias
        // anteriores" no le dice nada a nadie.
        variacion: rango === "personalizado" ? null : variacion(stats.total, previo.rows[0].total),
        ...stats,
      });
    })
  );

  router.get(
    "/api/ventas/resumen",
    ruta(async (req, res) => {
      const { fecha: hoy } = ahoraBogota();
      const minimo = sumarDias(hoy, -(MAX_DIAS_VENTAS - 1));
      const rango = acotarRango(req.query.desde || hoy, req.query.hasta || hoy, {
        hoy,
        maximo: MAX_DIAS_VENTAS,
        minimo,
      });
      const resumen = await resumenVentas(db, rango.desde, rango.hasta, hoy);
      res.json({ ...resumen, recortado: rango.recortado, minimo, maximoDias: MAX_DIAS_VENTAS });
    })
  );

  return router;
};
