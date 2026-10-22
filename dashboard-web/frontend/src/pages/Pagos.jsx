/**
 * Pagos: todos los pagos de un periodo, con busqueda instantanea y filtro por
 * banco. En escritorio el detalle se abre en un panel a la derecha de la
 * tabla; en el celular la tabla es una lista y el detalle una hoja inferior.
 */

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import { useApp } from "../App.jsx";
import { HojaPago, PanelPago } from "../components/DetallePago.jsx";
import { BotonTema } from "../components/Navegacion.jsx";
import { Aviso, Button, Card, CampoBusqueda, Chip, Punto, Segmented, Skeleton } from "../components/ui/index.jsx";
import { Iconos } from "../components/ui/Iconos.jsx";
import { useToast } from "../components/ui/Toast.jsx";
import { descargar, mensajeDeError, pedir, query } from "../lib/api.js";
import { agruparBancos, banco } from "../lib/bancos.js";
import { sumarDias } from "../lib/fechas.js";
import { diaMes, hora24, pesos, plural } from "../lib/format.js";

const PERIODOS = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "ayer", etiqueta: "Ayer" },
  { valor: "7d", etiqueta: "7 días" },
  { valor: "30d", etiqueta: "30 días" },
  { valor: "fechas", etiqueta: "Fechas" },
];

function useRetrasado(valor, ms = 250) {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}

