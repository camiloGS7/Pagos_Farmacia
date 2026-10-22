/**
 * Configuracion (en el celular, "Ajustes"): meta diaria, avisos, apariencia y
 * el estado de la captura de pagos.
 *
 * Los switches y el tema se guardan apenas se tocan (no hay boton Guardar:
 * un switch ya es una decision). La meta si espera a "Guardar", porque se
 * escribe cifra por cifra y guardar cada tecla seria raro.
 */

import { useEffect, useState } from "react";

import { useApp } from "../App.jsx";
import { BotonTema } from "../components/Navegacion.jsx";
import { Aviso, Button, Card, CabeceraCard, MoneyInput, Pill, Segmented, Switch } from "../components/ui/index.jsx";
import { Iconos } from "../components/ui/Iconos.jsx";
import { mensajeDeError } from "../lib/api.js";
import { useCaptura, useGuardarConfiguracion } from "../lib/consultas.js";
import { diaMes, haceCuanto, hora24 } from "../lib/format.js";

const TEMAS = [
  { valor: "claro", etiqueta: "Claro" },
  { valor: "oscuro", etiqueta: "Oscuro" },
  { valor: "auto", etiqueta: "Automático" },
];

function Meta({ meta, guardar, movil }) {
  const [valor, setValor] = useState(meta);
  const [guardada, setGuardada] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setValor(meta), [meta]);
  const cambio = (valor || 0) !== meta;

  const confirmar = () => {
    setError("");
    guardar.mutate(
      { metaDiaria: valor || 0 },
      {
        onSuccess: () => setGuardada(true),
        onError: (e) => setError(mensajeDeError(e, "guardar")),
      }
    );
  };

  return (
    <Card id="meta" aria-labelledby="meta-t">
      <CabeceraCard id="meta-t" titulo="Meta diaria" subtitulo="Cuánto esperas recaudar en un día." />
      <div className="config-meta-fila">
        <MoneyInput
          id="meta-in"
          etiqueta="Meta diaria en pesos"
          ocultarEtiqueta
          valor={valor}
          onCambio={(v) => { setValor(v); setGuardada(false); }}
          onKeyDown={(e) => e.key === "Enter" && cambio && confirmar()}
        />
        {cambio && (
          <div className={movil ? "config-meta-botones" : "egreso-form-botones"}>
            {movil ? (
              <>
                <Button variante="secundario" onClick={() => setValor(meta)}>Cancelar</Button>
                <Button variante="primario" onClick={confirmar} disabled={guardar.isPending}>Guardar</Button>
              </>
            ) : (
              <>
                <Button variante="primario" onClick={confirmar} disabled={guardar.isPending}>Guardar</Button>
                <Button variante="fantasma" onClick={() => setValor(meta)}>Cancelar</Button>
              </>
            )}
          </div>
        )}
        {guardada && !cambio && (
          <span className="config-ok" role="status"><Iconos.Check />Meta guardada</span>
        )}
      </div>
      {error && <span className="error-campo" role="alert">{error}</span>}
    </Card>
  );
}

/**
 * Estado de la captura: si estan entrando pagos y cuando llego el ultimo. Es
 * solo informativo; los pagos se registran solos desde el correo.
 */
function Captura({ captura, estado, hoy }) {
  const ultimo = captura.data?.ultimoPago;
  // La misma regla de la barra lateral: solo preocupa en horario de atencion.
  const funcionando = !estado.detenida;
  const textoUltimo = !ultimo
    ? "Ninguno todavía"
    : ultimo.fechaHora.slice(0, 10) === hoy
      ? `hoy, ${hora24(ultimo.fechaHora)}`
      : `${diaMes(ultimo.fechaHora)}, ${hora24(ultimo.fechaHora)}`;

  return (
    <Card id="captura" aria-labelledby="captura-t">
      <CabeceraCard id="captura-t" titulo="Captura de pagos" subtitulo="Lee los correos de Nequi, Daviplata y Bre-B.">
        {captura.data && (
          <Pill tono={funcionando ? "exito" : "warn"}>
            <span className="punto" />
            {funcionando ? "Funcionando" : ultimo ? `Sin pagos ${haceCuanto(ultimo.minutos)}` : "Sin pagos hoy"}
          </Pill>
        )}
      </CabeceraCard>
      <dl className="captura-datos">
        <dt>Último pago registrado</dt>
        <dd>{textoUltimo}</dd>
      </dl>
    </Card>
  );
}

export default function Configuracion() {
  const { ruta, tamano, tema, config, ahora, captura: estadoCaptura } = useApp();
  const movil = tamano === "movil";
  const guardar = useGuardarConfiguracion();
  const captura = useCaptura();
  const datos = config.data;

  // #/configuracion/captura y #/configuracion/meta llevan a esa seccion.
  const seccion = ruta.partes[0];
  useEffect(() => {
    if (!seccion || !datos) return;
    document.getElementById(seccion)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [seccion, datos]);

  const avisos = datos?.avisos;
  const cambiarAviso = (clave) => (valor) => guardar.mutate({ avisos: { [clave]: valor } });

  return (
    <div className="config">
      <header className="encabezado-pagina">
        <h1>Configuración</h1>
        <BotonTema tema={tema.efectivo} alternar={tema.alternar} />
      </header>

      {config.isError && !datos && (
        <Aviso tono="error" role="alert" titulo={mensajeDeError(config.error)}
          accion={<Button variante="secundario" onClick={() => config.refetch()}>Intentar de nuevo</Button>} />
      )}

      {datos && <Meta meta={datos.metaDiaria} guardar={guardar} movil={movil} />}

      {avisos && (
        <Card className="avisos-card" aria-labelledby="avisos-t">
          <CabeceraCard id="avisos-t" titulo="Avisos" />
          <Switch
            etiqueta="Sonido con cada pago"
            descripcion={movil ? "Vibra y suena al llegar un pago." : "Suena y muestra un aviso al llegar un pago."}
            activo={avisos.sonido}
            onCambio={cambiarAviso("sonido")}
          />
          <Switch
            etiqueta="Avisar si no llegan pagos"
            descripcion="Si pasan 2 horas sin pagos en horario de atención."
            activo={avisos.sinPagos2h}
            onCambio={cambiarAviso("sinPagos2h")}
          />
          <Switch
            etiqueta="Recordar el cierre"
            descripcion="Te avisa a las 9:00 p. m. si no has cerrado el día."
            activo={avisos.recordarCierre}
            onCambio={cambiarAviso("recordarCierre")}
          />
        </Card>
      )}

      <Card className="apariencia" aria-labelledby="apariencia-t">
        <CabeceraCard
          id="apariencia-t"
          titulo="Apariencia"
          subtitulo={movil ? "Automático sigue el modo del teléfono." : "Automático sigue el modo del computador."}
        />
        <Segmented opciones={TEMAS} valor={tema.preferencia} onCambio={tema.cambiar} etiqueta="Tema" ancho={movil} />
      </Card>

      <Captura captura={captura} estado={estadoCaptura} hoy={ahora.fecha} />
    </div>
  );
}
