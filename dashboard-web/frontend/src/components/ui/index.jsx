/**
 * Componentes base del sistema de diseño. Toda la apariencia sale de los
 * tokens de estilos.css (.t-claro / .t-oscuro), asi que ninguno sabe en que
 * tema esta: el modo oscuro lo cambian las variables CSS.
 */

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { cifras } from "../../lib/format.js";
import { Iconos } from "./Iconos.jsx";

const unir = (...clases) => clases.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ *
 * Superficies
 * ------------------------------------------------------------------ */

export function Card({ as: Etiqueta = "section", className, children, ...resto }) {
  return (
    <Etiqueta className={unir("card", className)} {...resto}>
      {children}
    </Etiqueta>
  );
}

/** La tarjeta oscura: "Recaudado hoy", la grafica, el cuadre y las ventas totales. */
export function HeroCard({ as: Etiqueta = "section", className, children, ...resto }) {
  return (
    <Etiqueta className={unir("card", "hero", className)} {...resto}>
      {children}
    </Etiqueta>
  );
}

/** Titulo de tarjeta con subtitulo opcional y acciones a la derecha. */
export function CabeceraCard({ titulo, id, subtitulo, children, nivel = 2 }) {
  const H = `h${nivel}`;
  return (
    <div className="card-cabecera">
      <div className="card-cabecera-textos">
        <H id={id} className="card-titulo">{titulo}</H>
        {subtitulo && <p className="card-sub">{subtitulo}</p>}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Controles
 * ------------------------------------------------------------------ */

/**
 * Selector segmentado. Con `pestanas` se comporta como tablist (Reportes);
 * si no, como grupo de botones con aria-pressed.
 */
export function Segmented({ opciones, valor, onCambio, etiqueta, oscuro = false, pestanas = false, ancho = false, className }) {
  return (
    <div
      role={pestanas ? "tablist" : "group"}
      aria-label={etiqueta}
      className={unir("seg", oscuro && "seg-oscuro", ancho && "seg-ancho", className)}
      style={ancho ? { gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` } : undefined}
    >
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role={pestanas ? "tab" : undefined}
            aria-selected={pestanas ? activo : undefined}
            aria-pressed={pestanas ? undefined : activo}
            aria-controls={pestanas ? o.controla : undefined}
            id={pestanas ? o.id : undefined}
            className={unir("seg-opcion", activo && "activo")}
            onClick={() => onCambio(o.valor)}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

/** Chip de filtro. `variante="banco"`: activo con el verde de la marca. */
export function Chip({ activo, color, onClick, children, variante = "periodo" }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      className={unir("chip", `chip-${variante}`, activo && "activo")}
      onClick={onClick}
    >
      {color && <span className="punto" style={{ background: color }} />}
      {children}
    </button>
  );
}

export function Pill({ tono = "ok", children, className, ...resto }) {
  return (
    <span className={unir("pill", `pill-${tono}`, className)} {...resto}>
      {children}
    </span>
  );
}

/** Punto de color de un banco o medio de pago. Nunca va solo: siempre con su nombre. */
export function Punto({ color, cuadrado = false, tam }) {
  return (
    <span
      aria-hidden="true"
      className={unir("punto", cuadrado && "punto-cuadrado")}
      style={{ background: color, ...(tam ? { width: tam, height: tam } : null) }}
    />
  );
}

export function Button({ variante = "primario", icono, children, className, type = "button", ...resto }) {
  return (
    <button type={type} className={unir("btn", `btn-${variante}`, className)} {...resto}>
      {icono}
      {children}
    </button>
  );
}

export function BotonIcono({ etiqueta, children, className, ...resto }) {
  return (
    <button type="button" aria-label={etiqueta} title={etiqueta} className={unir("btn-icono", className)} {...resto}>
      {children}
    </button>
  );
}

export function Switch({ activo, onCambio, etiqueta, descripcion }) {
  const id = useId();
  return (
    <div className="switch-fila">
      <div className="switch-textos">
        <span className="switch-etiqueta" id={`${id}-e`}>{etiqueta}</span>
        {descripcion && <span className="switch-desc" id={`${id}-d`}>{descripcion}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-labelledby={`${id}-e`}
        aria-describedby={descripcion ? `${id}-d` : undefined}
        className={unir("switch", activo && "activo")}
        onClick={() => onCambio(!activo)}
      >
        <span className="switch-perilla" />
      </button>
    </div>
  );
}

/**
 * Campo de dinero: muestra "$ 610.000" mientras se escribe y entrega solo el
 * numero. inputmode="numeric" abre el teclado de numeros en el celular, y el
 * texto va a 16 px o mas para que iOS no haga zoom al tocarlo.
 */
export function MoneyInput({ id, valor, onCambio, etiqueta, ocultarEtiqueta = false, placeholder = "0", grande = false, className, ...resto }) {
  const generado = useId();
  const idCampo = id || generado;
  const texto = valor === null || valor === undefined || valor === "" ? "" : cifras(valor);
  return (
    <div className={unir("money-campo", className)}>
      {etiqueta && (
        <label htmlFor={idCampo} className={ocultarEtiqueta ? "sr-only" : "campo-etiqueta"}>
          {etiqueta}
        </label>
      )}
      <div className={unir("money", grande && "money-grande")}>
        <span className="money-signo" aria-hidden="true">$</span>
        <input
          id={idCampo}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={texto}
          onChange={(e) => {
            const digitos = e.target.value.replace(/\D/g, "").slice(0, 9);
            onCambio(digitos ? parseInt(digitos, 10) : null);
          }}
          {...resto}
        />
      </div>
    </div>
  );
}

export function CampoBusqueda({ id, valor, onCambio, etiqueta, placeholder, grande = false }) {
  return (
    <div className={unir("busqueda", grande && "busqueda-grande")}>
      <label htmlFor={id} className="sr-only">{etiqueta}</label>
      <Iconos.Lupa className="busqueda-icono" />
      <input
        id={id}
        type="search"
        autoComplete="off"
        enterKeyHint="search"
        placeholder={placeholder}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Avisos
 * ------------------------------------------------------------------ */

export function Aviso({ tono = "warn", icono, titulo, children, accion, role = "status" }) {
  return (
    <div className={unir("aviso", `aviso-${tono}`)} role={role}>
      {icono}
      <span className="aviso-texto">
        {titulo && <strong>{titulo}</strong>} {children}
      </span>
      {accion}
    </div>
  );
}

export function Skeleton({ alto = 16, ancho = "100%", radio = 8, className }) {
  return <span aria-hidden="true" className={unir("skeleton", className)} style={{ height: alto, width: ancho, borderRadius: radio }} />;
}

/** Bloque de carga para una tarjeta entera, con el texto para lectores de pantalla. */
export function CargandoCard({ alto = 160, hero = false, etiqueta = "Cargando" }) {
  return (
    <div className={unir("card", hero && "hero", "cargando-card")} style={{ minHeight: alto }} aria-busy="true">
      <span className="sr-only">{etiqueta}…</span>
      <Skeleton alto={14} ancho="40%" />
      <Skeleton alto={32} ancho="60%" />
      <Skeleton alto={12} ancho="80%" />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Capas: hoja inferior y dialogo
 * ------------------------------------------------------------------ */

/**
 * Mantiene el foco dentro de la capa abierta, la cierra con Escape, bloquea el
 * scroll del fondo y devuelve el foco a quien la abrio al cerrarse.
 */
function useCapa(abierto, alCerrar, refCapa) {
  useEffect(() => {
    if (!abierto) return undefined;
    const previo = document.activeElement;
    const desborde = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const enfocables = () =>
      [...(refCapa.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      ) || [])];
    const primero = refCapa.current?.querySelector("[data-autofocus]") || enfocables()[0];
    primero?.focus();

    const alTeclear = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        alCerrar();
        return;
      }
      if (e.key !== "Tab") return;
      const lista = enfocables();
      if (!lista.length) return;
      const [a, z] = [lista[0], lista[lista.length - 1]];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    const nodo = refCapa.current;
    nodo?.addEventListener("keydown", alTeclear);
    return () => {
      nodo?.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = desborde;
      if (previo && typeof previo.focus === "function") previo.focus();
    };
    // alCerrar cambia en cada render del padre; la capa solo debe montarse una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);
}

export function BottomSheet({ abierto, alCerrar, titulo, idTitulo, children, className }) {
  const ref = useRef(null);
  const generado = useId();
  const tituloId = idTitulo || `${generado}-t`;
  useCapa(abierto, alCerrar, ref);
  if (!abierto) return null;
  return createPortal(
    <div className="capa capa-hoja">
      <div className="scrim" onClick={alCerrar} aria-hidden="true" />
      <div ref={ref} className={unir("hoja", className)} role="dialog" aria-modal="true" aria-labelledby={tituloId}>
        <span className="hoja-asa" aria-hidden="true" />
        {titulo && <h2 id={tituloId} className="hoja-titulo">{titulo}</h2>}
        {children}
      </div>
    </div>,
    document.body
  );
}

export function Dialogo({ abierto, alCerrar, idTitulo, children, className }) {
  const ref = useRef(null);
  useCapa(abierto, alCerrar, ref);
  if (!abierto) return null;
  return createPortal(
    <div className="capa capa-dialogo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div ref={ref} className={unir("dialogo", className)} role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
        {children}
      </div>
    </div>,
    document.body
  );
}
