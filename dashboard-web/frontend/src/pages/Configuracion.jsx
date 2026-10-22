/**
 * Configuracion (en el celular, "Ajustes"): meta diaria, avisos, apariencia y
 * el estado de la captura de pagos con el boton "Revisar correo ahora".
 *
 * Los switches y el tema se guardan apenas se tocan (no hay boton Guardar:
 * un switch ya es una decision). La meta si espera a "Guardar", porque se
 * escribe cifra por cifra y guardar cada tecla seria raro.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApp } from "../App.jsx";
import { BotonTema } from "../components/Navegacion.jsx";
import { Aviso, Button, Card, CabeceraCard, MoneyInput, Pill, Segmented, Switch } from "../components/ui/index.jsx";
import { Iconos } from "../components/ui/Iconos.jsx";
import { mensajeDeError, pedir } from "../lib/api.js";
import { useCaptura, useGuardarConfiguracion } from "../lib/consultas.js";
import { ahoraBogota } from "../lib/fechas.js";
import { diaMes, haceCuanto, hora12, hora24, plural } from "../lib/format.js";

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

function Captura({ captura, estado, hoy }) {
  const cliente = useQueryClient();
  const [resultado, setResultado] = useState(null);
  const revisar = useMutation({
    mutationFn: () => pedir("/api/captura/revisar", { metodo: "POST" }),
    onSuccess: (r) => {
      setResultado(
        r.modo === "en-cola"
          ? { tono: "info", texto: "Pedimos la revisión. Los pagos nuevos aparecen en un par de minutos." }
          : { tono: "ok", texto: r.nuevos ? `Correo revisado: ${plural(r.nuevos, "pago nuevo", "pagos nuevos")}.` : "Correo revisado. No había pagos nuevos." }
      );
      cliente.invalidateQueries();
    },
    onError: (e) => {
      setResultado({
        tono: "error",
        texto:
          e.codigo === "espera"
            ? `Acabamos de revisar. Intenta otra vez en ${e.cuerpo.segundos} segundos.`
            : e.estado === 0
              ? "No pudimos revisar. Revisa tu conexión e intenta de nuevo."
              : "No pudimos revisar el correo desde aquí. Los pagos siguen entrando solos.",
      });
    },
  });

  const ultimo = captura.data?.ultimoPago;
  const revision = captura.data?.ultimaRevision;
  // La misma regla de la barra lateral: solo preocupa en horario de atencion.
  const funcionando = !estado.detenida;
  const textoUltimo = !ultimo
    ? "Ninguno todavía"
    : ultimo.fechaHora.slice(0, 10) === hoy
      ? `hoy, ${hora24(ultimo.fechaHora)}`
      : `${diaMes(ultimo.fechaHora)}, ${hora24(ultimo.fechaHora)}`;
  const fechaRevision = revision ? ahoraBogota(new Date(revision)).fecha : null;
  const textoRevision = revision ? `${fechaRevision === hoy ? "hoy" : diaMes(fechaRevision)}, ${hora12(revision)}` : "—";

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
        <dt>Última revisión a mano</dt>
        <dd>{textoRevision}</dd>
      </dl>
      <div className="captura-accion">
        <Button variante="secundario" icono={<Iconos.Refrescar />} onClick={() => revisar.mutate()} disabled={revisar.isPending}>
          {revisar.isPending ? "Revisando el correo…" : "Revisar correo ahora"}
        </Button>
        <span>Úsalo si un cliente ya pagó y no aparece.</span>
      </div>
      {resultado && (
        <Aviso tono={resultado.tono === "ok" ? "info" : resultado.tono} role={resultado.tono === "error" ? "alert" : "status"} titulo={resultado.texto} />
      )}
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
