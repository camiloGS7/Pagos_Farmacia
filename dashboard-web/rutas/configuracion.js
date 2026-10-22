/** GET/PUT /api/configuracion: meta diaria, avisos y tema. */

const express = require("express");

const { ruta, validacion } = require("../lib/http");
const {
  aJson,
  guardarCambios,
  leerConfiguracion,
  validarCambios,
} = require("../lib/configuracion");

module.exports = function rutasConfiguracion(db) {
  const router = express.Router();

  router.get(
    "/api/configuracion",
    ruta(async (_req, res) => {
      res.json(aJson(await leerConfiguracion(db)));
    })
  );

  router.put(
    "/api/configuracion",
    express.json({ limit: "8kb" }),
    ruta(async (req, res) => {
      const v = validarCambios(req.body);
      if (!v.ok) throw validacion(v.errores);
      await guardarCambios(db, v.cambios);
      res.json(aJson(await leerConfiguracion(db)));
    })
  );

  return router;
};
