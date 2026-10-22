/**
 * Avisos flotantes: "Nuevo pago · $ 12.000" y "Se descargó cierre_2026-10-21.pdf".
 *
 * Abajo a la derecha en escritorio y encima de la barra de navegacion en el
 * celular. role="status" hace que el lector de pantalla los lea sin quitarle
 * el foco a lo que Gloria esta haciendo.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { Iconos } from "./Iconos.jsx";

const Contexto = createContext({ mostrar: () => {} });

export function useToast() {
  return useContext(Contexto);
}

export function ToastProvider({ children }) {
  const [avisos, setAvisos] = useState([]);
  const siguiente = useRef(1);

  const cerrar = useCallback((id) => setAvisos((lista) => lista.filter((a) => a.id !== id)), []);

  const mostrar = useCallback(
    ({ titulo, texto, tipo = "listo", duracion = 7000 }) => {
      const id = siguiente.current++;
      // Como mucho dos a la vez: una rafaga de pagos no debe tapar la pantalla.
      setAvisos((lista) => [...lista.slice(-1), { id, titulo, texto, tipo }]);
      if (duracion) setTimeout(() => cerrar(id), duracion);
    },
    [cerrar]
  );

  const valor = useMemo(() => ({ mostrar }), [mostrar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div className="toasts" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`toast toast-${a.tipo}`} role="status">
            <span className="toast-icono" aria-hidden="true">
              {a.tipo === "pago" ? <Iconos.Mas /> : <Iconos.Check />}
            </span>
            <span className="toast-textos">
              <span className="toast-titulo">{a.titulo}</span>
              {a.texto && <span className="toast-texto">{a.texto}</span>}
            </span>
            <button type="button" className="toast-cerrar" aria-label="Cerrar aviso" onClick={() => cerrar(a.id)}>
              <Iconos.Cerrar />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}
