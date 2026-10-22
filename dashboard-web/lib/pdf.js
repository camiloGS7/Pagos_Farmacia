/**
 * PDF del cierre de un dia y del reporte de ventas de un rango.
 *
 * Se genera en el servidor con pdfkit: no depende del navegador ni del modo
 * oscuro, sale igual en el iPhone y en el computador, y se puede reenviar.
 * Siempre en modo claro, fondo blanco, con Manrope incrustada y cifras de
 * ancho fijo (tnum) para que las columnas de montos queden alineadas.
 */

const PDFDocument = require("pdfkit");

const { ahoraBogota } = require("./fechas");
const { diaCorto, diaMes, fechaLarga, hora12, pesos, porcentaje } = require("./formato");

const fuente = (peso) =>
  require.resolve(`@fontsource/manrope/files/manrope-latin-${peso}-normal.woff`);

// Mismos colores que los tokens del modo claro.
const C = {
  texto: "#0B1220",
  texto2: "#344054",
  muted: "#475467",
  borde: "#E4E7EC",
  pista: "#F2F4F7",
  elevado: "#F9FAFB",
  brand: "#047857",
  acento: "#34D399",
  breb: "#0891B2",
  tarjeta: "#6366F1",
  efectivo: "#C08A1E",
  avisoFondo: "#FFFAEB",
  avisoBorde: "#FEDF89",
  avisoTexto: "#B54708",
};

const MARGEN = 48;
const NUM = { features: ["tnum"] };

function crearDocumento(titulo) {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
    bufferPages: true,
    info: { Title: titulo, Author: "Farmacia Glosar" },
  });
  doc.registerFont("Regular", fuente(400));
  doc.registerFont("Semi", fuente(600));
  doc.registerFont("Negrita", fuente(700));
  doc.registerFont("Extra", fuente(800));
  return doc;
}

const ancho = (doc) => doc.page.width - MARGEN * 2;
const fondo = (doc) => doc.page.height - MARGEN - 24; // deja sitio al pie

function encabezado(doc, titulo, subtitulo) {
  const ahora = ahoraBogota();
  const x = MARGEN;
  let y = MARGEN;

  // La marca: el mismo cuadro verde con la cruz de la barra lateral.
  doc.roundedRect(x, y, 26, 26, 7).fill(C.acento);
  doc.lineCap("round").lineWidth(3).strokeColor(C.texto)
    .moveTo(x + 13, y + 7).lineTo(x + 13, y + 19).stroke()
    .moveTo(x + 7, y + 13).lineTo(x + 19, y + 13).stroke();

  doc.font("Extra").fontSize(16).fillColor(C.texto)
    .text(`Farmacia Glosar · ${titulo}`, x + 38, y + 1, { width: ancho(doc) - 38 });
  doc.font("Semi").fontSize(10.5).fillColor(C.muted)
    .text(subtitulo, x + 38, y + 22, { width: ancho(doc) - 38 });

  y += 50;
  doc.font("Regular").fontSize(8.5).fillColor(C.muted)
    .text(`Generado el ${diaMes(ahora.fecha)} de ${ahora.fecha.slice(0, 4)}, ${hora12(new Date())}`, x, y, NUM);
  y += 18;
  doc.moveTo(x, y).lineTo(x + ancho(doc), y).lineWidth(1).strokeColor(C.borde).stroke();
  return y + 18;
}

function tituloSeccion(doc, texto, y, nota) {
  doc.font("Extra").fontSize(12).fillColor(C.texto).text(texto, MARGEN, y);
  if (nota) {
    doc.font("Regular").fontSize(9).fillColor(C.muted)
      .text(nota, MARGEN, y + 2, { width: ancho(doc), align: "right" });
  }
  return y + 22;
}

function punto(doc, x, y, color) {
  doc.circle(x + 3.5, y + 5.5, 3.5).fill(color);
}

function linea(doc, y, color = C.pista) {
  doc.moveTo(MARGEN, y).lineTo(MARGEN + ancho(doc), y).lineWidth(1).strokeColor(color).stroke();
}

/** Fila de "Ingresos": punto, nombre, detalle en gris y monto a la derecha. */
function filaIngreso(doc, y, { color, nombre, detalle, monto }) {
  const w = ancho(doc);
  punto(doc, MARGEN, y + 1, color);
  doc.font("Negrita").fontSize(10.5).fillColor(C.texto).text(nombre, MARGEN + 16, y);
  doc.font("Regular").fontSize(9).fillColor(C.muted)
    .text(detalle, MARGEN + 16, y + 15, { width: w - 160, ...NUM });
  doc.font("Extra").fontSize(11.5).fillColor(C.texto)
    .text(pesos(monto), MARGEN, y + 4, { width: w, align: "right", ...NUM });
  const fin = y + 34;
  linea(doc, fin);
  return fin + 10;
}

