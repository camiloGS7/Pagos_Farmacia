/**
 * GET /api/pagos       Lista paginada para la pantalla Pagos y para "¿Ya llegó
 *                      el pago?". Filtros: periodo, desde/hasta, banco, q.
 * GET /api/pagos.csv   Los mismos filtros, como archivo para Excel.
 *
 * La paginacion es por cursor (fecha_hora + id del ultimo pago mostrado) y no
 * por OFFSET: si entra un pago nuevo mientras Gloria baja por la lista, con
 * OFFSET se repetiria una fila; con el cursor cada pagina sigue justo donde
 * termino la anterior.
 */

const express = require("express");

const { acotarRango, hoyBogota, sumarDias } = require("../lib/fechas");
const { ruta, validacion } = require("../lib/http");
const { APROBADA } = require("../lib/ventas");

const MAX_DIAS = 90;
const LIMITE_CSV = 5000;

/** Una fila de `transacciones` en el formato de la API. */
function filaPago(f) {
  return {
    id: f.id,
    numero: f.numero_transaccion,
    monto: f.monto,
    fechaHora: f.fecha_hora,
    pagador: f.pagador || "",
    banco: f.banco || "",
    referencia: f.referencia || "",
  };
}

function rangoDePeriodo(query, hoy) {
  switch (query.periodo) {
    case "ayer": {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer, recortado: false };
    }
    case "7d":
      return { desde: sumarDias(hoy, -6), hasta: hoy, recortado: false };
    case "30d":
      return { desde: sumarDias(hoy, -29), hasta: hoy, recortado: false };
    case "fechas":
      return acotarRango(query.desde, query.hasta, { hoy, maximo: MAX_DIAS });
    default:
      return { desde: hoy, hasta: hoy, recortado: false };
  }
}

/** Minusculas y sin tildes, igual que el translate() del SQL. */
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, (c) => "\\" + c);
}

/**
 * Arma el WHERE comun a la lista, al resumen y al CSV. `conBanco` permite
 * calcular los chips de banco sin el filtro de banco: si no, al elegir Nequi
 * desaparecerian todos los demas chips.
 */
function filtros(query, rango, { conBanco = true, conBusqueda = true } = {}) {
  const valores = [rango.desde, rango.hasta];
  const condiciones = [
    APROBADA,
    "fecha_hora >= $1::date AND fecha_hora < $2::date + 1",
  ];

  if (conBanco && query.banco !== undefined) {
    const bancos = [].concat(query.banco).map(String);
    valores.push(bancos);
    condiciones.push(`COALESCE(banco, '') = ANY($${valores.length}::text[])`);
  }

  const q = typeof query.q === "string" ? query.q.trim().slice(0, 80) : "";
  if (conBusqueda && q) {
    valores.push(`%${escaparLike(normalizar(q))}%`);
    const i = valores.length;
    const partes = [
      `translate(lower(COALESCE(pagador, '')), 'áéíóúüñ', 'aeiouun') LIKE $${i}`,
      `lower(COALESCE(referencia, '')) LIKE $${i}`,
      `lower(numero_transaccion) LIKE $${i}`,
    ];
    // "70.000", "$ 70000" o "70000" buscan el mismo monto. Con menos de 3
    // cifras casi todo coincidiria, asi que no se busca por monto.
    const cifras = q.replace(/\D/g, "");
    if (cifras.length >= 3) {
      valores.push(`%${cifras}%`);
      partes.push(`monto::text LIKE $${valores.length}`);
    }
    condiciones.push(`(${partes.join(" OR ")})`);
  }

  return { where: condiciones.join(" AND "), valores };
}

function leerCursor(texto) {
  if (typeof texto !== "string" || !texto) return null;
  try {
    const [fechaHora, id] = Buffer.from(texto, "base64url").toString("utf8").split("|");
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fechaHora) || !/^\d+$/.test(id)) return null;
    return { fechaHora, id: Number(id) };
  } catch {
    return null;
  }
}

function crearCursor(fila) {
  return Buffer.from(`${fila.fecha_hora}|${fila.id}`, "utf8").toString("base64url");
}

