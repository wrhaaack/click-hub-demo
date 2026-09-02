-- ============================================================
-- MIGRACIÓN · Los permisos pasan a vivir en el rol
--
-- Solo hace falta si ya tenías la base andando con la versión anterior, donde
-- los diez permisos se cargaban a mano en cada usuario. Si estás armando la
-- base de cero con db/schema.sql, saltéate este archivo: ya viene todo.
--
-- Qué cambia:
--   roles.permisos     -> nuevo. Cada rol lleva los permisos que hereda su gente.
--   usuarios.rol_id    -> nuevo. De qué rol hereda cada usuario.
--   usuarios.permisos  -> cambia de significado: antes era el mapa completo,
--                         ahora son solo las EXCEPCIONES a lo que dice el rol.
--
-- Es segura de correr dos veces.
-- ============================================================

BEGIN;

ALTER TABLE roles    ADD COLUMN IF NOT EXISTS permisos JSONB NOT NULL DEFAULT '{}';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_id   BIGINT REFERENCES roles(id) ON DELETE SET NULL;

-- A los roles que quedaron sin permisos se les carga el mismo arranque que trae
-- schema.sql: gente de producción que ve lo suyo y mueve el estado de sus tareas.
UPDATE roles SET permisos = '{"clientes":"limitado","tareas":"limitado","calendario":"full","brainstorm":"full","delegacion":"full","historial":"full","comunicacion":"full","equipo":"sin_acceso","estudio":"limitado","usuarios":"sin_acceso"}'
WHERE permisos = '{}'::jsonb;

-- Cada usuario que todavía no tenga rol se engancha al rol de la persona del
-- equipo con la que está enlazado, que es lo que casi siempre corresponde.
UPDATE usuarios u
SET rol_id = r.id
FROM equipo e JOIN roles r ON r.nombre = e.rol
WHERE e.usuario_id = u.id AND u.rol_id IS NULL;

-- Los permisos que cada uno tenía cargados a mano se conservan como excepciones,
-- así nadie pierde ni gana acceso con la migración. Se limpian las secciones en
-- las que la excepción coincide con lo que ya dice el rol: ahí no hace falta.
UPDATE usuarios u
SET permisos = (
  SELECT COALESCE(jsonb_object_agg(clave, valor), '{}'::jsonb)
  FROM jsonb_each_text(u.permisos) AS p(clave, valor)
  WHERE valor IS DISTINCT FROM (r.permisos ->> p.clave)
)
FROM roles r
WHERE r.id = u.rol_id;

-- La sección Usuarios es admin-only por diseño: nunca se otorga por permiso.
UPDATE usuarios SET permisos = permisos - 'usuarios' WHERE permisos ? 'usuarios';
UPDATE roles    SET permisos = jsonb_set(permisos, '{usuarios}', '"sin_acceso"');

COMMIT;

-- Después de correr esto, revisá en la pantalla de Usuarios que cada persona
-- tenga el rol que le corresponde. Los que quedaron "sin rol" siguen andando con
-- sus excepciones, pero conviene asignarles uno para que hereden de ahí.
