/**
 * Reportes > Cierre del dia.
 *
 * Gloria escribe la tarjeta (total del datafono), la base y el efectivo
 * contado, y anota los egresos. El Bre-B se suma solo desde los correos.
 *
 * El estado de la pantalla vive en un useReducer: { modo, tarjeta, base,
 * contado, egresos, ... }. Con un reducer cada accion ("agregar egreso",
 * "editar", "cancelar") es una transicion con nombre, y las reglas de que se
 * puede hacer en cada modo quedan en un solo sitio en vez de regadas en diez
 * useState que hay que mantener sincronizados a mano.
 *
 * Modos: "borrador" (nunca guardado), "guardado" (solo lectura) y "editando"
 * (un cierre guardado que se esta corrigiendo).
 */

import { useEffect, useMemo, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApp } from "../../App.jsx";
import { descargar, mensajeDeError, pedir, query } from "../../lib/api.js";
import { calcularCierre } from "../../lib/cierre.js";
import { sumarDias } from "../../lib/fechas.js";
import { diaCorto, diaMedio, fechaLarga, hora12, pesos, plural } from "../../lib/format.js";
import { navegar } from "../../lib/ruta.js";
import { Aviso, BotonIcono, Button, Card, CabeceraCard, CargandoCard, MoneyInput, Pill, Punto } from "../ui/index.jsx";
import { Iconos } from "../ui/Iconos.jsx";
import { useToast } from "../ui/Toast.jsx";
import { AccionesCuadre, BarraAccionCierre, Cuadre } from "./CuadreCard.jsx";
import { EgresoEnHoja, EgresoEnLinea } from "./EgresoForm.jsx";

export const ESTADOS_DIA = {
  cerrado: { texto: "Cerrado", tono: "ok" },
  editado: { texto: "Editado", tono: "info" },
  "sin-cierre": { texto: "Sin cierre", tono: "warn" },
  "sin-guardar": { texto: "Sin guardar", tono: "warn" },
};

const MEDIO = { efectivo: "Efectivo", transferencia: "Transferencia" };

/* ------------------------------------------------------------------ *
 * Estado
 * ------------------------------------------------------------------ */

let siguienteId = 1;
const conId = (e) => ({ ...e, id: siguienteId++ });

function desdeServidor(datos) {
  return {
    modo: datos.guardado ? "guardado" : "borrador",
    tarjeta: datos.guardado ? datos.tarjetaTotal : null,
    base: datos.baseInicial || null,
    contado: datos.guardado ? datos.efectivoContado : null,
    egresos: datos.egresos.map(conId),
    agregando: false,
    confirmando: false,
  };
}

function reductor(estado, accion) {
  switch (accion.tipo) {
    case "cargar":
      return desdeServidor(accion.datos);
    case "campo":
      return { ...estado, [accion.campo]: accion.valor };
    case "editar":
      return { ...estado, modo: "editando" };
    case "cancelar-edicion":
      return desdeServidor(accion.datos);
    case "abrir-egreso":
      return { ...estado, agregando: true };
    case "cerrar-egreso":
      return { ...estado, agregando: false };
    case "agregar-egreso":
      return { ...estado, egresos: [...estado.egresos, conId(accion.egreso)], agregando: false };
    case "quitar-egreso":
      return { ...estado, egresos: estado.egresos.filter((e) => e.id !== accion.id) };
    case "confirmar":
      return { ...estado, confirmando: accion.valor };
    default:
      return estado;
  }
}

