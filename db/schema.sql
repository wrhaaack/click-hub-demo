-- ============================================================
-- CLICK HUB · Esquema de base de datos
-- Lo corre src/lib/arranque.js en CADA arranque del servidor, no una sola vez.
-- Por eso todo acá adentro tiene que poder repetirse sin efecto: CREATE ... IF
-- NOT EXISTS, ADD COLUMN IF NOT EXISTS y ON CONFLICT DO NOTHING de punta a punta.
--
-- Convención de IDs:
--   usuarios  -> UUID (igual que en el proyecto base: es lo que viaja en la sesión)
--   el resto  -> BIGSERIAL, porque la interfaz del hub trabaja con ids numéricos
--                (clientes, tareas, equipo, eventos...) y así no hay que
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
  -- Cobro del cliente. a_pagar es NUMERIC y no float: con dinero, 0.1 + 0.2 no
  -- puede dar 0.30000000000000004. NULL = todavía no se acordó un monto, que es
  -- distinto de 0 (acordado y sin cargo).
  a_pagar     NUMERIC(12,2),
  pagado      BOOLEAN NOT NULL DEFAULT false,
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

-- ---------- FECHAS ESPECIALES (por cliente y mes) ----------
CREATE TABLE IF NOT EXISTS fechas_especiales (
  id          BIGSERIAL PRIMARY KEY,
  cliente_id  BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  periodo     DATE NOT NULL,  -- día 1 del mes en el que se muestra
  fecha       DATE,
  label       TEXT,
  orden       INT NOT NULL DEFAULT 0
);


