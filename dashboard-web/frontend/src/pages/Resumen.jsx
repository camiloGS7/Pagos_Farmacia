/**
 * Resumen: cuanto llevo hoy, ¿ya llego el pago?, como va la semana y de que
 * banco viene la plata. Lo mas importante (el total de hoy) va arriba a la
 * izquierda.
 */

import { useMemo, useState } from "react";

import { useApp } from "../App.jsx";
import GraficaVentas from "../components/GraficaVentas.jsx";
import { HojaPago } from "../components/DetallePago.jsx";
import { BotonTema } from "../components/Navegacion.jsx";
import { BarraApilada, ListaReparto, topConOtros } from "../components/Reparto.jsx";
import {
  Aviso, Button, Card, CabeceraCard, CampoBusqueda, CargandoCard, Chip, HeroCard, Punto,
} from "../components/ui/index.jsx";
import { Iconos } from "../components/ui/Iconos.jsx";
import { mensajeDeError } from "../lib/api.js";
import { agruparBancos, banco } from "../lib/bancos.js";
import { usePagosDeHoy } from "../lib/consultas.js";
import { HORA_RECORDATORIO_CIERRE } from "../lib/fechas.js";
import { diaMes, fechaLarga, hora24, pesos, plural, porcentaje, saludo, variacion } from "../lib/format.js";
import { navegar } from "../lib/ruta.js";

function cuandoFue(fechaHora, hoy) {
  if (!fechaHora) return "";
  const dia = fechaHora.slice(0, 10);
  return dia === hoy ? hora24(fechaHora) : `${diaMes(dia)} · ${hora24(fechaHora)}`;
}

/* ------------------------------------------------------------------ */

