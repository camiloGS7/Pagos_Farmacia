/**
 * Cierre de caja del dia.
 *
 * GET /api/cierres?desde&hasta      Dias del rango con su estado ("Cierres anteriores")
 * GET /api/cierres/:fecha           El cierre guardado, o un borrador
 * PUT /api/cierres/:fecha           Guarda o edita (una sola transaccion)
 * GET /api/cierres/:fecha/historial Versiones del cierre
 */

const express = require("express");

const { calcularCierre, validarCierre } = require("../lib/cierre");
const { acotarRango, esFecha, hoyBogota, sumarDias } = require("../lib/fechas");
const { ErrorHttp, ruta, validacion } = require("../lib/http");
const { brebDelDia, cierreGuardado, diasDeVentas, leerCierre } = require("../lib/ventas");

function fechaValida(fecha, hoy) {
  if (!esFecha(fecha)) throw validacion(["fecha debe tener el formato AAAA-MM-DD."]);
  if (fecha > hoy) throw validacion(["No se puede cerrar un dia que todavia no llega."]);
}

/** La foto que se guarda en el historial: el cierre crudo y sus egresos. */
function foto(fila, egresos) {
  return {
    fecha: fila.fecha,
    brebTotal: fila.breb_total,
    brebCantidad: fila.breb_cantidad,
    tarjetaTotal: fila.tarjeta_total,
    baseInicial: fila.base_inicial,
    efectivoContado: fila.efectivo_contado,
    notas: fila.notas,
    version: fila.version,
    egresos: egresos.map((e) => ({ concepto: e.concepto, monto: e.monto, medio: e.medio })),
  };
}

module.exports = function rutasCierres(db, { enTransaccion }) {
  const router = express.Router();

  router.get(
    "/api/cierres",
    ruta(async (req, res) => {
      const hoy = hoyBogota();
      const rango = acotarRango(req.query.desde || sumarDias(hoy, -5), req.query.hasta || hoy, {
        hoy,
        maximo: 366,
      });
      const filas = await diasDeVentas(db, rango.desde, rango.hasta, hoy);
      res.json({ desde: rango.desde, hasta: rango.hasta, filas });
    })
  );

  router.get(
    "/api/cierres/:fecha",
    ruta(async (req, res) => {
      const hoy = hoyBogota();
      fechaValida(req.params.fecha, hoy);
      res.json(await leerCierre(db, req.params.fecha));
    })
  );

  router.put(
    "/api/cierres/:fecha",
    express.json({ limit: "64kb" }),
    ruta(async (req, res) => {
      const fecha = req.params.fecha;
      fechaValida(fecha, hoyBogota());

      const v = validarCierre(req.body);
      if (!v.ok) throw validacion(v.errores);
      const datos = v.datos;

      await enTransaccion(async (cliente) => {
        // FOR UPDATE bloquea la fila hasta el COMMIT: si dos pestañas guardan
        // a la vez, la segunda espera aqui y despues ve la version nueva.
        const actual = await cierreGuardado(cliente, fecha, { bloquear: true });
        const versionEsperada = actual ? actual.version : null;
        if (datos.version !== versionEsperada) {
          throw new ErrorHttp(409, "La version del cierre no coincide.", {
            codigo: "conflicto",
            versionActual: versionEsperada,
          });
        }

        // El Bre-B no lo manda el navegador: se toma en vivo al guardar. Es la
        // "foto" del momento del cierre.
        const breb = await brebDelDia(cliente, fecha);
        const parametros = [
          fecha,
          breb.total,
          breb.cantidad,
          datos.tarjetaTotal,
          datos.baseInicial,
          datos.efectivoContado,
          datos.notas,
        ];

        let fila;
        if (actual) {
          const r = await cliente.query(
            `UPDATE cierres_caja
                SET breb_total = $2, breb_cantidad = $3, tarjeta_total = $4,
                    base_inicial = $5, efectivo_contado = $6, notas = $7,
                    version = version + 1, actualizado_en = now()
              WHERE fecha = $1
          RETURNING *`,
            parametros
          );
          fila = r.rows[0];
        } else {
          // ON CONFLICT DO NOTHING cubre la carrera de dos pestañas que crean
          // el mismo dia a la vez: la segunda no inserta nada y recibe 409.
          const r = await cliente.query(
            `INSERT INTO cierres_caja
               (fecha, breb_total, breb_cantidad, tarjeta_total, base_inicial, efectivo_contado, notas)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (fecha) DO NOTHING
             RETURNING *`,
            parametros
          );
          if (!r.rows.length) {
            throw new ErrorHttp(409, "Otro guardado creo este cierre primero.", {
              codigo: "conflicto",
            });
          }
          fila = r.rows[0];
        }

        // Los egresos se reemplazan completos: es mas simple y mas seguro que
        // calcular cuales se agregaron, cuales cambiaron y cuales se quitaron.
        await cliente.query("DELETE FROM egresos WHERE cierre_id = $1", [fila.id]);
        if (datos.egresos.length) {
          const valores = [];
          const filas = datos.egresos.map((e, i) => {
            valores.push(fila.id, e.concepto, e.monto, e.medio, i);
            const b = i * 5;
            return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`;
          });
          await cliente.query(
            `INSERT INTO egresos (cierre_id, concepto, monto, medio, orden) VALUES ${filas.join(", ")}`,
            valores
          );
        }

        await cliente.query(
          `INSERT INTO cierres_historial (cierre_id, version, antes, despues)
           VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
          [
            fila.id,
            fila.version,
            actual ? JSON.stringify(foto(actual, actual.egresos)) : null,
            JSON.stringify(foto(fila, datos.egresos)),
          ]
        );
      });

      res.json(await leerCierre(db, fecha));
    })
  );

  router.get(
    "/api/cierres/:fecha/historial",
    ruta(async (req, res) => {
      fechaValida(req.params.fecha, hoyBogota());
      const { rows } = await db.query(
        `SELECT h.version, h.editado_en, h.antes, h.despues
           FROM cierres_historial h
           JOIN cierres_caja c ON c.id = h.cierre_id
          WHERE c.fecha = $1
          ORDER BY h.version DESC`,
        [req.params.fecha]
      );
      res.json({
        fecha: req.params.fecha,
        versiones: rows.map((f) => ({
          version: f.version,
          editadoEn: f.editado_en,
          antes: f.antes,
          despues: f.despues,
          calculado: calcularCierre(f.despues),
        })),
      });
    })
  );

  return router;
};
