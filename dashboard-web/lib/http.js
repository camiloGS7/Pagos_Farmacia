/** Utilidades de las rutas: manejo de errores y respuestas de validacion. */

class ErrorHttp extends Error {
  constructor(estado, mensaje, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.extra = extra;
  }
}

/**
 * Envuelve un handler async para que un error no tumbe el proceso y siempre
 * responda JSON. El texto de `error` es para quien lee los logs; el frontend
 * muestra sus propios mensajes segun el `codigo` y el estado HTTP.
 */
function ruta(handler) {
  return (req, res) => {
    handler(req, res).catch((error) => {
      if (error instanceof ErrorHttp) {
        res.status(error.estado).json({ error: error.message, ...error.extra });
        return;
      }
      console.error(error);
      // 42P01: tabla o vista inexistente. Pasa si se desplego el codigo nuevo
      // pero todavia no se corrio `npm run migrar` contra esa base.
      if (error.code === "42P01") {
        res.status(503).json({
          error: "Faltan tablas en la base. Corre: npm run migrar",
          codigo: "sin-migrar",
        });
        return;
      }
      res.status(500).json({ error: "Error consultando la base de datos." });
    });
  };
}

function validacion(errores) {
  return new ErrorHttp(400, errores.join(" "), { codigo: "validacion", errores });
}

module.exports = { ErrorHttp, ruta, validacion };