function aviso(doc, y, texto) {
  const w = ancho(doc);
  doc.font("Semi").fontSize(9.5);
  const alto = doc.heightOfString(texto, { width: w - 24 }) + 16;
  doc.roundedRect(MARGEN, y, w, alto, 8).fillAndStroke(C.avisoFondo, C.avisoBorde);
  doc.fillColor(C.avisoTexto).text(texto, MARGEN + 12, y + 8, { width: w - 24 });
  return y + alto + 14;
}

function pieDePagina(doc) {
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i += 1) {
    doc.switchToPage(paginas.start + i);
    // El pie va dentro del margen inferior. Mientras se escribe, el margen se
    // pone en cero: si no, pdfkit cree que el texto no cabe y abre una pagina
    // nueva en blanco.
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGEN + 6;
    doc.font("Regular").fontSize(8).fillColor(C.muted);
    doc.text("Farmacia Glosar · Bogotá", MARGEN, y, { lineBreak: false });
    doc.text(`Página ${i + 1} de ${paginas.count}`, MARGEN, y, {
      width: ancho(doc),
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = margenInferior;
  }
}

/* ------------------------------------------------------------------ *
 * Cierre de un dia
 * ------------------------------------------------------------------ */

function pdfCierre(cierre) {
  const doc = crearDocumento(`Cierre de caja ${cierre.fecha}`);
  const w = ancho(doc);
  const calc = cierre.calculado;
  let y = encabezado(doc, "Cierre de caja", fechaLarga(cierre.fecha, { conAnio: true }));

  if (!cierre.guardado) {
    y = aviso(doc, y, "Este día no tiene cierre guardado: solo se cuenta Bre-B. Tarjeta y efectivo aparecen en cero.");
  } else if (cierre.brebEnVivo.total !== cierre.brebTotal) {
    const diferencia = cierre.brebEnVivo.total - cierre.brebTotal;
    y = aviso(doc, y, diferencia > 0
      ? `Llegaron ${pesos(diferencia)} en Bre-B después del cierre. Este PDF muestra lo guardado.`
      : `El Bre-B del día cambió ${pesos(diferencia)} después del cierre. Este PDF muestra lo guardado.`);
  }

  y = tituloSeccion(doc, "Ingresos", y);
  y = filaIngreso(doc, y, {
    color: C.breb,
    nombre: "Bre-B (QR)",
    detalle: cierre.brebCantidad === 1 ? "1 pago capturado del correo" : `${cierre.brebCantidad} pagos capturados del correo`,
    monto: cierre.brebTotal,
  });
  y = filaIngreso(doc, y, {
    color: C.tarjeta,
    nombre: "Tarjeta",
    detalle: "Total del datáfono al cerrar",
    monto: cierre.tarjetaTotal,
  });
  y = filaIngreso(doc, y, {
    color: C.efectivo,
    nombre: "Efectivo",
    detalle: `Base ${pesos(cierre.baseInicial)} · Contado ${pesos(cierre.efectivoContado)} · Egresos en efectivo ${pesos(calc.egresosEfectivo)}`,
    monto: calc.ventaEfectivo,
  });

  y += 8;
  const cuantos = cierre.egresos.length;
  y = tituloSeccion(doc, "Egresos", y, cuantos === 1 ? "1 egreso" : `${cuantos} egresos`);
  if (!cuantos) {
    doc.font("Regular").fontSize(10).fillColor(C.muted).text("Sin egresos este día.", MARGEN, y);
    y += 20;
  }
  for (const e of cierre.egresos) {
    if (y + 26 > fondo(doc)) {
      doc.addPage();
      y = MARGEN;
    }
    doc.font("Semi").fontSize(10).fillColor(C.texto).text(e.concepto, MARGEN, y, { width: w - 220 });
    doc.font("Regular").fontSize(9).fillColor(C.muted)
      .text(e.medio === "efectivo" ? "Efectivo" : "Transferencia", MARGEN + w - 210, y + 1, { width: 100 });
    doc.font("Negrita").fontSize(10).fillColor(C.texto)
      .text(pesos(e.monto), MARGEN, y, { width: w, align: "right", ...NUM });
    y += 20;
    linea(doc, y - 6);
  }
  doc.font("Regular").fontSize(9).fillColor(C.muted)
    .text(`Efectivo ${pesos(calc.egresosEfectivo)} · Transferencia ${pesos(calc.egresosTransferencia)}`, MARGEN, y + 2, NUM);
  doc.font("Negrita").fontSize(10.5).fillColor(C.texto)
    .text(`Total egresos  ${pesos(calc.egresosTotal)}`, MARGEN, y, { width: w, align: "right", ...NUM });
  y += 30;

  // El cuadre, en una caja como la tarjeta oscura de la pantalla (en claro).
  const alto = 150;
  if (y + alto > fondo(doc)) {
    doc.addPage();
    y = MARGEN;
  }
  doc.roundedRect(MARGEN, y, w, alto, 12).fillAndStroke(C.elevado, C.borde);
  const xi = MARGEN + 18;
  const wi = w - 36;
  let yi = y + 16;
  doc.font("Negrita").fontSize(9.5).fillColor(C.muted).text("Cuadre del día", xi, yi);
  yi += 20;
  const fila = (etiqueta, valor, { fuenteValor = "Negrita", tam = 11, color = C.texto } = {}) => {
    doc.font("Semi").fontSize(10).fillColor(C.texto2).text(etiqueta, xi, yi + 1);
    doc.font(fuenteValor).fontSize(tam).fillColor(color).text(valor, xi, yi, { width: wi, align: "right", ...NUM });
  };
  fila("Ventas del día", pesos(calc.ventas), { fuenteValor: "Extra", tam: 13 });
  yi += 22;
  fila("Egresos", `− ${pesos(calc.egresosTotal)}`, { color: C.muted });
  yi += 22;
  doc.moveTo(xi, yi).lineTo(xi + wi, yi).lineWidth(1).strokeColor(C.borde).stroke();
  yi += 10;
  doc.font("Negrita").fontSize(10.5).fillColor(C.texto).text("Neto del día", xi, yi + 6);
  doc.font("Extra").fontSize(22).fillColor(C.brand).text(pesos(calc.neto), xi, yi, { width: wi, align: "right", ...NUM });
  yi += 30;
  doc.font("Regular").fontSize(9).fillColor(C.muted)
    .text(`En caja al cerrar: ${pesos(cierre.efectivoContado)}`, xi, yi, NUM);
  y += alto + 16;

  if (cierre.guardado) {
    const editado = cierre.editado ? ` · editado ${hora12(cierre.actualizadoEn)}` : "";
    doc.font("Regular").fontSize(9).fillColor(C.muted)
      .text(`Guardado ${hora12(cierre.creadoEn)}${editado} · versión ${cierre.version}`, MARGEN, y, NUM);
  }
  if (cierre.notas) {
    y += 16;
    doc.font("Regular").fontSize(9).fillColor(C.texto2).text(`Notas: ${cierre.notas}`, MARGEN, y, { width: w });
  }

  pieDePagina(doc);
  return doc;
}

/* ------------------------------------------------------------------ *
 * Ventas de un rango
 * ------------------------------------------------------------------ */

const COLUMNAS = [
  { titulo: "Día", ancho: 74, alinear: "left" },
  { titulo: "Bre-B", ancho: 62 },
  { titulo: "Tarjeta", ancho: 60 },
  { titulo: "Efectivo", ancho: 62 },
  { titulo: "Ventas", ancho: 66 },
  { titulo: "Egresos", ancho: 60 },
  { titulo: "Neto", ancho: 68 },
  { titulo: "Estado", ancho: 64 },
];
const ESTADOS = {
  cerrado: "Cerrado",
  editado: "Editado",
  "sin-cierre": "Sin cierre",
  "sin-guardar": "Sin guardar",
};

function cabeceraTabla(doc, y) {
  let x = MARGEN;
  doc.font("Negrita").fontSize(7.5).fillColor(C.muted);
  for (const col of COLUMNAS) {
    doc.text(col.titulo.toUpperCase(), x, y, { width: col.ancho, align: col.alinear || "right", characterSpacing: 0.4 });
    x += col.ancho;
  }
  linea(doc, y + 14, C.borde);
  return y + 20;
}

function filaTabla(doc, y, celdas, { negrita = false } = {}) {
  let x = MARGEN;
  celdas.forEach((texto, i) => {
    const col = COLUMNAS[i];
    const fuenteCelda = i === 0 || negrita ? "Negrita" : i === 6 ? "Extra" : "Regular";
    const color = i === 7 && texto !== "Cerrado" && texto !== "Editado" ? C.avisoTexto : i === 5 ? C.muted : C.texto;
    doc.font(fuenteCelda).fontSize(8.5).fillColor(color)
      .text(texto, x, y, { width: col.ancho, align: col.alinear || "right", lineBreak: false, ...NUM });
    x += col.ancho;
  });
  linea(doc, y + 15);
  return y + 21;
}

function pdfVentas(resumen) {
  const { desde, hasta, totales, filas, diasSinCierre } = resumen;
  const unDia = desde === hasta;
  const rango = unDia
    ? fechaLarga(desde, { conAnio: true })
    : `${diaMes(desde)} – ${diaMes(hasta)} de ${hasta.slice(0, 4)} · ${filas.length} días`;
  const doc = crearDocumento(`Ventas ${desde} a ${hasta}`);
  const w = ancho(doc);
  let y = encabezado(doc, "Ventas", rango);

  // Tres cifras grandes: ventas, egresos y neto.
  const caja = (w - 24) / 3;
  const cifras = [
    ["Ventas totales", pesos(totales.ventas), unDia ? "1 día" : `${filas.length} días`, C.texto],
    ["Egresos", pesos(totales.egresos), totales.ventas ? `${porcentaje(totales.egresos / totales.ventas)} de las ventas` : "Sin ventas", C.texto],
    ["Neto", pesos(totales.neto), "Ventas − egresos", C.brand],
  ];
  cifras.forEach(([etiqueta, valor, nota, color], i) => {
    const x = MARGEN + i * (caja + 12);
    doc.roundedRect(x, y, caja, 68, 10).fillAndStroke(C.elevado, C.borde);
    doc.font("Negrita").fontSize(8.5).fillColor(C.muted).text(etiqueta, x + 12, y + 11);
    doc.font("Extra").fontSize(16).fillColor(color).text(valor, x + 12, y + 26, { width: caja - 24, ...NUM });
    doc.font("Regular").fontSize(8).fillColor(C.muted).text(nota, x + 12, y + 49, NUM);
  });
  y += 88;

  if (diasSinCierre > 0) {
    y = aviso(doc, y, `${diasSinCierre === 1 ? "1 día sin cierre" : `${diasSinCierre} días sin cierre`}: ahí solo se cuenta Bre-B. Ciérralos para ver el total real.`);
  }

  // Por medio de pago: barra apilada y tres columnas.
  y = tituloSeccion(doc, "Por medio de pago", y);
  const medios = [
    ["Bre-B (QR)", totales.breb, C.breb],
    ["Tarjeta", totales.tarjeta, C.tarjeta],
    ["Efectivo", totales.efectivo, C.efectivo],
  ];
  let xb = MARGEN;
  doc.save();
  doc.roundedRect(MARGEN, y, w, 10, 5).clip();
  doc.rect(MARGEN, y, w, 10).fill(C.pista);
  for (const [, valor, color] of medios) {
    const largo = totales.ventas ? (valor / totales.ventas) * w : 0;
    if (largo > 0) doc.rect(xb, y, largo, 10).fill(color);
    xb += largo;
  }
  doc.restore();
  y += 20;
  const col = w / 3;
  medios.forEach(([nombre, valor, color], i) => {
    const x = MARGEN + i * col;
    punto(doc, x, y, color);
    doc.font("Semi").fontSize(9).fillColor(C.muted).text(nombre, x + 13, y + 1);
    doc.font("Extra").fontSize(13).fillColor(C.texto).text(pesos(valor), x, y + 15, NUM);
    doc.font("Regular").fontSize(8.5).fillColor(C.muted)
      .text(`${totales.ventas ? porcentaje(valor / totales.ventas) : "0 %"} de las ventas`, x, y + 33, NUM);
  });
  y += 60;

  // Por dia, del mas viejo al mas reciente para leerlo como un calendario.
  y = tituloSeccion(doc, "Por día", y);
  y = cabeceraTabla(doc, y);
  const raya = "—";
  for (const f of [...filas].reverse()) {
    if (y + 21 > fondo(doc)) {
      doc.addPage();
      y = cabeceraTabla(doc, MARGEN);
    }
    y = filaTabla(doc, y, [
      diaCorto(f.fecha),
      pesos(f.breb),
      f.tarjeta === null ? raya : pesos(f.tarjeta),
      f.efectivo === null ? raya : pesos(f.efectivo),
      pesos(f.ventas),
      f.egresos ? pesos(f.egresos) : raya,
      pesos(f.neto),
      ESTADOS[f.estado],
    ]);
  }
  if (y + 21 > fondo(doc)) {
    doc.addPage();
    y = cabeceraTabla(doc, MARGEN);
  }
  filaTabla(doc, y, [
    "Total",
    pesos(totales.breb),
    pesos(totales.tarjeta),
    pesos(totales.efectivo),
    pesos(totales.ventas),
    pesos(totales.egresos),
    pesos(totales.neto),
    "",
  ], { negrita: true });

  pieDePagina(doc);
  return doc;
}

module.exports = { pdfCierre, pdfVentas };
