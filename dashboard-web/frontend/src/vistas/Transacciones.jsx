import { useEffect, useMemo, useState } from "react";

import { Iconos } from "../iconos.jsx";
import {
  descargarCSV,
  etiquetaDia,
  horaDe,
  pesos,
  traer,
} from "../api.js";

const LIMITES = [50, 100, 250, 500];

/**
 * El listado completo de pagos del rango, con buscador.
 *
 * La busqueda se hace en el servidor (ILIKE sobre pagador, banco, referencia y
 * numero de transaccion) y no filtrando en el navegador: si algun dia hay
 * miles de pagos, traerlos todos para descartarlos aqui seria absurdo.
 */
export default function Transacciones({ ventana, version }) {
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [limite, setLimite] = useState(100);

  const [filas, setFilas] = useState(null);
  const [cargando, setCargando] = useState(false);

  // Se espera a que el usuario deje de escribir antes de consultar: sin esto
  // cada tecla dispararia una consulta a Neon.
  useEffect(() => {
    const espera = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(espera);
  }, [texto]);

  const consulta = useMemo(() => {
    const partes = [
      `desde=${ventana.desde}`,
      `hasta=${ventana.hasta}`,
      `limite=${limite}`,
    ];
    if (busqueda) partes.push(`q=${encodeURIComponent(busqueda)}`);
    return partes.join("&");
  }, [ventana, limite, busqueda]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);

    traer(`/api/transacciones?${consulta}`)
      .then((d) => vigente && setFilas(d))
      .catch(() => vigente && setFilas([]))
      .finally(() => vigente && setCargando(false));

    return () => {
      vigente = false;
    };
  }, [consulta, version]);

  const total = (filas || []).reduce(
    (s, t) => s + (t.estado === "Aprobada" ? t.monto : 0),
    0
  );

  const exportar = () => {
    const cabecera = [
      "Fecha", "Hora", "Pagador", "Banco", "Referencia",
      "Número de transacción", "Método", "Estado", "Monto",
    ];
    const cuerpo = (filas || []).map((t) => [
      t.fecha_hora.slice(0, 10),
      horaDe(t.fecha_hora),
      t.pagador || "",
      t.banco || "",
      t.referencia || "",
      t.numero_transaccion,
      t.metodo_pago || "",
      t.estado,
      t.monto,
    ]);
    descargarCSV(
      `transacciones-${ventana.desde}-a-${ventana.hasta}.csv`,
      [cabecera, ...cuerpo]
    );
  };

  return (
    <div className="tarjeta">
      <div className="panel-cabecera">
        <div>
          <div className="panel-titulo">Pagos del rango</div>
          <div className="panel-sub">
            {etiquetaDia(ventana.desde)} — {etiquetaDia(ventana.hasta)}
            {filas ? ` · ${filas.length} registros · ${pesos(total)} aprobados` : ""}
          </div>
        </div>
      </div>

      <div className="fila-controles" style={{ marginTop: 16 }}>
        <div className="buscador">
          <Iconos.Lupa tam={17} />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por pagador, banco, referencia o número…"
            aria-label="Buscar pagos"
          />
        </div>

        <select
          className="campo"
          value={limite}
          onChange={(e) => setLimite(Number(e.target.value))}
          aria-label="Cuántos registros mostrar"
          style={{ padding: "8px 10px" }}
        >
          {LIMITES.map((n) => (
            <option key={n} value={n}>
              {n} registros
            </option>
          ))}
        </select>

        <button
          type="button"
          className="boton"
          onClick={exportar}
          disabled={!filas || filas.length === 0}
        >
          <Iconos.Descargar tam={16} />
          Exportar CSV
        </button>
      </div>

      {!filas ? (
        <div className="cargando">Cargando pagos…</div>
      ) : filas.length === 0 ? (
        <div className="vacio">
          {busqueda
            ? `Ningún pago coincide con "${busqueda}".`
            : "No hay pagos en este rango."}
        </div>
      ) : (
        <div className={"tabla-contenedor" + (cargando ? " atenuado" : "")}>
          {/* Ver Resumen.jsx: las clases por celda son las que dejan que el CSS
              convierta cada fila en una ficha cuando la pantalla es angosta. */}
          <table className="tabla tabla-pagos">
            <thead>
              <tr>
                <th>FECHA</th>
                <th>HORA</th>
                <th>PAGADOR</th>
                <th>BANCO</th>
                <th>REFERENCIA</th>
                <th>ESTADO</th>
                <th className="derecha">MONTO</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((t) => (
                <tr key={t.numero_transaccion}>
                  <td className="hora celda-fecha">{etiquetaDia(t.fecha_hora.slice(0, 10))}</td>
                  <td className="hora celda-hora">{horaDe(t.fecha_hora)}</td>
                  <td className="pagador celda-pagador">{t.pagador || "—"}</td>
                  <td className="celda-banco">
                    <span className="banco">
                      <span className="banco-punto" style={{ background: "var(--sage)" }} />
                      {t.banco || "Sin identificar"}
                    </span>
                  </td>
                  <td className="hora celda-referencia">{t.referencia || "—"}</td>
                  <td className="celda-estado">
                    <span
                      className={"insignia " + (t.estado === "Aprobada" ? "ok" : "mal")}
                    >
                      {t.estado}
                    </span>
                  </td>
                  <td className="monto celda-monto">{pesos(t.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filas && filas.length === limite && (
        <div className="panel-sub" style={{ marginTop: 12 }}>
          Se muestran los {limite} más recientes del rango. Sube el límite o acota
          las fechas para ver el resto.
        </div>
      )}
    </div>
  );
}
