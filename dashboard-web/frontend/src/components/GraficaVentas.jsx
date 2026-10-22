/**
 * Grafica de ventas del Resumen (Bre-B): Hoy por hora, 7 o 30 dias, o un
 * rango personalizado de hasta 90 dias.
 *
 * Se dibuja con divs y botones en vez de Recharts (que el proyecto no tenia):
 * cada barra es un <button> real, asi se puede recorrer con el teclado y el
 * lector de pantalla lee "Martes 20 oct, $ 426.000"; y no suma ~100 kB al
 * bundle por cinco columnas de colores.
 *
 * Reglas del diseño: sin cuadricula, sin eje Y, sin linea de promedio (el
 * promedio va como texto) y sin etiqueta "Mejor". La barra de hoy va opaca y
 * el resto al 34 %. Con mas de 10 barras no se escriben valores encima, y con
 * muchas columnas la grafica toma un ancho minimo y se desplaza de lado.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useApp } from "../App.jsx";
import { pedir, query } from "../lib/api.js";
import { diasEntre, sumarDias } from "../lib/fechas.js";
import {
  diaMes, diaSemana, diaSemanaCorto, mesCorto, pesos, pesosCortos, plural, variacion,
} from "../lib/format.js";
import { BotonIcono, Dialogo, HeroCard, Segmented, Skeleton } from "./ui/index.jsx";
import { Iconos } from "./ui/Iconos.jsx";

const RANGOS = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "7d", etiqueta: "7 días" },
  { valor: "30d", etiqueta: "30 días" },
  { valor: "personalizado", etiqueta: "Personalizado" },
];
const MAX_DIAS = 90;

function titulo(datos, rango) {
  if (rango === "hoy") return "Ventas · hoy, por hora";
  if (rango === "7d") return "Ventas · últimos 7 días";
  if (rango === "30d") return "Ventas · últimos 30 días";
  if (!datos) return "Ventas";
  return datos.desde === datos.hasta
    ? `Ventas · ${diaMes(datos.desde)}`
    : `Ventas · ${diaMes(datos.desde)} – ${diaMes(datos.hasta)}`;
}

function etiquetaPunto(p, unidad) {
  if (unidad === "hora") {
    return `${p.clave}:00 – ${p.clave + 1}:00${p.actual ? " · en curso" : ""}`;
  }
  return p.actual ? "Hoy · en curso" : `${diaSemana(p.clave)} ${diaMes(p.clave)}`;
}

/** Medidas segun cuantas barras hay y donde se dibujan. */
function medidas(n, lugar) {
  if (lugar === "movil") {
    const gap = n <= 7 ? 10 : n <= 10 ? 8 : 4;
    const ancho = n <= 10 ? 30 : 14;
    return { alto: 170, altoBarra: 128, gap, ancho, minCol: n > 14 ? 10 : 0 };
  }
  const grande = lugar === "grande";
  const gap = n <= 7 ? 28 : n <= 10 ? 20 : n <= 16 ? 12 : n <= 31 ? 6 : 3;
  const ancho = n <= 10 ? 56 : n <= 16 ? 40 : 26;
  return {
    alto: grande ? 400 : 260,
    altoBarra: grande ? 330 : 200,
    gap: grande ? Math.round(gap * 1.6) : gap,
    ancho: grande ? Math.round(ancho * 1.45) : ancho,
    minCol: n > 16 ? (grande ? 20 : 14) : 0,
  };
}

function ejeDe(p, i, n, unidad, lugar) {
  if (unidad === "hora") {
    // En el celular, con muchas horas, se rotula una si y otra no (contando
    // desde la actual, que siempre se ve).
    const salta = lugar === "movil" && n > 9 && (n - 1 - i) % 2 !== 0;
    return { arriba: "", abajo: salta ? "" : `${p.clave} h` };
  }
  if (n <= 10) return { arriba: diaSemanaCorto(p.clave), abajo: p.actual ? "Hoy" : String(Number(p.clave.slice(8))) };
  const paso = n <= 31 ? 5 : 7;
  const dia = Number(p.clave.slice(8));
  return {
    arriba: i === 0 || dia === 1 ? mesCorto(p.clave) : "",
    abajo: p.actual ? "Hoy" : (n - 1 - i) % paso === 0 ? String(dia) : "",
  };
}

