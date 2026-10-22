import { useEffect, useState } from "react";

import { ahoraBogota } from "../lib/fechas.js";

/**
 * La hora de Bogota, al dia cada 30 segundos. Sirve para el saludo, para el
 * recordatorio del cierre de las 9 p. m. y para notar el cambio de dia con la
 * pagina abierta toda la noche.
 */
export function useAhora(intervaloMs = 30000) {
  const [ahora, setAhora] = useState(() => ahoraBogota());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(ahoraBogota()), intervaloMs);
    return () => clearInterval(reloj);
  }, [intervaloMs]);
  return ahora;
}