-- ---------- ACTIVIDAD (el registro de todo lo que pasa) ----------
-- Es lo que alimenta "Últimas actividades" del dashboard. Va aparte de
-- notificaciones porque son cosas distintas: una notificación es una copia por
-- persona que se marca leída y se puede ocultar; esto es el registro del hecho,
-- uno solo, que no se toca.
CREATE TABLE IF NOT EXISTS actividad (
  id          BIGSERIAL PRIMARY KEY,
  tipo        TEXT NOT NULL,   -- cliente_nuevo | tarea_editada | usuario_nuevo | evento_borrado...
  accion      TEXT NOT NULL CHECK (accion IN ('alta', 'edicion', 'baja')),
  entidad     TEXT,            -- cliente | tarea | usuario | evento | etapa
  entidad_id  BIGINT,          -- NULL para usuarios, que usan UUID
  descripcion TEXT NOT NULL,   -- el texto tal como se muestra
  usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  autor       TEXT NOT NULL,   -- copia del nombre, para que sobreviva al usuario
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- EVENTOS DEL CALENDARIO ----------
-- Cosas que pasan en una fecha y no son tareas de un cliente: una reunión, una
-- grabación, un feriado del estudio. Van en el calendario junto a las tareas
-- pero con su propio color.
--
-- La hora es opcional: sin hora_inicio el evento es "todo el día".
-- El autor se copia como texto además del usuario_id para que el evento siga
-- diciendo quién lo creó aunque después se dé de baja a esa persona.
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

-- ---------- ETAPAS (la planificación que se le muestra al cliente) ----------
-- El calendario del equipo y el del cliente son dos cosas distintas a propósito.
-- El del equipo tiene tareas y eventos, con nombres internos. Este tiene tramos
-- que duran varios días ("Diseño", "Grabación", "Revisión") escritos para que
-- los lea el cliente, y es lo que se exporta como imagen para mostrárselo.
--
-- Por eso no salen de las tareas: lo que el equipo escribe para trabajar no es
-- lo que se le muestra a un cliente.
CREATE TABLE IF NOT EXISTS etapas (
  id          BIGSERIAL PRIMARY KEY,
  cliente_id  BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL,
  desde       DATE NOT NULL,
  hasta       DATE NOT NULL,
  -- Una clave de la paleta y no un color libre: así el que arma la planificación
  -- no puede elegir un color ilegible, y la exportación puede dibujar los mismos
  -- colores que la pantalla sin que viaje ningún hex.
  color       TEXT NOT NULL DEFAULT 'azul'
              CHECK (color IN ('azul','rosa','ambar','verde','violeta','turquesa')),
  nota        TEXT,
  creado_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una etapa que termina antes de empezar no se puede dibujar. Se corta acá y
  -- no solo en el navegador: la base es la que tiene que quedar consistente.
  CHECK (hasta >= desde)
);

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


-- ---------- PUESTA AL DÍA DE TABLAS QUE YA EXISTEN ----------
-- Todo lo de arriba es CREATE TABLE IF NOT EXISTS, y eso tiene un límite que
-- costó caro: sobre una tabla que YA existe no hace absolutamente nada. En una
-- base nueva el esquema queda completo, pero en una que ya estaba andando las
-- columnas nuevas nunca aparecen, y la app se cae con "column X does not exist".
--
-- Por eso este bloque repite cada columna como ALTER ... ADD COLUMN IF NOT
-- EXISTS. Sobre una base al día no hace nada; sobre una vieja, la completa. Es
-- lo que le permite a src/lib/arranque.js dejar la base usable en cada
-- despliegue sin que nadie corra nada a mano.
--
-- REGLA: si agregás una columna a una tabla de acá arriba, agregala también
-- acá abajo. La prueba probar-esquema.js falla si te la olvidás.
--
-- Solo van las columnas que se pueden agregar a una tabla con datos: o admiten
-- NULL, o son NOT NULL con DEFAULT. Una NOT NULL sin default no se puede sumar
-- después (no hay qué poner en las filas que ya están), así que esas viven
-- únicamente en el CREATE TABLE.

ALTER TABLE roles ADD COLUMN IF NOT EXISTS orden    INT   NOT NULL DEFAULT 0;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS permisos JSONB NOT NULL DEFAULT '{}';

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo       BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_id       BIGINT REFERENCES roles(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permisos     JSONB NOT NULL DEFAULT '{}';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS creado_en    TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMPTZ;

ALTER TABLE equipo ADD COLUMN IF NOT EXISTS rol        TEXT;
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS activo     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS creado_en  TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ig         TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto   TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tel        TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS links      JSONB NOT NULL DEFAULT '[]';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS notas      TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS a_pagar    NUMERIC(12,2);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pagado     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS activo     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS creado_en  TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE tareas ADD COLUMN IF NOT EXISTS rol            TEXT;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS formato        TEXT;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS fecha          DATE;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS fecha_limite   DATE;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS notas          TEXT;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS estado         TEXT NOT NULL DEFAULT 'pendiente'
       CHECK (estado IN ('pendiente','en progreso','revisión','listo','cumplido'));
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS pagado         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS creado_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS creado_en      TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE brainstorm ADD COLUMN IF NOT EXISTS cliente_id     BIGINT REFERENCES clientes(id) ON DELETE CASCADE;
ALTER TABLE brainstorm ADD COLUMN IF NOT EXISTS ideas          JSONB NOT NULL DEFAULT '[]';
ALTER TABLE brainstorm ADD COLUMN IF NOT EXISTS inspo          JSONB NOT NULL DEFAULT '[]';
ALTER TABLE brainstorm ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE fechas_especiales ADD COLUMN IF NOT EXISTS fecha DATE;
ALTER TABLE fechas_especiales ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE fechas_especiales ADD COLUMN IF NOT EXISTS orden INT NOT NULL DEFAULT 0;

ALTER TABLE actividad ADD COLUMN IF NOT EXISTS entidad    TEXT;
ALTER TABLE actividad ADD COLUMN IF NOT EXISTS entidad_id BIGINT;
ALTER TABLE actividad ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE actividad ADD COLUMN IF NOT EXISTS creado_en  TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE eventos ADD COLUMN IF NOT EXISTS hora_inicio TIME;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS hora_fin    TIME;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS descripcion TEXT;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS creado_en   TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE etapas ADD COLUMN IF NOT EXISTS color      TEXT NOT NULL DEFAULT 'azul'
       CHECK (color IN ('azul','rosa','ambar','verde','violeta','turquesa'));
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS nota       TEXT;
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS creado_en  TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS valor           JSONB;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS actualizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS link      TEXT;
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS leida     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS oculta    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------- ÍNDICES ----------
-- Van todos juntos y después de la puesta al día a propósito: un índice sobre
-- una columna que la base vieja todavía no tiene falla, así que primero se
-- completan las columnas y recién ahí se indexan.

-- Dos índices en vez de un UNIQUE compuesto: en Postgres dos filas con
-- cliente_id NULL no chocan entre sí, así que el bloque general necesita el suyo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_brainstorm_cliente
  ON brainstorm(cliente_id, periodo) WHERE cliente_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_brainstorm_general
  ON brainstorm(periodo) WHERE cliente_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_fechas_cliente ON fechas_especiales(cliente_id, periodo);

CREATE INDEX IF NOT EXISTS idx_actividad_fecha ON actividad(creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos(fecha);

-- Se consulta siempre por cliente y ordenado por fecha de inicio: es como se
-- dibuja la tira de la planificación.
CREATE INDEX IF NOT EXISTS idx_etapas_cliente ON etapas(cliente_id, desde);

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
