/**
 * Navegacion por el hash de la URL: #/pagos, #/reportes/cierre/2026-10-19.
 *
 * Con el hash, recargar la pagina o compartir el enlace deja a Gloria en la
 * misma pantalla, y el servidor no necesita saber nada de rutas (el hash
 * nunca le llega). Una libreria de rutas seria mas de lo que hace falta.
 */

import { useEffect, useState } from "react";

export const PAGINAS = ["resumen", "pagos", "reportes", "configuracion"];

export function leerRuta(hash = window.location.hash) {
  const limpio = hash.replace(/^#\/?/, "");
  const [camino, busqueda = ""] = limpio.split("?");
  const partes = camino.split("/").filter(Boolean);
  const pagina = PAGINAS.includes(partes[0]) ? partes[0] : "resumen";
  return { pagina, partes: partes.slice(1), params: new URLSearchParams(busqueda) };
}

export function navegar(destino, { reemplazar = false } = {}) {
  const hash = destino.startsWith("#") ? destino : `#${destino}`;
  if (reemplazar) window.history.replaceState(null, "", hash);
  else window.location.hash = hash;
  if (reemplazar) window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useRuta() {
  const [ruta, setRuta] = useState(() => leerRuta());
  useEffect(() => {
    const alCambiar = () => setRuta(leerRuta());
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);
  return ruta;
}
