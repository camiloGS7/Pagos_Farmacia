/**
 * Fechas en hora de Colombia.
 *
 * Los pagos se guardan con la hora local de Bogota (asi vienen en el correo
 * de Nequi), asi que "hoy" tiene que calcularse en esa zona: si usaramos
 * CURRENT_DATE, el servidor en UTC cambiaria de dia a las 7 de la noche.
 */

const ZONA = "America/Bogota";

const FORMATO_AHORA = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** La fecha y la hora de ahora en Bogota: { fecha, hora, h } */
function ahoraBogota(momento = new Date()) {
  const v = {};
  for (const parte of FORMATO_AHORA.formatToParts(momento)) v[parte.type] = parte.value;
  return {
    fecha: `${v.year}-${v.month}-${v.day}`,
    hora: `${v.hour}:${v.minute}:${v.second}`,
    h: Number(v.hour),
  };
}

/** La fecha de hoy en Colombia, como texto YYYY-MM-DD. */
function hoyBogota(momento = new Date()) {
  return ahoraBogota(momento).fecha;
}

function sumarDias(fechaTexto, dias) {
  const [anio, mes, dia] = fechaTexto.split("-").map(Number);
  // Date.UTC evita que el huso del servidor corra la fecha un dia.
  const d = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return d.toISOString().slice(0, 10);
}

function diasEntre(desde, hasta) {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86400000) + 1;
}

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD y ademas una fecha que existe (rechaza 2026-02-31). */
function esFecha(valor) {
  if (typeof valor !== "string" || !FECHA_VALIDA.test(valor)) return false;
  const [anio, mes, dia] = valor.split("-").map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Ajusta un rango pedido por el usuario a lo permitido: nunca despues de hoy,
 * desde <= hasta y, como mucho, `maximo` dias. Si hay que recortar se corre
 * el inicio y se conserva el final, que es el dia que la persona esta mirando.
 */
function acotarRango(desde, hasta, { hoy, maximo, minimo = null }) {
  let fin = esFecha(hasta) ? hasta : hoy;
  if (fin > hoy) fin = hoy;
  let inicio = esFecha(desde) ? desde : fin;
  if (inicio > fin) inicio = fin;
  if (minimo && inicio < minimo) inicio = minimo;
  if (minimo && fin < minimo) fin = minimo;

  let recortado = false;
  if (diasEntre(inicio, fin) > maximo) {
    inicio = sumarDias(fin, -(maximo - 1));
    recortado = true;
  }
  return { desde: inicio, hasta: fin, dias: diasEntre(inicio, fin), recortado };
}

module.exports = {
  ZONA,
  ahoraBogota,
  hoyBogota,
  sumarDias,
  diasEntre,
  esFecha,
  acotarRango,
};
