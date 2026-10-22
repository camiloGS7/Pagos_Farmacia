/**
 * Nombre y color de cada banco.
 *
 * El correo de Nequi trae el banco escrito a su manera ("Bco Bogotá", "BCS",
 * "Nubank"). Se normaliza (sin tildes, minusculas, sin "banco"/"bco") y se
 * busca en este mapa. Un banco que no esta en la lista conserva su nombre y
 * usa el color de "Otros".
 *
 * El punto de color SIEMPRE va con el nombre al lado: el color solo no le
 * sirve a quien no distingue bien los colores.
 */

const MAPA = {
  nequi: { label: "Nequi", token: "--b-nequi" },
  daviplata: { label: "Daviplata", token: "--b-davi" },
  davivienda: { label: "Davivienda", token: "--b-davivienda" },
  nu: { label: "Nu", token: "--b-nu" },
  nubank: { label: "Nu", token: "--b-nu" },
  "nu colombia": { label: "Nu", token: "--b-nu" },
  bancolombia: { label: "Bancolombia", token: "--b-bancolombia" },
  bbva: { label: "BBVA", token: "--b-bbva" },
  bogota: { label: "Banco de Bogotá", token: "--b-bogota" },
  "de bogota": { label: "Banco de Bogotá", token: "--b-bogota" },
  "caja social": { label: "Caja Social", token: "--b-cajasocial" },
  cajasocial: { label: "Caja Social", token: "--b-cajasocial" },
  bcs: { label: "Caja Social", token: "--b-cajasocial" },
  occidente: { label: "Banco de Occidente", token: "--b-occidente" },
  "de occidente": { label: "Banco de Occidente", token: "--b-occidente" },
  avvillas: { label: "AV Villas", token: "--b-avvillas" },
  "av villas": { label: "AV Villas", token: "--b-avvillas" },
  popular: { label: "Banco Popular", token: "--b-popular" },
  agrario: { label: "Banco Agrario", token: "--b-agrario" },
  falabella: { label: "Banco Falabella", token: "--b-falabella" },
  santander: { label: "Santander", token: "--b-santander" },
  itau: { label: "Itaú", token: "--b-itau" },
  lulo: { label: "Lulo Bank", token: "--b-lulo" },
  "lulo bank": { label: "Lulo Bank", token: "--b-lulo" },
  movii: { label: "Movii", token: "--b-movii" },
};

// Un pago sin banco identificado llego por Bre-B y no se sabe de donde.
const SIN_BANCO = { clave: "breb", label: "Bre-B", token: "--b-breb" };

export function normalizarBanco(nombre) {
  return (nombre || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(banco|bco)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Bco Bogotá" -> { clave: "bogota", label: "Banco de Bogotá", color: "var(--b-bogota)" } */
export function banco(nombre) {
  const clave = normalizarBanco(nombre);
  if (!clave || clave === "sin identificar" || clave === "bre b" || clave === "breb") {
    return { ...SIN_BANCO, color: `var(${SIN_BANCO.token})` };
  }
  const conocido = MAPA[clave];
  if (conocido) {
    return { clave: conocido.label.toLowerCase(), label: conocido.label, color: `var(${conocido.token})` };
  }
  return { clave, label: (nombre || "").trim(), color: "var(--b-otros)" };
}

/**
 * Junta las filas de la API ({ banco, total?, pagos }) por banco normalizado:
 * "Nubank" y "Nu" suman en la misma fila. Guarda los nombres crudos de cada
 * grupo para poder filtrar despues por todos ellos.
 */
export function agruparBancos(filas) {
  const grupos = new Map();
  for (const f of filas || []) {
    const b = banco(f.banco);
    const g = grupos.get(b.clave) || { ...b, total: 0, pagos: 0, crudos: [] };
    g.total += f.total || 0;
    g.pagos += f.pagos || 0;
    g.crudos.push(f.banco || "");
    grupos.set(b.clave, g);
  }
  return [...grupos.values()].sort((a, b) => b.total - a.total || b.pagos - a.pagos);
}
