const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireAdmin, requireSectionAccess } = require('../middleware/auth');
const { avisarAlEquipo } = require('../lib/notificaciones');

const router = crearRouter();
router.use(requireAuth);
router.use(requireSectionAccess('clientes', 'limitado'));

const CAMPOS = `id, nombre, COALESCE(ig,'') AS ig, COALESCE(contacto,'') AS contacto,
                COALESCE(tel,'') AS tel, links, COALESCE(notas,'') AS notas`;

// Los links vienen del formulario como [{label,url}]. Se limpia lo que no
// tenga url (igual que hacía la pantalla antes de guardar en localStorage).
function sanitizarLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .filter((l) => l && typeof l.url === 'string' && l.url.trim())
    .map((l) => ({ label: String(l.label || '').trim(), url: String(l.url).trim() }))
    .slice(0, 50);
}

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT ${CAMPOS} FROM clientes WHERE activo = true ORDER BY nombre ASC`
  );
  res.json(result.rows);
});

router.post('/', requireSectionAccess('clientes', 'full'), async (req, res) => {
  const { nombre, ig, contacto, tel, links, notas } = req.body || {};
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'Falta el nombre del cliente.' });
  }
  const result = await pool.query(
    `INSERT INTO clientes (nombre, ig, contacto, tel, links, notas, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${CAMPOS}`,
    [
      String(nombre).trim(), ig || null, contacto || null, tel || null,
      JSON.stringify(sanitizarLinks(links)), notas || null, req.session.userId,
    ]
  );
  const cliente = result.rows[0];

  await avisarAlEquipo(
    req.session, 'cliente_nuevo',
    `${req.session.nombre} agregó un cliente nuevo: "${cliente.nombre}"`,
    '/hub.html', null, cliente.id
  );

  res.status(201).json(cliente);
});

router.put('/:id', requireSectionAccess('clientes', 'full'), async (req, res) => {
  const { nombre, ig, contacto, tel, links, notas } = req.body || {};
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'Falta el nombre del cliente.' });
  }
  const previo = await pool.query('SELECT nombre FROM clientes WHERE id = $1 AND activo = true', [req.params.id]);
  if (previo.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const result = await pool.query(
    `UPDATE clientes SET nombre = $1, ig = $2, contacto = $3, tel = $4, links = $5, notas = $6
     WHERE id = $7 AND activo = true RETURNING ${CAMPOS}`,
    [
      String(nombre).trim(), ig || null, contacto || null, tel || null,
      JSON.stringify(sanitizarLinks(links)), notas || null, req.params.id,
    ]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const anterior = previo.rows[0].nombre;
  const actual = result.rows[0].nombre;
  await avisarAlEquipo(
    req.session, 'cliente_editado',
    anterior === actual
      ? `${req.session.nombre} editó los datos de ${actual}`
      : `${req.session.nombre} renombró "${anterior}" a "${actual}"`,
    '/hub.html', null, req.params.id
  );
  res.json(result.rows[0]);
});

// Baja lógica: el cliente deja de aparecer pero no se pierde su historial.
// Es solo del admin: se lleva puesto un cliente entero de la vista de todos.
router.delete('/:id', requireAdmin, async (req, res) => {
  const result = await pool.query(
    'UPDATE clientes SET activo = false WHERE id = $1 AND activo = true RETURNING nombre',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado.' });
  await avisarAlEquipo(
    req.session, 'cliente_baja',
    `${req.session.nombre} dio de baja al cliente ${result.rows[0].nombre}`,
    '/hub.html', null, req.params.id
  );
  res.json({ ok: true });
});

module.exports = router;
