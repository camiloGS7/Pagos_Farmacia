/**
 * Conexion a Neon, compartida por el servidor y por scripts/migrar.js.
 *
 * Las credenciales salen del .env de la RAIZ del proyecto, el mismo que usan
 * los scripts de Python. En Railway no hay .env y no importa: dotenv no falla
 * si el archivo no existe, y las variables llegan del entorno.
 *
 * Con la bandera --prueba (o BD=prueba) se usa NEON_CONEXION_STR_PRUEBA, la
 * rama de prueba de Neon. Asi se puede probar una migracion o un cambio de la
 * API sin tocar los datos reales:
 *
 *     node server.js --prueba
 *     node scripts/migrar.js --prueba
 */

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { Pool, types } = require("pg");

// Como llegan los tipos de Postgres a JavaScript:
//   DATE (1082) y TIMESTAMP sin zona (1114) se dejan como texto. Si pg los
//   convierte a Date, los interpreta en la zona del servidor y al pasarlos a
//   JSON se corren de dia o de hora. Como texto llegan tal cual: "2026-10-21"
//   y "2026-10-21 14:39:00", ya en hora de Bogota.
//   BIGINT (20) se convierte a number. pg lo deja como texto porque un bigint
//   puede no caber en un number, pero los pesos de una farmacia caben de sobra
//   (el limite seguro es 9 mil billones).
types.setTypeParser(1082, (valor) => valor);
types.setTypeParser(1114, (valor) => valor);
types.setTypeParser(20, (valor) => Number(valor));

const USAR_PRUEBA =
  process.argv.includes("--prueba") || process.env.BD === "prueba";

const NOMBRE_VARIABLE = USAR_PRUEBA ? "NEON_CONEXION_STR_PRUEBA" : "NEON_CONEXION_STR";
const CONEXION_STR = process.env[NOMBRE_VARIABLE];

function validarConexion() {
  if (!CONEXION_STR) {
    console.error(
      `Falta ${NOMBRE_VARIABLE}.\n` +
        "Revisa el archivo .env en la raiz del proyecto (dos carpetas arriba de esta)."
    );
    process.exit(1);
  }
  if (!CONEXION_STR.startsWith("postgres")) {
    console.error(
      `${NOMBRE_VARIABLE} no parece una cadena de conexion valida.\n` +
        "Debe empezar por postgresql:// y terminar en ?sslmode=require."
    );
    process.exit(1);
  }
}

validarConexion();

// Neon usa certificados de una CA publica, asi que dejamos la verificacion
// activada (rejectUnauthorized:false abriria la puerta a un MITM). Este bloque
// ssl es explicito y le gana a lo que diga la cadena de conexion.
//
// La unica excepcion es una cadena que pida sslmode=disable a proposito: un
// Postgres local de pruebas, que no tiene certificado. Neon nunca la usa.
const sinSsl = /[?&]sslmode=disable\b/.test(CONEXION_STR);
const pool = new Pool({
  connectionString: CONEXION_STR,
  ssl: sinSsl ? false : { rejectUnauthorized: true },
  max: 5,
});

/**
 * Corre `trabajo(cliente)` dentro de una transaccion. Si el trabajo lanza un
 * error se hace ROLLBACK y el error sigue su camino; si no, COMMIT.
 */
async function enTransaccion(trabajo) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await trabajo(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = {
  pool,
  enTransaccion,
  USAR_PRUEBA,
  NOMBRE_VARIABLE,
  CONEXION_STR,
};
