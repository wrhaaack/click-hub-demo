const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = crearRouter();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT id, tipo, mensaje, link, leida, creado_en
     FROM notificaciones
     WHERE usuario_id = $1 AND oculta = false
     ORDER BY creado_en DESC
     LIMIT 50`,
    [req.session.userId]
  );
  res.json(result.rows);
});

router.patch('/:id/leida', async (req, res) => {
  const result = await pool.query(
    `UPDATE notificaciones SET leida = true WHERE id = $1 AND usuario_id = $2 RETURNING id`,
    [req.params.id, req.session.userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Notificación no encontrada.' });
  res.json({ ok: true });
});

router.patch('/:id/no-leida', async (req, res) => {
  const result = await pool.query(
    `UPDATE notificaciones SET leida = false WHERE id = $1 AND usuario_id = $2 RETURNING id`,
    [req.params.id, req.session.userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Notificación no encontrada.' });
  res.json({ ok: true });
});

// Borrar una o varias. Dos comportamientos distintos a propósito:
//
//   volverAAvisar = false  ->  oculta = true. La fila queda en la base, así la
//     revisión diaria (src/lib/alertas.js) la sigue viendo y no regenera el aviso.
//   volverAAvisar = true   ->  DELETE de verdad. Al desaparecer el rastro, la
//     revisión vuelve a crear el aviso si la tarea sigue vencida.
//
// El WHERE siempre incluye usuario_id: nadie puede borrar notificaciones ajenas
// aunque mande ids que no son suyos.
router.post('/borrar', async (req, res) => {
  const { ids, volverAAvisar } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Falta la lista de notificaciones a borrar.' });
  }
  const idsNum = ids.map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  if (idsNum.length === 0) return res.status(400).json({ error: 'Lista de notificaciones inválida.' });

  const sql = volverAAvisar === true
    ? `DELETE FROM notificaciones WHERE id = ANY($1::bigint[]) AND usuario_id = $2 RETURNING id`
    : `UPDATE notificaciones SET oculta = true WHERE id = ANY($1::bigint[]) AND usuario_id = $2 RETURNING id`;

  const result = await pool.query(sql, [idsNum, req.session.userId]);
  res.json({ ok: true, borradas: result.rows.length });
});

router.post('/marcar-todas', async (req, res) => {
  await pool.query(
    `UPDATE notificaciones SET leida = true WHERE usuario_id = $1 AND leida = false`,
    [req.session.userId]
  );
  res.json({ ok: true });
});

module.exports = router;