/** Lo que Gloria escribio, sin ids locales, para comparar y para enviar. */
function cuerpo(estado) {
  return {
    tarjetaTotal: estado.tarjeta || 0,
    baseInicial: estado.base || 0,
    efectivoContado: estado.contado || 0,
    egresos: estado.egresos.map(({ concepto, monto, medio }) => ({ concepto, monto, medio })),
  };
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------------------------------------------ *
 * Piezas
 * ------------------------------------------------------------------ */

function Ingresos({ estado, dispatch, datos, editable, calc, breb, movil }) {
  const contadoBajo = editable && estado.contado !== null && estado.base !== null && estado.contado < estado.base;
  return (
    <Card className="ingresos" aria-labelledby="ingresos-t">
      <CabeceraCard
        id="ingresos-t"
        nivel={3}
        titulo="Ingresos"
        subtitulo={movil ? null : "Bre-B se suma solo. Tarjeta y efectivo los escribes tú."}
      />

      <div className="ingreso">
        <div className="ingreso-fila">
          <Punto color="var(--b-breb)" cuadrado />
          <div className="ingreso-textos">
            <span className="ingreso-nombre">Bre-B (QR)</span>
            <span className="ingreso-nota">
              {plural(editable ? datos.brebEnVivo.cantidad : datos.brebCantidad, "pago", "pagos")} · {movil ? "llegan solos" : "llegan solos desde el correo"}
            </span>
          </div>
          <span className="ingreso-monto num">{pesos(breb)}</span>
        </div>
      </div>

      <div className="ingreso">
        <div className="ingreso-fila">
          <Punto color="var(--m-tarjeta)" cuadrado />
          <div className="ingreso-textos">
            {editable ? (
              <label htmlFor="tarjeta" className="ingreso-nombre">Tarjeta</label>
            ) : (
              <span className="ingreso-nombre">Tarjeta</span>
            )}
            <span className="ingreso-nota">{movil ? "Total del datáfono" : "Total del datáfono al cerrar."}</span>
          </div>
          {editable && !movil && (
            <MoneyInput id="tarjeta" valor={estado.tarjeta} onCambio={(v) => dispatch({ tipo: "campo", campo: "tarjeta", valor: v })} className="money-tarjeta" />
          )}
          {!editable && <span className="ingreso-monto num">{pesos(estado.tarjeta)}</span>}
        </div>
        {editable && movil && (
          <MoneyInput id="tarjeta" valor={estado.tarjeta} onCambio={(v) => dispatch({ tipo: "campo", campo: "tarjeta", valor: v })} />
        )}
      </div>

      <div className="ingreso">
        <div className="ingreso-fila">
          <Punto color="var(--m-efectivo)" cuadrado />
          <div className="ingreso-textos">
            <span className="ingreso-nombre">Efectivo</span>
            <span className="ingreso-nota">
              {movil ? "Contado − base + egresos en efectivo" : "Contado − base + egresos pagados en efectivo."}
            </span>
          </div>
          <span className="ingreso-monto num">{pesos(calc.ventaEfectivo)}</span>
        </div>
        {editable ? (
          <div className="ingreso-campos">
            <MoneyInput
              id="base"
              etiqueta={movil ? "Base al abrir" : "Base de caja · al abrir"}
              valor={estado.base}
              onCambio={(v) => dispatch({ tipo: "campo", campo: "base", valor: v })}
            />
            <MoneyInput
              id="contado"
              etiqueta={movil ? "Contado al cerrar" : "Efectivo contado · al cerrar"}
              valor={estado.contado}
              onCambio={(v) => dispatch({ tipo: "campo", campo: "contado", valor: v })}
            />
          </div>
        ) : (
          <span className="ingreso-detalle num">
            Base {pesos(estado.base)} · Contado {pesos(estado.contado)} · Egresos en efectivo {pesos(calc.egresosEfectivo)}
          </span>
        )}
        {contadoBajo && (
          <span className="aviso aviso-warn aviso-chico" role="alert">
            {movil ? "El contado es menor que la base. Revisa los dos valores." : "El efectivo contado es menor que la base. Revisa los dos valores."}
          </span>
        )}
      </div>
    </Card>
  );
}

function Egresos({ estado, dispatch, editable, calc, movil }) {
  const n = estado.egresos.length;
  return (
    <Card className="egresos-card" aria-labelledby="egresos-t">
      <CabeceraCard
        id="egresos-t"
        nivel={3}
        titulo="Egresos"
        subtitulo={n === 0 ? "Lo que salió de la caja o se pagó hoy." : plural(n, "egreso", "egresos")}
      >
        {editable && !estado.agregando && n < 50 && (
          <Button variante="secundario" icono={<Iconos.Mas />} onClick={() => dispatch({ tipo: "abrir-egreso" })}>
            {movil ? "Agregar" : "Agregar egreso"}
          </Button>
        )}
      </CabeceraCard>

      {editable && !movil && estado.agregando && (
        <EgresoEnLinea
          alAgregar={(egreso) => dispatch({ tipo: "agregar-egreso", egreso })}
          alCancelar={() => dispatch({ tipo: "cerrar-egreso" })}
        />
      )}

      {n === 0 ? (
        <p className="egresos-vacio">{editable ? "Sin egresos hoy." : "Sin egresos este día."}</p>
      ) : (
        <ul>
          {estado.egresos.map((e) => (
            <li key={e.id} className="egreso">
              <span className="egreso-textos">
                <span className="egreso-concepto">{e.concepto}</span>
                {movil && <span className="egreso-medio-movil">{MEDIO[e.medio]}</span>}
              </span>
              {!movil && <span className="egreso-medio">{MEDIO[e.medio]}</span>}
              <span className="egreso-monto num">{pesos(e.monto)}</span>
              {editable && (
                <BotonIcono etiqueta={`Quitar ${e.concepto}`} onClick={() => dispatch({ tipo: "quitar-egreso", id: e.id })}>
                  <Iconos.Cerrar />
                </BotonIcono>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="egresos-pie">
        <span className="egresos-pie-total">
          Total egresos <strong className="num">{pesos(calc.egresosTotal)}</strong>
        </span>
        <span className="egresos-pie-split num">
          Efectivo {pesos(calc.egresosEfectivo)} · Transferencia {pesos(calc.egresosTransferencia)}
        </span>
      </div>

      {editable && movil && (
        <EgresoEnHoja
          abierto={estado.agregando}
          alAgregar={(egreso) => dispatch({ tipo: "agregar-egreso", egreso })}
          alCerrar={() => dispatch({ tipo: "cerrar-egreso" })}
        />
      )}
    </Card>
  );
}

function Anteriores({ hoy, movil, irAVentas }) {
  const desde = sumarDias(hoy, -5);
  const hasta = sumarDias(hoy, -1);
  const consulta = useQuery({
    queryKey: ["cierres", desde, hasta],
    queryFn: ({ signal }) => pedir(`/api/cierres${query({ desde, hasta })}`, { signal }),
  });
  const filas = consulta.data?.filas || [];
  const ir = (fecha) => navegar(`/reportes/cierre/${fecha}`);

  return (
    <Card className="anteriores" aria-labelledby="anteriores-t">
      <CabeceraCard id="anteriores-t" nivel={3} titulo="Cierres anteriores">
        <Button variante="enlace" onClick={irAVentas}>{movil ? "Ver todo" : "Ver todas las ventas →"}</Button>
      </CabeceraCard>
      {consulta.isError && <p className="vacio" role="alert">{mensajeDeError(consulta.error)}</p>}
      {movil ? (
        <ul className="lista-filas">
          {filas.map((d) => {
            const estado = ESTADOS_DIA[d.estado];
            return (
              <li key={d.fecha}>
                <a className="fila-tactil" href={`#/reportes/cierre/${d.fecha}`} style={{ textDecoration: "none" }}>
                  <span className="fila-tactil-textos">
                    <span className="fila-tactil-titulo">{diaCorto(d.fecha)}</span>
                    <span className="fila-tactil-sub num">Ventas {pesos(d.ventas)} · Egresos {d.egresos ? pesos(d.egresos) : "—"}</span>
                  </span>
                  <span className="anteriores-fila-der">
                    <span className="fila-tactil-monto num" style={{ fontSize: 15 }}>{pesos(d.neto)}</span>
                    <Pill tono={estado.tono} className="pill-chica">{estado.texto}</Pill>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="tabla-caja">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col" className="der">Ventas</th>
                <th scope="col" className="der">Egresos</th>
                <th scope="col" className="der">Neto</th>
                <th scope="col" className="der">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((d) => {
                const estado = ESTADOS_DIA[d.estado];
                return (
                  <tr key={d.fecha} className="tabla-fila-accion" onClick={() => ir(d.fecha)}>
                    <td style={{ fontWeight: 600 }}>
                      <a href={`#/reportes/cierre/${d.fecha}`} style={{ color: "inherit", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                        {diaCorto(d.fecha)}
                      </a>
                    </td>
                    <td className="der num">{pesos(d.ventas)}</td>
                    <td className="der tenue num">{d.egresos ? pesos(d.egresos) : "—"}</td>
                    <td className="der fuerte num">{pesos(d.neto)}</td>
                    <td className="der"><Pill tono={estado.tono}>{estado.texto}</Pill></td>
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

/* ------------------------------------------------------------------ *
 * Pantalla
 * ------------------------------------------------------------------ */

export default function CierreDia({ fecha, irAVentas }) {
  const { tamano, ahora, slotAccion } = useApp();
  const movil = tamano === "movil";
  const hoy = ahora.fecha;
  const cliente = useQueryClient();
  const { mostrar } = useToast();

  const consulta = useQuery({
    queryKey: ["cierre", fecha],
    queryFn: ({ signal }) => pedir(`/api/cierres/${fecha}`, { signal }),
  });
  const datos = consulta.data;

  const [estado, dispatch] = useReducer(reductor, null);
  const [error, setError] = useState(null);
  const [conflicto, setConflicto] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [descargando, setDescargando] = useState(false);

  // Los datos del servidor entran al formulario al abrir el dia, y despues
  // solo si no hay nada escrito a medias: si llega un pago mientras Gloria
  // escribe, el Bre-B se actualiza (sale de `datos`) pero no se le borra nada.
  const [cargadoPara, setCargadoPara] = useState(null);
  useEffect(() => {
    if (!datos) return;
    const clave = `${datos.fecha}|${datos.version}`;
    if (cargadoPara === clave) return;
    if (estado && cargadoPara?.startsWith(`${datos.fecha}|`) && estado.modo !== "guardado") return;
    dispatch({ tipo: "cargar", datos });
    setCargadoPara(clave);
    setError(null);
    setConflicto(false);
    setMensaje("");
  }, [datos, estado, cargadoPara]);

  const original = useMemo(() => (datos ? cuerpo(desdeServidor(datos)) : null), [datos]);
  const actual = estado ? cuerpo(estado) : null;
  const sucio = Boolean(estado && original && !igual(actual, original));
  const editable = estado?.modo === "borrador" || estado?.modo === "editando";

  // Un cierre guardado muestra su foto de Bre-B; mientras se escribe o se
  // edita, el Bre-B en vivo, que es el que quedara al guardar.
  const breb = !datos ? 0 : editable ? datos.brebEnVivo.total : datos.brebTotal;
  const calc = estado ? calcularCierre({ ...actual, brebTotal: breb }) : null;
  const tardio = datos?.guardado && estado?.modo === "guardado" ? datos.brebEnVivo.total - datos.brebTotal : 0;

  // Aviso del navegador al cerrar la pestaña con cambios sin guardar.
  const hayPendiente = estado && ((estado.modo === "borrador" && (sucio || estado.egresos.length > 0)) || (estado.modo === "editando" && sucio));
  useEffect(() => {
    if (!hayPendiente) return undefined;
    const alSalir = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [hayPendiente]);

  const mutacion = useMutation({
    mutationFn: (cuerpoPut) => pedir(`/api/cierres/${fecha}`, { metodo: "PUT", cuerpo: cuerpoPut }),
    onSuccess: (respuesta) => {
      cliente.setQueryData(["cierre", fecha], respuesta);
      dispatch({ tipo: "cargar", datos: respuesta });
      setCargadoPara(`${respuesta.fecha}|${respuesta.version}`);
      setError(null);
      setMensaje("");
      cliente.invalidateQueries({ queryKey: ["ventas"] });
      cliente.invalidateQueries({ queryKey: ["cierres"] });
      cliente.invalidateQueries({ queryKey: ["resumen"] });
    },
    onError: (e) => {
      dispatch({ tipo: "confirmar", valor: false });
      if (e.estado === 409) {
        setConflicto(true);
        setError(null);
      } else {
        setError(mensajeDeError(e, "guardar"));
      }
    },
  });

  if (!datos || !estado) {
    if (consulta.isError) {
      return (
        <Aviso tono="error" role="alert" titulo={mensajeDeError(consulta.error)}
          accion={<Button variante="secundario" onClick={() => consulta.refetch()}>Intentar de nuevo</Button>} />
      );
    }
    return (
      <div className="fila">
        <CargandoCard alto={360} etiqueta="Cargando el cierre" />
        <CargandoCard hero alto={360} />
      </div>
    );
  }

  const enviar = (base = actual) =>
    mutacion.mutate({ version: datos.guardado ? datos.version : null, ...base });

  const guardar = () => {
    setError(null);
    if (!estado.contado) {
      dispatch({ tipo: "confirmar", valor: true });
      return;
    }
    enviar();
  };

  const pdf = async () => {
    setDescargando(true);
    try {
      const nombre = await descargar(`/api/reportes/pdf${query({ desde: fecha, hasta: fecha })}`, `cierre_${fecha}.pdf`);
      if (movil) mostrar({ titulo: `Se descargó ${nombre}` });
      else setMensaje(`Se descargó ${nombre}`);
    } catch (e) {
      setMensaje(mensajeDeError(e));
    } finally {
      setDescargando(false);
    }
  };

  const recargar = async () => {
    const { data } = await consulta.refetch();
    if (data) {
      dispatch({ tipo: "cargar", datos: data });
      setCargadoPara(`${data.fecha}|${data.version}`);
    }
    setConflicto(false);
  };

  const textoGuardado = datos.editado
    ? `Guardado ${hora12(datos.creadoEn)} · editado ${hora12(datos.actualizadoEn)}`
    : `Guardado a las ${hora12(datos.creadoEn)}`;

  const c = {
    modo: estado.modo,
    confirmando: estado.confirmando,
    puedeGuardar: estado.modo === "borrador" || sucio,
    guardando: mutacion.isPending,
    descargando,
    error,
    mensaje,
    textoGuardado,
    guardar,
    guardarConfirmado: () => enviar(),
    cancelarConfirmacion: () => dispatch({ tipo: "confirmar", valor: false }),
    editar: () => dispatch({ tipo: "editar" }),
    cancelarEdicion: () => dispatch({ tipo: "cancelar-edicion", datos }),
    pdf,
  };

  const pill = estado.modo === "borrador"
    ? { tono: "warn", texto: "Sin guardar" }
    : estado.modo === "editando"
      ? { tono: "info", texto: "Editando" }
      : { tono: "ok", texto: datos.editado ? "Guardado · editado" : "Guardado" };

  const columnaIzquierda = (
    <>
      <Ingresos estado={estado} dispatch={dispatch} datos={datos} editable={editable} calc={calc} breb={breb} movil={movil} />
      <Egresos estado={estado} dispatch={dispatch} editable={editable} calc={calc} movil={movil} />
    </>
  );
  const cuadre = (
    <Cuadre calc={calc} breb={breb} tarjeta={estado.tarjeta || 0} contado={estado.contado || 0} className={movil ? "" : "cuadre-pegado"}>
      {!movil && <AccionesCuadre c={c} />}
    </Cuadre>
  );

  return (
    <>
      <div className="cierre-encabezado">
        <h2>{movil ? diaMedio(fecha) : fechaLarga(fecha)}</h2>
        <Pill tono={pill.tono}>{pill.texto}</Pill>
        {movil && estado.modo === "editando" && (
          <Button variante="enlace" onClick={c.cancelarEdicion} style={{ minHeight: 40, marginLeft: "auto" }}>Cancelar edición</Button>
        )}
        {fecha !== hoy && estado.modo !== "editando" && (
          <a className="btn btn-enlace" href="#/reportes/cierre">
            <Iconos.Izquierda tam={16} />
            Ir a hoy
          </a>
        )}
      </div>

      {conflicto && (
        <Aviso tono="warn" role="alert" titulo="Este cierre cambió en otra pestaña."
          accion={<Button variante="secundario" onClick={recargar}>Recargar</Button>}>
          Recarga para ver la última versión.
        </Aviso>
      )}
      {tardio !== 0 && (
        <Aviso tono="info" icono={<Iconos.Alerta />}
          titulo={tardio > 0 ? `Llegaron ${pesos(tardio)} en Bre-B después del cierre.` : `El Bre-B cambió ${pesos(tardio)} después del cierre.`}
          accion={<Button variante="secundario" onClick={() => enviar(original)} disabled={mutacion.isPending}>Actualizar cierre</Button>} />
      )}

      {movil ? (
        <>
          {columnaIzquierda}
          {cuadre}
        </>
      ) : (
        <div className="fila">
          <div style={{ "--crece": 3, "--base": "520px", display: "flex", flexDirection: "column", gap: 20 }}>
            {columnaIzquierda}
          </div>
          <div style={{ "--crece": 2, "--base": "320px", alignSelf: "stretch" }}>{cuadre}</div>
        </div>
      )}

      <Anteriores hoy={hoy} movil={movil} irAVentas={irAVentas} />

      {movil && slotAccion && createPortal(<BarraAccionCierre c={c} neto={calc.neto} />, slotAccion)}
    </>
  );
}