function Barras({ datos, lugar, activo, setActivo }) {
  const { puntos, unidad } = datos;
  const n = puntos.length;
  const m = medidas(n, lugar);
  const maximo = Math.max(...puntos.map((p) => p.total), 1) * 1.08;
  const conValores = n <= 10;
  const radio = m.ancho >= 26 ? "6px 6px 2px 2px" : "4px 4px 1px 1px";
  const tactil = lugar === "movil";

  // Cuando la grafica es mas ancha que la pantalla, arranca mostrando el
  // final: lo que Gloria quiere ver primero es hoy, no el dia mas viejo.
  const caja = useRef(null);
  useEffect(() => {
    if (caja.current) caja.current.scrollLeft = caja.current.scrollWidth;
  }, [n, datos.desde]);

  return (
    <div className="barras-caja" ref={caja}>
      <div className="barras-lienzo" style={{ minWidth: m.minCol ? n * (m.minCol + m.gap) : undefined }}>
        <div className="barras" style={{ height: m.alto, gap: m.gap }} onMouseLeave={tactil ? undefined : () => setActivo(null)}>
          {puntos.map((p, i) => {
            const alto = Math.max(3, Math.round((p.total / maximo) * m.altoBarra));
            const elegido = activo === i;
            const opacidad = p.actual ? 1 : elegido ? 0.72 : 0.34;
            const etiqueta = etiquetaPunto(p, unidad);
            let posicion = { left: "50%", transform: "translateX(-50%)" };
            if (i < 2) posicion = { left: 0 };
            else if (i > n - 3) posicion = { right: 0 };
            return (
              <button
                key={p.clave}
                type="button"
                className={"barra-col" + (p.actual ? " actual" : "")}
                aria-label={`${etiqueta}, ${pesos(p.total)}`}
                aria-pressed={tactil ? elegido : undefined}
                onClick={tactil ? () => setActivo(i) : undefined}
                onMouseEnter={tactil ? undefined : () => setActivo(i)}
                onFocus={() => setActivo(i)}
                onBlur={tactil ? undefined : () => setActivo(null)}
                style={{ cursor: tactil ? "pointer" : "default" }}
              >
                {conValores && <span className="barra-valor">{pesosCortos(p.total)}</span>}
                <span
                  className="barra"
                  style={{ height: alto, maxWidth: m.ancho, borderRadius: radio, opacity: tactil && elegido ? 1 : opacidad }}
                />
                {!tactil && elegido && (
                  <span className="pista-barra" role="tooltip" style={{ bottom: alto + (conValores ? 30 : 12), ...posicion }}>
                    <span className="pista-barra-fecha">{etiqueta}</span>
                    <span className="pista-barra-valor">{pesos(p.total)}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="eje" aria-hidden="true" style={{ gap: m.gap }}>
          {puntos.map((p, i) => {
            const eje = ejeDe(p, i, n, unidad, lugar);
            return (
              <span key={p.clave} className={p.actual ? "actual" : undefined}>
                <span className="eje-arriba">{eje.arriba}</span>
                <span className="eje-abajo">{eje.abajo}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Cifras({ datos, rango }) {
  const { unidad } = datos;
  let nota;
  if (rango === "hoy") {
    nota = <><strong>{plural(datos.pagos, "pago", "pagos")}</strong> recibidos hasta ahora</>;
  } else if (rango === "personalizado") {
    nota = <><strong>{plural(datos.puntos.length, "día", "días")}</strong> en el rango elegido</>;
  } else {
    const v = variacion(datos.variacion);
    const contra = rango === "7d" ? "frente a la semana pasada" : "frente a los 30 días anteriores";
    nota = v
      ? <><strong className={datos.variacion < 0 ? "baja" : undefined}>{v}</strong> {contra}</>
      : "Sin datos del periodo anterior para comparar.";
  }
  return (
    <>
      <span className="grafica-total num">{pesos(datos.total)}</span>
      <span className="grafica-nota">{nota}</span>
      <span className="grafica-nota">
        {unidad === "hora" ? "Promedio por hora" : "Promedio diario"} {pesos(datos.promedio)}
      </span>
    </>
  );
}

export default function GraficaVentas() {
  const { tamano, ahora } = useApp();
  const movil = tamano === "movil";
  const idTitulo = useId();
  const hoy = ahora.fecha;

  const [rango, setRango] = useState("7d");
  const [fechas, setFechas] = useState(() => ({ desde: sumarDias(hoy, -13), hasta: hoy }));
  const [activo, setActivo] = useState(null);
  const [ampliada, setAmpliada] = useState(false);

  // Si se pasan de 90 dias se recorta el inicio y se avisa.
  const recorte = useMemo(() => {
    let { desde, hasta } = fechas;
    if (hasta > hoy) hasta = hoy;
    if (desde > hasta) desde = hasta;
    const recortado = diasEntre(desde, hasta) > MAX_DIAS;
    if (recortado) desde = sumarDias(hasta, -(MAX_DIAS - 1));
    return { desde, hasta, recortado };
  }, [fechas, hoy]);

  const personalizado = rango === "personalizado";
  const consulta = useQuery({
    queryKey: ["ventas", "serie", rango, personalizado ? recorte.desde : null, personalizado ? recorte.hasta : null],
    queryFn: ({ signal }) =>
      pedir(`/api/ventas/serie${query({ rango, desde: personalizado ? recorte.desde : null, hasta: personalizado ? recorte.hasta : null })}`, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: 60000,
  });
  const datos = consulta.data && consulta.data.rango === rango ? consulta.data : null;

  // Al cambiar de rango, en el celular la linea de lectura vuelve a la barra
  // en curso (la ultima); en escritorio se suelta el tooltip.
  useEffect(() => {
    setActivo(null);
  }, [rango, recorte.desde, recorte.hasta]);

  const puntos = datos?.puntos || [];
  const seleccion = movil ? (activo ?? (puntos.length ? puntos.length - 1 : null)) : activo;

  const selectorFechas = personalizado ? (
    <div className="fechas">
      <label>
        Desde
        <input
          type="date"
          className="campo-fecha"
          value={fechas.desde}
          max={hoy}
          onChange={(e) => e.target.value && setFechas((f) => ({ ...f, desde: e.target.value }))}
        />
      </label>
      <label>
        Hasta
        <input
          type="date"
          className="campo-fecha"
          value={fechas.hasta}
          max={hoy}
          onChange={(e) => e.target.value && setFechas((f) => ({ ...f, hasta: e.target.value }))}
        />
      </label>
      {(recorte.recortado || datos?.recortado) && (
        <span className="fechas-nota" role="status">Máximo 90 días por consulta.</span>
      )}
    </div>
  ) : null;

  const cuerpo = (lugar, activoLocal, setActivoLocal) => {
    if (consulta.isError && !datos) {
      return <p className="grafica-vacia" role="alert">No pudimos cargar la gráfica. Revisa tu conexión.</p>;
    }
    if (!datos) {
      return (
        <div aria-busy="true" style={{ height: lugar === "movil" ? 190 : 300, display: "flex", alignItems: "flex-end", gap: 12 }}>
          {[40, 70, 55, 85, 60, 30, 75].map((h, i) => <Skeleton key={i} alto={`${h}%`} radio={6} />)}
        </div>
      );
    }
    if (!puntos.length || (rango === "hoy" && datos.pagos === 0)) {
      return <p className="grafica-vacia">Aún no hay pagos hoy.</p>;
    }
    return <Barras datos={datos} lugar={lugar} activo={activoLocal} setActivo={setActivoLocal} />;
  };

  if (movil) {
    const elegido = seleccion !== null ? puntos[seleccion] : null;
    return (
      <HeroCard className="grafica" aria-labelledby={idTitulo}>
        <div className="grafica-cifras">
          <h2 id={idTitulo} className="hero-etiqueta">{titulo(datos, rango)}</h2>
          {datos ? <Cifras datos={datos} rango={rango} /> : <Skeleton alto={34} ancho="55%" />}
        </div>
        <Segmented opciones={RANGOS} valor={rango} onCambio={setRango} etiqueta="Rango de la gráfica" oscuro ancho className="seg-auto" />
        {selectorFechas}
        {elegido && (
          <div className="lectura" role="status">
            <span className="lectura-etiqueta">{etiquetaPunto(elegido, datos.unidad)}</span>
            <span className="lectura-valor num">{pesos(elegido.total)}</span>
          </div>
        )}
        {cuerpo("movil", seleccion, setActivo)}
      </HeroCard>
    );
  }

  return (
    <>
      <HeroCard className="grafica" aria-labelledby={idTitulo}>
        <div className="grafica-arriba">
          <div className="grafica-cifras">
            <h2 id={idTitulo} className="hero-etiqueta">{titulo(datos, rango)}</h2>
            {datos ? <Cifras datos={datos} rango={rango} /> : <Skeleton alto={38} ancho={220} />}
          </div>
          <div className="grafica-controles">
            <Segmented opciones={RANGOS} valor={rango} onCambio={setRango} etiqueta="Rango de la gráfica" oscuro />
            <BotonIcono etiqueta="Ampliar gráfica de ventas" onClick={() => setAmpliada(true)} disabled={!datos}>
              <Iconos.Ampliar />
            </BotonIcono>
          </div>
        </div>
        {selectorFechas}
        {cuerpo("tarjeta", activo, setActivo)}
      </HeroCard>

      <Dialogo abierto={ampliada} alCerrar={() => setAmpliada(false)} idTitulo={`${idTitulo}-dlg`} className="card hero grafica">
        <div className="grafica-arriba">
          <div className="grafica-cifras">
            <h2 id={`${idTitulo}-dlg`} className="hero-etiqueta">{titulo(datos, rango)}</h2>
            {datos && <Cifras datos={datos} rango={rango} />}
          </div>
          <div className="grafica-controles">
            <Segmented opciones={RANGOS} valor={rango} onCambio={setRango} etiqueta="Rango de la gráfica" oscuro />
            <BotonIcono etiqueta="Cerrar gráfica ampliada" onClick={() => setAmpliada(false)} data-autofocus>
              <Iconos.Cerrar tam={18} />
            </BotonIcono>
          </div>
        </div>
        {selectorFechas}
        {cuerpo("grande", activo, setActivo)}
        {datos && datos.masAlto && (
          <dl className="grafica-pie">
            <div>
              <dt>Más alto</dt>
              <dd className="num">{etiquetaPunto(puntos.find((p) => p.clave === datos.masAlto.clave) || puntos[0], datos.unidad)} · {pesos(datos.masAlto.total)}</dd>
            </div>
            <div>
              <dt>Más bajo</dt>
              <dd className="num">{etiquetaPunto(puntos.find((p) => p.clave === datos.masBajo.clave) || puntos[0], datos.unidad)} · {pesos(datos.masBajo.total)}</dd>
            </div>
            <div>
              <dt>{datos.unidad === "hora" ? "Promedio por hora" : "Promedio diario"}</dt>
              <dd className="num">{pesos(datos.promedio)}</dd>
            </div>
          </dl>
        )}
      </Dialogo>
    </>
  );
}
