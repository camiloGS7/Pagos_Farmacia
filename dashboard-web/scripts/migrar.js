/**
 * Aplica las migraciones de dashboard-web/migraciones/ que falten, en orden.
 *
 * El proyecto no tenia un sistema de migraciones y traer Knex o Prisma solo
 * para esto seria mucho. Este script es lo minimo que hace falta: guarda en la
 * tabla `migraciones_aplicadas` cuales ya corrieron, y corre cada archivo
 * nuevo dentro de su propia transaccion. Correrlo dos veces no hace nada.
 *
 *     npm run migrar             -> base real (NEON_CONEXION_STR)
 *     npm run migrar:prueba      -> rama de prueba (NEON_CONEXION_STR_PRUEBA)
 */

const fs = require("fs");
const path = require("path");

const { pool, enTransaccion, NOMBRE_VARIABLE } = require("../lib/db");

const CARPETA = path.join(__dirname, "..", "migraciones");

async function main() {
  console.log(`Base de datos: ${NOMBRE_VARIABLE}`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
      nombre      TEXT PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query("SELECT nombre FROM migraciones_aplicadas");
  const aplicadas = new Set(rows.map((f) => f.nombre));

  const archivos = fs
    .readdirSync(CARPETA)
    .filter((n) => n.endsWith(".sql"))
    .sort();

  let nuevas = 0;
  for (const nombre of archivos) {
    if (aplicadas.has(nombre)) {
      console.log(`  ya estaba   ${nombre}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(CARPETA, nombre), "utf8");
    await enTransaccion(async (cliente) => {
      await cliente.query(sql);
      await cliente.query(
        "INSERT INTO migraciones_aplicadas (nombre) VALUES ($1)",
        [nombre]
      );
    });
    console.log(`  aplicada    ${nombre}`);
    nuevas += 1;
  }

  console.log(nuevas ? `Listo: ${nuevas} migracion(es) nueva(s).` : "Nada que aplicar.");
}

main()
  .catch((error) => {
    console.error("La migracion fallo y no se aplico nada:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
