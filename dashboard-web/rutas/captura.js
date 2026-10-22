/**
 * GET /api/captura   Estado de la captura de pagos: cuando llego el ultimo.
 *
 * Los pagos los registran solos escuchar_pagos.py y procesar_pagos.py desde
 * el correo; el tablero solo los muestra.
 */

const express = require("express");

const { ruta } = require("../lib/http");
const { APROBADA } = require("../lib/ventas");

module.exports = function rutasCaptura(db) {
  const router = express.Router();

  router.get(
    "/api/captura",
    ruta(async (_req, res) => {
      // Los minutos se calculan en la base, contra su reloj en hora de Bogota.
      const { rows } = await db.query(
        `SELECT MAX(fecha_hora) AS fecha_hora,
                FLOOR(EXTRACT(EPOCH FROM (
                  (now() AT TIME ZONE 'America/Bogota') - MAX(fecha_hora)
                )) / 60)::int AS minutos
           FROM transacciones WHERE ${APROBADA}`
      );
      const u = rows[0];
      res.json({
        ultimoPago: u.fecha_hora ? { fechaHora: u.fecha_hora, minutos: Math.max(0, u.minutos) } : null,
      });
    })
  );

  return router;
};
