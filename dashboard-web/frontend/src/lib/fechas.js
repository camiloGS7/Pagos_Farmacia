/** Fechas en hora de Bogota, como texto YYYY-MM-DD (mismo criterio que el servidor). */

const FORMATO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Horario de atencion de la farmacia. Fuera de el no se avisa que "no llegan
 * pagos": a las 6 a. m. es normal que no haya ninguno.
 */
export const HORARIO = { abre: 7, cierra: 21 };
// A esta hora se recuerda el cierre si todavia no se guardo.
export const HORA_RECORDATORIO_CIERRE = 21;

/** { fecha: "2026-10-21", h: 21, m: 42 } en Bogota, sin importar la zona del telefono. */
export function ahoraBogota(momento = new Date()) {
  const v = {};
  for (const p of FORMATO.formatToParts(momento)) v[p.type] = p.value;
  return { fecha: `${v.year}-${v.month}-${v.day}`, h: Number(v.hour), m: Number(v.minute) };
}

export function hoyBogota() {
  return ahoraBogota().fecha;
}

export function enHorario(ahora) {
  return ahora.h >= HORARIO.abre && ahora.h < HORARIO.cierra;
}

export function sumarDias(fechaTexto, dias) {
  const [anio, mes, dia] = fechaTexto.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

export function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000) + 1;
}

export const esFecha = (t) => typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t);
