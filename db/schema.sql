-- ============================================================
-- CLICK HUB · Esquema de base de datos
-- Se ejecuta una sola vez al armar la base (Railway -> Postgres -> Query).
--
-- Convención de IDs:
--   usuarios  -> UUID (igual que en el proyecto base: es lo que viaja en la sesión)
--   el resto  -> BIGSERIAL, porque la interfaz del hub trabaja con ids numéricos
--                (clientes, tareas, equipo, mensajes...) y así no hay que
--                traducir nada entre el front y la base.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- para gen_random_uuid()

-- ---------- ROLES (Editor, Diseñadora, CM, SMM...) ----------
-- Cumplen dos funciones a la vez:
--   1. Etiquetan las tareas y las personas del equipo (el "orden" define el
--      color que les toca en el calendario).
--   2. Llevan los permisos. Cada usuario tiene un rol asignado y hereda de ahí
--      lo que puede ver y tocar, sin configurarle nada a mano.
-- Formato de permisos: {"clientes":"full|limitado|sin_acceso", "tareas":"...", ...}
--
-- Van antes que usuarios porque usuarios los referencia.
CREATE TABLE IF NOT EXISTS roles (
  id        BIGSERIAL PRIMARY KEY,
  nombre    TEXT NOT NULL UNIQUE,
  orden     INT NOT NULL DEFAULT 0,
  permisos  JSONB NOT NULL DEFAULT '{}'
);

-- ---------- USUARIOS ----------
-- No hay registro público: el primero se crea con db/seed-admin.js y desde ahí
-- se administran el resto en la pantalla de Usuarios.
CREATE TABLE IF NOT EXISTS usuarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  nombre         TEXT NOT NULL,
  rol            TEXT NOT NULL CHECK (rol IN ('admin', 'empleado')),
  activo         BOOLEAN NOT NULL DEFAULT true,
  -- De qué rol hereda los permisos. NULL = sin rol = sin acceso a nada
  -- (salvo que sea admin, que siempre tiene todo).
  rol_id         BIGINT REFERENCES roles(id) ON DELETE SET NULL,
  -- Excepciones a lo que dice el rol, solo para esta persona. Las secciones que
  -- NO estén acá se heredan del rol; las que estén, lo pisan. Un {} vacío
  -- significa "exactamente lo que dice mi rol".
  permisos       JSONB NOT NULL DEFAULT '{}',
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_login   TIMESTAMPTZ
);

