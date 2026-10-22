/**
 * Reportes > Ventas totales: lo que vendio el negocio entero (Bre-B + tarjeta
 * + efectivo), los egresos y el neto, por dia o por rango.
 *
 * Los dias sin cierre solo cuentan Bre-B; la pantalla lo dice en vez de
 * esconderlo, porque un total que parece completo y no lo es engaña.
 */

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useApp } from "../../App.jsx";
import { descargar, mensajeDeError, pedir, query } from "../../lib/api.js";
import { sumarDias } from "../../lib/fechas.js";
import { diaCorto, diaMes, pesos, plural, porcentaje } from "../../lib/format.js";
import { BarraApilada, ListaReparto } from "../Reparto.jsx";
import { Aviso, BotonIcono, Button, Card, CabeceraCard, CargandoCard, Chip, HeroCard, Pill, Punto, Segmented } from "../ui/index.jsx";
import { Iconos } from "../ui/Iconos.jsx";
import { useToast } from "../ui/Toast.jsx";
import { ESTADOS_DIA } from "./CierreDia.jsx";

const RANGOS = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "7d", etiqueta: "7 días" },
  { valor: "30d", etiqueta: "30 días" },
  { valor: "personalizado", etiqueta: "Personalizado" },
];
// Cuantos dias hacia atras se pueden consultar (v1). El servidor tiene el
// mismo tope en VENTAS_MAX_DIAS y manda el suyo en la respuesta.
const MAX_DIAS = 60;

function ventana(rango, fechas, hoy, minimo) {
  if (rango === "hoy") return { desde: hoy, hasta: hoy };
  if (rango === "7d") return { desde: sumarDias(hoy, -6), hasta: hoy };
  if (rango === "30d") return { desde: sumarDias(hoy, -29), hasta: hoy };
  let { desde, hasta } = fechas;
  if (hasta > hoy) hasta = hoy;
  if (desde < minimo) desde = minimo;
  if (desde > hasta) desde = hasta;
  return { desde, hasta };
}

