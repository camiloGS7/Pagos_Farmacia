import { useCallback, useEffect, useMemo, useState } from "react";

import "./App.css";
import { Iconos } from "./iconos.jsx";
import {
  RANGOS,
  fechaLarga,
  haceCuanto,
  hoyBogota,
  parametrosDe,
  sumarDias,
  traer,
  ventanaDe,
} from "./api.js";

import Resumen from "./vistas/Resumen.jsx";
import Transacciones from "./vistas/Transacciones.jsx";
import Reportes from "./vistas/Reportes.jsx";
import Configuracion from "./vistas/Configuracion.jsx";

/* Cada 60 segundos se vuelve a pedir todo. El robot de GitHub Actions corre
   cada 10 minutos, asi que refrescar mas seguido solo gastaria consultas a
   Neon sin traer nada nuevo; 60 s da la sensacion de tablero vivo sin costo. */
const REFRESCO_MS = 60000;

const VISTAS = [
  { clave: "resumen", etiqueta: "Resumen", icono: Iconos.Resumen, titulo: "Resumen del día" },
  { clave: "transacciones", etiqueta: "Transacciones", icono: Iconos.Lista, titulo: "Transacciones" },
  { clave: "reportes", etiqueta: "Reportes", icono: Iconos.Reporte, titulo: "Reportes" },
  { clave: "configuracion", etiqueta: "Configuración", icono: Iconos.Ajustes, titulo: "Configuración" },
];

