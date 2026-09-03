-- ============================================================
-- MIGRACIÓN · Cobro por cliente + eventos del calendario
--
-- YA NO HACE FALTA CORRERLA A MANO. Desde que el arranque aplica db/schema.sql
-- en cada boot (src/lib/arranque.js) y schema.sql trae el bloque PUESTA AL DÍA,
-- estas columnas se agregan solas al desplegar. El archivo queda como registro
-- de qué cambió y por qué, y para poder aplicarlo suelto si hiciera falta.
--
-- Esa era justamente la falla: se agregaron las columnas al CREATE TABLE, el
-- despliegue salió sin errores, y la app se cayó con "column a_pagar does not
-- exist" porque CREATE TABLE IF NOT EXISTS no toca una tabla que ya existe.
--
-- Qué agrega:
--   1. clientes.a_pagar y clientes.pagado — cuánto cobra el estudio por ese
--      cliente y si ya cobró;
--   2. la tabla eventos — reuniones, grabaciones y feriados que van en el
--      calendario pero no son tareas de nadie.
--
-- El nivel "limitado" de Calendario, que volvió junto con los eventos, no se
-- toca desde acá: los niveles viven en src/middleware/auth.js, no en la base.
--
-- No borra ni modifica ningún dato existente.
--
-- Es segura de correr dos veces.
-- ============================================================

BEGIN;

-- 1. El cobro del cliente.
-- NUMERIC y no float: con dinero, 0.1 + 0.2 no puede dar 0.30000000000000004.
-- Se deja NULL a propósito para los clientes que ya estaban: NULL es "todavía no
-- se acordó un monto", que no es lo mismo que acordar 0.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS a_pagar NUMERIC(12,2);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pagado  BOOLEAN NOT NULL DEFAULT false;

-- 2. Los eventos del calendario.
CREATE TABLE IF NOT EXISTS eventos (
  id           BIGSERIAL PRIMARY KEY,
  titulo       TEXT NOT NULL,
  fecha        DATE NOT NULL,
  hora_inicio  TIME,
  hora_fin     TIME,
  descripcion  TEXT,
  usuario_id   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  autor        TEXT NOT NULL,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos(fecha);

COMMIT;

-- Para verificar que quedó bien:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'clientes' AND column_name IN ('a_pagar','pagado');   -- 2 filas
--   SELECT to_regclass('public.eventos');                                    -- eventos