function Recaudado({ datos, hoy }) {
  const meta = datos.meta;
  const fraccion = meta > 0 ? Math.min(1, datos.total / meta) : 0;
  const faltan = Math.max(0, meta - datos.total);
  const v = variacion(datos.variacion.total);
  return (
    <HeroCard className="recaudado" aria-labelledby="recaudado-t" style={{ "--crece": 3, "--base": "440px" }}>
      <div className="recaudado-arriba">
        <h2 id="recaudado-t" className="hero-etiqueta">Recaudado hoy</h2>
        {datos.ultimoPago && (
          <span className="recaudado-ultimo">Último pago {cuandoFue(datos.ultimoPago.fechaHora, hoy)}</span>
        )}
      </div>
      <div>
        <span className="recaudado-monto num">{pesos(datos.total)}</span>
        <p className="recaudado-variacion">
          {v ? (
            <>
              <span className={"pill-hero" + (datos.variacion.total < 0 ? " baja" : "")}>{v}</span>
              frente a ayer a esta hora
            </>
          ) : datos.ayerALaHora.pagos === 0 ? (
            "Ayer a esta hora todavía no había pagos."
          ) : null}
        </p>
      </div>
      <div className="meta">
        <div className="meta-arriba">
          <span>Meta del día · <strong>{porcentaje(fraccion)}</strong></span>
          <span className="meta-objetivo num">{pesos(meta)}</span>
        </div>
        <div
          className="barra-progreso"
          role="progressbar"
          aria-label="Avance de la meta del día"
          aria-valuenow={Math.round(fraccion * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${fraccion * 100}%` }} />
        </div>
        <span className="meta-nota">
          {meta <= 0
            ? "Aún no tienes meta diaria. "
            : faltan > 0
              ? `Faltan ${pesos(faltan)}`
              : `Meta cumplida. Vas ${pesos(datos.total - meta)} por encima.`}
          <span className="solo-grande"> · <a href="#/configuracion/meta">cambiar meta</a></span>
        </span>
      </div>
    </HeroCard>
  );
}

function Kpis({ datos, hoy }) {
  const delta = (fraccion, largo) => {
    const v = variacion(fraccion);
    if (!v) {
      return (
        <span className="kpi-nota">
          <span className="kpi-texto-largo">Sin comparación</span>
          <span className="kpi-texto-corto" aria-label="Sin comparación">—</span>
        </span>
      );
    }
    return (
      <span className="kpi-nota">
        <strong className={fraccion < 0 ? "baja" : "sube"}>{v}</strong>
        <span className="kpi-texto-largo"> {largo}</span>
      </span>
    );
  };
  const alto = datos.masAlto;
  return (
    <section className="kpis" aria-label="Indicadores de hoy">
      <Card as="div" className="kpi">
        <span className="kpi-etiqueta"><span className="kpi-texto-largo">Pagos recibidos</span><span className="kpi-texto-corto">Pagos</span></span>
        <span className="kpi-valor num">{datos.pagos.toLocaleString("es-CO")}</span>
        {delta(datos.variacion.pagos, "frente a ayer")}
      </Card>
      <Card as="div" className="kpi">
        <span className="kpi-etiqueta"><span className="kpi-texto-largo">Promedio por pago</span><span className="kpi-texto-corto">Promedio</span></span>
        <span className="kpi-valor num">{pesos(datos.promedio)}</span>
        {delta(datos.variacion.promedio, "frente a ayer")}
      </Card>
      <Card as="div" className="kpi">
        <span className="kpi-etiqueta"><span className="kpi-texto-largo">Pago más alto</span><span className="kpi-texto-corto">Más alto</span></span>
        <span className="kpi-valor num">{alto ? pesos(alto.monto) : "—"}</span>
        <span className="kpi-nota">
          {alto ? (
            <>
              {banco(alto.banco).label}
              <span className="kpi-texto-largo"> · {cuandoFue(alto.fechaHora, hoy)}</span>
            </>
          ) : (
            <>
              <span className="kpi-texto-largo">Aún no hay pagos</span>
              <span className="kpi-texto-corto">Sin pagos</span>
            </>
          )}
        </span>
      </Card>
    </section>
  );
}

const quitarTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "¿Ya llegó el pago?": busca entre los pagos de hoy, al instante, sin boton. */
function Verificar({ movil, alAbrir }) {
  const [texto, setTexto] = useState("");
  const pagos = usePagosDeHoy();
  const lista = pagos.data?.pagos || [];
  const q = texto.trim();

  const resultados = useMemo(() => {
    if (q.length < 2) return [];
    const ql = quitarTildes(q);
    const digitos = q.replace(/\D/g, "");
    return lista
      .filter((p) =>
        quitarTildes(p.pagador).includes(ql) ||
        p.referencia.toLowerCase().includes(ql) ||
        p.numero.toLowerCase().includes(ql) ||
        (digitos.length >= 3 && String(p.monto).includes(digitos))
      )
      .slice(0, 3);
  }, [q, lista]);

  // Ejemplos sacados de los pagos reales de hoy: un monto, un apellido y el
  // comienzo de una referencia.
  const ejemplos = useMemo(() => {
    const [a, b, c] = [lista[0], lista[1] || lista[0], lista[2] || lista[0]];
    if (!a) return [];
    const apellido = (b.pagador || "").trim().split(/\s+/).slice(-1)[0];
    return [String(a.monto), apellido, (c.referencia || c.numero).slice(0, 5)]
      .filter((x, i, todos) => x && x.length >= 2 && todos.indexOf(x) === i);
  }, [lista]);

  return (
    <Card className="verificar" aria-labelledby="verificar-t" style={{ "--crece": 2, "--base": "340px" }}>
      <div>
        <h2 id="verificar-t" className="card-titulo">¿Ya llegó el pago?</h2>
        <p className="card-sub solo-grande">Busca por nombre, monto o referencia.</p>
      </div>
      <CampoBusqueda
        id="verificar"
        etiqueta="Buscar un pago de hoy"
        placeholder={movil ? "Nombre, monto o referencia" : "Ej.: 70000 o Andrea"}
        valor={texto}
        onCambio={setTexto}
        grande
      />
      <div className="verificar-resultados" aria-live="polite">
        {q.length < 2 && ejemplos.length > 0 && (
          <div className={"ejemplos" + (movil ? " chips desliza" : "")} style={movil ? { margin: "0 -18px", padding: "0 18px" } : undefined}>
            <span className="ejemplos-titulo solo-grande">Prueba:</span>
            {ejemplos.map((e) => (
              <Chip key={e} variante="ejemplo" onClick={() => setTexto(e)}>{e}</Chip>
            ))}
          </div>
        )}
        {resultados.map((p) => {
          const b = banco(p.banco);
          return (
            <button key={p.id} type="button" className="resultado" onClick={() => alAbrir(p)}>
              <span className="resultado-check"><Iconos.Check /></span>
              <span className="resultado-textos">
                <span className="resultado-nombre">{p.pagador || "Sin nombre"}</span>
                <span className="resultado-sub"><Punto color={b.color} tam={6} />{b.label} · {hora24(p.fechaHora)}</span>
              </span>
              <span className="resultado-monto num">{pesos(p.monto)}</span>
            </button>
          );
        })}
        {q.length >= 2 && !resultados.length && pagos.data && (
          <div className="no-llega">
            <strong>Aún no llega «{q}»</strong>
            <span>Espera unos minutos o pide el comprobante.</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function PorBanco({ datos, estilo }) {
  const grupos = topConOtros(agruparBancos(datos.porBanco));
  const total = datos.total;
  return (
    <Card className="reparto" aria-labelledby="banco-t" style={estilo}>
      <CabeceraCard
        id="banco-t"
        titulo="Por banco"
        subtitulo={grupos.length ? `Hoy lidera ${grupos[0].label}.` : "Aún no hay pagos hoy."}
      />
      {grupos.length > 0 && (
        <>
          <BarraApilada partes={grupos} total={total} />
          <ListaReparto partes={grupos} total={total} />
        </>
      )}
    </Card>
  );
}

function UltimosPagos({ datos, hoy, movil, alAbrir, estilo }) {
  const filas = datos.ultimos;
  return (
    <Card aria-labelledby="ultimos-t" style={{ display: "flex", flexDirection: "column", gap: 12, ...estilo }}>
      <CabeceraCard id="ultimos-t" titulo="Últimos pagos">
        <a className="btn btn-enlace" href="#/pagos">
          Ver todos
          <Iconos.Derecha tam={16} />
        </a>
      </CabeceraCard>
      {!filas.length ? (
        <p className="vacio">Todavía no hay pagos registrados.</p>
      ) : movil ? (
        <ul className="lista-filas">
          {filas.map((p) => {
            const b = banco(p.banco);
            return (
              <li key={p.id}>
                <button type="button" className="fila-tactil" onClick={() => alAbrir(p)}>
                  <span className="fila-tactil-textos">
                    <span className="fila-tactil-titulo">{p.pagador || "Sin nombre"}</span>
                    <span className="fila-tactil-sub"><Punto color={b.color} tam={7} />{b.label} · {cuandoFue(p.fechaHora, hoy)}</span>
                  </span>
                  <span className="fila-tactil-monto num">{pesos(p.monto)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="tabla-caja">
          <table className="tabla" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th scope="col">Hora</th>
                <th scope="col">Quién pagó</th>
                <th scope="col">Banco</th>
                <th scope="col" className="der">Monto</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => {
                const b = banco(p.banco);
                return (
                  <tr key={p.id}>
                    <td className="celda-hora">{cuandoFue(p.fechaHora, hoy)}</td>
                    <td className="celda-nombre">{p.pagador || "Sin nombre"}</td>
                    <td><span className="banco-etiqueta"><Punto color={b.color} />{b.label}</span></td>
                    <td className="der fuerte num">{pesos(p.monto)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export default function Resumen() {
  const { tamano, tema, ahora, resumen, config, captura } = useApp();
  const movil = tamano === "movil";
  const [abierto, setAbierto] = useState(null);
  const datos = resumen.data;
  const hoy = ahora.fecha;
  const avisos = config.data?.avisos;

  // En el celular el detalle se abre en una hoja; en escritorio se va a Pagos
  // con ese pago abierto en el panel lateral.
  const abrir = (pago) => {
    if (movil) setAbierto(pago);
    else navegar(`/pagos?q=${encodeURIComponent(pago.referencia || pago.numero)}&abrir=${pago.id}`);
  };

  const encabezado = (
    <header className="resumen-encabezado">
      <div className="saludo">
        <span className="saludo-fecha">{fechaLarga(hoy)}</span>
        <h1>{saludo(ahora.h)}, Gloria</h1>
        {datos && (
          <p className="saludo-resumen solo-grande">
            Llevas <strong className="num">{pesos(datos.total)}</strong> en {plural(datos.pagos, "pago", "pagos")} hoy.
          </p>
        )}
      </div>
      <span className="solo-grande"><BotonTema tema={tema.efectivo} alternar={tema.alternar} /></span>
    </header>
  );

  if (!datos) {
    return (
      <>
        {encabezado}
        {resumen.isError ? (
          <Aviso
            tono="error"
            role="alert"
            titulo={mensajeDeError(resumen.error)}
            accion={<Button variante="secundario" onClick={() => resumen.refetch()}>Intentar de nuevo</Button>}
          />
        ) : (
          <>
            <div className="fila"><CargandoCard hero alto={220} etiqueta="Cargando el total de hoy" /><CargandoCard alto={220} /></div>
            <CargandoCard hero alto={360} etiqueta="Cargando la gráfica" />
          </>
        )}
      </>
    );
  }

  const avisoCaptura = avisos?.sinPagos2h && captura.detenida && (
    <Aviso
      tono="warn"
      role="alert"
      icono={<Iconos.Alerta />}
      titulo={datos.ultimoPago ? `No llegan pagos ${captura.titulo.replace("Sin pagos ", "")}.` : "Hoy no ha llegado ningún pago."}
      accion={<a className="btn btn-secundario" href="#/configuracion/captura">Ver estado</a>}
    >
      Puede que el correo no se esté revisando.
    </Aviso>
  );

  const avisoCierre = avisos?.recordarCierre && ahora.h >= HORA_RECORDATORIO_CIERRE && !datos.cierreGuardado && (
    <Aviso
      tono="info"
      icono={<Iconos.Reloj />}
      titulo="Aún no cierras la caja de hoy."
      accion={<a className="btn btn-secundario" href="#/reportes/cierre">Cerrar caja</a>}
    />
  );

  const recaudado = <Recaudado datos={datos} hoy={hoy} />;
  const kpis = <Kpis datos={datos} hoy={hoy} />;
  const verificar = <Verificar movil={movil} alAbrir={abrir} />;

  return (
    <>
      {encabezado}
      {avisoCaptura}
      {avisoCierre}

      {movil ? (
        <>
          {recaudado}
          {kpis}
          {verificar}
        </>
      ) : (
        <>
          <div className="fila fila-estirada">
            {recaudado}
            {verificar}
          </div>
          {kpis}
        </>
      )}

      <GraficaVentas />

      {movil ? (
        <>
          <PorBanco datos={datos} />
          <UltimosPagos datos={datos} hoy={hoy} movil alAbrir={abrir} />
        </>
      ) : (
        <div className="fila">
          <UltimosPagos datos={datos} hoy={hoy} alAbrir={abrir} estilo={{ "--crece": 2, "--base": "520px" }} />
          <PorBanco datos={datos} estilo={{ "--base": "300px" }} />
        </div>
      )}

      <HojaPago pago={abierto} alCerrar={() => setAbierto(null)} />
    </>
  );
}
