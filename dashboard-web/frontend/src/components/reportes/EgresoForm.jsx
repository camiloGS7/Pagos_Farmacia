/**
 * Formulario para agregar un egreso: en linea en escritorio, en hoja inferior
 * en el celular. Valida al presionar "Agregar" y avisa junto al boton.
 *
 * El egreso solo queda en el estado de la pantalla: se guarda en la base
 * junto con el cierre, nunca uno por uno mientras Gloria escribe.
 */

import { useId, useState } from "react";

import { BottomSheet, Button, MoneyInput, Segmented } from "../ui/index.jsx";

const MEDIOS = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
];

function useFormulario(alAgregar) {
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState(null);
  const [medio, setMedio] = useState("efectivo");
  const [error, setError] = useState("");

  const agregar = () => {
    const limpio = concepto.trim();
    if (!limpio) return setError("Escribe qué se pagó.");
    if (!monto) return setError("Escribe el monto.");
    alAgregar({ concepto: limpio.slice(0, 80), monto, medio });
    setConcepto("");
    setMonto(null);
    setMedio("efectivo");
    setError("");
    return undefined;
  };

  return {
    concepto, monto, medio, error, agregar,
    setConcepto: (v) => { setConcepto(v); setError(""); },
    setMonto: (v) => { setMonto(v); setError(""); },
    setMedio,
  };
}

function Campos({ f, idBase }) {
  return (
    <>
      <div>
        <label htmlFor={`${idBase}-c`} className="campo-etiqueta">Qué se pagó</label>
        <input
          id={`${idBase}-c`}
          className="campo-texto"
          type="text"
          maxLength={80}
          autoComplete="off"
          placeholder="Ej.: Helados, pago camión"
          value={f.concepto}
          onChange={(e) => f.setConcepto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && f.agregar()}
          data-autofocus
        />
      </div>
      <MoneyInput
        id={`${idBase}-m`}
        etiqueta="Monto"
        valor={f.monto}
        onCambio={f.setMonto}
        onKeyDown={(e) => e.key === "Enter" && f.agregar()}
      />
    </>
  );
}

export function EgresoEnLinea({ alAgregar, alCancelar }) {
  const f = useFormulario(alAgregar);
  const id = useId();
  return (
    <div className="egreso-form" role="group" aria-label="Nuevo egreso">
      <div className="egreso-form-campos">
        <Campos f={f} idBase={id} />
      </div>
      <div className="egreso-form-pie">
        <Segmented opciones={MEDIOS} valor={f.medio} onCambio={f.setMedio} etiqueta="Cómo se pagó" />
        <div className="egreso-form-botones">
          <Button variante="fantasma" onClick={alCancelar}>Cancelar</Button>
          <Button variante="primario" onClick={f.agregar}>Agregar</Button>
        </div>
      </div>
      {f.error && <span className="error-campo" role="alert">{f.error}</span>}
    </div>
  );
}

export function EgresoEnHoja({ abierto, alAgregar, alCerrar }) {
  const f = useFormulario((egreso) => {
    alAgregar(egreso);
    alCerrar();
  });
  const id = useId();
  return (
    <BottomSheet abierto={abierto} alCerrar={alCerrar} titulo="Nuevo egreso">
      <Campos f={f} idBase={id} />
      <Segmented opciones={MEDIOS} valor={f.medio} onCambio={f.setMedio} etiqueta="Cómo se pagó" ancho />
      {f.error && <span className="error-campo" role="alert">{f.error}</span>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
        <Button variante="secundario" onClick={alCerrar}>Cancelar</Button>
        <Button variante="primario" onClick={f.agregar}>Agregar egreso</Button>
      </div>
    </BottomSheet>
  );
}
