-- =====================================================================
-- Farmacia Glosar · Migracion 001: cierre de caja, egresos y ventas totales
--
-- La corre scripts/migrar.js dentro de UNA transaccion: si algo falla a la
-- mitad, no queda nada a medias. Por eso aqui no hay BEGIN ni COMMIT.
-- Es idempotente (IF NOT EXISTS / OR REPLACE) para poder repetirla.
--
-- Reglas de diseno:
--   * Todo el dinero en pesos enteros (BIGINT). Nunca FLOAT: el flotante
--     acumula errores de redondeo que descuadran la caja.
--   * Lo que digita Gloria se guarda crudo (base, contado, tarjeta, egresos).
--     Lo calculado (venta en efectivo, ventas, neto) se deriva en la vista,
--     asi una edicion de un egreso recalcula todo sin inconsistencias.
--
-- Adaptado a este repo:
--   * La tabla de pagos se llama `transacciones` (la crea procesar_pagos.py)
--     y solo cuentan las filas con estado = 'Aprobada'.
--   * `fecha_hora` es TIMESTAMP SIN zona y ya viene en hora de Bogota (asi la
--     trae el correo de Nequi). El dia es entonces `fecha_hora::date`.
--     OJO: `(fecha_hora AT TIME ZONE 'America/Bogota')::date` seria un error
--     aqui. Sobre un TIMESTAMP sin zona, AT TIME ZONE lo interpreta como hora
--     de Bogota y lo convierte a UTC; el ::date posterior se calcula en la
--     zona de la sesion (UTC en Neon) y todo pago despues de las 7 p. m.
--     caeria en el dia siguiente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Tabla existente de pagos. El CREATE es el mismo de procesar_pagos.py:
--    en la base real no hace nada, y en una base vacia (una rama de prueba
--    nueva) deja la migracion correr igual.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transacciones (
  id SERIAL PRIMARY KEY,
  numero_transaccion TEXT NOT NULL UNIQUE,
  monto BIGINT NOT NULL,
  estado TEXT NOT NULL,
  fecha_hora TIMESTAMP NOT NULL,
  pagador TEXT,
  banco TEXT,
  referencia TEXT,
  metodo_pago TEXT,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Un indice sobre fecha_hora sirve para las dos consultas calientes: los
-- rangos por dia (fecha_hora >= dia AND < dia + 1) y el listado de Pagos
-- ordenado del mas reciente al mas viejo.
CREATE INDEX IF NOT EXISTS idx_transacciones_fecha_hora
  ON transacciones (fecha_hora);

-- ---------------------------------------------------------------------
-- 1. Cierre de caja: una fila por dia.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cierres_caja (
  id                SERIAL PRIMARY KEY,
  fecha             DATE        NOT NULL UNIQUE,          -- dia en America/Bogota
  breb_total        BIGINT      NOT NULL DEFAULT 0 CHECK (breb_total >= 0),     -- foto de Bre-B al guardar
  breb_cantidad     INTEGER     NOT NULL DEFAULT 0 CHECK (breb_cantidad >= 0),  -- numero de pagos Bre-B al guardar
  tarjeta_total     BIGINT      NOT NULL DEFAULT 0 CHECK (tarjeta_total >= 0),
  base_inicial      BIGINT      NOT NULL DEFAULT 0 CHECK (base_inicial >= 0),
  efectivo_contado  BIGINT      NOT NULL DEFAULT 0 CHECK (efectivo_contado >= 0),
  notas             TEXT,
  version           INTEGER     NOT NULL DEFAULT 1,       -- sube en cada edicion (control de concurrencia)
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. Egresos del dia: N por cierre.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS egresos (
  id         SERIAL PRIMARY KEY,
  cierre_id  INTEGER     NOT NULL REFERENCES cierres_caja(id) ON DELETE CASCADE,
  concepto   TEXT        NOT NULL CHECK (length(btrim(concepto)) BETWEEN 1 AND 80),
  monto      BIGINT      NOT NULL CHECK (monto > 0),
  medio      TEXT        NOT NULL DEFAULT 'efectivo'
                         CHECK (medio IN ('efectivo', 'transferencia')),
  orden      SMALLINT    NOT NULL DEFAULT 0,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_egresos_cierre ON egresos (cierre_id);

-- ---------------------------------------------------------------------
-- 3. Historial de ediciones: foto completa antes y despues de cada cambio.
--    Nunca se borra.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cierres_historial (
  id          SERIAL PRIMARY KEY,
  cierre_id   INTEGER     NOT NULL REFERENCES cierres_caja(id) ON DELETE CASCADE,
  version     INTEGER     NOT NULL,          -- version que quedo despues del cambio
  antes       JSONB,                         -- NULL en el primer guardado
  despues     JSONB       NOT NULL,          -- {cierre..., egresos:[...]}
  editado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_historial_cierre ON cierres_historial (cierre_id, version);

-- ---------------------------------------------------------------------
-- 4. Configuracion clave/valor (meta diaria, avisos, tema). Reemplaza la
--    meta que antes vivia en el navegador y en la variable META_DIARIA.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion (
  clave           TEXT PRIMARY KEY,
  valor           JSONB       NOT NULL,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO configuracion (clave, valor) VALUES
  ('meta_diaria', '600000'),
  ('avisos', '{"sonido": true, "sin_pagos_2h": true, "recordar_cierre": false}'),
  ('tema', '"auto"')
ON CONFLICT (clave) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Vista de ventas por dia: une lo capturado (Bre-B en vivo) con el cierre.
--    Es la UNICA fuente para Reportes > Ventas totales y para el PDF de rango.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ventas_diarias AS
WITH breb_vivo AS (
  SELECT fecha_hora::date    AS fecha,
         SUM(monto)::BIGINT  AS breb_total,
         COUNT(*)::INT       AS breb_cantidad
  FROM transacciones
  WHERE estado = 'Aprobada'
  GROUP BY 1
),
eg AS (
  SELECT cierre_id,
         SUM(monto)                                        ::BIGINT AS egresos_total,
         SUM(monto) FILTER (WHERE medio = 'efectivo')      ::BIGINT AS egresos_efectivo,
         SUM(monto) FILTER (WHERE medio = 'transferencia') ::BIGINT AS egresos_transferencia
  FROM egresos
  GROUP BY cierre_id
),
dias AS (
  SELECT fecha FROM breb_vivo
  UNION
  SELECT fecha FROM cierres_caja
),
base AS (
  SELECT
    d.fecha,
    c.id                                   AS cierre_id,
    c.version,
    c.breb_total                           AS breb_al_cerrar,
    COALESCE(b.breb_total, 0)              AS breb_total,
    COALESCE(b.breb_cantidad, 0)           AS breb_cantidad,
    COALESCE(c.tarjeta_total, 0)           AS tarjeta_total,
    COALESCE(c.base_inicial, 0)            AS base_inicial,
    COALESCE(c.efectivo_contado, 0)        AS efectivo_contado,
    COALESCE(e.egresos_total, 0)           AS egresos_total,
    COALESCE(e.egresos_efectivo, 0)        AS egresos_efectivo,
    COALESCE(e.egresos_transferencia, 0)   AS egresos_transferencia,
    c.actualizado_en
  FROM dias d
  LEFT JOIN breb_vivo     b ON b.fecha = d.fecha
  LEFT JOIN cierres_caja  c ON c.fecha = d.fecha
  LEFT JOIN eg            e ON e.cierre_id = c.id
),
calc AS (
  SELECT
    base.*,
    -- Venta en efectivo = contado - base + egresos pagados en efectivo. El
    -- egreso en efectivo se suma porque esa plata salio de las ventas del dia.
    CASE WHEN cierre_id IS NULL THEN 0
         ELSE GREATEST(0, efectivo_contado - base_inicial + egresos_efectivo)
    END::BIGINT AS efectivo_venta
  FROM base
)
SELECT
  fecha,
  (cierre_id IS NOT NULL)                              AS cerrado,
  COALESCE(version, 0) > 1                             AS editado,
  breb_total,                                          -- en vivo
  breb_cantidad,
  breb_al_cerrar,                                      -- foto
  tarjeta_total,
  base_inicial,
  efectivo_contado,
  egresos_total,
  egresos_efectivo,
  egresos_transferencia,
  efectivo_venta,
  (breb_total + tarjeta_total + efectivo_venta)::BIGINT                 AS ventas_total,
  (breb_total + tarjeta_total + efectivo_venta - egresos_total)::BIGINT AS neto,
  actualizado_en
FROM calc;
