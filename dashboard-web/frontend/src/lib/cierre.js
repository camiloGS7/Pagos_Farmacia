/**
 * Las cuentas del cierre, para mostrar el cuadre mientras Gloria escribe.
 *
 * Es una copia de dashboard-web/lib/cierre.js: el servidor es el que manda
 * (recalcula todo al guardar), esta solo evita esperar a la red para ver el
 * neto. test/cierre.test.mjs prueba las dos con el mismo caso.
 */

/**
 * venta_efectivo = max(0, contado - base + egresos_en_efectivo)
 * ventas         = breb + tarjeta + venta_efectivo
 * neto           = ventas - egresos_totales
 */
export function calcularCierre({ brebTotal, tarjetaTotal, baseInicial, efectivoContado, egresos }) {
  const suma = (medio) =>
    egresos.filter((e) => e.medio === medio).reduce((t, e) => t + e.monto, 0);
  const egresosEfectivo = suma("efectivo");
  const egresosTransferencia = suma("transferencia");
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
