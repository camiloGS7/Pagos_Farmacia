/**
 * El detalle de un pago: panel lateral en escritorio (pantalla Pagos) y hoja
 * inferior en el celular. El contenido es el mismo; solo cambia el envase.
 */

import { useEffect, useState } from "react";

import { banco } from "../lib/bancos.js";
import { fechaCorta, hora24, pesos } from "../lib/format.js";
import { BotonIcono, BottomSheet, Button, Punto } from "./ui/index.jsx";
import { Iconos } from "./ui/Iconos.jsx";

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sin permiso de portapapeles (http o navegador viejo): el metodo antiguo.
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** Busca el correo original en Gmail por el numero del pago. */
function enlaceCorreo(pago) {
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`"${pago.numero}"`)}`;
}

function Datos({ pago }) {
  const b = banco(pago.banco);
  return (
    <dl className="detalle-datos">
      <div>
        <dt>Quién pagó</dt>
        <dd>{pago.pagador || "Sin nombre"}</dd>
      </div>
      <div>
        <dt>Banco</dt>
        <dd><Punto color={b.color} />{b.label}</dd>
      </div>
      <div>
        <dt>Referencia</dt>
        <dd className="mono">{pago.referencia || pago.numero}</dd>
      </div>
      <div>
        <dt>Fecha</dt>
        <dd>{fechaCorta(pago.fechaHora)} · {hora24(pago.fechaHora)}</dd>
      </div>
    </dl>
  );
}

function Acciones({ pago, corto = false }) {
  const [copiada, setCopiada] = useState(false);
  useEffect(() => setCopiada(false), [pago.id]);
  return (
    <div className="detalle-acciones">
      <Button
        variante="secundario"
        onClick={async () => setCopiada(await copiar(pago.referencia || pago.numero))}
        aria-live="polite"
      >
        {copiada ? "Copiada" : "Copiar referencia"}
      </Button>
      <a className="btn btn-enlace" href={enlaceCorreo(pago)} target="_blank" rel="noopener noreferrer">
        {corto ? "Ver correo" : "Ver correo original"}
      </a>
    </div>
  );
}

export function PanelPago({ pago, alCerrar }) {
  return (
    <aside className="detalle-panel" aria-label="Detalle del pago">
      <div className="detalle-panel-arriba">
        <h2>Detalle</h2>
        <BotonIcono etiqueta="Cerrar detalle" className="btn-icono-plano" onClick={alCerrar}>
          <Iconos.Cerrar tam={18} />
        </BotonIcono>
      </div>
      <span className="detalle-monto num">{pesos(pago.monto)}</span>
      <Datos pago={pago} />
      <Acciones pago={pago} />
    </aside>
  );
}

export function HojaPago({ pago, alCerrar }) {
  return (
    <BottomSheet abierto={Boolean(pago)} alCerrar={alCerrar} idTitulo="hoja-pago-t">
      {pago && (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span id="hoja-pago-t" className="kpi-etiqueta" style={{ fontSize: 13 }}>Pago recibido</span>
              <span className="detalle-monto num">{pesos(pago.monto)}</span>
            </div>
            <BotonIcono etiqueta="Cerrar" onClick={alCerrar} style={{ border: 0, background: "var(--raised)", borderRadius: 12 }}>
              <Iconos.Cerrar tam={18} />
            </BotonIcono>
          </div>
          <Datos pago={pago} />
          <Acciones pago={pago} corto />
        </>
      )}
    </BottomSheet>
  );
}
