/**
 * Las tres piezas fijas del armazon:
 *   - BarraLateral (tablet y escritorio): logo, menu y estado de la captura.
 *   - BarraSuperior (celular): logo, titulo de la pantalla y botones de icono.
 *   - BarraInferior (celular): las cuatro pestañas.
 * El CSS muestra cada una solo en su tamaño.
 */

import { haceCuanto } from "../lib/format.js";
import { BotonIcono } from "./ui/index.jsx";
import { Iconos, Logo } from "./ui/Iconos.jsx";

export const SECCIONES = [
  { pagina: "resumen", etiqueta: "Resumen", movil: "Resumen", Icono: Iconos.Resumen },
  { pagina: "pagos", etiqueta: "Pagos", movil: "Pagos", Icono: Iconos.Pagos },
  { pagina: "reportes", etiqueta: "Reportes", movil: "Reportes", Icono: Iconos.Reportes },
  { pagina: "configuracion", etiqueta: "Configuración", movil: "Ajustes", Icono: Iconos.Ajustes },
];

/**
 * El semaforo de la captura. Verde mientras entran pagos; ambar si van mas de
 * 2 horas sin pagos en horario de atencion (puede que el correo no se este
 * revisando).
 */
export function estadoCaptura(ultimoPago, enHorario) {
  const minutos = ultimoPago?.minutos ?? null;
  const detenida = enHorario && (minutos === null || minutos >= 120);
  return {
    detenida,
    titulo: detenida ? (minutos === null ? "Sin pagos hoy" : `Sin pagos ${haceCuanto(minutos)}`) : "Recibiendo pagos",
    texto: detenida
      ? "Toca para revisar la captura."
      : minutos === null
        ? "Todavía no llegan pagos."
        : `Último pago ${haceCuanto(minutos)}.`,
  };
}

export function BarraLateral({ pagina, captura }) {
  return (
    <aside className="barra-lateral" aria-label="Menú">
      <div className="lateral-marca">
        <Logo />
        <div className="lateral-marca-textos">
          <span className="lateral-marca-nombre">Farmacia Glosar</span>
          <span className="lateral-marca-sub">Pagos digitales</span>
        </div>
      </div>

      <nav aria-label="Principal" className="lateral-nav">
        {SECCIONES.map(({ pagina: p, etiqueta, Icono }) => (
          <a
            key={p}
            href={`#/${p}`}
            className={"lateral-item" + (pagina === p ? " activo" : "")}
            aria-current={pagina === p ? "page" : undefined}
            aria-label={etiqueta}
            title={etiqueta}
          >
            <Icono />
            <span className="lateral-item-texto">{etiqueta}</span>
          </a>
        ))}
      </nav>

      <a
        href="#/configuracion/captura"
        className="lateral-estado"
        title={`${captura.titulo}. ${captura.texto}`}
        aria-label={`${captura.titulo}. ${captura.texto}`}
      >
        <span className="lateral-estado-fila" aria-hidden="true">
          <span
            className="punto"
            style={{ background: captura.detenida ? "#E3B55C" : "var(--hero-accent)" }}
          />
          <span className="lateral-estado-titulo">{captura.titulo}</span>
        </span>
        <span className="lateral-estado-texto" aria-hidden="true">{captura.texto}</span>
      </a>
    </aside>
  );
}

export function BotonTema({ tema, alternar, plano = false }) {
  const etiqueta = tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  return (
    <BotonIcono etiqueta={etiqueta} onClick={alternar} className={plano ? "btn-icono-plano" : undefined}>
      {tema === "oscuro" ? <Iconos.Sol tam={plano ? 22 : 18} /> : <Iconos.Luna tam={plano ? 22 : 18} />}
    </BotonIcono>
  );
}

export function BarraSuperior({ titulo, tema, alternarTema, refAcciones }) {
  return (
    <header className="barra-superior">
      <div className="barra-superior-marca">
        <Logo tam={30} />
        <h1>{titulo}</h1>
      </div>
      <div className="barra-superior-acciones">
        {/* Las pantallas ponen aqui sus botones de icono (por ejemplo el PDF de
            Ventas totales) con un portal. El de tema siempre va de ultimo. */}
        <div ref={refAcciones} style={{ display: "contents" }} />
        <BotonTema tema={tema} alternar={alternarTema} plano />
      </div>
    </header>
  );
}

export function BarraInferior({ pagina }) {
  return (
    <nav className="barra-inferior" aria-label="Principal">
      {SECCIONES.map(({ pagina: p, movil, Icono }) => (
        <a
          key={p}
          href={`#/${p}`}
          className={"nav-tab" + (pagina === p ? " activo" : "")}
          aria-current={pagina === p ? "page" : undefined}
        >
          <span className="nav-tab-icono">
            <Icono tam={22} grosor={pagina === p ? 2 : 1.8} />
          </span>
          {movil}
        </a>
      ))}
    </nav>
  );
}
