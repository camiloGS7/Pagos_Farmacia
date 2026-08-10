import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const RANGOS = [
  { dias: 7, etiqueta: "7 dias" },
  { dias: 14, etiqueta: "14 dias" },
  { dias: 30, etiqueta: "30 dias" },
];

const pesos = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const pesosCompacto = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  notation: "compact",
  maximumFractionDigits: 1,
});

const porcentaje = new Intl.NumberFormat("es-CO", {
  style: "percent",
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
});

/**
 * Parte el ISO a mano en vez de usar new Date("2026-08-04"): ese constructor
 * interpreta la cadena como UTC y en Colombia devolveria el dia anterior.
 */
function aFecha(iso) {
  const [anio, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

function etiquetaDia(iso) {
  return aFecha(iso).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
  });
}

function etiquetaDiaLarga(iso) {
  return aFecha(iso).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function horaDe(fechaHora) {
  return fechaHora.slice(11, 16);
}

/**
 * "hace 12 min". Las fechas vienen en hora de Colombia y se comparan contra el
 * reloj del navegador, asi que esto asume que estas viendo el tablero desde
 * Colombia (que es el caso). Sirve sobre todo para notar que algo se rompio:
 * si dice "hace 2 dias" es que dejaron de entrar correos.
 */
function haceCuanto(fechaHora) {
  if (!fechaHora) return null;

  const [parteFecha, parteHora] = fechaHora.split(" ");
  const [anio, mes, dia] = parteFecha.split("-").map(Number);
  const [hh, mm, ss] = parteHora.split(":").map(Number);
  const cuando = new Date(anio, mes - 1, dia, hh, mm, ss);

  const minutos = Math.floor((Date.now() - cuando.getTime()) / 60000);
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 dia" : `hace ${dias} dias`;
}

async function traer(ruta) {
  const respuesta = await fetch(ruta);
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || `Error ${respuesta.status}`);
  }
  return respuesta.json();
}

/* ------------------------------------------------------------------ */

function Tarjeta({ etiqueta, valor, apoyo }) {
  return (
    <div className="tarjeta">
      <span className="tarjeta-etiqueta">{etiqueta}</span>
      <span className="tarjeta-valor">{valor}</span>
      {apoyo && <span className="tarjeta-apoyo">{apoyo}</span>}
    </div>
  );
}

function TooltipVentas({ active, payload }) {
  if (!active || !payload?.length) return null;
  const punto = payload[0].payload;

  return (
    <div className="tooltip">
      <div className="tooltip-titulo">{etiquetaDiaLarga(punto.dia)}</div>
      <div className="tooltip-valor">{pesos.format(punto.total)}</div>
      <div className="tooltip-apoyo">
        {punto.transacciones}{" "}
        {punto.transacciones === 1 ? "transaccion" : "transacciones"}
      </div>
    </div>
  );
}

