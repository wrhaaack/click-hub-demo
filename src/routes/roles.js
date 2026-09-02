// Roles: Editor, Diseñadora, CM, SMM... Hacen dos cosas a la vez:
//   - etiquetan tareas y personas (el orden define el color en el calendario),
//   - llevan los permisos que hereda cada usuario que los tenga asignados.
//
// Por eso toda esta ruta es admin-only: si alguien que no es admin pudiera
// editar un rol, se subiría los permisos a sí mismo. El hub no la necesita para
// dibujarse — los nombres de los roles ya le llegan en /api/estado.
//
// El PUT recibe la lista completa tal como quedó en la pantalla:
//   [{ id: 3, nombre: 'Editor', permisos: {...} }, { id: null, nombre: 'Fotógrafo' }, ...]
// Los que traen id se actualizan (y si cambió el nombre, el nuevo se propaga a
// las tareas y personas que lo tenían), los que vienen sin id se crean, y los
// que ya no están en la lista se borran.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireAdmin, SECCIONES, SECCIONES_SOLO_ADMIN } = require('../middleware/auth');

const router = crearRouter();
router.use(requireAuth);
router.use(requireAdmin);

router.get('/', async (req, res) => {
  const result = await pool.query('SELECT id, nombre, orden, permisos FROM roles ORDER BY orden ASC, id ASC');
  res.json(result.rows);
});

// Deja solo secciones y niveles válidos. Lo que no venga o no sea válido queda
// en sin_acceso: olvidarse de algo nunca puede terminar en acceso de más.
function sanitizarPermisos(input) {
  const out = {};
  for (const [seccion, nivelesValidos] of Object.entries(SECCIONES)) {
    const valor = input && input[seccion];
    out[seccion] = nivelesValidos.includes(valor) ? valor : 'sin_acceso';
  }
  // Usuarios y Equipo son admin-only por diseño: ningún rol las puede otorgar.
  for (const seccion of SECCIONES_SOLO_ADMIN) out[seccion] = 'sin_acceso';
  return out;
}

router.put('/', async (req, res) => {
  const entrada = Array.isArray((req.body || {}).roles) ? req.body.roles : null;
  if (!entrada) return res.status(400).json({ error: 'Falta la lista de roles.' });

  const limpios = entrada
    .map((r, i) => ({
      id: r && r.id ? parseInt(r.id, 10) : null,
      nombre: String((r && r.nombre) || '').trim(),
      permisos: sanitizarPermisos(r && r.permisos),
      orden: i,
    }))
    .filter((r) => r.nombre);

  if (limpios.length === 0) return res.status(400).json({ error: 'Tiene que quedar al menos un rol.' });

  const nombres = limpios.map((r) => r.nombre.toLowerCase());
  if (new Set(nombres).size !== nombres.length) {
    return res.status(400).json({ error: 'Hay dos roles con el mismo nombre.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const previos = await client.query('SELECT id, nombre FROM roles');
    const previoPorId = new Map(previos.rows.map((r) => [Number(r.id), r.nombre]));

    // Los usuarios que tenían un rol borrado quedan con rol_id en NULL
    // (lo hace el ON DELETE SET NULL), o sea sin permisos heredados. Se avisa
    // en la respuesta para que la pantalla lo pueda mostrar.
    const idsQueQuedan = limpios.filter((r) => r.id).map((r) => r.id);
    const borrados = await client.query(
      idsQueQuedan.length
        ? `DELETE FROM roles WHERE id <> ALL($1::bigint[]) RETURNING nombre`
        : 'DELETE FROM roles RETURNING nombre',
      idsQueQuedan.length ? [idsQueQuedan] : []
    );

    for (const rol of limpios) {
      if (rol.id && previoPorId.has(rol.id)) {
        const anterior = previoPorId.get(rol.id);
        await client.query(
          'UPDATE roles SET nombre = $1, orden = $2, permisos = $3 WHERE id = $4',
          [rol.nombre, rol.orden, JSON.stringify(rol.permisos), rol.id]
        );
        if (anterior !== rol.nombre) {
          // Renombrar arrastra a lo que ya estaba etiquetado con el nombre viejo,
          // así ninguna tarea queda huérfana de un rol que dejó de existir.
          await client.query('UPDATE tareas SET rol = $1 WHERE rol = $2', [rol.nombre, anterior]);
          await client.query('UPDATE equipo SET rol = $1 WHERE rol = $2', [rol.nombre, anterior]);
        }
      } else {
        await client.query(
          `INSERT INTO roles (nombre, orden, permisos) VALUES ($1, $2, $3)
           ON CONFLICT (nombre) DO UPDATE SET orden = EXCLUDED.orden, permisos = EXCLUDED.permisos`,
          [rol.nombre, rol.orden, JSON.stringify(rol.permisos)]
        );
      }
    }

    await client.query('COMMIT');
    res.locals.borrados = borrados.rows.map((r) => r.nombre);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const result = await pool.query('SELECT id, nombre, orden, permisos FROM roles ORDER BY orden ASC, id ASC');
  res.json({ roles: result.rows, borrados: res.locals.borrados || [] });
});

module.exports = router;