/** Iniciales para el avatar: "Gloria Sarmiento" -> "GS" */
function iniciales(nombre) {
  return (nombre || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export default function App() {
  const [vista, setVista] = useState("resumen");
  const [tema, setTema] = useState(() =>
    document.documentElement.classList.contains("dark") ? "oscuro" : "claro"
  );

  const [rango, setRango] = useState(() => {
    const hoy = hoyBogota();
    return { clave: "hoy", desde: sumarDias(hoy, -6), hasta: hoy };
  });

  const [config, setConfig] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState(null);

  // Sube de uno en cada refresco. Las vistas lo tienen en sus dependencias, asi
  // que con un solo contador se recargan todas a la vez sin coordinarse entre si.
  const [version, setVersion] = useState(0);

  /* La meta se guarda en el navegador. El servidor trae un valor por defecto
     (variable de entorno META_DIARIA), pero cambiarlo desde Configuracion no
     deberia exigir redesplegar nada, y es una preferencia de quien mira el
     tablero, no un dato del negocio. */
  const [metaLocal, setMetaLocal] = useState(() => {
    const guardado = Number(localStorage.getItem("metaDiaria"));
    return Number.isFinite(guardado) && guardado > 0 ? guardado : null;
  });

  const ventana = useMemo(() => ventanaDe(rango), [rango]);
  const parametros = useMemo(() => parametrosDe(rango), [rango]);
  const metaDiaria = metaLocal ?? config?.metaDiaria ?? 0;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "oscuro");
    localStorage.setItem("tema", tema);
  }, [tema]);

  useEffect(() => {
    traer("/api/config")
      .then(setConfig)
      // Que falle el nombre del negocio no debe tumbar el tablero: se usan los
      // valores por defecto y se sigue.
      .catch(() => setConfig({ negocio: "Farmacias Glosar", administradora: "Gloria Sarmiento", metaDiaria: 0 }));
  }, []);

  useEffect(() => {
    let vigente = true;

    traer(`/api/resumen?${parametros}`)
      .then((datos) => {
        if (!vigente) return;
        setResumen(datos);
        setError(null);
      })
      .catch((e) => vigente && setError(e.message));

    // Si el rango cambia mientras una peticion vieja sigue en vuelo, esta
    // bandera evita que la respuesta tardia pise a la nueva.
    return () => {
      vigente = false;
    };
  }, [parametros, version]);

  useEffect(() => {
    const reloj = setInterval(() => setVersion((v) => v + 1), REFRESCO_MS);
    return () => clearInterval(reloj);
  }, []);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  const guardarMeta = useCallback((valor) => {
    setMetaLocal(valor);
    if (valor) localStorage.setItem("metaDiaria", String(valor));
    else localStorage.removeItem("metaDiaria");
  }, []);

  const vistaActual = VISTAS.find((v) => v.clave === vista);
  const negocio = config?.negocio || "Farmacias Glosar";
  const administradora = config?.administradora || "Gloria Sarmiento";

  const comunes = { rango, ventana, parametros, version, metaDiaria, recargar };

  return (
    <div className="app">
      <BarraLateral
        vista={vista}
        alCambiarVista={setVista}
        negocio={negocio}
        ultimoPago={resumen?.ultimoPago}
        hayError={Boolean(error)}
      />

      <div className="principal">
        <Cabecera
          titulo={vistaActual.titulo}
          rango={rango}
          alCambiarRango={setRango}
          mostrarFiltro={vista !== "configuracion"}
          tema={tema}
          alCambiarTema={() => setTema(tema === "oscuro" ? "claro" : "oscuro")}
          administradora={administradora}
          negocio={negocio}
        />

        <div className="contenido">
          {error && (
            <div className="aviso">
              No se pudo leer la base de datos: {error}
              <br />
              Revisa que el servidor siga arriba y que la cadena de conexión de Neon sea correcta.
            </div>
          )}

          {vista === "resumen" && <Resumen {...comunes} resumen={resumen} />}
          {vista === "transacciones" && <Transacciones {...comunes} />}
          {vista === "reportes" && <Reportes {...comunes} negocio={negocio} />}
          {vista === "configuracion" && (
            <Configuracion
              metaDiaria={metaDiaria}
              metaPorDefecto={config?.metaDiaria ?? 0}
              esMetaLocal={metaLocal !== null}
              alGuardarMeta={guardarMeta}
              tema={tema}
              alCambiarTema={setTema}
              negocio={negocio}
              administradora={administradora}
              resumen={resumen}
              hayError={Boolean(error)}
            />
          )}
        </div>

        {/* En el celular la barra lateral se vuelve una barra de pestañas abajo,
            donde ya no cabe el estado de sincronizacion: se repite aqui, al pie
            del contenido, y cada copia se oculta en el tamaño que no le toca. */}
        <EstadoSync
          ultimoPago={resumen?.ultimoPago}
          hayError={Boolean(error)}
          className="solo-movil"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Barra lateral
 * ------------------------------------------------------------------ */

function BarraLateral({ vista, alCambiarVista, negocio, ultimoPago, hayError }) {
  return (
    <aside className="barra-lateral">
      <div className="marca">
        <Iconos.Mortero />
        <div>
          <div className="marca-nombre">{negocio}</div>
          <div className="marca-sub">Pagos digitales</div>
        </div>
      </div>

      <nav className="menu">
        {VISTAS.map((v) => {
          const Icono = v.icono;
          return (
            <button
              key={v.clave}
              type="button"
              className={"menu-item" + (vista === v.clave ? " activo" : "")}
              onClick={() => alCambiarVista(v.clave)}
              aria-current={vista === v.clave ? "page" : undefined}
            >
              <Icono />
              {v.etiqueta}
            </button>
          );
        })}
      </nav>

      <EstadoSync
        ultimoPago={ultimoPago}
        hayError={hayError}
        className="solo-escritorio"
      />
    </aside>
  );
}

/**
 * El semaforo del robot: verde si acaba de entrar un pago, rojo si hace rato
 * que no.
 *
 * En escritorio vive al pie de la barra lateral y en movil al pie del
 * contenido, asi que recibe una clase para saber en cual de los dos sitios le
 * toca aparecer.
 */
function EstadoSync({ ultimoPago, hayError, className = "" }) {
  const desde = haceCuanto(ultimoPago);

  // Sin pagos en 24 horas es raro en una farmacia abierta: probablemente el
  // robot dejo de correr. Se marca en rojo para que se note sin leer.
  const frio = !desde || desde.includes("día");

  return (
    <div className={"estado-sync " + className}>
      <span className={"punto" + (hayError || frio ? " alerta" : "")} />
      <div className="estado-sync-texto">
        {hayError
          ? "Sin conexión con la base"
          : desde
            ? <>Último pago <span className="estado-sync-cuando">{desde}</span></>
            : "Sin pagos registrados"}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cabecera
 * ------------------------------------------------------------------ */

function Cabecera({
  titulo,
  rango,
  alCambiarRango,
  mostrarFiltro,
  tema,
  alCambiarTema,
  administradora,
  negocio,
}) {
  const hoy = hoyBogota();

  const elegir = (clave) => {
    if (clave !== "personalizado") {
      alCambiarRango({ ...rango, clave });
      return;
    }
    // Al entrar a personalizado se arranca con la ultima semana, que es un
    // punto de partida util en vez de dos campos vacios.
    alCambiarRango({
      clave: "personalizado",
      desde: rango.desde || sumarDias(hoy, -6),
      hasta: rango.hasta || hoy,
    });
  };

  return (
    <header className="cabecera">
      {/* Solo se ve en movil: alli la barra lateral, que es donde vive el
          nombre del negocio en escritorio, se reduce a iconos abajo. */}
      <div className="cabecera-negocio">{negocio}</div>

      <div className="cabecera-titulo">
        <h1>{titulo}</h1>
        <div className="cabecera-fecha">{fechaLarga(hoy)}</div>
      </div>

      {/* En movil este contenedor se vuelve "display: contents" para que el
          filtro, el boton de tema y el avatar se acomoden solos en la rejilla
          de la cabecera en vez de ir todos apretados en una fila. */}
      <div className="cabecera-acciones">
        {mostrarFiltro && (
          <div className="filtro">
            <div className="filtro-grupo" role="group" aria-label="Rango de fechas">
              {RANGOS.map((r) => (
                <button
                  key={r.clave}
                  type="button"
                  className={"filtro-boton" + (rango.clave === r.clave ? " activo" : "")}
                  onClick={() => elegir(r.clave)}
                  aria-pressed={rango.clave === r.clave}
                >
                  {r.etiqueta}
                </button>
              ))}
            </div>

            {rango.clave === "personalizado" && (
              <div className="filtro-fechas">
                <input
                  className="campo"
                  type="date"
                  value={rango.desde}
                  max={rango.hasta}
                  aria-label="Desde"
                  onChange={(e) => alCambiarRango({ ...rango, desde: e.target.value })}
                />
                <span>a</span>
                <input
                  className="campo"
                  type="date"
                  value={rango.hasta}
                  min={rango.desde}
                  max={hoy}
                  aria-label="Hasta"
                  onChange={(e) => alCambiarRango({ ...rango, hasta: e.target.value })}
                />
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="boton-icono"
          onClick={alCambiarTema}
          title={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          aria-label={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        >
          {tema === "oscuro" ? <Iconos.Sol /> : <Iconos.Luna />}
        </button>

        <div className="usuario">
          <div className="avatar">{iniciales(administradora)}</div>
          <div className="usuario-datos">
            <div className="usuario-nombre">{administradora}</div>
            <div className="usuario-rol">Administradora</div>
          </div>
        </div>
      </div>
    </header>
  );
}
