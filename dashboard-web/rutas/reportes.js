/**
 * GET /api/reportes/pdf?desde&hasta&tipo
 *
 * Un solo dia con tipo=cierre (o sin tipo)  -> cierre_2026-10-21.pdf
 * Un rango, o tipo=ventas                   -> ventas_2026-10-15_a_2026-10-21.pdf
 */

const express = require("express");

const { acotarRango, hoyBogota, sumarDias } = require("../lib/fechas");
const { ruta } = require("../lib/http");
const { leerCierre, resumenVentas } = require("../lib/ventas");
const { pdfCierre, pdfVentas } = require("../lib/pdf");

const MAX_DIAS = 366;

module.exports = function rutasReportes(db) {
  const router = express.Router();

  router.get(
    "/api/reportes/pdf",
    ruta(async (req, res) => {
      const hoy = hoyBogota();
      const rango = acotarRango(req.query.desde || hoy, req.query.hasta || req.query.desde || hoy, {
        hoy,
        maximo: MAX_DIAS,
        minimo: sumarDias(hoy, -(MAX_DIAS - 1)),
      });
      const unDia = rango.desde === rango.hasta;
      const esCierre = unDia && req.query.tipo !== "ventas";

      let doc;
      let nombre;
      if (esCierre) {
        doc = pdfCierre(await leerCierre(db, rango.desde));
        nombre = `cierre_${rango.desde}.pdf`;
      } else {
        doc = pdfVentas(await resumenVentas(db, rango.desde, rango.hasta, hoy));
        nombre = unDia ? `ventas_${rango.desde}.pdf` : `ventas_${rango.desde}_a_${rango.hasta}.pdf`;
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
      // El nombre tambien va en una cabecera propia: el frontend lo lee para el
      // aviso "Se descargó ..." sin tener que parsear Content-Disposition.
      res.setHeader("X-Nombre-Archivo", nombre);
      res.setHeader("Access-Control-Expose-Headers", "X-Nombre-Archivo");
      doc.pipe(res);
      doc.end();
    })
  );

  return router;
};
