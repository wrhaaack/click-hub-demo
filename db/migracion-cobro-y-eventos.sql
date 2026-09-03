-- ============================================================
-- MIGRACIÓN · Cobro por cliente + eventos del calendario
--
-- Solo hace falta si ya tenías la base andando de antes. Si la armás de cero con
-- db/schema.sql (o si la app arranca contra una base vacía, que lo aplica sola),
-- saltéate este archivo.
--
-- Qué agrega:
--   1. clientes.a_pagar y clientes.pagado — cuánto cobra el estudio por ese
--      cliente y si ya cobró;
--   2. la tabla eventos — reuniones, grabaciones y feriados que van en el
--      calendario pero no son tareas de nadie;
--   3. devuelve el nivel "limitado" al permiso de Calendario.
--
-- Sobre el punto 3: cuando se sacó Google Calendar, Calendario quedó con dos
-- niveles porque no había nada que "editar" adentro. Ahora sí lo hay, así que
-- vuelve a distinguir entre ver la grilla (limitado) y manejar los eventos
-- (full). A los roles que hoy tienen "full" NO se los toca: seguían pudiendo
-- ver, y ahora además pueden cargar eventos, que es lo razonable para un rol
-- que ya tenía el máximo.
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
