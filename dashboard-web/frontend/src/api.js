/**
 * Todo lo que habla con la API y todo lo que da formato a un numero vive aqui.
 *
 * Las rutas son relativas a proposito (`/api/...`, sin host ni puerto): en
 * desarrollo el proxy de Vite las reenvia al backend, y en produccion Express
 * sirve la pagina y la API desde el mismo dominio. El mismo codigo funciona en
 * los dos casos sin condicionales.
 */

export async function traer(ruta) {
  const respuesta = await fetch(ruta);
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || `Error ${respuesta.status}`);
  }
  return respuesta.json();
}

/* ------------------------------------------------------------------ *
 * Rangos de fecha
 * ------------------------------------------------------------------ */

export const RANGOS = [
  { clave: "hoy", etiqueta: "Hoy", dias: 1 },
  { clave: "7", etiqueta: "7 días", dias: 7 },
  { clave: "30", etiqueta: "30 días", dias: 30 },
  { clave: "personalizado", etiqueta: "Personalizado" },
];

/**
 * Convierte el rango elegido en dos fechas concretas.
 *
 * Se resuelven aqui y no en el servidor, aunque el servidor tambien sabe
 * hacerlo, porque varias vistas necesitan las fechas para otras cosas
 * (el nombre del archivo CSV, el titulo del reporte, el filtro del listado).
 * Con las fechas explicitas, todas las peticiones de una misma pantalla
 * hablan exactamente del mismo periodo.
 */
export function ventanaDe(rango) {
  if (rango.clave === "personalizado" && rango.desde && rango.hasta) {
    return { desde: rango.desde, hasta: rango.hasta };
  }
  const hoy = hoyBogota();
  const dias = RANGOS.find((r) => r.clave === rango.clave)?.dias ?? 1;
  return { desde: sumarDias(hoy, -(dias - 1)), hasta: hoy };
}

/** La misma ventana, ya como query string. */
export function parametrosDe(rango) {
  const { desde, hasta } = ventanaDe(rango);
  return `desde=${desde}&hasta=${hasta}`;
}

/** La fecha de hoy en Colombia, como YYYY-MM-DD. */
export function hoyBogota() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
}

export function sumarDias(fechaTexto, dias) {
  const [anio, mes, dia] = fechaTexto.split("-").map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Formato
 * ------------------------------------------------------------------ */

/** 1284500 -> "$ 1.284.500" */
export function pesos(n) {
  return "$ " + Math.round(n || 0).toLocaleString("es-CO");
}

/** 1284500 -> "$ 1,3 M". Para ejes y espacios estrechos. */
export function pesosCortos(n) {
  const v = Math.abs(n || 0);
  if (v >= 1000000) return "$ " + (n / 1000000).toFixed(1).replace(".", ",") + " M";
  if (v >= 1000) return "$ " + Math.round(n / 1000) + " K";
  return pesos(n);
}

/** 0.124 -> "+12,4%"; null -> null (no hay con que comparar) */
export function porcentaje(fraccion) {
  if (fraccion === null || fraccion === undefined) return null;
  const signo = fraccion >= 0 ? "+" : "−"; // menos tipografico, no guion
  return signo + Math.abs(fraccion * 100).toFixed(1).replace(".", ",") + "%";
}

/** 0.71 -> "71%" */
export function porcentajeEntero(fraccion) {
  return Math.round((fraccion || 0) * 100) + "%";
}

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/**
 * "2026-08-10" -> "10 ago"
 *
 * Se parte el texto a mano en vez de usar new Date(iso): esa forma interpreta
 * la fecha como UTC y en Colombia mostraria el dia anterior.
 */
export function etiquetaDia(iso) {
  const [, mes, dia] = iso.split("-").map(Number);
  return `${dia} ${MESES[mes - 1]}`;
}

/** "2026-08-10" -> "Dom 10 ago". Para la pestaña de la gráfica. */
export function etiquetaDiaConSemana(iso) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const d = new Date(anio, mes - 1, dia);
  const semana = d
    .toLocaleDateString("es-CO", { weekday: "short" })
    .replace(".", "");
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)} ${dia} ${MESES[mes - 1]}`;
}

/** "2026-08-10" -> "domingo, 10 de agosto de 2026" */
export function fechaLarga(iso) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const d = new Date(anio, mes - 1, dia);
  const texto = d.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "2026-08-10 16:42:03" -> "16:42" */
export function horaDe(fechaHora) {
  return fechaHora ? fechaHora.slice(11, 16) : "";
}

/**
 * "hace 12 min".
 *
 * Las fechas vienen en hora de Colombia y se comparan contra el reloj del
 * navegador, asi que esto asume que estas viendo el tablero desde Colombia
 * (que es el caso). Sirve sobre todo para notar que algo se rompio: si dice
 * "hace 2 días" es que dejaron de entrar correos.
 */
export function haceCuanto(fechaHora) {
  if (!fechaHora) return null;

  const [parteFecha, parteHora] = fechaHora.split(" ");
  const [anio, mes, dia] = parteFecha.split("-").map(Number);
  const [hh, mm, ss] = parteHora.split(":").map(Number);
  const cuando = new Date(anio, mes - 1, dia, hh, mm, ss);

  const minutos = Math.floor((Date.now() - cuando.getTime()) / 60000);
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

/* ------------------------------------------------------------------ *
 * Colores de las series
 *
 * Se leen de las variables CSS para que el modo oscuro los cambie solo.
 * ------------------------------------------------------------------ */

export const COLORES_SERIE = [
  "var(--sage)",
  "var(--amber)",
  "var(--coral)",
  "var(--perf)",
];

/** Descarga un CSV generado en el navegador, sin pasar por el servidor. */
export function descargarCSV(nombreArchivo, filas) {
  const escapar = (valor) => {
    const texto = String(valor ?? "");
    // Comillas dobles y separadores obligan a entrecomillar la celda.
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  // Se usa punto y coma: Excel en español interpreta la coma como decimal y
  // con coma partiria mal las columnas.
  const contenido = filas.map((fila) => fila.map(escapar).join(";")).join("\r\n");

  // El BOM hace que Excel abra el archivo como UTF-8 y no rompa las tildes.
  const blob = new Blob(["﻿" + contenido], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}
