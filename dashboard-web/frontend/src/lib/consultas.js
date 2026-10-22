/**
 * Consultas compartidas entre pantallas (TanStack Query).
 *
 * TanStack Query guarda cada respuesta bajo una clave (['resumen','hoy'],
 * ['cierre', fecha]...). Dos componentes que piden la misma clave comparten
 * una sola peticion, y al guardar un cierre basta con "invalidar" sus claves
 * para que todas las pantallas que lo muestran se pongan al dia solas.
 */

import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { pedir } from "./api.js";

export const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20000,
      retry: (intentos, error) => error?.estado !== 400 && error?.estado !== 503 && intentos < 2,
    },
  },
});

/** Cada 60 s: la captura del correo tarda segundos, y asi no se gastan consultas a Neon. */
export const REFRESCO_MS = 60000;

export function useResumenHoy() {
  return useQuery({
    queryKey: ["resumen", "hoy"],
    queryFn: ({ signal }) => pedir("/api/resumen/hoy", { signal }),
    refetchInterval: REFRESCO_MS,
  });
}

/** Los pagos de hoy, para "¿Ya llegó el pago?" (se filtra en el navegador, al instante). */
export function usePagosDeHoy() {
  return useQuery({
    queryKey: ["pagos", "hoy", "busqueda"],
    queryFn: ({ signal }) => pedir("/api/pagos?periodo=hoy&limite=200", { signal }),
    refetchInterval: REFRESCO_MS,
  });
}

export function useConfiguracion() {
  return useQuery({
    queryKey: ["configuracion"],
    queryFn: ({ signal }) => pedir("/api/configuracion", { signal }),
    staleTime: 5 * 60000,
  });
}

export function useGuardarConfiguracion() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (cambios) => pedir("/api/configuracion", { metodo: "PUT", cuerpo: cambios }),
    // Se pinta el cambio antes de que conteste el servidor (un switch que
    // tarda un segundo en moverse parece roto) y se deshace si falla.
    onMutate: async (cambios) => {
      await cliente.cancelQueries({ queryKey: ["configuracion"] });
      const anterior = cliente.getQueryData(["configuracion"]);
      if (anterior) {
        cliente.setQueryData(["configuracion"], {
          ...anterior,
          ...cambios,
          avisos: { ...anterior.avisos, ...(cambios.avisos || {}) },
        });
      }
      return { anterior };
    },
    onError: (_error, _cambios, contexto) => {
      if (contexto?.anterior) cliente.setQueryData(["configuracion"], contexto.anterior);
    },
    onSuccess: (datos) => {
      cliente.setQueryData(["configuracion"], datos);
      cliente.invalidateQueries({ queryKey: ["resumen"] });
    },
  });
}

export function useCaptura() {
  return useQuery({
    queryKey: ["captura"],
    queryFn: ({ signal }) => pedir("/api/captura", { signal }),
    refetchInterval: REFRESCO_MS,
  });
}
