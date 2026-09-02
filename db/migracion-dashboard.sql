-- ============================================================
-- MIGRACIÓN · Dashboard
--
-- Solo hace falta si ya tenías la base andando de antes. Si la armás de cero con
-- db/schema.sql (o con "npm run db:init"), saltéate este archivo.
--
-- Qué agrega:
--   actividad       -> el registro de lo que va pasando (alimenta el dashboard)
--   permiso "dashboard" en los roles
--
-- Es segura de correr dos veces.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS actividad (
  id          BIGSERIAL PRIMARY KEY,
  tipo        TEXT NOT NULL,
  accion      TEXT NOT NULL CHECK (accion IN ('alta', 'edicion', 'baja')),
  entidad     TEXT,
  entidad_id  BIGINT,
  descripcion TEXT NOT NULL,
  usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  autor       TEXT NOT NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actividad_fecha ON actividad(creado_en DESC);

-- El dashboard queda habilitado para los roles que ya existían: es la pantalla
-- de inicio y esconderla por omisión sería una sorpresa desagradable.
-- Si preferís que alguien no lo vea, bajáselo desde Usuarios → Permisos por rol.
UPDATE roles
SET permisos = jsonb_set(permisos, '{dashboard}', '"full"')
WHERE NOT (permisos ? 'dashboard');

COMMIT;
