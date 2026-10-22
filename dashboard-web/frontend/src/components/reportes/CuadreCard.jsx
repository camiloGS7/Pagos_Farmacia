/**
 * "Cuadre del dia": la tarjeta oscura con Bre-B, tarjeta y efectivo, las
 * ventas, los egresos y el neto. En escritorio tambien lleva los botones de
 * guardar, editar y descargar; en el celular esos van en la barra fija de
 * abajo (BarraAccionCierre).
 */

import { pesos } from "../../lib/format.js";
import { Button, HeroCard, Punto } from "../ui/index.jsx";
import { Iconos } from "../ui/Iconos.jsx";

export function Cuadre({ calc, breb, tarjeta, contado, children, className }) {
  return (
    <HeroCard as="aside" className={"cuadre " + (className || "")} aria-labelledby="cuadre-t">
      <h3 id="cuadre-t" className="hero-etiqueta">Cuadre del día</h3>
      <dl className="cuadre-medios">
        <div><Punto color="var(--b-breb)" /><dt>Bre-B (QR)</dt><dd className="num">{pesos(breb)}</dd></div>
        <div><Punto color="var(--m-tarjeta)" /><dt>Tarjeta</dt><dd className="num">{pesos(tarjeta)}</dd></div>
        <div><Punto color="var(--m-efectivo)" /><dt>Efectivo</dt><dd className="num">{pesos(calc.ventaEfectivo)}</dd></div>
      </dl>
      <div className="cuadre-linea" />
      <div className="cuadre-fila"><span>Ventas del día</span><strong className="cuadre-ventas num">{pesos(calc.ventas)}</strong></div>
      <div className="cuadre-fila"><span>Egresos</span><strong className="cuadre-egresos num">− {pesos(calc.egresosTotal)}</strong></div>
      <div className="cuadre-linea" />
      <div className="cuadre-neto">
        <span className="cuadre-neto-etiqueta">Neto del día</span>
        <span className="cuadre-neto-valor num">{pesos(calc.neto)}</span>
        <span className="cuadre-caja">En caja al cerrar: {pesos(contado)}</span>
      </div>
      {children}
    </HeroCard>
  );
}

/** Los botones del cuadre en escritorio, segun el modo. */
export function AccionesCuadre({ c }) {
  if (c.confirmando) {
    return (
      <div className="cuadre-confirmar" role="alertdialog" aria-labelledby="confirmar-t">
        <p id="confirmar-t">¿Guardar sin efectivo?</p>
        <div className="cuadre-botones">
          <Button variante="hero-borde" onClick={c.cancelarConfirmacion}>Cancelar</Button>
          <Button variante="hero" onClick={c.guardarConfirmado} disabled={c.guardando}>Guardar así</Button>
        </div>
      </div>
    );
  }

  if (c.modo === "guardado") {
    return (
      <div className="cuadre-acciones">
        <span className="cuadre-guardado" role="status"><Iconos.Check />{c.textoGuardado}</span>
        <div className="cuadre-botones">
          <Button variante="hero-borde" icono={<Iconos.Editar />} onClick={c.editar}>Editar</Button>
          <Button variante="hero-borde" icono={<Iconos.Descargar tam={16} />} onClick={c.pdf} disabled={c.descargando}>
            Descargar PDF
          </Button>
        </div>
        {c.mensaje && <span className="cuadre-nota" role="status">{c.mensaje}</span>}
      </div>
    );
  }

  return (
    <div className="cuadre-acciones">
      {c.puedeGuardar && (
        <Button variante="hero" onClick={c.guardar} disabled={c.guardando}>
          {c.guardando ? "Guardando…" : c.modo === "editando" ? "Guardar cambios" : "Guardar cierre del día"}
        </Button>
      )}
      {c.modo === "editando" && (
        <Button variante="hero-borde" onClick={c.cancelarEdicion}>Cancelar</Button>
      )}
      {c.error && <span className="cuadre-error" role="alert">{c.error}</span>}
      <span className="cuadre-nota">
        {c.modo === "editando" ? "El cambio queda en el historial del cierre." : "Podrás editarlo después si olvidas algo."}
      </span>
    </div>
  );
}

/** La barra fija de abajo en el celular: neto + guardar, o editar y PDF. */
export function BarraAccionCierre({ c, neto }) {
  if (c.confirmando) {
    return (
      <div className="barra-accion" role="alertdialog" aria-labelledby="confirmar-m">
        <span id="confirmar-m" style={{ fontWeight: 800 }}>¿Guardar sin efectivo?</span>
        <div className="barra-accion-botones">
          <Button variante="secundario" onClick={c.cancelarConfirmacion}>Cancelar</Button>
          <Button variante="primario" onClick={c.guardarConfirmado} disabled={c.guardando}>Guardar así</Button>
        </div>
      </div>
    );
  }
  if (c.modo === "guardado") {
    return (
      <div className="barra-accion">
        <span className="barra-accion-estado" role="status"><Iconos.Check />{c.textoGuardado}</span>
        <div className="barra-accion-botones">
          <Button variante="secundario" onClick={c.editar}>Editar</Button>
          <Button variante="secundario" onClick={c.pdf} disabled={c.descargando}>Descargar PDF</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="barra-accion">
      {c.error && <span className="error-campo" role="alert">{c.error}</span>}
      <div className="barra-accion-fila">
        <div className="barra-accion-neto">
          <span>Neto del día</span>
          <strong className="num">{pesos(neto)}</strong>
        </div>
        {c.puedeGuardar ? (
          <Button variante="primario" onClick={c.guardar} disabled={c.guardando}>
            {c.guardando ? "Guardando…" : c.modo === "editando" ? "Guardar cambios" : "Guardar cierre"}
          </Button>
        ) : (
          <Button variante="secundario" onClick={c.cancelarEdicion} style={{ flex: 1 }}>Cancelar edición</Button>
        )}
      </div>
    </div>
  );
}
