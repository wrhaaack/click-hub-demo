-- ============================================================
-- CLICK HUB · Esquema de base de datos
-- Lo corre src/lib/arranque.js en CADA arranque del servidor, así que todo
-- tiene que poder repetirse sin efecto: CREATE ... IF NOT EXISTS y
-- ON CONFLICT DO NOTHING de punta a punta.
--
-- Ojo: CREATE TABLE IF NOT EXISTS no toca una tabla que ya existe. Si cambiás
-- una columna, en una base que ya tiene datos hay que agregar el ALTER a mano.
--
-- Convención de IDs:
--   usuarios  -> UUID (es lo que viaja en la sesión)
--   el resto  -> BIGSERIAL (src/db.js los convierte a número para la pantalla)
--
-- La plata va siempre en NUMERIC y no en float: con dinero, 0.1 + 0.2 no puede
-- dar 0.30000000000000004.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------- ROLES (Editor, Diseñadora, CM, SMM...) ----------
-- Etiquetan tareas y personas, y llevan los permisos: cada usuario hereda los
-- de su rol. Formato: {"clientes":"full|limitado|sin_acceso", ...}
CREATE TABLE IF NOT EXISTS roles (
  id        BIGSERIAL PRIMARY KEY,
  nombre    TEXT NOT NULL UNIQUE,
  orden     INT NOT NULL DEFAULT 0,
  permisos  JSONB NOT NULL DEFAULT '{}'
);

-- ---------- USUARIOS ----------
-- No hay registro público: el primero lo crea el arranque con ADMIN_EMAIL y
-- ADMIN_PASSWORD, y el resto se da de alta en la pantalla Usuarios.
CREATE TABLE IF NOT EXISTS usuarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  nombre         TEXT NOT NULL,
  rol            TEXT NOT NULL CHECK (rol IN ('admin', 'empleado')),
  activo         BOOLEAN NOT NULL DEFAULT true,
  -- De qué rol hereda los permisos. NULL = sin acceso a nada (salvo admin).
  rol_id         BIGINT REFERENCES roles(id) ON DELETE SET NULL,
  -- Excepciones a lo que dice el rol, solo para esta persona.
  permisos       JSONB NOT NULL DEFAULT '{}',
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_login   TIMESTAMPTZ
);

-- ---------- EQUIPO (a quiénes se les asignan tareas) ----------
-- Solo entra gente con usuario. El nombre es una copia del del usuario (se
-- actualiza al renombrarlo) para que las tareas lo lean sin otro JOIN. La baja
-- es lógica y libera el usuario_id, así las tareas viejas siguen mostrando el
-- nombre y la persona se puede volver a sumar.
CREATE TABLE IF NOT EXISTS equipo (
  id          BIGSERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  rol         TEXT,
  usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (activo = false OR usuario_id IS NOT NULL)
);

-- ---------- CLIENTES (y prospectos) ----------
-- Un prospecto es un presupuesto que todavía no arrancó. Vive en la misma
-- tabla para que pasarlo a cliente sea cambiar "tipo" y no copiar datos.
CREATE TABLE IF NOT EXISTS clientes (
  id                    BIGSERIAL PRIMARY KEY,
  nombre                TEXT NOT NULL,
  tipo                  TEXT NOT NULL DEFAULT 'cliente' CHECK (tipo IN ('cliente','prospecto')),
  ig                    TEXT,
  contacto              TEXT,
  tel                   TEXT,
  links                 JSONB NOT NULL DEFAULT '[]',   -- [{"label":"Drive","url":"https://..."}]
  notas                 TEXT,
  -- Abono mensual. NULL = todavía no se acordó, que no es lo mismo que 0.
  a_pagar               NUMERIC(12,2),
  estado_pago           TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente','parcial','pagado')),
  -- Cuánto abonó: solo tiene sentido en 'parcial' (en los otros dos lo dice el estado).
  abonado               NUMERIC(12,2),
  proxima_actualizacion DATE,                          -- cuándo toca el próximo aumento
  puntajes              JSONB NOT NULL DEFAULT '{}',   -- los del cotizador: {"estrategia":3,...}
  activo                BOOLEAN NOT NULL DEFAULT true,
  creado_por            UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (estado_pago = 'parcial' OR abonado IS NULL)
);

