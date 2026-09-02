-- ============================================================
-- MIGRACIÓN · Dashboard + Google Calendar
--
-- Solo hace falta si ya tenías la base andando de antes. Si la armás de cero con
-- db/schema.sql (o con "npm run db:init"), saltéate este archivo.
--
-- Qué agrega:
--   actividad       -> el registro de lo que va pasando (alimenta el dashboard)
--   google_cuenta   -> la agenda de Google que conecta el estudio
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

CREATE TABLE IF NOT EXISTS google_cuenta (
  id             INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  email          TEXT,
  calendario_id  TEXT NOT NULL DEFAULT 'primary',
  access_token   TEXT,
  refresh_token  TEXT,
  expira_en      TIMESTAMPTZ,
  conectado_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  conectado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El dashboard queda habilitado para los roles que ya existían: es la pantalla
-- de inicio y esconderla por omisión sería una sorpresa desagradable.
-- Si preferís que alguien no lo vea, bajáselo desde Usuarios → Permisos por rol.
UPDATE roles
SET permisos = jsonb_set(permisos, '{dashboard}', '"full"')
WHERE NOT (permisos ? 'dashboard');

COMMIT;
