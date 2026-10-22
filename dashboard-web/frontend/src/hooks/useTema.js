import { useCallback, useEffect, useState } from "react";

import { useConfiguracion, useGuardarConfiguracion } from "../lib/consultas.js";

/**
 * Tema claro / oscuro / automatico.
 *
 * La preferencia se guarda en dos sitios a proposito:
 *   - localStorage: el script de index.html la lee ANTES de que cargue React,
 *     asi la pagina no parpadea en blanco cuando el tema es oscuro.
 *   - la tabla configuracion (clave "tema"): asi el celular y el computador de
 *     Gloria quedan con la misma eleccion.
 * Si las dos no coinciden, gana la de la base y se copia al navegador.
 */

const OSCURO = "(prefers-color-scheme: dark)";

function leerLocal() {
  try {
    const t = localStorage.getItem("tema");
    return t === "claro" || t === "oscuro" || t === "auto" ? t : "auto";
  } catch {
    return "auto";
  }
}

function aplicar(preferencia) {
  const oscuro =
    preferencia === "oscuro" ||
    (preferencia === "auto" && window.matchMedia(OSCURO).matches);
  const raiz = document.documentElement;
  raiz.classList.toggle("t-oscuro", oscuro);
  raiz.classList.toggle("t-claro", !oscuro);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", oscuro ? "#13171F" : "#F5F6F8");
  return oscuro ? "oscuro" : "claro";
}

export function useTema() {
  const config = useConfiguracion();
  const guardar = useGuardarConfiguracion();
  const [preferencia, setPreferencia] = useState(leerLocal);
  const [efectivo, setEfectivo] = useState(() => aplicar(leerLocal()));

  // La base manda: si otro dispositivo cambio el tema, se adopta aqui.
  const remoto = config.data?.tema;
  useEffect(() => {
    if (remoto && remoto !== preferencia) setPreferencia(remoto);
    // Solo reacciona a cambios del servidor, no a los locales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoto]);

  useEffect(() => {
    setEfectivo(aplicar(preferencia));
    try {
      localStorage.setItem("tema", preferencia);
    } catch {
      /* navegacion privada con storage bloqueado: no pasa nada */
    }
    if (preferencia !== "auto") return undefined;
    // En automatico se sigue al telefono en vivo (por ejemplo, al anochecer).
    const consulta = window.matchMedia(OSCURO);
    const alCambiar = () => setEfectivo(aplicar("auto"));
    consulta.addEventListener("change", alCambiar);
    return () => consulta.removeEventListener("change", alCambiar);
  }, [preferencia]);

  const cambiar = useCallback(
    (nueva) => {
      setPreferencia(nueva);
      guardar.mutate({ tema: nueva });
    },
    [guardar]
  );

  // El boton de la luna / el sol alterna entre claro y oscuro explicitos.
  const alternar = useCallback(
    () => cambiar(efectivo === "oscuro" ? "claro" : "oscuro"),
    [cambiar, efectivo]
  );

  return { preferencia, efectivo, cambiar, alternar };
}