-- ---------- TAREAS ----------
-- fecha = publicación (agrupa el mes), fecha_limite = deadline interno.
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
  -- Lo que se le paga a quien la hace: nivel de la pieza (N1/N2/N3) y monto.
  -- El monto se guarda y no se calcula: si sube la tarifa, lo ya hecho sigue
  -- valiendo lo que valía.
  nivel          TEXT CHECK (nivel IN ('N1','N2','N3')),
  monto          NUMERIC(12,2),
  pagado         BOOLEAN NOT NULL DEFAULT false,
  creado_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tarea_asignados (
  tarea_id   BIGINT NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  miembro_id BIGINT NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
  PRIMARY KEY (tarea_id, miembro_id)
);

-- ---------- PAUTA PUBLICITARIA (una fila por cliente y mes) ----------
-- El "Mes N" del cliente no se guarda: sale de contar sus filas.
CREATE TABLE IF NOT EXISTS pautas (
  id            BIGSERIAL PRIMARY KEY,
  cliente_id    BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  periodo       DATE NOT NULL,   -- día 1 del mes
  pauta         NUMERIC(12,2) NOT NULL DEFAULT 0,   -- inversión en anuncios
  capacitacion  NUMERIC(12,2) NOT NULL DEFAULT 0,
  fee_click     NUMERIC(12,2) NOT NULL DEFAULT 0,   -- lo que cobra Click por gestionarla
  nota          TEXT,
  pagado        BOOLEAN NOT NULL DEFAULT false,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, periodo)
);

-- ---------- BRAINSTORM (ideas + links de inspiración, por mes) ----------
-- cliente_id NULL = las ideas generales del mes. periodo = día 1 del mes.
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

-- ---------- EVENTOS DEL CALENDARIO ----------
-- Lo que pasa y no es tarea de un cliente: reuniones, grabaciones, feriados.
-- hasta NULL = un solo día; hora_inicio NULL = todo el día. El color es una
-- clave de la paleta (web/src/lib/colores.js) y no un hex libre.
CREATE TABLE IF NOT EXISTS eventos (
  id           BIGSERIAL PRIMARY KEY,
  titulo       TEXT NOT NULL,
  desde        DATE NOT NULL,
  hasta        DATE,
  hora_inicio  TIME,
  hora_fin     TIME,
  descripcion  TEXT,
  color        TEXT NOT NULL DEFAULT 'violeta'
               CHECK (color IN ('azul','rosa','ambar','verde','violeta','turquesa')),
  usuario_id   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  autor        TEXT NOT NULL,   -- copia del nombre, para que sobreviva al usuario
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (hasta IS NULL OR hasta >= desde)
);

-- ---------- ETAPAS (la planificación que se le muestra al cliente) ----------
-- Tramos de varios días escritos para el cliente ("Diseño", "Grabación"), que
-- se exportan como imagen. No salen de las tareas a propósito: lo que el
-- equipo escribe para trabajar no es lo que se le muestra a un cliente.
CREATE TABLE IF NOT EXISTS etapas (
  id          BIGSERIAL PRIMARY KEY,
  cliente_id  BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL,
  desde       DATE NOT NULL,
  hasta       DATE NOT NULL,
  color       TEXT NOT NULL DEFAULT 'azul'
              CHECK (color IN ('azul','rosa','ambar','verde','violeta','turquesa')),
  nota        TEXT,
  creado_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (hasta >= desde)
);

