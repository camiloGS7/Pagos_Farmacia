import { useEffect, useState } from "react";

import { Iconos } from "../iconos.jsx";
import {
  COLORES_SERIE,
  descargarCSV,
  etiquetaDia,
  fechaLarga,
  pesos,
  porcentajeEntero,
  traer,
} from "../api.js";

/**
 * El cierre del periodo: cuanto entro cada dia, cuanto por banco, y el archivo
 * para llevarlo a Excel o pasarselo al contador.
 *
 * El CSV se arma en el navegador con los datos que ya estan en pantalla. No
 * hace falta una ruta de exportacion en el servidor, y lo que se descarga es
 * exactamente lo que se esta viendo.
 */
export default function Reportes({ ventana, parametros, version, negocio }) {
  const [porDia, setPorDia] = useState(null);
  const [porBanco, setPorBanco] = useState(null);

  useEffect(() => {
    let vigente = true;

    Promise.all([
      traer(`/api/ventas-por-dia?${parametros}`),
      traer(`/api/ventas-por-banco?${parametros}`),
    ])
      .then(([dias, bancos]) => {
        if (!vigente) return;
        setPorDia(dias);
        setPorBanco(bancos);
      })
      .catch(() => {
        if (!vigente) return;
        setPorDia({ dias: [] });
        setPorBanco({ bancos: [], total: 0 });
      });

    return () => {
      vigente = false;
    };
  }, [parametros, version]);

  if (!porDia || !porBanco) return <div className="cargando">Cargando reporte…</div>;

  const dias = porDia.dias || [];
  const total = dias.reduce((s, d) => s + d.total, 0);
  const pagos = dias.reduce((s, d) => s + d.transacciones, 0);

  // Solo cuentan los dias con ventas: dividir entre los domingos cerrados
  // hundiria el promedio y daria una cifra que no describe nada real.
  const diasConVentas = dias.filter((d) => d.total > 0);
  const promedioDiario = diasConVentas.length
    ? Math.round(total / diasConVentas.length)
    : 0;

  const mejor = dias.reduce(
    (mejor, d) => (!mejor || d.total > mejor.total ? d : mejor),
    null
  );

  const exportarDias = () => {
    descargarCSV(`reporte-diario-${ventana.desde}-a-${ventana.hasta}.csv`, [
      [negocio],
      [`Reporte del ${ventana.desde} al ${ventana.hasta}`],
      [],
      ["Fecha", "Transacciones", "Total"],
      ...dias.map((d) => [d.dia, d.transacciones, d.total]),
      [],
      ["TOTAL", pagos, total],
    ]);
  };

  const exportarBancos = () => {
    descargarCSV(`reporte-bancos-${ventana.desde}-a-${ventana.hasta}.csv`, [
      [negocio],
      [`Reparto por banco del ${ventana.desde} al ${ventana.hasta}`],
      [],
      ["Banco", "Transacciones", "Total", "Participación"],
      ...porBanco.bancos.map((b) => [
        b.banco,
        b.transacciones,
        b.total,
        porcentajeEntero(b.porcentaje),
      ]),
    ]);
  };

  return (
    <>
      <section className="tarjetas">
        <Cifra etiqueta="Total del periodo" valor={pesos(total)} nota={`${dias.length} días`} />
        <Cifra etiqueta="Pagos recibidos" valor={pagos.toLocaleString("es-CO")} nota={`${diasConVentas.length} días con ventas`} />
        <Cifra etiqueta="Promedio por día" valor={pesos(promedioDiario)} nota="solo días con ventas" />
        <Cifra
          etiqueta="Mejor día"
          valor={mejor && mejor.total > 0 ? pesos(mejor.total) : "—"}
          nota={mejor && mejor.total > 0 ? fechaLarga(mejor.dia) : "sin datos"}
        />
      </section>

      <div className="tarjeta">
        <div className="panel-cabecera">
          <div>
            <div className="panel-titulo">Detalle por día</div>
            <div className="panel-sub">
              {etiquetaDia(ventana.desde)} — {etiquetaDia(ventana.hasta)}
            </div>
          </div>
          <button type="button" className="boton" onClick={exportarDias} disabled={dias.length === 0}>
            <Iconos.Descargar tam={16} />
            Exportar CSV
          </button>
        </div>

        {dias.length === 0 ? (
          <div className="vacio">No hay datos en este rango.</div>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>FECHA</th>
                  <th className="derecha">PAGOS</th>
                  <th className="derecha">TOTAL</th>
                  <th className="derecha">PARTICIPACIÓN</th>
                </tr>
              </thead>
              <tbody>
                {dias.map((d) => (
                  <tr key={d.dia}>
                    <td>{fechaLarga(d.dia)}</td>
                    <td className="monto">{d.transacciones}</td>
                    <td className="monto">{pesos(d.total)}</td>
                    <td className="monto">
                      {total > 0 ? porcentajeEntero(d.total / total) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="tarjeta">
        <div className="panel-cabecera">
          <div>
            <div className="panel-titulo">Detalle por banco</div>
            <div className="panel-sub">De dónde viene la plata en este periodo</div>
          </div>
          <button
            type="button"
            className="boton"
            onClick={exportarBancos}
            disabled={porBanco.bancos.length === 0}
          >
            <Iconos.Descargar tam={16} />
            Exportar CSV
          </button>
        </div>

        {porBanco.bancos.length === 0 ? (
          <div className="vacio">No hay datos en este rango.</div>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>BANCO</th>
                  <th className="derecha">PAGOS</th>
                  <th className="derecha">TOTAL</th>
                  <th className="derecha">PARTICIPACIÓN</th>
                </tr>
              </thead>
              <tbody>
                {porBanco.bancos.map((b, i) => (
                  <tr key={b.banco}>
                    <td>
                      <span className="banco">
                        <span
                          className="banco-punto"
                          style={{ background: COLORES_SERIE[i % COLORES_SERIE.length] }}
                        />
                        {b.banco}
                      </span>
                    </td>
                    <td className="monto">{b.transacciones}</td>
                    <td className="monto">{pesos(b.total)}</td>
                    <td className="monto">{porcentajeEntero(b.porcentaje)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Cifra({ etiqueta, valor, nota }) {
  return (
    <div className="tarjeta stat">
      <div className="stat-label">{etiqueta}</div>
      <div className="stat-valor num">{valor}</div>
      <div className="stat-pie">
        <span className="nota">{nota}</span>
      </div>
    </div>
  );
}
