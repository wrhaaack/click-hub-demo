// Ideas + links de inspiración, por cliente y por mes.
// cliente = 'gen' es el bloque de ideas generales (cliente_id NULL en la base).
//
// Se guarda el bloque entero de una: la pantalla edita listas por posición
// (agregar, cambiar el texto de la fila 3, borrar la 2), así que mandar la lista
// completa es lo que refleja de verdad lo que el usuario dejó en pantalla.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireSectionAccess } = require('../middleware/auth');
const { periodoADate } = require('../lib/consultas');

const router = crearRouter();
router.use(requireAuth);
router.use(requireSectionAccess('brainstorm', 'limitado'));

function limpiarIdeas(ideas) {
  if (!Array.isArray(ideas)) return [];
  return ideas.map((i) => String(i == null ? '' : i)).slice(0, 200);
}

function limpiarInspo(inspo) {
  if (!Array.isArray(inspo)) return [];
  return inspo
    .map((l) => ({ label: String((l && l.label) || ''), url: String((l && l.url) || '') }))
    .slice(0, 200);
}

router.put('/', requireSectionAccess('brainstorm', 'full'), async (req, res) => {
  const { cliente, periodo, ideas, inspo } = req.body || {};
  const periodoSql = periodoADate(periodo);
  if (!periodoSql) return res.status(400).json({ error: 'Periodo inválido (se espera YYYY-MM).' });

  const esGeneral = cliente === 'gen' || cliente === null || cliente === undefined;
  const clienteId = esGeneral ? null : parseInt(cliente, 10);
  if (!esGeneral && Number.isNaN(clienteId)) {
    return res.status(400).json({ error: 'Cliente inválido.' });
  }

  const datos = [JSON.stringify(limpiarIdeas(ideas)), JSON.stringify(limpiarInspo(inspo))];

  if (esGeneral) {
    await pool.query(
      `INSERT INTO brainstorm (cliente_id, periodo, ideas, inspo)
       VALUES (NULL, $1, $2, $3)
       ON CONFLICT (periodo) WHERE cliente_id IS NULL
       DO UPDATE SET ideas = EXCLUDED.ideas, inspo = EXCLUDED.inspo, actualizado_en = now()`,
      [periodoSql, ...datos]
    );
  } else {
    const cli = await pool.query('SELECT id FROM clientes WHERE id = $1 AND activo = true', [clienteId]);
    if (cli.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado.' });
    await pool.query(
      `INSERT INTO brainstorm (cliente_id, periodo, ideas, inspo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cliente_id, periodo) WHERE cliente_id IS NOT NULL
       DO UPDATE SET ideas = EXCLUDED.ideas, inspo = EXCLUDED.inspo, actualizado_en = now()`,
      [clienteId, periodoSql, ...datos]
    );
  }

  res.json({ ok: true });
});

module.exports = router;
