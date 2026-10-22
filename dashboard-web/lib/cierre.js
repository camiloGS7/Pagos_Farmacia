/**
 * Reglas de negocio del cierre de caja. Funciones puras: no tocan la base, asi
 * se pueden probar con node --test sin conexion (ver test/cierre.test.js).
 *
 * La vista v_ventas_diarias hace exactamente las mismas cuentas en SQL, y el
 * frontend las repite en src/lib/cierre.js para mostrar el cuadre mientras se
 * escribe. El test compara las tres con el mismo caso de aceptacion.
 */

const MEDIOS = ["efectivo", "transferencia"];
const MONTO_MAXIMO = 100000000;
const MAX_EGRESOS = 50;
const MAX_CONCEPTO = 80;
const MAX_NOTAS = 500;

function sumar(egresos, medio) {
  return egresos
    .filter((e) => medio === undefined || e.medio === medio)
    .reduce((total, e) => total + e.monto, 0);
}

/**
 * venta_efectivo = max(0, contado - base + egresos_en_efectivo)
 * ventas         = breb + tarjeta + venta_efectivo
 * neto           = ventas - egresos_totales
 */
function calcularCierre({ brebTotal, tarjetaTotal, baseInicial, efectivoContado, egresos }) {
  const egresosEfectivo = sumar(egresos, "efectivo");
  const egresosTransferencia = sumar(egresos, "transferencia");
  const egresosTotal = egresosEfectivo + egresosTransferencia;
  const ventaEfectivo = Math.max(0, efectivoContado - baseInicial + egresosEfectivo);
  const ventas = brebTotal + tarjetaTotal + ventaEfectivo;
  return {
    egresosEfectivo,
    egresosTransferencia,
    egresosTotal,
    ventaEfectivo,
    ventas,
    neto: ventas - egresosTotal,
  };
}

function esMonto(valor, { minimo = 0 } = {}) {
  return Number.isInteger(valor) && valor >= minimo && valor <= MONTO_MAXIMO;
}

/**
 * Valida y normaliza el cuerpo de PUT /api/cierres/:fecha. No confia en el
 * front: cualquiera puede mandar un JSON a mano.
 *
 * Devuelve { ok: true, datos } o { ok: false, errores: [texto, ...] }.
 */
function validarCierre(cuerpo) {
  const errores = [];
  const c = cuerpo && typeof cuerpo === "object" ? cuerpo : {};

  const montos = {
    tarjetaTotal: c.tarjetaTotal,
    baseInicial: c.baseInicial,
    efectivoContado: c.efectivoContado,
  };
  for (const [campo, valor] of Object.entries(montos)) {
    if (!esMonto(valor)) {
      errores.push(`${campo} debe ser un entero entre 0 y ${MONTO_MAXIMO}.`);
    }
  }

  let version = null;
  if (c.version !== undefined && c.version !== null) {
    if (!Number.isInteger(c.version) || c.version < 1) {
      errores.push("version debe ser un entero positivo.");
    } else {
      version = c.version;
    }
  }

  let notas = null;
  if (c.notas !== undefined && c.notas !== null) {
    if (typeof c.notas !== "string" || c.notas.length > MAX_NOTAS) {
      errores.push(`notas debe ser texto de hasta ${MAX_NOTAS} caracteres.`);
    } else {
      notas = c.notas.trim() || null;
    }
  }

  const egresos = [];
  if (!Array.isArray(c.egresos)) {
    errores.push("egresos debe ser una lista.");
  } else if (c.egresos.length > MAX_EGRESOS) {
    errores.push(`Maximo ${MAX_EGRESOS} egresos por dia.`);
  } else {
    c.egresos.forEach((e, i) => {
      const concepto = typeof e?.concepto === "string" ? e.concepto.trim() : "";
      if (concepto.length < 1 || concepto.length > MAX_CONCEPTO) {
        errores.push(`egresos[${i}].concepto debe tener entre 1 y ${MAX_CONCEPTO} caracteres.`);
      }
      if (!esMonto(e?.monto, { minimo: 1 })) {
        errores.push(`egresos[${i}].monto debe ser un entero entre 1 y ${MONTO_MAXIMO}.`);
      }
      if (!MEDIOS.includes(e?.medio)) {
        errores.push(`egresos[${i}].medio debe ser "efectivo" o "transferencia".`);
      }
      egresos.push({ concepto, monto: e?.monto, medio: e?.medio });
    });
  }

  if (errores.length) return { ok: false, errores };

  return {
    ok: true,
    datos: {
      version,
      notas,
      tarjetaTotal: c.tarjetaTotal,
      baseInicial: c.baseInicial,
      efectivoContado: c.efectivoContado,
      egresos,
    },
  };
}

module.exports = {
  MEDIOS,
  MONTO_MAXIMO,
  MAX_EGRESOS,
  MAX_CONCEPTO,
  calcularCierre,
  validarCierre,
};
