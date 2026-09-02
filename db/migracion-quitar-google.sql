-- ============================================================
-- MIGRACIÓN · Se elimina la integración con Google Calendar
--
-- Solo hace falta si ya tenías la base andando de antes. Si la armás de cero con
-- db/schema.sql (o con "npm run db:init"), saltéate este archivo.
--
-- Qué hace:
--   1. borra la tabla google_cuenta (la agenda conectada y sus tokens);
--   2. pasa el permiso de Calendario de "limitado" a "full".
--
-- El CALENDARIO NO SE VA: sigue la grilla del mes con las tareas y las fechas
-- especiales. Lo que se elimina es la capa de eventos de Google que se dibujaba
-- encima.
--
-- Sobre el punto 2: Calendario tenía tres niveles porque "limitado" era ver la
-- grilla y "full" era además crear, editar y borrar eventos de Google. Sin
-- Google esa distinción no gobierna nada, así que la sección queda en dos
-- niveles (ve la grilla o no la ve). A quien tenía "limitado" se le pone "full"
-- para que conserve exactamente el acceso que tenía: ver el calendario.
--
-- Lo que se puede TOCAR dentro del calendario no lo decide este permiso: las
-- tareas las gobierna el permiso de Tareas y las fechas especiales el de
-- Clientes. Así que subir a "full" no le da a nadie nada que no tuviera.
--
-- NO se borran los eventos que estén en Google: esta app deja de mostrarlos,
-- pero siguen en la agenda de quien la haya conectado. Si querés que el hub
-- pierda el acceso de verdad, revocá el permiso desde la cuenta de Google:
-- https://myaccount.google.com/permissions
--
-- Es segura de correr dos veces.
-- ============================================================

BEGIN;

-- 1. La agenda conectada y sus tokens.
DROP TABLE IF EXISTS google_cuenta;

-- 2. El permiso de Calendario.
UPDATE roles
   SET permisos = jsonb_set(permisos::jsonb, '{calendario}', '"full"')::json
 WHERE permisos::jsonb ->> 'calendario' = 'limitado';

UPDATE usuarios
   SET permisos = jsonb_set(permisos::jsonb, '{calendario}', '"full"')::json
 WHERE permisos::jsonb ->> 'calendario' = 'limitado';

-- 3. Los avisos y el registro de actividad de eventos, que ya no se generan.
DELETE FROM notificaciones WHERE tipo IN ('evento_nuevo', 'evento_editado', 'evento_borrado');
DELETE FROM actividad      WHERE tipo IN ('evento_nuevo', 'evento_editado', 'evento_borrado');

COMMIT;

-- Para verificar que quedó limpio (las cuatro tienen que devolver 0):
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name = 'google_cuenta';
--   SELECT count(*) FROM roles    WHERE permisos::jsonb->>'calendario' = 'limitado';
--   SELECT count(*) FROM usuarios WHERE permisos::jsonb->>'calendario' = 'limitado';
--   SELECT count(*) FROM actividad WHERE tipo LIKE 'evento_%';