export default function Pagos() {
  const { tamano, tema, ahora, ruta } = useApp();
  const movil = tamano === "movil";
  const { mostrar } = useToast();
  const hoy = ahora.fecha;

  const [texto, setTexto] = useState(() => ruta.params.get("q") || "");
  // Desde "¿Ya llegó el pago?" se llega con ?q=<referencia>&abrir=<id>: el
  // pago es de hoy, asi que basta el periodo por defecto.
  const [periodo, setPeriodo] = useState("hoy");
  const [fechas, setFechas] = useState(() => ({ desde: sumarDias(hoy, -6), hasta: hoy }));
  const [bancoElegido, setBancoElegido] = useState(null);
  const [abiertoId, setAbiertoId] = useState(() => Number(ruta.params.get("abrir")) || null);
  const [error, setError] = useState(null);
  const q = useRetrasado(texto.trim());

  // Los nombres crudos del banco elegido ("Nubank" y "Nu" van juntos).
  const [crudos, setCrudos] = useState(null);

  const filtros = {
    periodo,
    desde: periodo === "fechas" ? fechas.desde : null,
    hasta: periodo === "fechas" ? fechas.hasta : null,
    banco: crudos,
    q,
  };

  const consulta = useInfiniteQuery({
    queryKey: ["pagos", "lista", filtros],
    queryFn: ({ pageParam, signal }) =>
      pedir(`/api/pagos${query({ ...filtros, cursor: pageParam, limite: 50 })}`, { signal }),
    initialPageParam: null,
    getNextPageParam: (ultima) => ultima.siguiente,
    placeholderData: keepPreviousData,
    refetchInterval: periodo === "hoy" ? 60000 : false,
  });

  const paginas = consulta.data?.pages || [];
  const primera = paginas[0];
  const pagos = paginas.flatMap((p) => p.pagos);
  const multiDia = primera ? primera.desde !== primera.hasta : periodo !== "hoy" && periodo !== "ayer";
  const grupos = useMemo(() => agruparBancos(primera?.bancos), [primera]);
  const abierto = pagos.find((p) => p.id === abiertoId) || null;
  const hayFiltros = Boolean(bancoElegido || texto.trim());

  const elegirBanco = (g) => {
    if (!g || bancoElegido === g.clave) {
      setBancoElegido(null);
      setCrudos(null);
    } else {
      setBancoElegido(g.clave);
      setCrudos(g.crudos);
    }
  };
  const quitarFiltros = () => {
    setTexto("");
    elegirBanco(null);
  };
  const cambiarPeriodo = (p) => {
    setPeriodo(p);
    setAbiertoId(null);
  };

  const descargarCsv = async () => {
    setError(null);
    try {
      const nombre = await descargar(`/api/pagos.csv${query(filtros)}`, "pagos.csv");
      mostrar({ titulo: `Se descargó ${nombre}` });
    } catch (e) {
      setError(mensajeDeError(e));
    }
  };

  const cuando = (p) => (multiDia ? `${diaMes(p.fechaHora)} · ${hora24(p.fechaHora)}` : hora24(p.fechaHora));
  const conteo = primera?.resumen;

  const selectorFechas = periodo === "fechas" && (
    <div className="fechas">
      <label>
        Desde
        <input type="date" className="campo-fecha" value={fechas.desde} max={hoy}
          onChange={(e) => e.target.value && setFechas((f) => ({ ...f, desde: e.target.value }))} />
      </label>
      <label>
        Hasta
        <input type="date" className="campo-fecha" value={fechas.hasta} max={hoy}
          onChange={(e) => e.target.value && setFechas((f) => ({ ...f, hasta: e.target.value }))} />
      </label>
      {primera?.recortado && <span className="fechas-nota" role="status">Máximo 90 días por consulta.</span>}
    </div>
  );

  const chipsBanco = (
    <>
      <Chip variante="banco" activo={!bancoElegido} color="var(--b-otros)" onClick={() => elegirBanco(null)}>Todos</Chip>
      {grupos.map((g) => (
        <Chip key={g.clave} variante="banco" activo={bancoElegido === g.clave} color={g.color} onClick={() => elegirBanco(g)}>
          {g.label}
        </Chip>
      ))}
    </>
  );

  const vacio = primera && !pagos.length && (
    <div className="vacio">
      {hayFiltros ? (
        <>
          <strong>Sin resultados</strong>
          Revisa el monto o el nombre.
          <div style={{ marginTop: 12 }}>
            <Button variante={movil ? "enlace" : "secundario"} onClick={quitarFiltros}>Quitar filtros</Button>
          </div>
        </>
      ) : (
        <>
          <strong>Sin pagos</strong>
          No hay pagos en este periodo.
        </>
      )}
    </div>
  );

  const cargando = !primera && consulta.isPending;
  const errorCarga = consulta.isError && !primera && (
    <Aviso tono="error" role="alert" titulo={mensajeDeError(consulta.error)}
      accion={<Button variante="secundario" onClick={() => consulta.refetch()}>Intentar de nuevo</Button>} />
  );
  const verMas = consulta.hasNextPage && (
    <div className="pagos-mas">
      <Button variante="secundario" onClick={() => consulta.fetchNextPage()} disabled={consulta.isFetchingNextPage}>
        {consulta.isFetchingNextPage ? "Cargando…" : "Ver más pagos"}
      </Button>
    </div>
  );

  if (movil) {
    return (
      <>
        <div className="pagos-filtros-movil">
          <CampoBusqueda id="buscar-pagos" etiqueta="Buscar pagos" placeholder="Nombre, monto o referencia" valor={texto} onCambio={setTexto} />
          <div className="chips desliza" role="group" aria-label="Periodo">
            {PERIODOS.map((p) => (
              <Chip key={p.valor} activo={periodo === p.valor} onClick={() => cambiarPeriodo(p.valor)}>{p.etiqueta}</Chip>
            ))}
          </div>
          {selectorFechas}
          <div className="chips desliza" role="group" aria-label="Banco">{chipsBanco}</div>
        </div>
        {errorCarga}
        <div className="pagos-totales-movil" aria-live="polite">
          <span>{conteo ? plural(conteo.pagos, "pago", "pagos") : " "}</span>
          <strong className="num">{conteo ? pesos(conteo.total) : ""}</strong>
        </div>
        <Card className="lista-card" aria-label="Lista de pagos" aria-busy={consulta.isFetching}>
          {cargando && <div style={{ padding: "16px 0", display: "grid", gap: 14 }}>{[1, 2, 3, 4].map((i) => <Skeleton key={i} alto={40} />)}</div>}
          {vacio}
          <ul className="lista-filas">
            {pagos.map((p) => {
              const b = banco(p.banco);
              return (
                <li key={p.id}>
                  <button type="button" className="fila-tactil" style={{ minHeight: 64 }} onClick={() => setAbiertoId(p.id)}>
                    <span className="fila-tactil-textos">
                      <span className="fila-tactil-titulo">{p.pagador || "Sin nombre"}</span>
                      <span className="fila-tactil-sub"><Punto color={b.color} tam={7} />{b.label} · {cuando(p)}</span>
                    </span>
                    <span className="fila-tactil-monto num">{pesos(p.monto)}</span>
                    <Iconos.Derecha tam={16} className="chevron" />
                  </button>
                </li>
              );
            })}
          </ul>
          {verMas}
        </Card>
        <HojaPago pago={abierto} alCerrar={() => setAbiertoId(null)} />
      </>
    );
  }

  return (
    <>
      <header className="encabezado-pagina">
        <h1>Pagos</h1>
        <div className="encabezado-acciones">
          <Button variante="secundario" icono={<Iconos.Descargar />} onClick={descargarCsv} disabled={!pagos.length}>
            Descargar CSV
          </Button>
          <BotonTema tema={tema.efectivo} alternar={tema.alternar} />
        </div>
      </header>
      {error && <Aviso tono="error" role="alert" titulo={error} />}
      {errorCarga}

      <Card className="pagos-card">
        <div className="pagos-filtros">
          <div className="pagos-filtros-fila">
            <CampoBusqueda id="buscar-pagos" etiqueta="Buscar por nombre, monto o referencia" placeholder="Nombre, monto o referencia" valor={texto} onCambio={setTexto} />
            <Segmented opciones={PERIODOS} valor={periodo} onCambio={cambiarPeriodo} etiqueta="Periodo" />
          </div>
          {selectorFechas}
          <div className="pagos-filtros-fila">
            <div className="chips chips-envolver" role="group" aria-label="Banco">
              {chipsBanco}
              {hayFiltros && <Button variante="enlace" onClick={quitarFiltros} style={{ minHeight: 36 }}>Quitar filtros</Button>}
            </div>
            <span className="pagos-conteo" aria-live="polite">
              {conteo && <><strong className="num">{plural(conteo.pagos, "pago", "pagos")}</strong> · <strong className="num">{pesos(conteo.total)}</strong></>}
            </span>
          </div>
        </div>

        <div className="pagos-cuerpo">
          <div className="pagos-tabla" aria-busy={consulta.isFetching}>
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">{multiDia ? "Fecha" : "Hora"}</th>
                  <th scope="col">Quién pagó</th>
                  <th scope="col">Banco</th>
                  <th scope="col" className="der">Monto</th>
                  <th scope="col" style={{ width: 60 }}><span className="sr-only">Detalle</span></th>
                </tr>
              </thead>
              <tbody>
                {cargando && [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i}><td colSpan={5}><Skeleton alto={22} /></td></tr>
                ))}
                {pagos.map((p) => {
                  const b = banco(p.banco);
                  return (
                    <tr key={p.id} className={"tabla-fila-accion" + (abiertoId === p.id ? " seleccionada" : "")} onClick={() => setAbiertoId(p.id)}>
                      <td className="celda-hora">{cuando(p)}</td>
                      <td>
                        <button type="button" className="nombre-btn" onClick={(e) => { e.stopPropagation(); setAbiertoId(p.id); }}>
                          {p.pagador || "Sin nombre"}
                        </button>
                        <span className="celda-ref">{p.referencia || p.numero}</span>
                      </td>
                      <td><span className="banco-etiqueta"><Punto color={b.color} />{b.label}</span></td>
                      <td className="der fuerte num">{pesos(p.monto)}</td>
                      <td className="der">
                        <button
                          type="button"
                          className="btn-icono btn-icono-plano"
                          aria-label={`Ver detalle del pago de ${p.pagador || "este cliente"}`}
                          onClick={(e) => { e.stopPropagation(); setAbiertoId(p.id); }}
                        >
                          <Iconos.Derecha />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {vacio}
            {verMas}
          </div>
          {abierto && <PanelPago pago={abierto} alCerrar={() => setAbiertoId(null)} />}
        </div>
      </Card>
    </>
  );
}
