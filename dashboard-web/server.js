/**
 * Dashboard de pagos, en un solo proceso: responde las rutas /api/* leyendo la
 * tabla `transacciones` que llenan procesar_pagos.py y escuchar_pagos.py, y
 * ademas sirve el build de React. Un unico servicio desplegable, un solo
 * dominio.
 *
 * Local:    npm install && npm run build && npm start   -> http://localhost:3001
 *           npm run dev:prueba   usa la rama de prueba de Neon (NEON_CONEXION_STR_PRUEBA)
 * Railway:  detecta el script build y despues corre start.
 *
 * Antes del primer arranque con el modulo de cierres hay que crear las tablas:
 *           npm run migrar          (o npm run migrar:prueba)
 */

const path = require("path");
const express = require("express");

const { pool, enTransaccion, NOMBRE_VARIABLE } = require("./lib/db");

const PUERTO = process.env.PORT || 3001;

const app = express();

// Sin CORS a proposito: el frontend y la API salen del mismo proceso y del
// mismo dominio, asi que el navegador ni siquiera considera esto una peticion
// cruzada. Habilitarlo seria abrir un permiso que nadie necesita.
app.disable("x-powered-by");

app.use(require("./rutas/resumen")(pool));
app.use(require("./rutas/pagos")(pool));
app.use(require("./rutas/ventas")(pool));
app.use(require("./rutas/cierres")(pool, { enTransaccion }));
app.use(require("./rutas/configuracion")(pool));
app.use(require("./rutas/captura")(pool));
app.use(require("./rutas/reportes")(pool));

// Cualquier otra /api/... responde 404 en JSON, no con el index.html.
app.use("/api", (_req, res) => res.status(404).json({ error: "Ruta no encontrada." }));

// El build de React. Va DESPUES de las rutas /api a proposito: Express prueba
// los middlewares en el orden en que se registran.
//
// La ruta se arma con __dirname (absoluta): en Railway el proceso no
// necesariamente arranca parado en esta carpeta.
//
// No hace falta un catch-all hacia index.html: la navegacion vive en el hash
// de la URL (#/pagos, #/reportes/cierre), que nunca llega al servidor.
const DIRECTORIO_FRONTEND = path.join(__dirname, "frontend", "dist");
app.use(
  express.static(DIRECTORIO_FRONTEND, {
    // Los archivos de assets/ llevan un hash en el nombre: se pueden guardar
    // para siempre. El index.html no, para que un despliegue se vea enseguida.
    setHeaders(res, ruta) {
      if (ruta.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

app.listen(PUERTO, () => {
  console.log(`Dashboard y API en http://localhost:${PUERTO} (base: ${NOMBRE_VARIABLE})`);
});
