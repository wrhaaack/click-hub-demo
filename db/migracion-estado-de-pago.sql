-- ============================================================
-- MIGRACIÓN · El pago del cliente pasa de un sí/no a tres estados
--
-- YA NO HACE FALTA CORRERLA A MANO. El arranque aplica db/schema.sql en cada
-- boot (src/lib/arranque.js), y ahí ya está todo esto. El archivo queda como
-- registro de qué cambió y por qué, y para poder aplicarlo suelto si hiciera
-- falta.
--
-- Qué cambia:
--   1. se agrega clientes.estado_pago: 'pendiente' | 'parcial' | 'pagado';
--   2. se agrega clientes.abonado, cuánto pagó (solo en 'parcial');
--   3. clientes.pagado (booleano) se traduce al estado nuevo y SE BORRA.
--
-- Por qué tres estados: la realidad tiene tres casos y el booleano solo dos.
-- Un cliente que pagó la mitad no es "pagado" ni "impago".
--
-- Por qué se borra "pagado" en vez de dejarlo al lado: dos columnas diciendo lo
-- mismo terminan diciendo cosas distintas en cuanto alguien escribe en una sola.
-- El dato no se pierde: los que estaban en true quedan en 'pagado'.
--
-- "abonado" solo puede tener valor cuando el estado es 'parcial'. En los otros
-- dos el monto ya lo dice el estado (nada, o todo), y dejarlo cargado abriría la
-- puerta a que la fila se contradiga.
--
-- Es segura de correr dos veces: después de la primera, la columna vieja ya no
-- está y el bloque que la convierte no hace nada.
-- ============================================================

BEGIN;

-- 1 y 2. Las columnas nuevas.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS estado_pago TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (estado_pago IN ('pendiente','parcial','pagado'));
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS abonado NUMERIC(12,2);

-- 3. La traducción del booleano y su baja, en un solo paso.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'pagado')
  THEN
    UPDATE clientes SET estado_pago = 'pagado' WHERE pagado = true;
    ALTER TABLE clientes DROP COLUMN pagado;
  END IF;
END $$;

-- La restricción que sostiene la regla de "abonado". ADD CONSTRAINT no tiene
-- IF NOT EXISTS, así que se pregunta a mano.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_abonado_ok') THEN
    ALTER TABLE clientes ADD CONSTRAINT clientes_abonado_ok
      CHECK (estado_pago = 'parcial' OR abonado IS NULL);
  END IF;
END $$;

COMMIT;

-- Para verificar que quedó bien:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'clientes' AND column_name IN ('estado_pago','abonado','pagado');
--   -- tienen que salir 2 filas: estado_pago y abonado. "pagado" ya no existe.
--   SELECT estado_pago, count(*) FROM clientes GROUP BY 1;
