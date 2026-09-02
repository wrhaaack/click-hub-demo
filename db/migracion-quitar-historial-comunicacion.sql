-- ============================================================
-- MIGRACIÓN · Se eliminan las secciones Historial y Comunicación
--
-- Solo hace falta si ya tenías la base andando de antes. Si la armás de cero con
-- db/schema.sql (o con "npm run db:init"), saltéate este archivo: el schema ya
-- no las incluye.
--
-- Qué hace:
--   1. borra las tablas de Comunicación (mensajes y notas por cliente);
--   2. limpia los permisos "historial" y "comunicacion" que hayan quedado
--      guardados en los roles y en las excepciones de cada usuario.
--
-- Historial no tenía tabla propia: era una vista sobre las tareas cumplidas,
-- así que no hay nada que borrar de datos. Solo se le saca el permiso.
--
-- OJO, ESTO SÍ BORRA DATOS: se pierden el chat general y todas las notas por
-- cliente. No hay vuelta atrás. Si querés conservarlos, exportalos antes:
--   \copy (SELECT autor, texto, creado_en FROM mensajes ORDER BY creado_en) TO 'chat.csv' CSV HEADER
--   \copy (SELECT cliente_id, periodo, autor, texto, creado_en FROM notas ORDER BY creado_en) TO 'notas.csv' CSV HEADER
--
-- NO se tocan las columnas "notas" de clientes y de tareas, ni las notas
-- internas del estudio: son otra cosa y siguen en uso.
--
-- Es segura de correr dos veces.
-- ============================================================

BEGIN;

-- 1. Las tablas de Comunicación. Los índices se van con ellas.
DROP TABLE IF EXISTS notas;
DROP TABLE IF EXISTS mensajes;

-- 2. Los permisos que quedaron guardados.
UPDATE roles
   SET permisos = ((permisos::jsonb - 'historial') - 'comunicacion')::json
 WHERE permisos::jsonb ?| array['historial', 'comunicacion'];

UPDATE usuarios
   SET permisos = ((permisos::jsonb - 'historial') - 'comunicacion')::json
 WHERE permisos::jsonb ?| array['historial', 'comunicacion'];

COMMIT;

-- Para verificar que quedó limpio (las tres tienen que devolver 0):
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name IN ('mensajes', 'notas');
--   SELECT count(*) FROM roles    WHERE permisos::jsonb ?| array['historial','comunicacion'];
--   SELECT count(*) FROM usuarios WHERE permisos::jsonb ?| array['historial','comunicacion'];
