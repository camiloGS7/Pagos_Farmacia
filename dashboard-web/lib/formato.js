/**
 * Formato en español de Colombia para lo que arma el servidor (el PDF). Son
 * las mismas reglas que src/lib/format.js del frontend:
 *   $ 177.900 · 30 % · 14:39 · 9:42 p. m. · mié 21 oct · Miércoles 21 de octubre
 */

const { ZONA } = require("./fechas");

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** 177900 -> "$ 177.900". Negativos con el menos tipografico. */
function pesos(n) {
  const v = Math.round(Number(n) || 0);
  const cifras = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (v < 0 ? "− $ " : "$ ") + cifras;
}

/** 0.304 -> "30 %" */
function porcentaje(fraccion) {
  return `${Math.round((fraccion || 0) * 100)} %`;
}

function partes(iso) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  // Mediodia UTC: el dia de la semana no cambia en ninguna zona horaria.
  const semana = new Date(Date.UTC(anio, mes - 1, dia, 12)).getUTCDay();
  return { anio, mes, dia, semana };
}

/** "2026-10-21" -> "Miércoles 21 de octubre" (con el año si se pide) */
function fechaLarga(iso, { conAnio = false } = {}) {
  const p = partes(iso);
  const texto = `${mayuscula(DIAS[p.semana])} ${p.dia} de ${MESES[p.mes - 1]}`;
  return conAnio ? `${texto} de ${p.anio}` : texto;
}

/** "2026-10-21" -> "Mié 21 oct" */
function diaCorto(iso) {
  const p = partes(iso);
  return `${mayuscula(DIAS_CORTOS[p.semana])} ${p.dia} ${MESES_CORTOS[p.mes - 1]}`;
}

/** "2026-10-21" -> "21 oct" */
function diaMes(iso) {
  const p = partes(iso);
  return `${p.dia} ${MESES_CORTOS[p.mes - 1]}`;
}

const FORMATO_HORA = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Un instante (Date o ISO) -> "9:42 p. m." en hora de Bogota. */
function hora12(momento) {
  const v = {};
  for (const p of FORMATO_HORA.formatToParts(new Date(momento))) v[p.type] = p.value;
  const h = Number(v.hour);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${v.minute} ${h < 12 ? "a. m." : "p. m."}`;
}

module.exports = { pesos, porcentaje, fechaLarga, diaCorto, diaMes, hora12, MESES_CORTOS };