export default function VentasTotales() {
  const { tamano, ahora, slotSuperior } = useApp();
  const movil = tamano === "movil";
  const { mostrar } = useToast();
  const hoy = ahora.fecha;
  const minimo = sumarDias(hoy, -(MAX_DIAS - 1));

  const [rango, setRango] = useState("7d");
  const [fechas, setFechas] = useState(() => ({ desde: sumarDias(hoy, -13), hasta: hoy }));
  const [mensaje, setMensaje] = useState("");
  const [descargando, setDescargando] = useState(false);
  const { desde, hasta } = useMemo(() => ventana(rango, fechas, hoy, minimo), [rango, fechas, hoy, minimo]);

  const consulta = useQuery({
    queryKey: ["ventas", desde, hasta],
    queryFn: ({ signal }) => pedir(`/api/ventas/resumen${query({ desde, hasta })}`, { signal }),
    placeholderData: keepPreviousData,
  });
  const d = consulta.data;

  const pdf = async () => {
    setDescargando(true);
    setMensaje("");
    try {
      const nombre = await descargar(`/api/reportes/pdf${query({ desde, hasta, tipo: "ventas" })}`, "ventas.pdf");
      if (movil) mostrar({ titulo: `Se descargó ${nombre}` });
      else setMensaje(`Se descargó ${nombre}`);
    } catch (e) {
      const texto = mensajeDeError(e);
      if (movil) mostrar({ titulo: texto });
      else setMensaje(texto);
    } finally {
      setDescargando(false);
    }
  };

  const cambiarRango = (r) => {
    setRango(r);
    setMensaje("");
  };

  const selectorFechas = rango === "personalizado" && (
    <div className="fechas">
      <label>
        Desde
        <input type="date" className="campo-fecha" value={desde} min={minimo} max={hoy}
          onChange={(e) => e.target.value && setFechas((f) => ({ ...f, desde: e.target.value }))} />
      </label>
      <label>
        Hasta
        <input type="date" className="campo-fecha" value={hasta} min={minimo} max={hoy}
          onChange={(e) => e.target.value && setFechas((f) => ({ ...f, hasta: e.target.value }))} />
      </label>
    </div>
  );

  const iconoPdf = movil && slotSuperior && createPortal(
    <BotonIcono etiqueta="Descargar PDF" className="btn-icono-plano" onClick={pdf} disabled={descargando || !d}>
      <Iconos.Descargar tam={22} />
    </BotonIcono>,
    slotSuperior
  );

  const controles = movil ? (
    <>
      <div className="chips desliza" role="group" aria-label="Periodo">
        {RANGOS.map((r) => (
          <Chip key={r.valor} activo={rango === r.valor} onClick={() => cambiarRango(r.valor)}>{r.etiqueta}</Chip>
        ))}
      </div>
      {selectorFechas}
    </>
  ) : (
    <div className="ventas-controles">
      <div className="ventas-controles-izq">
        <Segmented opciones={RANGOS} valor={rango} onCambio={cambiarRango} etiqueta="Periodo" />
        {selectorFechas}
      </div>
      <div className="ventas-controles-der">
        {mensaje && <span className="ventas-pdf-nota" role="status">{mensaje}</span>}
        <Button variante="secundario" icono={<Iconos.Descargar />} onClick={pdf} disabled={descargando || !d}>
          {descargando ? "Descargando…" : "Descargar PDF"}
        </Button>
      </div>
    </div>
  );

  if (!d) {
    return (
      <>
        {iconoPdf}
        {controles}
        {consulta.isError ? (
          <Aviso tono="error" role="alert" titulo={mensajeDeError(consulta.error)}
            accion={<Button variante="secundario" onClick={() => consulta.refetch()}>Intentar de nuevo</Button>} />
        ) : (
          <div className="fila"><CargandoCard hero alto={140} etiqueta="Cargando las ventas" /><CargandoCard alto={140} /><CargandoCard alto={140} /></div>
        )}
      </>
    );
  }

  const t = d.totales;
  const etiquetaRango = rango === "hoy" ? "hoy" : d.desde === d.hasta ? diaMes(d.desde) : `${diaMes(d.desde)} – ${diaMes(d.hasta)}`;
  const medios = [
    { clave: "breb", label: "Bre-B (QR)", total: t.breb, color: "var(--b-breb)" },
    { clave: "tarjeta", label: "Tarjeta", total: t.tarjeta, color: "var(--m-tarjeta)" },
    { clave: "efectivo", label: "Efectivo", total: t.efectivo, color: "var(--m-efectivo)" },
  ];
  const notaEgresos = t.egresos ? `${porcentaje(t.ventas ? t.egresos / t.ventas : 0)} de las ventas` : "Sin egresos";
  const raya = "—";

  const avisoFaltantes = d.diasSinCierre > 0 && (
    <Aviso tono="warn">
      {plural(d.diasSinCierre, "día sin cierre", "días sin cierre")}: ahí solo se cuenta Bre-B. Ciérralos para ver el total real.
    </Aviso>
  );

  if (movil) {
    return (
      <>
        {iconoPdf}
        {controles}
        <HeroCard className="ventas-total" aria-label="Ventas totales">
          <span className="hero-etiqueta">Ventas totales · {etiquetaRango}</span>
          <span className="ventas-total-valor num">{pesos(t.ventas)}</span>
          <span className="ventas-total-nota">{plural(d.dias, "día", "días")}</span>
        </HeroCard>
        <div className="ventas-kpis">
          <Card as="div" className="ventas-kpi">
            <span className="kpi-etiqueta">Egresos</span>
            <span className="ventas-kpi-valor num">{pesos(t.egresos)}</span>
            <span className="kpi-nota">{notaEgresos}</span>
          </Card>
          <Card as="div" className="ventas-kpi">
            <span className="kpi-etiqueta">Neto</span>
            <span className="ventas-kpi-valor neto num">{pesos(t.neto)}</span>
            <span className="kpi-nota">Ventas − egresos</span>
          </Card>
        </div>
        {avisoFaltantes}
        <Card className="reparto" aria-labelledby="medios-t">
          <CabeceraCard id="medios-t" nivel={3} titulo="Por medio de pago" />
          <BarraApilada partes={medios} total={t.ventas} />
          <ListaReparto partes={medios} total={t.ventas} mostrarCantidad={false} />
        </Card>
        <Card className="por-dia-lista" aria-labelledby="dia-t">
          <CabeceraCard id="dia-t" nivel={3} titulo="Por día" />
          <ul>
            {d.filas.map((f) => {
              const e = ESTADOS_DIA[f.estado];
              return (
                <li key={f.fecha} className="por-dia-item">
                  <div className="por-dia-item-arriba">
                    <a className="por-dia-item-dia" href={`#/reportes/cierre/${f.fecha}`} style={{ color: "inherit", textDecoration: "none" }}>
                      {diaCorto(f.fecha)}
                    </a>
                    <Pill tono={e.tono} className="pill-chica">{e.texto}</Pill>
                    <span className="por-dia-item-neto num">{pesos(f.neto)}</span>
                  </div>
                  <span className="por-dia-item-detalle num">
                    Bre-B {pesos(f.breb)} · Tarjeta {f.tarjeta === null ? raya : pesos(f.tarjeta)} · Efectivo {f.efectivo === null ? raya : pesos(f.efectivo)} · Egresos {f.egresos ? pesos(f.egresos) : raya}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </>
    );
  }

  return (
    <>
      {controles}
      <section className="fila fila-estirada" aria-label="Totales">
        <HeroCard as="div" className="ventas-total" style={{ "--crece": 1.4, "--base": "260px" }}>
          <span className="hero-etiqueta">Ventas totales · {etiquetaRango}</span>
          <span className="ventas-total-valor num">{pesos(t.ventas)}</span>
          <span className="ventas-total-nota">{plural(d.dias, "día", "días")}</span>
        </HeroCard>
        <Card as="div" className="ventas-kpi" style={{ "--base": "200px" }}>
          <span className="kpi-etiqueta">Egresos</span>
          <span className="ventas-kpi-valor num">{pesos(t.egresos)}</span>
          <span className="kpi-nota">{notaEgresos}</span>
        </Card>
        <Card as="div" className="ventas-kpi" style={{ "--base": "200px" }}>
          <span className="kpi-etiqueta">Neto</span>
          <span className="ventas-kpi-valor neto num">{pesos(t.neto)}</span>
          <span className="kpi-nota">Ventas − egresos</span>
        </Card>
      </section>

      {avisoFaltantes}

      <Card className="reparto" aria-labelledby="medios-t">
        <CabeceraCard id="medios-t" nivel={3} titulo="Por medio de pago" />
        <BarraApilada partes={medios} total={t.ventas} alto={14} />
        <div className="medios-columnas">
          {medios.map((m) => (
            <div key={m.clave} className="medio-col">
              <span className="medio-col-nombre"><Punto color={m.color} />{m.label}</span>
              <span className="medio-col-total num">{pesos(m.total)}</span>
              <span className="medio-col-pct">{porcentaje(t.ventas ? m.total / t.ventas : 0)} de las ventas</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="por-dia-card" aria-labelledby="dia-t">
        <CabeceraCard id="dia-t" nivel={3} titulo="Por día" />
        <div className="tabla-sticky" tabIndex={0} aria-label="Tabla de ventas por día">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col" className="der">Bre-B</th>
                <th scope="col" className="der">Tarjeta</th>
                <th scope="col" className="der">Efectivo</th>
                <th scope="col" className="der">Ventas</th>
                <th scope="col" className="der">Egresos</th>
                <th scope="col" className="der">Neto</th>
                <th scope="col" className="der">Estado</th>
              </tr>
            </thead>
            <tbody>
              {d.filas.map((f) => {
                const e = ESTADOS_DIA[f.estado];
                return (
                  <tr key={f.fecha}>
                    <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      <a href={`#/reportes/cierre/${f.fecha}`} style={{ color: "inherit", textDecoration: "none" }}>{diaCorto(f.fecha)}</a>
                    </td>
                    <td className="der num">{pesos(f.breb)}</td>
                    <td className="der num">{f.tarjeta === null ? raya : pesos(f.tarjeta)}</td>
                    <td className="der num">{f.efectivo === null ? raya : pesos(f.efectivo)}</td>
                    <td className="der num" style={{ fontWeight: 700 }}>{pesos(f.ventas)}</td>
                    <td className="der tenue num">{f.egresos ? pesos(f.egresos) : raya}</td>
                    <td className="der fuerte num">{pesos(f.neto)}</td>
                    <td className="der"><Pill tono={e.tono}>{e.texto}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