-- ---------- EQUIPO (las personas a las que se les asignan tareas) ----------
-- usuario_id es opcional: podés tener a alguien en el equipo que todavía no
-- tenga login. Si lo tiene, se le pueden mandar notificaciones.
CREATE TABLE IF NOT EXISTS equipo (
  id          BIGSERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  rol         TEXT,
  usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- CLIENTES ----------
-- links guarda [{"label":"Drive","url":"https://..."}] tal cual lo edita la ficha.
CREATE TABLE IF NOT EXISTS clientes (
  id          BIGSERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  ig          TEXT,
  contacto    TEXT,
  tel         TEXT,
  links       JSONB NOT NULL DEFAULT '[]',
  notas       TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  creado_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- TAREAS ----------
-- fecha = fecha de publicación (es la que agrupa el mes que se está viendo).
-- fecha_limite = deadline interno del equipo.
CREATE TABLE IF NOT EXISTS tareas (
  id             BIGSERIAL PRIMARY KEY,
  cliente_id     BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  descripcion    TEXT NOT NULL,
  rol            TEXT,
  formato        TEXT,
  fecha          DATE,
  fecha_limite   DATE,
  notas          TEXT,
  estado         TEXT NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente','en progreso','revisión','listo','cumplido')),
  pagado         BOOLEAN NOT NULL DEFAULT false,
  creado_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una tarea puede estar asignada a varias personas del equipo.
CREATE TABLE IF NOT EXISTS tarea_asignados (
  tarea_id   BIGINT NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  miembro_id BIGINT NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
  PRIMARY KEY (tarea_id, miembro_id)
);

-- ---------- BRAINSTORM (ideas + links de inspiración, por mes) ----------
-- cliente_id NULL = el bloque de "ideas generales del mes".
-- periodo es siempre el día 1 del mes al que pertenecen.
CREATE TABLE IF NOT EXISTS brainstorm (
  id             BIGSERIAL PRIMARY KEY,
  cliente_id     BIGINT REFERENCES clientes(id) ON DELETE CASCADE,
  periodo        DATE NOT NULL,
  ideas          JSONB NOT NULL DEFAULT '[]',
  inspo          JSONB NOT NULL DEFAULT '[]',
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Dos índices en vez de un UNIQUE compuesto: en Postgres dos filas con
-- cliente_id NULL no chocan entre sí, así que el bloque general necesita el suyo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_brainstorm_cliente
  ON brainstorm(cliente_id, periodo) WHERE cliente_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_brainstorm_general
  ON brainstorm(periodo) WHERE cliente_id IS NULL;

-- ---------- FECHAS ESPECIALES (por cliente y mes) ----------
CREATE TABLE IF NOT EXISTS fechas_especiales (
  id          BIGSERIAL PRIMARY KEY,
  cliente_id  BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  periodo     DATE NOT NULL,  -- día 1 del mes en el que se muestra
  fecha       DATE,
  label       TEXT,
  orden       INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fechas_cliente ON fechas_especiales(cliente_id, periodo);



-- ---------- ACTIVIDAD (el registro de todo lo que pasa) ----------
-- Es lo que alimenta "Últimas actividades" del dashboard. Va aparte de
-- notificaciones porque son cosas distintas: una notificación es una copia por
-- persona que se marca leída y se puede ocultar; esto es el registro del hecho,
-- uno solo, que no se toca.
CREATE TABLE IF NOT EXISTS actividad (
  id          BIGSERIAL PRIMARY KEY,
  tipo        TEXT NOT NULL,   -- cliente_nuevo | tarea_editada | usuario_nuevo | evento_borrado...
  accion      TEXT NOT NULL CHECK (accion IN ('alta', 'edicion', 'baja')),
  entidad     TEXT,            -- cliente | tarea | usuario | evento
  entidad_id  BIGINT,          -- NULL para usuarios, que usan UUID
  descripcion TEXT NOT NULL,   -- el texto tal como se muestra
  usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  autor       TEXT NOT NULL,   -- copia del nombre, para que sobreviva al usuario
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actividad_fecha ON actividad(creado_en DESC);

-- ---------- CONFIGURACION (clave/valor: los datos del estudio) ----------
CREATE TABLE IF NOT EXISTS configuracion (
  clave           TEXT PRIMARY KEY,
  valor           JSONB,
  actualizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- NOTIFICACIONES ----------
-- 'oculta' es el borrado blando: la fila se queda pero no se muestra más.
-- Hace falta porque revisarTareasVencidas() (src/lib/alertas.js) le pregunta a
-- esta misma tabla si ya avisó de una tarea; borrar la fila de verdad hace que
-- el aviso vuelva a generarse. Ocultarla lo silencia sin perder ese rastro.
CREATE TABLE IF NOT EXISTS notificaciones (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL, -- cliente_nuevo | tarea_asignada | tarea_vencida | cliente_sin_planificar
  mensaje     TEXT NOT NULL,
  link        TEXT,
  leida       BOOLEAN NOT NULL DEFAULT false,
  oculta      BOOLEAN NOT NULL DEFAULT false,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id, leida, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_tareas_cliente_fecha ON tareas(cliente_id, fecha);
CREATE INDEX IF NOT EXISTS idx_tareas_fecha ON tareas(fecha);
CREATE INDEX IF NOT EXISTS idx_tarea_asignados_miembro ON tarea_asignados(miembro_id);

-- Un mismo usuario no puede figurar dos veces en el equipo. Es un índice PARCIAL
-- (solo sobre los activos) porque las bajas conservan la fila para el historial:
-- si mirara todas, no se podría volver a sumar a alguien que ya salió una vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipo_usuario_activo
  ON equipo(usuario_id) WHERE activo = true AND usuario_id IS NOT NULL;

-- ---------- DATOS INICIALES ----------
-- Los 4 roles con los que arranca el hub, con un permiso de arranque pensado
-- para gente de producción: ve todo lo que necesita para trabajar, mueve el
-- estado de sus tareas, aporta ideas y escribe en el chat, pero no crea ni
-- borra clientes ni tareas. El admin los ajusta desde la pantalla de Usuarios.
INSERT INTO roles (nombre, orden, permisos) VALUES
  ('Editor',     0, '{"dashboard":"full","clientes":"limitado","tareas":"limitado","calendario":"full","brainstorm":"full","delegacion":"full","equipo":"sin_acceso","estudio":"limitado","usuarios":"sin_acceso"}'),
  ('Diseñadora', 1, '{"dashboard":"full","clientes":"limitado","tareas":"limitado","calendario":"full","brainstorm":"full","delegacion":"full","equipo":"sin_acceso","estudio":"limitado","usuarios":"sin_acceso"}'),
  ('CM',         2, '{"dashboard":"full","clientes":"limitado","tareas":"limitado","calendario":"full","brainstorm":"full","delegacion":"full","equipo":"sin_acceso","estudio":"limitado","usuarios":"sin_acceso"}'),
  ('SMM',        3, '{"dashboard":"full","clientes":"limitado","tareas":"limitado","calendario":"full","brainstorm":"full","delegacion":"full","equipo":"sin_acceso","estudio":"limitado","usuarios":"sin_acceso"}')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO configuracion (clave, valor) VALUES
  ('estudio', '{"nombre":"Click","ig":"@click","email":"","tel":"","wa":"","links":[],"notas":""}')
ON CONFLICT (clave) DO NOTHING;

-- La tabla de sesiones (express-session + connect-pg-simple) se crea sola en el
-- primer arranque del server (createTableIfMissing: true).
