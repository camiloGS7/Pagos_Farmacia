import { useEffect, useState } from "react";

import { haceCuanto, pesos } from "../api.js";

/**
 * Ajustes del tablero.
 *
 * Solo hay dos cosas configurables de verdad —la meta del dia y el tema— y las
 * dos se guardan en el navegador. El resto del bloque es informativo: sirve
 * para responder "¿esto sigue funcionando?" sin abrir una terminal.
 */
export default function Configuracion({
  metaDiaria,
  metaPorDefecto,
  esMetaLocal,
  alGuardarMeta,
  tema,
  alCambiarTema,
  negocio,
  administradora,
  resumen,
  hayError,
}) {
  const [texto, setTexto] = useState(String(metaDiaria || ""));
  const [guardado, setGuardado] = useState(false);

  // Si la meta cambia desde fuera (por ejemplo al llegar la config del
  // servidor), el campo se pone al dia solo.
  useEffect(() => {
    setTexto(String(metaDiaria || ""));
  }, [metaDiaria]);

  const valor = Number(texto);
  const valido = Number.isFinite(valor) && valor >= 0;
  const cambio = valido && valor !== metaDiaria;

  const guardar = () => {
    if (!cambio) return;
    alGuardarMeta(valor > 0 ? valor : null);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  const desde = haceCuanto(resumen?.ultimoPago);

  return (
    <>
      <div className="tarjeta">
        <div className="panel-titulo">Preferencias</div>

        <div className="ajuste">
          <div className="ajuste-titulo">Meta diaria</div>
          <div className="ajuste-ayuda">
            Cuánto esperas recaudar en un día. Es lo que llena el anillo del
            resumen. Se guarda en este navegador, así que cambiarla no afecta a
            nadie más ni requiere volver a desplegar nada.
          </div>

          <div className="fila-controles" style={{ marginTop: 6 }}>
            <input
              className="campo-numero"
              type="number"
              min="0"
              step="50000"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
              aria-label="Meta diaria en pesos"
            />
            <button
              type="button"
              className="boton primario"
              onClick={guardar}
              disabled={!cambio}
            >
              Guardar
            </button>

            {esMetaLocal && (
              <button
                type="button"
                className="boton"
                onClick={() => alGuardarMeta(null)}
                title={`Volver a ${pesos(metaPorDefecto)}`}
              >
                Restablecer
              </button>
            )}

            {guardado && <span className="panel-nota">Guardado.</span>}
            {!valido && <span className="panel-nota">Escribe un número.</span>}
          </div>

          <div className="ajuste-ayuda">
            Actual: <strong>{pesos(metaDiaria)}</strong>
            {esMetaLocal && ` · valor del servidor: ${pesos(metaPorDefecto)}`}
          </div>
        </div>

        <div className="ajuste">
          <div className="ajuste-titulo">Apariencia</div>
          <div className="ajuste-ayuda">
            El modo oscuro también se puede cambiar desde el botón de la esquina
            superior. La primera vez se toma del sistema operativo.
          </div>
          <div className="fila-controles" style={{ marginTop: 6 }}>
            <div className="filtro-grupo">
              <button
                type="button"
                className={"filtro-boton" + (tema === "claro" ? " activo" : "")}
                onClick={() => alCambiarTema("claro")}
              >
                Claro
              </button>
              <button
                type="button"
                className={"filtro-boton" + (tema === "oscuro" ? " activo" : "")}
                onClick={() => alCambiarTema("oscuro")}
              >
                Oscuro
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="tarjeta">
        <div className="panel-cabecera">
          <div>
            <div className="panel-titulo">Estado del sistema</div>
            <div className="panel-sub">Para saber si los pagos siguen entrando</div>
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <Dato clave="Negocio" valor={negocio} />
          <Dato clave="Administradora" valor={administradora} />
          <Dato
            clave="Base de datos"
            valor={hayError ? "Sin conexión" : "Conectada"}
          />
          <Dato clave="Último pago registrado" valor={desde || "Ninguno todavía"} />
          <Dato
            clave="Recaudado hoy"
            valor={resumen ? pesos(resumen.meta.logrado) : "—"}
          />
          <Dato clave="El tablero se actualiza" valor="cada 60 segundos" />
          <Dato clave="Los correos se revisan" valor="cada 10 minutos" />
        </div>

        <div className="ajuste-ayuda" style={{ marginTop: 14 }}>
          Los pagos los registra un proceso automático que revisa el correo de
          Nequi y escribe en la base de datos. Funciona con el computador
          apagado. Si el “último pago” se queda quieto varias horas en horario
          de atención, revisa el historial de ejecuciones en GitHub Actions.
        </div>
      </div>
    </>
  );
}

function Dato({ clave, valor }) {
  return (
    <div className="dato">
      <span className="dato-clave">{clave}</span>
      <span className="dato-valor">{valor}</span>
    </div>
  );
}
