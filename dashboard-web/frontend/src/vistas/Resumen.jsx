import { useEffect, useState } from "react";

import {
  COLORES_SERIE,
  etiquetaDia,
  etiquetaDiaConSemana,
  haceCuanto,
  horaDe,
  pesos,
  pesosCortos,
  porcentaje,
  porcentajeEntero,
  traer,
} from "../api.js";

/**
 * La pantalla principal: cuatro cifras, la evolucion por dia, el reparto por
 * banco, la meta del dia y los ultimos pagos que entraron.
 *
 * El resumen llega ya calculado desde App (una sola peticion para todo el
 * tablero); esta vista solo pide los tres bloques que son suyos.
 */
export default function Resumen({ resumen, parametros, rango, version, metaDiaria }) {
  const [porDia, setPorDia] = useState(null);
  const [porBanco, setPorBanco] = useState(null);
  const [ultimos, setUltimos] = useState(null);

  /* Con el rango en "Hoy" la grafica tendria una sola barra, que no dice nada.
     En ese caso se piden igual los ultimos 7 dias: el resto del tablero habla
     de hoy, y la grafica sirve para ver hoy *contra* los dias anteriores. */
  const esUnSoloDia = rango.clave === "hoy";
  const parametrosGrafica = esUnSoloDia ? "dias=7" : parametros;

  useEffect(() => {
    let vigente = true;
    traer(`/api/ventas-por-dia?${parametrosGrafica}`)
      .then((d) => vigente && setPorDia(d))
      .catch(() => vigente && setPorDia({ dias: [] }));
    return () => {
      vigente = false;
    };
  }, [parametrosGrafica, version]);

  useEffect(() => {
    let vigente = true;
    traer(`/api/ventas-por-banco?${parametros}`)
      .then((d) => vigente && setPorBanco(d))
      .catch(() => vigente && setPorBanco({ bancos: [], total: 0 }));
    return () => {
      vigente = false;
    };
  }, [parametros, version]);

  useEffect(() => {
    let vigente = true;
    traer("/api/transacciones?limite=8")
      .then((d) => vigente && setUltimos(d))
      .catch(() => vigente && setUltimos([]));
    return () => {
      vigente = false;
    };
  }, [version]);

  if (!resumen) return <div className="cargando">Cargando…</div>;

  const v = resumen.variacion;
  const comparado =
    resumen.rango.dias === 1
      ? "vs. ayer"
      : `vs. los ${resumen.rango.dias} días anteriores`;

  return (
    <>
      <section className="tarjetas">
        <Stat
          etiqueta="Total recaudado"
          valor={pesos(resumen.total)}
          delta={v.total}
          nota={comparado}
        />
        <Stat
          etiqueta="Transacciones"
          valor={resumen.transacciones.toLocaleString("es-CO")}
          delta={v.transacciones}
          nota={comparado}
        />
        <Stat
          etiqueta="Ticket promedio"
          valor={pesos(resumen.ticketPromedio)}
          delta={v.ticketPromedio}
          nota={comparado}
        />
        <Stat
          etiqueta="Últimos 7 días"
          valor={pesos(resumen.totalSemana)}
          delta={v.totalSemana}
          nota="vs. semana anterior"
        />
      </section>

      <section className="paneles">
        <Grafica datos={porDia} esUnSoloDia={esUnSoloDia} />

        <div className="columna">
          <Bancos datos={porBanco} />
          <Meta resumen={resumen} metaDiaria={metaDiaria} />
        </div>
      </section>

      <UltimosPagos filas={ultimos} ultimoPago={resumen.ultimoPago} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Tarjeta de cifra
 * ------------------------------------------------------------------ */

function Stat({ etiqueta, valor, delta, nota }) {
  const texto = porcentaje(delta);

  return (
    <div className="tarjeta stat">
      <div className="stat-label">{etiqueta}</div>
      <div className="stat-valor num">{valor}</div>
      <div className="stat-pie">
        {/* Sin periodo anterior con datos no hay porcentaje: se dice eso en
            vez de inventar un "+100%" que no significa nada. */}
        {texto === null ? (
          <span className="nota">sin comparación</span>
        ) : (
          <>
            <span className={"delta " + (delta >= 0 ? "sube" : "baja")}>{texto}</span>
            <span className="nota">{nota}</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Grafica de barras por dia
 * ------------------------------------------------------------------ */

function Grafica({ datos, esUnSoloDia }) {
  // Indice de la columna sobre la que esta el cursor, o null si no hay ninguna.
  const [activo, setActivo] = useState(null);

  if (!datos) return <div className="tarjeta cargando">Cargando gráfica…</div>;

  const dias = datos.dias || [];
  const maximo = Math.max(...dias.map((d) => d.total), 1);
  const total = dias.reduce((s, d) => s + d.total, 0);

  // Con muchos dias las etiquetas se amontonan, asi que solo se rotula una de
  // cada n. Se ancla al ultimo dia para que el mas reciente siempre se vea.
  const salto = Math.ceil(dias.length / 12);

  return (
    <div className="tarjeta grafica">
      <div className="panel-cabecera">
        <div>
          <div className="panel-titulo">Ventas por día</div>
          <div className="panel-sub">
            {esUnSoloDia ? "Últimos 7 días" : `${dias.length} días del rango`}
          </div>
        </div>
        <div className="panel-nota">{pesos(total)} en total</div>
      </div>

      {dias.length === 0 ? (
        <div className="vacio">No hay ventas en este rango.</div>
      ) : (
        <>
          <div className="barras" onMouseLeave={() => setActivo(null)}>
            {dias.map((d, i) => (
              <div
                className="barra-hueco"
                key={d.dia}
                onMouseEnter={() => setActivo(i)}
              >
                <div
                  className={
                    "barra" +
                    (d.dia === datos.hoy ? " hoy" : "") +
                    (activo === i ? " activa" : "")
                  }
                  style={{ height: `${(d.total / maximo) * 100}%` }}
                />
              </div>
            ))}

            {activo !== null && (
              <Pista
                dia={dias[activo]}
                posicion={(activo + 0.5) / dias.length}
                alto={dias[activo].total / maximo}
              />
            )}
          </div>

          <div className="barras-etiquetas">
            {dias.map((d, i) => (
              <div className="barra-etiqueta" key={d.dia}>
                {(dias.length - 1 - i) % salto === 0 ? etiquetaDia(d.dia) : ""}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * La pestaña que sale al pararse sobre una columna.
 *
 * Se posiciona en porcentajes del alto de la gráfica, no en pixeles medidos
 * del DOM: asi sube y baja con la barra sola, sin escuchar el resize ni pedir
 * medidas al navegador en cada movimiento del mouse.
 */
function Pista({ dia, posicion, alto }) {
  // Cerca de los bordes la pestaña se recuesta hacia adentro, y la punta se
  // corre para seguir apuntando a la barra correcta.
  let desplazamiento = "-50%";
  let punta = "50%";

  if (posicion < 0.12) {
    desplazamiento = "-12px";
    punta = "12px";
  } else if (posicion > 0.88) {
    desplazamiento = "calc(-100% + 12px)";
    punta = "calc(100% - 12px)";
  }

  return (
    <div
      className="pista"
      role="status"
      style={{
        left: `${posicion * 100}%`,
        // El min() la frena antes de que se salga por arriba de la caja
        // cuando la barra es la mas alta del rango.
        bottom: `min(calc(${alto * 100}% + 10px), calc(100% - 58px))`,
        "--pista-x": desplazamiento,
        "--punta": punta,
      }}
    >
      <div className="pista-dia">{etiquetaDiaConSemana(dia.dia)}</div>
      <div className="pista-monto">{pesos(dia.total)}</div>
      <div className="pista-pagos">
        {dia.transacciones === 1 ? "1 pago" : `${dia.transacciones} pagos`}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Dona: reparto por banco
 * ------------------------------------------------------------------ */

const RADIO_DONA = 54;
const VUELTA_DONA = 2 * Math.PI * RADIO_DONA;

function Bancos({ datos }) {
  if (!datos) return <div className="tarjeta cargando">Cargando bancos…</div>;

  const todos = datos.bancos || [];

  // Mas de cuatro porciones se vuelven ilegibles; el resto se junta en "Otros"
  // para que la dona siga sumando 100% sin mentir.
  const principales = todos.slice(0, 3);
  const resto = todos.slice(3);
  const porciones = [...principales];

  if (resto.length > 0) {
    porciones.push({
      banco: `Otros (${resto.length})`,
      total: resto.reduce((s, b) => s + b.total, 0),
      transacciones: resto.reduce((s, b) => s + b.transacciones, 0),
      porcentaje: resto.reduce((s, b) => s + b.porcentaje, 0),
    });
  }

  const lider = porciones[0];
  let acumulado = 0;

  return (
    <div className="tarjeta">
      <div className="panel-cabecera">
        <div className="panel-titulo">Por banco</div>
        <div className="panel-nota">{porciones.length ? `${todos.length} bancos` : ""}</div>
      </div>

      {porciones.length === 0 ? (
        <div className="vacio">Sin pagos en este rango.</div>
      ) : (
        <div className="dona-fila">
          <div className="dona">
            <svg width="132" height="132" viewBox="0 0 132 132" role="img"
                 aria-label={`Reparto por banco: ${porciones.map((p) => `${p.banco} ${porcentajeEntero(p.porcentaje)}`).join(", ")}`}>
              {/* El grupo se gira -90° para que el primer segmento arranque
                  arriba y no a las tres en punto. */}
              <g transform="rotate(-90 66 66)">
                <circle
                  cx="66" cy="66" r={RADIO_DONA}
                  fill="none" strokeWidth="16"
                  style={{ stroke: "var(--track)" }}
                />
                {porciones.map((p, i) => {
                  const inicio = acumulado;
                  acumulado += p.porcentaje;
                  return (
                    <circle
                      key={p.banco}
                      cx="66" cy="66" r={RADIO_DONA}
                      fill="none" strokeWidth="16" strokeLinecap="butt"
                      strokeDasharray={`${p.porcentaje * VUELTA_DONA} ${VUELTA_DONA}`}
                      strokeDashoffset={-inicio * VUELTA_DONA}
                      style={{
                        stroke: COLORES_SERIE[i % COLORES_SERIE.length],
                        transition: "stroke-dasharray .4s ease",
                      }}
                    />
                  );
                })}
              </g>
            </svg>

            <div className="dona-centro">
              <div className="dona-cifra">{porcentajeEntero(lider.porcentaje)}</div>
              <div className="dona-nombre">{lider.banco}</div>
            </div>
          </div>

          <div className="leyenda">
            {porciones.map((p, i) => (
              <div className="leyenda-item" key={p.banco}>
                <span
                  className="leyenda-color"
                  style={{ background: COLORES_SERIE[i % COLORES_SERIE.length] }}
                />
                <span className="leyenda-nombre" title={`${p.banco} · ${pesos(p.total)}`}>
                  {p.banco}
                </span>
                <span className="leyenda-pct">{porcentajeEntero(p.porcentaje)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Anillo de meta del dia
 * ------------------------------------------------------------------ */

const RADIO_ANILLO = 48;
const VUELTA_ANILLO = 2 * Math.PI * RADIO_ANILLO;

function Meta({ resumen, metaDiaria }) {
  const logrado = resumen.meta.logrado;

  // La meta puede venir cambiada desde Configuracion, asi que el porcentaje se
  // recalcula aqui en vez de usar el que trajo el servidor.
  const objetivo = metaDiaria || resumen.meta.objetivo;
  const fraccion = objetivo > 0 ? Math.min(1, logrado / objetivo) : 0;
  const restante = Math.max(0, objetivo - logrado);

  return (
    <div className="tarjeta">
      <div className="panel-cabecera">
        <div className="panel-titulo">Meta de hoy</div>
        <div className="panel-nota">{pesosCortos(objetivo)}</div>
      </div>

      <div className="meta" style={{ marginTop: 14 }}>
        <div className="anillo">
          <svg width="110" height="110" viewBox="0 0 110 110" role="img"
               aria-label={`Meta del día: ${porcentajeEntero(fraccion)} alcanzado`}>
            <g transform="rotate(-90 55 55)">
              <circle
                cx="55" cy="55" r={RADIO_ANILLO}
                fill="none" strokeWidth="10"
                style={{ stroke: "var(--track)" }}
              />
              <circle
                cx="55" cy="55" r={RADIO_ANILLO}
                fill="none" strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${fraccion * VUELTA_ANILLO} ${VUELTA_ANILLO}`}
                style={{
                  stroke: fraccion >= 1 ? "var(--sage-deep)" : "var(--amber)",
                  transition: "stroke-dasharray .5s ease",
                }}
              />
            </g>
          </svg>
          <div className="anillo-centro">{porcentajeEntero(fraccion)}</div>
        </div>

        <div>
          <div className="meta-cifra">
            {pesos(logrado)} <span>de {pesos(objetivo)}</span>
          </div>
          <div className="meta-nota">
            {objetivo <= 0
              ? "Define una meta en Configuración."
              : fraccion >= 1
                ? "Meta alcanzada."
                : `Faltan ${pesos(restante)}.`}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Ultimos pagos
 * ------------------------------------------------------------------ */

function UltimosPagos({ filas, ultimoPago }) {
  const desde = haceCuanto(ultimoPago);

  return (
    <div className="tarjeta">
      <div className="panel-cabecera">
        <div>
          <div className="panel-titulo">Últimos pagos</div>
          <div className="panel-sub">Los más recientes, sin importar el rango</div>
        </div>
        {desde && <div className="panel-nota">Actualizado {desde}</div>}
      </div>

      {!filas ? (
        <div className="cargando">Cargando pagos…</div>
      ) : filas.length === 0 ? (
        <div className="vacio">Todavía no hay pagos registrados.</div>
      ) : (
        <div className="tabla-contenedor">
          {/* Las clases por celda no son decoracion: en movil la tabla deja de
              ser tabla y cada fila se reordena como una ficha, y el CSS las usa
              para saber que va arriba, que va al lado del monto y que abajo. */}
          <table className="tabla tabla-pagos">
            <thead>
              <tr>
                <th>HORA</th>
                <th>PAGADOR</th>
                <th>BANCO</th>
                <th>REFERENCIA</th>
                <th className="derecha">MONTO</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((t) => (
                <tr key={t.numero_transaccion}>
                  <td className="hora celda-hora">{horaDe(t.fecha_hora)}</td>
                  <td className="pagador celda-pagador">{t.pagador || "—"}</td>
                  <td className="celda-banco">
                    <span className="banco">
                      <span className="banco-punto" style={{ background: "var(--sage)" }} />
                      {t.banco || "Sin identificar"}
                    </span>
                  </td>
                  <td className="hora celda-referencia">{t.referencia || "—"}</td>
                  <td className="monto celda-monto">{pesos(t.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
