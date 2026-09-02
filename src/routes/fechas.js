// Fechas especiales de un cliente en un mes (lanzamientos, feriados, efemérides).
// Igual que el brainstorm: la pantalla edita una lista por posición, así que se
// guarda la lista completa del cliente+mes de una sola vez.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireSectionAccess } = require('../middleware/auth');
const { periodoADate } = require('../lib/consultas');

const router = crearRouter();
router.use(requireAuth);
router.use(requireSectionAccess('clientes', 'limitado'));

function fechaONull(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
}

router.put('/', requireSectionAccess('clientes', 'full'), async (req, res) => {
  const { cliente, periodo, items } = req.body || {};
  const clienteId = parseInt(cliente, 10);
  const periodoSql = periodoADate(periodo);
  if (Number.isNaN(clienteId)) return res.status(400).json({ error: 'Cliente inválido.' });
  if (!periodoSql) return res.status(400).json({ error: 'Periodo inválido (se espera YYYY-MM).' });
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Falta la lista de fechas.' });

  const limpios = items
    .map((f, i) => ({
      fecha: fechaONull(f && f.fecha),
      label: String((f && f.label) || '').trim(),
      orden: i,
    }))
    .slice(0, 100);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM fechas_especiales WHERE cliente_id = $1 AND periodo = $2',
      [clienteId, periodoSql]
    );
    for (const f of limpios) {
      await client.query(
        'INSERT INTO fechas_especiales (cliente_id, periodo, fecha, label, orden) VALUES ($1,$2,$3,$4,$5)',
        [clienteId, periodoSql, f.fecha, f.label || null, f.orden]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ ok: true });
});

module.exports = router;