function rutasPagos(db) {
  const router = express.Router();

  router.get(
    "/api/pagos",
    ruta(async (req, res) => {
      const hoy = hoyBogota();
      const rango = rangoDePeriodo(req.query, hoy);
      const limite = Math.min(Math.max(Number.parseInt(req.query.limite, 10) || 50, 1), 200);

      if (req.query.cursor !== undefined && !leerCursor(req.query.cursor)) {
        throw validacion(["cursor invalido."]);
      }
      const cursor = leerCursor(req.query.cursor);

      const lista = filtros(req.query, rango);
      const valores = [...lista.valores];
      let where = lista.where;
      if (cursor) {
        valores.push(cursor.fechaHora, cursor.id);
        where += ` AND (fecha_hora, id) < ($${valores.length - 1}::timestamp, $${valores.length}::int)`;
      }
      valores.push(limite + 1);

      const consultas = [
        db.query(
          `SELECT id, numero_transaccion, monto, fecha_hora, pagador, banco, referencia
             FROM transacciones WHERE ${where}
            ORDER BY fecha_hora DESC, id DESC
            LIMIT $${valores.length}`,
          valores
        ),
      ];

      // El resumen y los chips solo hacen falta en la primera pagina.
      if (!cursor) {
        consultas.push(
          db.query(
            `SELECT COUNT(*)::int AS pagos, COALESCE(SUM(monto), 0)::bigint AS total
               FROM transacciones WHERE ${lista.where}`,
            lista.valores
          )
        );
        const sinBanco = filtros(req.query, rango, { conBanco: false, conBusqueda: false });
        consultas.push(
          db.query(
            `SELECT COALESCE(banco, '') AS banco, COUNT(*)::int AS pagos
               FROM transacciones WHERE ${sinBanco.where}
              GROUP BY 1 ORDER BY 2 DESC`,
            sinBanco.valores
          )
        );
      }

      const [filas, resumen, bancos] = await Promise.all(consultas);
      const hayMas = filas.rows.length > limite;
      const pagina = filas.rows.slice(0, limite);

      res.json({
        desde: rango.desde,
        hasta: rango.hasta,
        recortado: rango.recortado,
        pagos: pagina.map(filaPago),
        siguiente: hayMas ? crearCursor(pagina[pagina.length - 1]) : null,
        resumen: resumen ? resumen.rows[0] : undefined,
        bancos: bancos ? bancos.rows : undefined,
      });
    })
  );

  router.get(
    "/api/pagos.csv",
    ruta(async (req, res) => {
      const rango = rangoDePeriodo(req.query, hoyBogota());
      const { where, valores } = filtros(req.query, rango);
      valores.push(LIMITE_CSV);
      const { rows } = await db.query(
        `SELECT numero_transaccion, monto, fecha_hora, pagador, banco, referencia
           FROM transacciones WHERE ${where}
          ORDER BY fecha_hora DESC, id DESC LIMIT $${valores.length}`,
        valores
      );

      const escapar = (valor) => {
        const texto = String(valor ?? "");
        return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
      };
      const filas = [
        ["Fecha", "Hora", "Quién pagó", "Banco", "Referencia", "Número", "Monto"],
        ...rows.map((f) => [
          f.fecha_hora.slice(0, 10),
          f.fecha_hora.slice(11, 16),
          f.pagador,
          f.banco,
          f.referencia,
          f.numero_transaccion,
          f.monto,
        ]),
      ];
      // Punto y coma: Excel en español toma la coma como decimal. El BOM hace
      // que abra el archivo como UTF-8 y no rompa las tildes.
      const contenido = "﻿" + filas.map((f) => f.map(escapar).join(";")).join("\r\n");
      const nombre =
        rango.desde === rango.hasta
          ? `pagos_${rango.desde}.csv`
          : `pagos_${rango.desde}_a_${rango.hasta}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
      res.send(contenido);
    })
  );

  return router;
}

module.exports = rutasPagos;
module.exports.filaPago = filaPago;
