/**
 * Pruebas de las formulas del cierre y de su validacion.
 *
 *     npm test
 *
 * Se prueban las dos copias de la formula (la del servidor, que manda, y la
 * del frontend, que muestra el cuadre mientras se escribe) con el mismo caso
 * de aceptacion, para que no se puedan separar sin que esto falle.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import servidor from "../lib/cierre.js";
import * as frontend from "../frontend/src/lib/cierre.js";

const CASO = {
  brebTotal: 177900,
  tarjetaTotal: 85000,
  baseInicial: 200000,
  efectivoContado: 610000,
  egresos: [
    { concepto: "Helados", monto: 70000, medio: "efectivo" },
    { concepto: "Pago camión", monto: 70000, medio: "transferencia" },
  ],
};

for (const [nombre, calcular] of [
  ["servidor", servidor.calcularCierre],
  ["frontend", frontend.calcularCierre],
]) {
  test(`${nombre}: caso de aceptacion de la fase 4`, () => {
    const r = calcular(CASO);
    assert.equal(r.ventaEfectivo, 480000);
    assert.equal(r.ventas, 742900);
    assert.equal(r.neto, 602900);
    assert.equal(r.egresosEfectivo, 70000);
    assert.equal(r.egresosTransferencia, 70000);
    assert.equal(r.egresosTotal, 140000);
  });

  test(`${nombre}: la venta en efectivo nunca es negativa`, () => {
    const r = calcular({ ...CASO, efectivoContado: 50000, egresos: [] });
    assert.equal(r.ventaEfectivo, 0);
    assert.equal(r.ventas, 177900 + 85000);
  });

  test(`${nombre}: sin tarjeta ni egresos`, () => {
    const r = calcular({ brebTotal: 1000, tarjetaTotal: 0, baseInicial: 0, efectivoContado: 0, egresos: [] });
    assert.deepEqual(
      { ventas: r.ventas, neto: r.neto, ventaEfectivo: r.ventaEfectivo },
      { ventas: 1000, neto: 1000, ventaEfectivo: 0 }
    );
  });

  test(`${nombre}: el egreso por transferencia no toca el efectivo`, () => {
    const r = calcular({
      ...CASO,
      egresos: [{ concepto: "Arriendo", monto: 300000, medio: "transferencia" }],
    });
    assert.equal(r.ventaEfectivo, 410000);
    assert.equal(r.neto, 177900 + 85000 + 410000 - 300000);
  });
}

test("validacion: acepta el caso y recorta espacios del concepto", () => {
  const v = servidor.validarCierre({
    ...CASO,
    egresos: [{ concepto: "  Helados  ", monto: 70000, medio: "efectivo" }],
  });
  assert.equal(v.ok, true);
  assert.equal(v.datos.egresos[0].concepto, "Helados");
  assert.equal(v.datos.version, null);
});

test("validacion: rechaza decimales, negativos y montos gigantes", () => {
  for (const malo of [10.5, -1, 100000001, "85000", null]) {
    const v = servidor.validarCierre({ ...CASO, tarjetaTotal: malo });
    assert.equal(v.ok, false, `deberia rechazar ${malo}`);
  }
});

test("validacion: concepto vacio, demasiado largo o medio desconocido", () => {
  const conEgreso = (e) => servidor.validarCierre({ ...CASO, egresos: [e] });
  assert.equal(conEgreso({ concepto: "   ", monto: 1000, medio: "efectivo" }).ok, false);
  assert.equal(conEgreso({ concepto: "x".repeat(81), monto: 1000, medio: "efectivo" }).ok, false);
  assert.equal(conEgreso({ concepto: "Helados", monto: 1000, medio: "cheque" }).ok, false);
  assert.equal(conEgreso({ concepto: "Helados", monto: 0, medio: "efectivo" }).ok, false);
});

test("validacion: maximo 50 egresos", () => {
  const egresos = Array.from({ length: 51 }, () => ({ concepto: "x", monto: 1, medio: "efectivo" }));
  assert.equal(servidor.validarCierre({ ...CASO, egresos }).ok, false);
  assert.equal(servidor.validarCierre({ ...CASO, egresos: egresos.slice(0, 50) }).ok, true);
});

test("validacion: version debe ser entero positivo", () => {
  assert.equal(servidor.validarCierre({ ...CASO, version: 0 }).ok, false);
  assert.equal(servidor.validarCierre({ ...CASO, version: 3 }).datos.version, 3);
});
