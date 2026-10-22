import { useEffect, useState } from "react";

/**
 * "movil" (< 768 px), "tablet" (768-1023) o "escritorio" (>= 1024).
 *
 * Los mismos cortes que el CSS. Hace falta tambien en JavaScript para lo que
 * cambia de estructura y no solo de estilo: el detalle de un pago es un panel
 * lateral en escritorio y una hoja inferior en el celular, la grafica responde
 * al mouse o al dedo, y una tabla pasa a ser lista.
 */
const ESCRITORIO = "(min-width: 1024px)";
const TABLET = "(min-width: 768px)";

function medir() {
  if (window.matchMedia(ESCRITORIO).matches) return "escritorio";
  if (window.matchMedia(TABLET).matches) return "tablet";
  return "movil";
}

export function useBreakpoint() {
  const [tamano, setTamano] = useState(medir);

  useEffect(() => {
    const consultas = [window.matchMedia(ESCRITORIO), window.matchMedia(TABLET)];
    const alCambiar = () => setTamano(medir());
    consultas.forEach((c) => c.addEventListener("change", alCambiar));
    // Girar el telefono cruza el corte sin que se remonte nada.
    alCambiar();
    return () => consultas.forEach((c) => c.removeEventListener("change", alCambiar));
  }, []);

  return tamano;
}

export const esMovil = (tamano) => tamano === "movil";
