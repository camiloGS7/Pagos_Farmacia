/**
 * Formato en español de Colombia. Una sola regla para toda la app:
 *   $ 177.900 · 30 % · 14:39 (tablas) · 9:42 p. m. (textos)
 *   mié 21 oct · Miércoles 21 de octubre
 *
 * Las fechas llegan de la API como texto ("2026-10-21", "2026-10-21 14:39:00")
 * y se parten a mano: new Date("2026-10-21") las lee como UTC y en Colombia
 * mostraria el dia anterior.
 */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** 177900 -> "177.900" */
export function cifras(n) {
  return String(Math.abs(Math.round(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * 177900 -> "$ 177.900". Negativos con el menos tipografico. El espacio es de
 * no separacion (U+00A0): el "$" nunca queda solo al final de una linea.
 */
export function pesos(n) {
  return (Number(n) < 0 ? "− $ " : "$ ") + cifras(n);
}

/** Para las etiquetas encima de las barras: "507 mil", "62,3 mil", "1,2 M". */
export function pesosCortos(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 1000000) return (v / 1000000).toFixed(1).replace(".", ",") + " M";
  if (v >= 1000) {
    const miles = v / 1000;
    return (Number.isInteger(miles) || miles >= 100 ? String(Math.round(miles)) : miles.toFixed(1).replace(".", ",")) + " mil";
  }
  return String(v);
}

/** 0.304 -> "30 %" */
export function porcentaje(fraccion) {
  return `${Math.round((fraccion || 0) * 100)} %`;
}

/** 1.856 -> "↑ 185,6 %"; null -> null (no hay con que comparar) */
export function variacion(fraccion) {
  if (fraccion === null || fraccion === undefined || !Number.isFinite(fraccion)) return null;
  const flecha = fraccion >= 0 ? "↑" : "↓";
  return `${flecha} ${Math.abs(fraccion * 100).toFixed(1).replace(".", ",")} %`;
}

function partes(iso) {
  const [anio, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  const semana = new Date(Date.UTC(anio, mes - 1, dia, 12)).getUTCDay();
  return { anio, mes, dia, semana };
}

/** "2026-10-21" -> "Miércoles 21 de octubre" */
export function fechaLarga(iso) {
  const p = partes(iso);
  return `${mayuscula(DIAS[p.semana])} ${p.dia} de ${MESES[p.mes - 1]}`;
}

/** "2026-10-21" -> "mié 21 oct" */
export function fechaCorta(iso) {
  const p = partes(iso);
  return `${DIAS_CORTOS[p.semana]} ${p.dia} ${MESES_CORTOS[p.mes - 1]}`;
}

/** "2026-10-21" -> "Mié 21 oct" (primera columna de las tablas) */
export function diaCorto(iso) {
  return mayuscula(fechaCorta(iso));
}

/** "2026-10-21" -> "Mié 21 de octubre" (encabezado del cierre en el celular) */
export function diaMedio(iso) {
  const p = partes(iso);
  return `${mayuscula(DIAS_CORTOS[p.semana])} ${p.dia} de ${MESES[p.mes - 1]}`;
}

/** "2026-10-21" -> "21 oct" */
export function diaMes(iso) {
  const p = partes(iso);
  return `${p.dia} ${MESES_CORTOS[p.mes - 1]}`;
}

/** "2026-10-21" -> "Miércoles" */
export function diaSemana(iso) {
  return mayuscula(DIAS[partes(iso).semana]);
}

/** "2026-10-21" -> "mié" (eje de la grafica) */
export function diaSemanaCorto(iso) {
  return DIAS_CORTOS[partes(iso).semana];
}

export function mesCorto(iso) {
  return MESES_CORTOS[partes(iso).mes - 1];
}

/** "2026-10-21 14:39:00" -> "14:39" */
export function hora24(fechaHora) {
  return fechaHora ? fechaHora.slice(11, 16) : "";
}

const FORMATO_HORA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Un instante (ISO con zona, o Date) -> "9:42 p. m." en hora de Bogota. */
export function hora12(momento) {
  if (!momento) return "";
  const v = {};
  for (const p of FORMATO_HORA.formatToParts(new Date(momento))) v[p.type] = p.value;
  const h = Number(v.hour);
  return `${h % 12 === 0 ? 12 : h % 12}:${v.minute} ${h < 12 ? "a. m." : "p. m."}`;
}

/** Saludo segun la hora de Bogota. */
export function saludo(hora) {
  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** 4 -> "hace 4 min"; 150 -> "hace 2 h"; 3000 -> "hace 2 días" */
export function haceCuanto(minutos) {
  if (minutos === null || minutos === undefined) return null;
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

/** plural(1, "pago", "pagos") -> "1 pago"; plural(9, ...) -> "9 pagos" */
export function plural(n, uno, varios) {
  return `${n.toLocaleString("es-CO")} ${n === 1 ? uno : varios}`;
}