function GraficaVentas({ datos }) {
  // Etiquetamos solo el maximo: un numero sobre cada punto se vuelve ruido y
  // nadie lo lee. El resto de valores los cargan el eje y el tooltip.
  const maximo = useMemo(() => {
    if (!datos.length) return null;
    const punto = datos.reduce((a, b) => (b.total > a.total ? b : a));
    return punto.total > 0 ? punto : null;
  }, [datos]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={datos} margin={{ top: 28, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid
          stroke="var(--gridline)"
          strokeWidth={1}
          vertical={false}
        />
        <XAxis
          dataKey="dia"
          tickFormatter={etiquetaDia}
          tickLine={false}
          axisLine={{ stroke: "var(--baseline)" }}
          tick={{ fill: "var(--muted)", fontSize: 12 }}
          tickMargin={10}
          minTickGap={16}
        />
        <YAxis
          tickFormatter={(v) => (v === 0 ? "0" : pesosCompacto.format(v))}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted)", fontSize: 12 }}
          width={64}
        />
        <Tooltip
          content={<TooltipVentas />}
          cursor={{ stroke: "var(--baseline)", strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke="var(--serie-1)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="var(--serie-1)"
          fillOpacity={0.1}
          dot={false}
          activeDot={{
            r: 4,
            fill: "var(--serie-1)",
            stroke: "var(--superficie)",
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        />
        {maximo && (
          <ReferenceDot
            x={maximo.dia}
            y={maximo.total}
            r={4}
            fill="var(--serie-1)"
            stroke="var(--superficie)"
            strokeWidth={2}
            label={{
              value: pesosCompacto.format(maximo.total),
              position: "top",
              offset: 10,
              fill: "var(--tinta-secundaria)",
              fontSize: 12,
              fontWeight: 600,
            }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TablaTransacciones({ filas }) {
  if (!filas.length) {
    return <p className="vacio">Todavia no hay pagos registrados.</p>;
  }

  return (
    <div className="tabla-scroll">
      <table className="tabla">
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Hora</th>
            <th scope="col">Pagador</th>
            <th scope="col">Banco</th>
            <th scope="col">Estado</th>
            <th scope="col" className="num">
              Monto
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((t) => (
            <tr key={t.numero_transaccion}>
              <td>{etiquetaDia(t.fecha_hora)}</td>
              <td className="num">{horaDe(t.fecha_hora)}</td>
              <td>{t.pagador || "—"}</td>
              <td>{t.banco || "—"}</td>
              <td>
                <span
                  className={
                    t.estado === "Aprobada" ? "estado ok" : "estado alerta"
                  }
                >
                  {t.estado}
                </span>
              </td>
              <td className="num monto">{pesos.format(t.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function App() {
  const [dias, setDias] = useState(14);
  const [resumen, setResumen] = useState(null);
  const [serie, setSerie] = useState([]);
  const [transacciones, setTransacciones] = useState([]);
  const [error, setError] = useState(null);
  // primeraCarga separa "no hay nada que mostrar" de "estoy refrescando":
  // en el refresco mantenemos lo anterior en pantalla, sin saltos de layout.
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    setRefrescando(true);
    try {
      const [r, s, t] = await Promise.all([
        traer("/api/resumen"),
        traer(`/api/ventas-por-dia?dias=${dias}`),
        traer("/api/transacciones?limite=25"),
      ]);
      setResumen(r);
      setSerie(s);
      setTransacciones(t);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setPrimeraCarga(false);
      setRefrescando(false);
    }
  }, [dias]);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 60_000);
    return () => clearInterval(id);
  }, [cargar]);

  const variacion = resumen?.variacionVsAyer;

  return (
    <div className="viz-root">
      <header className="cabecera">
        <div>
          <h1>Pagos Nequi</h1>
          <p className="subtitulo">
            Ventas registradas automaticamente desde los correos de Nequi
            {refrescando && !primeraCarga && " · actualizando…"}
          </p>
          {resumen?.ultimoPago && (
            <p className="subtitulo">
              Ultimo pago recibido {haceCuanto(resumen.ultimoPago)}
            </p>
          )}
        </div>

        {/* Una sola fila de filtros, arriba de todo lo que afecta. */}
        <div className="filtros" role="group" aria-label="Rango de dias">
          {RANGOS.map((r) => (
            <button
              key={r.dias}
              type="button"
              className={r.dias === dias ? "filtro activo" : "filtro"}
              aria-pressed={r.dias === dias}
              onClick={() => setDias(r.dias)}
            >
              {r.etiqueta}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {primeraCarga && !error && <p className="vacio">Cargando…</p>}

      {resumen && (
        <main className={refrescando ? "contenido atenuado" : "contenido"}>
          <section className="destacado">
            <span className="tarjeta-etiqueta">Ventas de hoy</span>
            <span className="heroe">{pesos.format(resumen.totalHoy)}</span>
            {variacion !== null && variacion !== undefined && (
              <span className={variacion >= 0 ? "delta sube" : "delta baja"}>
                {porcentaje.format(variacion)} vs ayer a esta hora
              </span>
            )}
          </section>

          <section className="fila-tarjetas">
            <Tarjeta
              etiqueta="Transacciones hoy"
              valor={resumen.transaccionesHoy}
            />
            <Tarjeta
              etiqueta="Ticket promedio hoy"
              valor={pesos.format(resumen.ticketPromedioHoy)}
            />
            <Tarjeta
              etiqueta="Ultimos 7 dias"
              valor={pesos.format(resumen.totalSemana)}
              apoyo={`${resumen.transaccionesSemana} transacciones`}
            />
          </section>

          <section className="panel">
            <h2>Ventas por dia</h2>
            <p className="panel-apoyo">
              Total aprobado por dia, ultimos {dias} dias
            </p>
            <GraficaVentas datos={serie} />
          </section>

          <section className="panel">
            <h2>Ultimos pagos</h2>
            <p className="panel-apoyo">
              Los 25 mas recientes, incluidos los que no quedaron aprobados
            </p>
            <TablaTransacciones filas={transacciones} />
          </section>
        </main>
      )}
    </div>
  );
}
