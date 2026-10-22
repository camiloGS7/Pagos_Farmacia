/**
 * Barra apilada + lista con punto, nombre, cantidad, monto y porcentaje. La
 * usan "Por banco" (Resumen) y "Por medio de pago" (Ventas totales, celular).
 */

import { pesos, porcentaje } from "../lib/format.js";
import { Punto } from "./ui/index.jsx";

export function BarraApilada({ partes, total, alto }) {
  const visibles = partes.filter((p) => p.total > 0);
  const descripcion = visibles.map((p) => `${p.label} ${porcentaje(total ? p.total / total : 0)}`).join(", ");
  return (
    <div className="barra-apilada" role="img" aria-label={descripcion || "Sin datos"} style={alto ? { height: alto } : undefined}>
      {visibles.length ? (
        visibles.map((p) => (
          <span key={p.clave || p.label} style={{ width: `${(p.total / total) * 100}%`, background: p.color }} />
        ))
      ) : (
        <span style={{ width: "100%", background: "var(--track)" }} />
      )}
    </div>
  );
}

export function ListaReparto({ partes, total, mostrarCantidad = true, cantidadCorta = false }) {
  return (
    <ul className="reparto-lista">
      {partes.map((p) => (
        <li key={p.clave || p.label}>
          <Punto color={p.color} cuadrado />
          <span className="reparto-nombre">
            {p.label}
            {mostrarCantidad && (
              <span> · {cantidadCorta ? p.pagos : `${p.pagos} ${p.pagos === 1 ? "pago" : "pagos"}`}</span>
            )}
          </span>
          <span className="reparto-monto num">{pesos(p.total)}</span>
          <span className="reparto-pct num">{porcentaje(total ? p.total / total : 0)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Con muchos bancos la barra y la lista se vuelven ilegibles: se muestran los
 * cinco primeros y el resto se suma en "Otros", que sigue cuadrando al 100 %.
 */
export function topConOtros(grupos, cuantos = 5) {
  if (grupos.length <= cuantos + 1) return grupos;
  const resto = grupos.slice(cuantos);
  return [
    ...grupos.slice(0, cuantos),
    {
      clave: "otros",
      label: `Otros (${resto.length})`,
      color: "var(--b-otros)",
      total: resto.reduce((s, g) => s + g.total, 0),
      pagos: resto.reduce((s, g) => s + g.pagos, 0),
    },
  ];
}
