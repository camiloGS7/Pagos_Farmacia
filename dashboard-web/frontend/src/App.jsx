import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { BarraInferior, BarraLateral, BarraSuperior, SECCIONES, estadoCaptura } from "./components/Navegacion.jsx";
import { useToast } from "./components/ui/Toast.jsx";
import { useAhora } from "./hooks/useAhora.js";
import { useBreakpoint } from "./hooks/useBreakpoint.js";
import { useTema } from "./hooks/useTema.js";
import { banco } from "./lib/bancos.js";
import { useConfiguracion, useResumenHoy } from "./lib/consultas.js";
import { HORA_RECORDATORIO_CIERRE, enHorario } from "./lib/fechas.js";
import { pesos } from "./lib/format.js";
import { useRuta } from "./lib/ruta.js";
import { sonarPago } from "./lib/sonido.js";

import Resumen from "./pages/Resumen.jsx";
import Pagos from "./pages/Pagos.jsx";
import Reportes from "./pages/Reportes.jsx";
import Configuracion from "./pages/Configuracion.jsx";

/**
 * Lo que todas las pantallas comparten: tamaño de pantalla, tema, hora de
 * Bogota y los dos "huecos" del armazon movil donde una pantalla puede poner
 * botones propios (la barra de accion del cierre y el icono del PDF).
 */
const Contexto = createContext(null);
export const useApp = () => useContext(Contexto);

const PAGINAS = { resumen: Resumen, pagos: Pagos, reportes: Reportes, configuracion: Configuracion };
const TITULOS_MOVIL = { resumen: "Farmacia Glosar", pagos: "Pagos", reportes: "Reportes", configuracion: "Ajustes" };

/**
 * Avisa cuando entra un pago nuevo: toast, sonido (si esta activado) y
 * recarga de las listas que lo muestran. Compara contra el ultimo pago visto;
 * la primera carga no avisa nada.
 */
function useAvisoPagoNuevo(resumen, sonido) {
  const ultimoVisto = useRef(null);
  const { mostrar } = useToast();
  const cliente = useQueryClient();

  useEffect(() => {
    const ultimos = resumen?.ultimos;
    if (!ultimos) return;
    const masNuevo = ultimos[0]?.id ?? 0;
    if (ultimoVisto.current === null) {
      ultimoVisto.current = masNuevo;
      return;
    }
    if (masNuevo <= ultimoVisto.current) return;

    const nuevos = ultimos.filter((p) => p.id > ultimoVisto.current);
    ultimoVisto.current = masNuevo;
    const p = nuevos[0];
    const extra = nuevos.length > 1 ? ` · y ${nuevos.length - 1} más` : "";
    mostrar({
      tipo: "pago",
      titulo: `Nuevo pago · ${pesos(p.monto)}`,
      texto: `${banco(p.banco).label} · ${p.pagador || "Sin nombre"} · ahora${extra}`,
    });
    if (sonido) sonarPago();
    cliente.invalidateQueries({ queryKey: ["pagos"] });
    cliente.invalidateQueries({ queryKey: ["ventas"] });
    cliente.invalidateQueries({ queryKey: ["cierre"] });
    cliente.invalidateQueries({ queryKey: ["captura"] });
  }, [resumen, sonido, mostrar, cliente]);
}

/** A las 9 p. m., si no hay cierre del dia, un aviso una sola vez por dia. */
function useRecordatorioCierre(ahora, resumen, activo) {
  const { mostrar } = useToast();
  useEffect(() => {
    if (!activo || !resumen || resumen.cierreGuardado) return;
    if (ahora.h < HORA_RECORDATORIO_CIERRE) return;
    const clave = `recordatorio-cierre-${ahora.fecha}`;
    try {
      if (localStorage.getItem(clave)) return;
      localStorage.setItem(clave, "1");
    } catch {
      /* sin storage se avisa igual, una vez por carga */
    }
    mostrar({ titulo: "Aún no cierras la caja de hoy", texto: "Ve a Reportes › Cierre del día.", duracion: 12000 });
  }, [ahora, resumen, activo, mostrar]);
}

export default function App() {
  const ruta = useRuta();
  const tamano = useBreakpoint();
  const tema = useTema();
  const ahora = useAhora();
  const resumen = useResumenHoy();
  const config = useConfiguracion();
  const avisos = config.data?.avisos;

  const [slotAccion, setSlotAccion] = useState(null);
  const [slotSuperior, setSlotSuperior] = useState(null);
  const principal = useRef(null);

  useAvisoPagoNuevo(resumen.data, avisos?.sonido);
  useRecordatorioCierre(ahora, resumen.data, avisos?.recordarCierre);

  const captura = estadoCaptura(resumen.data?.ultimoPago, enHorario(ahora));
  const Pagina = PAGINAS[ruta.pagina];
  const seccion = SECCIONES.find((s) => s.pagina === ruta.pagina);

  // Al cambiar de pantalla se vuelve arriba y se actualiza el titulo de la pestaña.
  useEffect(() => {
    principal.current?.scrollTo({ top: 0 });
    document.title = `${seccion.etiqueta} · Farmacia Glosar`;
  }, [ruta.pagina, seccion]);

  const valor = { ruta, tamano, tema, ahora, resumen, config, captura, slotAccion, slotSuperior, principal };

  return (
    <Contexto.Provider value={valor}>
      <div className="app">
        <a href="#contenido" className="saltar" onClick={(e) => { e.preventDefault(); principal.current?.focus(); }}>
          Saltar al contenido
        </a>
        <BarraLateral pagina={ruta.pagina} captura={captura} />
        <div className="marco">
          <BarraSuperior
            titulo={TITULOS_MOVIL[ruta.pagina]}
            tema={tema.efectivo}
            alternarTema={tema.alternar}
            refAcciones={setSlotSuperior}
          />
          <main id="contenido" className="principal" ref={principal} tabIndex={-1}>
            <div className="contenido">
              <Pagina />
            </div>
          </main>
          <div className="slot-barra-accion" ref={setSlotAccion} />
          <BarraInferior pagina={ruta.pagina} />
        </div>
      </div>
    </Contexto.Provider>
  );
}
