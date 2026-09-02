// Chat general del equipo + notas por cliente y mes.
//
// Diferencia con la versión que guardaba en localStorage: ya no hay un selector
// de "autor". El autor es quien está logueado, y solo esa persona (o un admin)
// puede borrar lo que escribió. Con logins de verdad, elegir a mano de parte de
// quién habla cada mensaje dejaba de tener sentido.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireSectionAccess } = require('../middleware/auth');
const { periodoADate } = require('../lib/consultas');

const router = crearRouter();
router.use(requireAuth);
router.use(requireSectionAccess('comunicacion', 'limitado'));

const MAX_TEXTO = 2000;

function esPropioOAdmin(session, usuarioId) {
  return session.rol === 'admin' || usuarioId === session.userId;
}

// ---------- Chat general ----------
// Con ?desde=<id> devuelve solo lo que llegó después de ese mensaje. Es lo que
// usa la pantalla para ir trayendo lo nuevo cada pocos segundos sin volver a
// bajarse toda la conversación.
router.get('/mensajes', async (req, res) => {
  const desde = parseInt(req.query.desde, 10);
  if (!Number.isNaN(desde)) {
    const nuevos = await pool.query(
      `SELECT id, autor, texto, usuario_id, to_char(creado_en, 'DD/MM/YYYY HH24:MI') AS fecha
       FROM mensajes WHERE id > $1 ORDER BY id ASC LIMIT 200`,
      [desde]
    );
    return res.json(nuevos.rows);
  }
  const result = await pool.query(
    `SELECT id, autor, texto, usuario_id, to_char(creado_en, 'DD/MM/YYYY HH24:MI') AS fecha
     FROM mensajes ORDER BY creado_en ASC LIMIT 500`
  );
  res.json(result.rows);
});

router.post('/mensajes', requireSectionAccess('comunicacion', 'full'), async (req, res) => {
  const texto = String((req.body || {}).texto || '').trim();
  if (!texto) return res.status(400).json({ error: 'El mensaje está vacío.' });
  if (texto.length > MAX_TEXTO) return res.status(400).json({ error: 'El mensaje es demasiado largo.' });

  const result = await pool.query(
    `INSERT INTO mensajes (usuario_id, autor, texto) VALUES ($1, $2, $3)
     RETURNING id, autor, texto, usuario_id, to_char(creado_en, 'DD/MM/YYYY HH24:MI') AS fecha`,
    [req.session.userId, req.session.nombre, texto]
  );
  res.status(201).json(result.rows[0]);
});

router.delete('/mensajes/:id', requireSectionAccess('comunicacion', 'full'), async (req, res) => {
  const previo = await pool.query('SELECT usuario_id FROM mensajes WHERE id = $1', [req.params.id]);
  if (previo.rows.length === 0) return res.status(404).json({ error: 'Mensaje no encontrado.' });
  if (!esPropioOAdmin(req.session, previo.rows[0].usuario_id)) {
    return res.status(403).json({ error: 'Solo podés borrar tus propios mensajes.' });
  }
  await pool.query('DELETE FROM mensajes WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ---------- Notas por cliente y mes ----------
router.get('/notas', async (req, res) => {
  const clienteId = parseInt(req.query.cliente, 10);
  const periodoSql = periodoADate(req.query.periodo);
  if (Number.isNaN(clienteId) || !periodoSql) {
    return res.status(400).json({ error: 'Falta cliente o periodo.' });
  }
  const result = await pool.query(
    `SELECT id, texto, autor, usuario_id, to_char(creado_en, 'DD/MM HH24:MI') AS fecha
     FROM notas WHERE cliente_id = $1 AND periodo = $2 ORDER BY creado_en ASC`,
    [clienteId, periodoSql]
  );
  res.json(result.rows);
});

router.post('/notas', requireSectionAccess('comunicacion', 'full'), async (req, res) => {
  const { cliente, periodo } = req.body || {};
  const texto = String((req.body || {}).texto || '').trim();
  const clienteId = parseInt(cliente, 10);
  const periodoSql = periodoADate(periodo);
  if (Number.isNaN(clienteId) || !periodoSql) return res.status(400).json({ error: 'Falta cliente o periodo.' });
  if (!texto) return res.status(400).json({ error: 'La nota está vacía.' });
  if (texto.length > MAX_TEXTO) return res.status(400).json({ error: 'La nota es demasiado larga.' });

  const cli = await pool.query('SELECT id FROM clientes WHERE id = $1 AND activo = true', [clienteId]);
  if (cli.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const result = await pool.query(
    `INSERT INTO notas (cliente_id, periodo, texto, usuario_id, autor) VALUES ($1,$2,$3,$4,$5)
     RETURNING id, texto, autor, usuario_id, to_char(creado_en, 'DD/MM HH24:MI') AS fecha`,
    [clienteId, periodoSql, texto, req.session.userId, req.session.nombre]
  );
  res.status(201).json(result.rows[0]);
});

router.delete('/notas/:id', requireSectionAccess('comunicacion', 'full'), async (req, res) => {
  const previo = await pool.query('SELECT usuario_id FROM notas WHERE id = $1', [req.params.id]);
  if (previo.rows.length === 0) return res.status(404).json({ error: 'Nota no encontrada.' });
  if (!esPropioOAdmin(req.session, previo.rows[0].usuario_id)) {
    return res.status(403).json({ error: 'Solo podés borrar tus propias notas.' });
  }
  await pool.query('DELETE FROM notas WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