-- ---------- ACTIVIDAD (el registro de lo que pasa, para el dashboard) ----------
-- Una fila por hecho, que no se toca. Las notificaciones son otra cosa: una
-- copia por persona que se marca leída.
CREATE TABLE IF NOT EXISTS actividad (
  id          BIGSERIAL PRIMARY KEY,
  tipo        TEXT NOT NULL,   -- cliente_nuevo | tarea_editada | evento_borrado...
  accion      TEXT NOT NULL CHECK (accion IN ('alta', 'edicion', 'baja')),
  entidad     TEXT,            -- cliente | tarea | usuario | evento | etapa
  entidad_id  BIGINT,
  descripcion TEXT NOT NULL,
  usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  autor       TEXT NOT NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- NOTIFICACIONES ----------
-- 'oculta' es el borrado blando: las alertas automáticas (src/lib/alertas.js)
-- miran esta tabla para no avisar dos veces lo mismo, así que borrar la fila de
-- verdad haría que el aviso vuelva.
CREATE TABLE IF NOT EXISTS notificaciones (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  mensaje     TEXT NOT NULL,
  link        TEXT,            -- la pantalla a la que lleva: '/app/tareas'...
  leida       BOOLEAN NOT NULL DEFAULT false,
  oculta      BOOLEAN NOT NULL DEFAULT false,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- CONFIGURACION (clave/valor) ----------
CREATE TABLE IF NOT EXISTS configuracion (
  clave           TEXT PRIMARY KEY,
  valor           JSONB,
  actualizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- ÍNDICES ----------
-- Dos índices en vez de un UNIQUE compuesto: en Postgres dos filas con
-- cliente_id NULL no chocan entre sí, así que el bloque general necesita el suyo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_brainstorm_cliente ON brainstorm(cliente_id, periodo) WHERE cliente_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_brainstorm_general ON brainstorm(periodo) WHERE cliente_id IS NULL;
-- Un usuario no puede estar dos veces en el equipo. Parcial (solo activos)
-- porque las bajas conservan la fila.
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipo_usuario_activo ON equipo(usuario_id) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_tareas_cliente_fecha ON tareas(cliente_id, fecha);
CREATE INDEX IF NOT EXISTS idx_tareas_fecha ON tareas(fecha);
CREATE INDEX IF NOT EXISTS idx_tarea_asignados_miembro ON tarea_asignados(miembro_id);
CREATE INDEX IF NOT EXISTS idx_fechas_cliente ON fechas_especiales(cliente_id, periodo);
CREATE INDEX IF NOT EXISTS idx_eventos_desde ON eventos(desde);
CREATE INDEX IF NOT EXISTS idx_etapas_cliente ON etapas(cliente_id, desde);
CREATE INDEX IF NOT EXISTS idx_actividad_fecha ON actividad(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id, leida, creado_en DESC);

-- ---------- DATOS INICIALES ----------
-- Los 4 roles de arranque, pensados para gente de producción: ven lo que
-- necesitan, mueven el estado de sus tareas y aportan ideas, pero no crean ni
-- borran clientes ni tareas. El admin los ajusta en Usuarios → Permisos por rol.
INSERT INTO roles (nombre, orden, permisos) VALUES
  ('Editor',     0, '{"dashboard":"full","clientes":"limitado","tareas":"limitado","calendario":"full","brainstorm":"full","delegacion":"full","estudio":"limitado"}'),
  ('Diseñadora', 1, '{"dashboard":"full","clientes":"limitado","tareas":"limitado","calendario":"full","brainstorm":"full","delegacion":"full","estudio":"limitado"}'),
  ('CM',         2, '{"dashboard":"full","clientes":"limitado","tareas":"limitado","calendario":"full","brainstorm":"full","delegacion":"full","estudio":"limitado"}'),
  ('SMM',        3, '{"dashboard":"full","clientes":"limitado","tareas":"limitado","calendario":"full","brainstorm":"full","delegacion":"full","estudio":"limitado"}')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO configuracion (clave, valor) VALUES
  ('estudio', '{"nombre":"Click","ig":"@click","email":"","tel":"","wa":"","links":[],"notas":""}'),
  -- Tarifas y parámetros que vivían sueltos en las planillas:
  --   diseno / video  -> lo que se paga por pieza, según nivel
  --   puntoCotizador  -> cuánto vale cada punto del "Total Nivel"
  --   topeEdicion     -> lo de edición no puede superar esta parte del abono
  ('tarifas', '{"diseno":{"N1":10000,"N2":15000,"N3":20000},"video":{"N1":27700,"N2":41500,"N3":60000},"puntoCotizador":30000,"topeEdicion":0.3}')
ON CONFLICT (clave) DO NOTHING;

-- La tabla de sesiones la crea connect-pg-simple en el primer arranque.
