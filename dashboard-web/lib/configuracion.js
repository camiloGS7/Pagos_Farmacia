/**
 * Configuracion del tablero: meta diaria, avisos y tema, en la tabla
 * `configuracion` (clave/valor JSONB).
 *
 * Antes la meta vivia en el navegador (localStorage) y en la variable
 * META_DIARIA. En la base sirve para todos los dispositivos de Gloria a la vez.
 * Si la tabla todavia no existe (falta correr la migracion) se devuelven los
 * valores por defecto en vez de tumbar la pantalla.
 */

const POR_DEFECTO = {
  meta_diaria: Number(process.env.META_DIARIA) || 600000,
  avisos: { sonido: true, sin_pagos_2h: true, recordar_cierre: false },
  tema: "auto",
  captura_ultima_revision: null,
};

const TEMAS = ["claro", "oscuro", "auto"];

async function leerConfiguracion(db) {
  const valores = { ...POR_DEFECTO, avisos: { ...POR_DEFECTO.avisos } };
  try {
    const { rows } = await db.query("SELECT clave, valor FROM configuracion");
    for (const { clave, valor } of rows) {
      if (clave === "avisos") valores.avisos = { ...valores.avisos, ...valor };
      else valores[clave] = valor;
    }
  } catch (error) {
    if (error.code !== "42P01") throw error; // 42P01 = la tabla no existe
  }
  return valores;
}

/** Del formato de la base (snake_case) al de la API (camelCase). */
function aJson(valores) {
  return {
    metaDiaria: Number(valores.meta_diaria) || 0,
    avisos: {
      sonido: Boolean(valores.avisos.sonido),
      sinPagos2h: Boolean(valores.avisos.sin_pagos_2h),
      recordarCierre: Boolean(valores.avisos.recordar_cierre),
    },
    tema: TEMAS.includes(valores.tema) ? valores.tema : "auto",
  };
}

/**
 * Valida un PUT parcial. Solo se escriben las claves que llegan, para que
 * cambiar el tema no pise una meta que se edito en otra pestaña.
 */
function validarCambios(cuerpo) {
  const errores = [];
  const cambios = {};
  const c = cuerpo && typeof cuerpo === "object" ? cuerpo : {};

  if (c.metaDiaria !== undefined) {
    if (!Number.isInteger(c.metaDiaria) || c.metaDiaria < 0 || c.metaDiaria > 100000000) {
      errores.push("metaDiaria debe ser un entero entre 0 y 100000000.");
    } else {
      cambios.meta_diaria = c.metaDiaria;
    }
  }

  if (c.avisos !== undefined) {
    const a = c.avisos && typeof c.avisos === "object" ? c.avisos : null;
    const mapa = { sonido: "sonido", sinPagos2h: "sin_pagos_2h", recordarCierre: "recordar_cierre" };
    if (!a) {
      errores.push("avisos debe ser un objeto.");
    } else {
      const avisos = {};
      for (const [campo, columna] of Object.entries(mapa)) {
        if (a[campo] === undefined) continue;
        if (typeof a[campo] !== "boolean") errores.push(`avisos.${campo} debe ser true o false.`);
        else avisos[columna] = a[campo];
      }
      cambios.avisos = avisos;
    }
  }

  if (c.tema !== undefined) {
    if (!TEMAS.includes(c.tema)) errores.push('tema debe ser "claro", "oscuro" o "auto".');
    else cambios.tema = c.tema;
  }

  return errores.length ? { ok: false, errores } : { ok: true, cambios };
}

async function guardarCambios(db, cambios) {
  for (const [clave, valor] of Object.entries(cambios)) {
    // Los avisos se mezclan con lo guardado (||), asi un PUT con un solo
    // switch no apaga los otros dos.
    const sql =
      clave === "avisos"
        ? `INSERT INTO configuracion (clave, valor) VALUES ($1, $2::jsonb)
           ON CONFLICT (clave) DO UPDATE
             SET valor = configuracion.valor || EXCLUDED.valor, actualizado_en = now()`
        : `INSERT INTO configuracion (clave, valor) VALUES ($1, $2::jsonb)
           ON CONFLICT (clave) DO UPDATE
             SET valor = EXCLUDED.valor, actualizado_en = now()`;
    await db.query(sql, [clave, JSON.stringify(valor)]);
  }
}

module.exports = { leerConfiguracion, aJson, validarCambios, guardarCambios };
