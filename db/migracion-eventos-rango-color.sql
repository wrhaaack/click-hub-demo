-- ============================================================
-- MIGRACIÓN · Los eventos pasan a tener rango y color
--
-- YA NO HACE FALTA CORRERLA A MANO. El arranque aplica db/schema.sql en cada
-- boot (src/lib/arranque.js), y ahí ya está todo esto. El archivo queda como
-- registro de qué cambió y por qué, y para poder aplicarlo suelto si hiciera
-- falta.
--
-- Qué cambia:
--   1. eventos.fecha pasa a llamarse eventos.desde;
--   2. se agrega eventos.hasta (NULL = dura un solo día);
--   3. se agrega eventos.color, con la misma paleta que las etapas;
--   4. el índice idx_eventos_fecha se reemplaza por idx_eventos_desde.
--
-- Por qué el renombre: un evento con rango y una columna llamada "fecha" es una
-- trampa para la próxima consulta que alguien escriba, y la tabla de al lado
-- (etapas) ya usaba desde/hasta. Los eventos que ya estaban quedan con hasta en
-- NULL, que significa exactamente lo que eran: de un solo día.
--
-- Por qué 'violeta' de default: es el color que tenían todos los eventos antes
-- de que se pudiera elegir, así que los que ya estaban cargados no cambian de
-- aspecto.
--
-- No borra ni modifica ningún dato existente.
--
-- Es segura de correr dos veces.
-- ============================================================

BEGIN;

-- 1. El renombre. Se pregunta antes para poder correrlo de nuevo sin que falle.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'eventos' AND column_name = 'fecha')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'eventos' AND column_name = 'desde')
  THEN
    ALTER TABLE eventos RENAME COLUMN fecha TO desde;
  END IF;
END $$;

-- 2 y 3. Las columnas nuevas.
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS hasta DATE;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT 'violeta'
      CHECK (color IN ('azul','rosa','ambar','verde','violeta','turquesa'));

-- Un evento que termina antes de empezar no se puede dibujar. ADD CONSTRAINT no
-- tiene IF NOT EXISTS, así que se pregunta a mano.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_hasta_ok') THEN
    ALTER TABLE eventos ADD CONSTRAINT eventos_hasta_ok CHECK (hasta IS NULL OR hasta >= desde);
  END IF;
END $$;

-- 4. El índice, que después del renombre tenía un nombre que mentía.
DROP INDEX IF EXISTS idx_eventos_fecha;
CREATE INDEX IF NOT EXISTS idx_eventos_desde ON eventos(desde);

COMMIT;

-- Para verificar que quedó bien:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'eventos' AND column_name IN ('desde','hasta','color');   -- 3 filas
--   SELECT indexname FROM pg_indexes WHERE tablename = 'eventos';                 -- idx_eventos_desde
