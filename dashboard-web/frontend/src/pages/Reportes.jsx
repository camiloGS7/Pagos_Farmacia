/**
 * Reportes: dos pestañas, Cierre del dia y Ventas totales.
 *
 *   #/reportes/cierre              cierre de hoy
 *   #/reportes/cierre/2026-10-19   cierre de un dia pasado
 *   #/reportes/ventas              ventas totales
 */

import { useApp } from "../App.jsx";
import { BotonTema } from "../components/Navegacion.jsx";
import CierreDia from "../components/reportes/CierreDia.jsx";
import VentasTotales from "../components/reportes/VentasTotales.jsx";
import { Segmented } from "../components/ui/index.jsx";
import { esFecha } from "../lib/fechas.js";
import { navegar } from "../lib/ruta.js";

const PESTANAS = [
  { valor: "cierre", etiqueta: "Cierre del día", id: "pestana-cierre", controla: "panel-cierre" },
  { valor: "ventas", etiqueta: "Ventas totales", id: "pestana-ventas", controla: "panel-ventas" },
];

export default function Reportes() {
  const { ruta, tamano, tema, ahora } = useApp();
  const movil = tamano === "movil";
  const pestana = ruta.partes[0] === "ventas" ? "ventas" : "cierre";
  const pedida = ruta.partes[1];
  const fecha = esFecha(pedida) && pedida <= ahora.fecha ? pedida : ahora.fecha;
  const cambiar = (p) => navegar(`/reportes/${p}`);

  const pestanas = (
    <Segmented
      pestanas
      opciones={PESTANAS}
      valor={pestana}
      onCambio={cambiar}
      etiqueta="Secciones de reportes"
      ancho={movil}
      className="reportes-tabs"
    />
  );

  const panel = PESTANAS.find((p) => p.valor === pestana);

  return (
    <>
      {movil ? (
        pestanas
      ) : (
        <header className="encabezado-pagina">
          <h1>Reportes</h1>
          <div className="encabezado-acciones">
            {pestanas}
            <BotonTema tema={tema.efectivo} alternar={tema.alternar} />
          </div>
        </header>
      )}
      <div
        role="tabpanel"
        id={panel.controla}
        aria-labelledby={panel.id}
        style={{ display: "flex", flexDirection: "column", gap: movil ? 16 : 20 }}
      >
        {pestana === "cierre" ? (
          <CierreDia key={fecha} fecha={fecha} irAVentas={() => cambiar("ventas")} />
        ) : (
          <VentasTotales />
        )}
      </div>
    </>
  );
}
