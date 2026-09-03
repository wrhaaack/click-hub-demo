-- ============================================================
-- MIGRACIÓN · Planificación del cliente (etapas)
--
-- YA NO HACE FALTA CORRERLA A MANO. El arranque aplica db/schema.sql en cada
-- boot (src/lib/arranque.js), y ahí ya está todo esto. El archivo queda como
-- registro de qué cambió y por qué, y para poder aplicarlo suelto si hiciera
-- falta.
--
-- Qué agrega: la tabla etapas, que es el segundo calendario de la sección
-- Calendario — el que se le muestra al cliente.
--
-- Por qué una tabla nueva y no las tareas: son dos cosas distintas. Las tareas
-- son de un día y están escritas para trabajar ("Reel de septiembre", "revisar
-- copy"). Las etapas duran varios días, se llaman como el cliente las entiende
-- ("Diseño", "Grabación", "Revisión") y son lo que se exporta como imagen para
-- mostrárselo. Derivarlas de las tareas habría significado mostrarle al cliente
-- la lista interna del equipo tal como está escrita.
--
-- No borra ni modifica ningún dato existente.
--
-- Es segura de correr dos veces.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS etapas (
  id          BIGSERIAL PRIMARY KEY,
  cliente_id  BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL,
  desde       DATE NOT NULL,
  hasta       DATE NOT NULL,
  -- Una clave de la paleta y no un color libre: así el que arma la
  -- planificación no puede elegir un color ilegible, y la exportación dibuja
  -- los mismos colores que la pantalla sin que viaje ningún hex.
  color       TEXT NOT NULL DEFAULT 'azul'
              CHECK (color IN ('azul','rosa','ambar','verde','violeta','turquesa')),
  nota        TEXT,
  creado_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una etapa que termina antes de empezar no se puede dibujar.
  CHECK (hasta >= desde)
);

-- Se consulta siempre por cliente y ordenado por fecha de inicio.
CREATE INDEX IF NOT EXISTS idx_etapas_cliente ON etapas(cliente_id, desde);

COMMIT;

-- Para verificar que quedó bien:
--   SELECT to_regclass('public.etapas');   -- etapas
