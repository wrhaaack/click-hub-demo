-- ============================================================
-- MIGRACIÓN · Equipo: admin-only y solo usuarios registrados
--
-- Solo hace falta si ya tenías la base andando de antes. Si la armás de cero con
-- db/schema.sql (o con "npm run db:init"), saltéate este archivo.
--
-- Qué hace:
--   1. limpia el permiso "equipo" que haya quedado guardado en los roles y en
--      las excepciones de cada usuario, de cuando la sección era configurable;
--   2. agrega el índice que impide que un mismo usuario figure dos veces en el
--      equipo (hace falta para la regla de "solo usuarios ya registrados").
--
-- IMPORTANTE: esto NO es lo que cierra el acceso. El acceso ya está cerrado por
-- código: permisosEfectivos() (src/middleware/auth.js) fuerza a sin_acceso todas
-- las secciones de SECCIONES_SOLO_ADMIN, así que un 'equipo: full' guardado de
-- antes no otorga nada aunque nunca corras este archivo. Esto es prolijidad:
-- deja la tabla diciendo lo mismo que hace el sistema, para que quien mire la
-- base no lea un permiso que en realidad no rige.
--
-- Es segura de correr dos veces.
-- ============================================================

BEGIN;

-- Los permisos del rol.
UPDATE roles
   SET permisos = jsonb_set(permisos::jsonb, '{equipo}', '"sin_acceso"')::json
 WHERE permisos::jsonb ? 'equipo'
   AND permisos::jsonb ->> 'equipo' <> 'sin_acceso';

-- Las excepciones por persona: acá se borra la clave en vez de ponerla en
-- sin_acceso. Las excepciones son solo lo que pisa al rol, y una que no otorga
-- nada es ruido: si quedara, la ficha del usuario mostraría una excepción
-- cargada que no cambia absolutamente nada.
UPDATE usuarios
   SET permisos = (permisos::jsonb - 'equipo')::json
 WHERE permisos::jsonb ? 'equipo';

-- Un mismo usuario no puede figurar dos veces en el equipo. Parcial (solo los
-- activos) porque las bajas conservan la fila para el historial: si mirara
-- todas, no se podría volver a sumar a alguien que ya salió una vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipo_usuario_activo
  ON equipo(usuario_id) WHERE activo = true AND usuario_id IS NOT NULL;

COMMIT;

-- OJO si venís de la versión vieja: las personas del equipo que quedaron SIN
-- usuario (las que dejó db/importar-localstorage.js, de cuando el equipo eran
-- nombres sueltos) siguen funcionando, pero no reciben los avisos de sus tareas.
-- En el hub aparecen con una etiqueta "sin usuario": editalas y enlazalas con el
-- usuario que les corresponda. Para ver cuáles son:
--   SELECT id, nombre, rol FROM equipo WHERE activo = true AND usuario_id IS NULL;

-- Para verificar que quedó limpio (tiene que devolver 0 filas):
--   SELECT nombre, permisos->>'equipo' FROM roles WHERE permisos::jsonb->>'equipo' <> 'sin_acceso';
--   SELECT email FROM usuarios WHERE permisos::jsonb ? 'equipo';
