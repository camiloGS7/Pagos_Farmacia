/**
 * Consultas de cierres y ventas por dia. Las usan las rutas de la API y el
 * generador de PDF, asi que lo que sale impreso es exactamente lo que se ve en
 * pantalla.
 */

const { calcularCierre } = require("./cierre");

// Solo cuentan las ventas aprobadas; un rechazo o una reversion no es ingreso.
const APROBADA = "estado = 'Aprobada'";

/** Total y numero de pagos Bre-B de un dia, en vivo desde `transacciones`. */
async function brebDelDia(db, fecha) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(monto), 0)::bigint AS total, COUNT(*)::int AS cantidad
       FROM transacciones
      WHERE ${APROBADA}
        AND fecha_hora >= $1::date AND fecha_hora < $1::date + 1`,
    [fecha]
  );
  return rows[0];
}

/** La fila de cierres_caja de un dia y sus egresos, o null si no hay cierre. */
async function cierreGuardado(db, fecha, { bloquear = false } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM cierres_caja WHERE fecha = $1 ${bloquear ? "FOR UPDATE" : ""}`,
    [fecha]
  );
  if (!rows.length) return null;
  const fila = rows[0];
  const egresos = await db.query(
    `SELECT concepto, monto, medio FROM egresos
      WHERE cierre_id = $1 ORDER BY orden, id`,
    [fila.id]
  );
  return { ...fila, egresos: egresos.rows };
}

/**
 * La base sugerida para un borrador: la del ultimo cierre anterior a esa
 * fecha. La base casi nunca cambia, asi Gloria no tiene que escribirla a diario.
 */
async function baseSugerida(db, fecha) {
  const { rows } = await db.query(
    `SELECT base_inicial FROM cierres_caja
      WHERE fecha < $1 ORDER BY fecha DESC LIMIT 1`,
    [fecha]
  );
  return rows.length ? rows[0].base_inicial : 0;
}

/**
 * El cierre de un dia tal como lo pide la pantalla: el guardado, o un borrador
 * con el Bre-B en vivo si todavia no se cerro. Siempre trae `brebEnVivo` para
 * notar los pagos que llegaron despues de guardar.
 */
async function leerCierre(db, fecha) {
  const [guardado, vivo] = await Promise.all([
    cierreGuardado(db, fecha),
    brebDelDia(db, fecha),
  ]);

  if (!guardado) {
    const base = await baseSugerida(db, fecha);
    const datos = {
      brebTotal: vivo.total,
      tarjetaTotal: 0,
      baseInicial: base,
      efectivoContado: 0,
      egresos: [],
    };
    return {
      fecha,
      guardado: false,
      version: null,
      editado: false,
      creadoEn: null,
      actualizadoEn: null,
      brebCantidad: vivo.cantidad,
      brebEnVivo: vivo,
      notas: null,
      ...datos,
      calculado: calcularCierre(datos),
    };
  }

  const datos = {
    brebTotal: guardado.breb_total,
    tarjetaTotal: guardado.tarjeta_total,
    baseInicial: guardado.base_inicial,
    efectivoContado: guardado.efectivo_contado,
    egresos: guardado.egresos,
  };
  return {
    fecha,
    guardado: true,
    version: guardado.version,
    editado: guardado.version > 1,
    creadoEn: guardado.creado_en,
    actualizadoEn: guardado.actualizado_en,
    brebCantidad: guardado.breb_cantidad,
    brebEnVivo: vivo,
    notas: guardado.notas,
    ...datos,
    calculado: calcularCierre(datos),
  };
}

/**
 * Una fila por dia del rango, incluidos los dias sin movimiento, desde la
 * vista v_ventas_diarias. Ordenadas del dia mas reciente al mas viejo.
 */
async function diasDeVentas(db, desde, hasta, hoy) {
  const { rows } = await db.query(
    // Las columnas de v van una por una: con v.* llegaria una segunda columna
    // `fecha` (nula en los dias sin movimiento) que pisaria la del calendario.
    `SELECT g.fecha::date AS fecha,
            v.cerrado, v.editado, v.breb_total, v.breb_cantidad, v.breb_al_cerrar,
            v.tarjeta_total, v.base_inicial, v.efectivo_contado, v.egresos_total,
            v.egresos_efectivo, v.egresos_transferencia, v.efectivo_venta,
            v.ventas_total, v.neto
       FROM generate_series($1::date, $2::date, interval '1 day') AS g(fecha)
       LEFT JOIN v_ventas_diarias v ON v.fecha = g.fecha::date
      ORDER BY g.fecha DESC`,
    [desde, hasta]
  );

  return rows.map((f) => {
    const cerrado = Boolean(f.cerrado);
    const editado = Boolean(f.editado);
    return {
      fecha: f.fecha,
      cerrado,
      editado,
      estado: cerrado
        ? editado ? "editado" : "cerrado"
        : f.fecha === hoy ? "sin-guardar" : "sin-cierre",
      breb: f.breb_total || 0,
      brebCantidad: f.breb_cantidad || 0,
      brebAlCerrar: f.breb_al_cerrar ?? null,
      // Sin cierre no hay tarjeta ni efectivo que mostrar: null, y la pantalla
      // pone una raya en vez de un $ 0 que parece dato.
      tarjeta: cerrado ? f.tarjeta_total : null,
      efectivo: cerrado ? f.efectivo_venta : null,
      baseInicial: cerrado ? f.base_inicial : null,
      efectivoContado: cerrado ? f.efectivo_contado : null,
      egresos: f.egresos_total || 0,
      egresosEfectivo: f.egresos_efectivo || 0,
      egresosTransferencia: f.egresos_transferencia || 0,
      ventas: f.ventas_total || 0,
      neto: f.neto || 0,
    };
  });
}

/** Totales de un rango para Reportes > Ventas totales y su PDF. */
async function resumenVentas(db, desde, hasta, hoy) {
  const filas = await diasDeVentas(db, desde, hasta, hoy);
  const totales = filas.reduce(
    (t, f) => ({
      breb: t.breb + f.breb,
      tarjeta: t.tarjeta + (f.tarjeta || 0),
      efectivo: t.efectivo + (f.efectivo || 0),
      ventas: t.ventas + f.ventas,
      egresos: t.egresos + f.egresos,
      neto: t.neto + f.neto,
    }),
    { breb: 0, tarjeta: 0, efectivo: 0, ventas: 0, egresos: 0, neto: 0 }
  );
  // Hoy no cuenta como "sin cierre": el dia todavia no termina.
  const diasSinCierre = filas.filter((f) => !f.cerrado && f.fecha !== hoy).length;
  return { desde, hasta, dias: filas.length, totales, diasSinCierre, filas };
}

module.exports = {
  APROBADA,
  brebDelDia,
  cierreGuardado,
  leerCierre,
  diasDeVentas,
  resumenVentas,
};
