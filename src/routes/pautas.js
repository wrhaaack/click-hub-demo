// Pauta publicitaria: una fila por cliente y mes, con lo invertido en
// anuncios, la capacitación y el fee de Click.
//
// Es plata de clientes, así que va con la sección Clientes: verla pide acceso,
// cargarla o marcarla pagada pide 'full'.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireSectionAccess } = require('../middleware/auth');
const { periodoADate, SELECT_PAUTAS: SELECT, todasLasPautas } = require('../lib/consultas');

const router = crearRouter();
router.use(requireAuth);
router.use(requireSectionAccess('clientes', 'limitado'));

function monto(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

async function porId(id) {
  const r = await pool.query(`${SELECT} AND p.id = $1`, [id]);
  return r.rows[0] || null;
}

router.get('/', async (req, res) => {
  res.json(await todasLasPautas());
});

router.post('/', requireSectionAccess('clientes', 'full'), async (req, res) => {
  const b = req.body || {};
  const periodo = periodoADate(b.periodo);
  const cid = parseInt(b.clienteId, 10);
  if (!periodo) return res.status(400).json({ error: 'Periodo inválido (se espera YYYY-MM).' });
  if (Number.isNaN(cid)) return res.status(400).json({ error: 'Falta el cliente.' });

  const existe = await pool.query('SELECT 1 FROM pautas WHERE cliente_id = $1 AND periodo = $2', [cid, periodo]);
  if (existe.rows.length) return res.status(409).json({ error: 'Ese cliente ya tiene pauta cargada en ese mes.' });

  const r = await pool.query(
    `INSERT INTO pautas (cliente_id, periodo, pauta, capacitacion, fee_click, nota, pagado)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [cid, periodo, monto(b.pauta), monto(b.capacitacion), monto(b.feeClick), b.nota || null, !!b.pagado]
  );
  res.status(201).json(await porId(r.rows[0].id));
});

router.put('/:id', requireSectionAccess('clientes', 'full'), async (req, res) => {
  const b = req.body || {};
  const r = await pool.query(
    `UPDATE pautas SET pauta = $1, capacitacion = $2, fee_click = $3, nota = $4, pagado = $5
     WHERE id = $6 RETURNING id`,
    [monto(b.pauta), monto(b.capacitacion), monto(b.feeClick), b.nota || null, !!b.pagado, req.params.id]
  );
  if (!r.rows.length) return res.status(404).json({ error: 'Pauta no encontrada.' });
  res.json(await porId(req.params.id));
});

// Arranca un mes copiando el anterior: es lo que se hacía duplicando la hoja.
// Solo copia los clientes que todavía no tienen fila en el mes nuevo, y todo
// arranca sin pagar.
router.post('/copiar', requireSectionAccess('clientes', 'full'), async (req, res) => {
  const desde = periodoADate((req.body || {}).desde);
  const hasta = periodoADate((req.body || {}).hasta);
  if (!desde || !hasta) return res.status(400).json({ error: 'Periodo inválido (se espera YYYY-MM).' });
  const r = await pool.query(
    `INSERT INTO pautas (cliente_id, periodo, pauta, capacitacion, fee_click, nota, pagado)
     SELECT p.cliente_id, $2::date, p.pauta, p.capacitacion, p.fee_click, p.nota, false
     FROM pautas p JOIN clientes c ON c.id = p.cliente_id
     WHERE p.periodo = $1::date AND c.activo = true
     ON CONFLICT (cliente_id, periodo) DO NOTHING`,
    [desde, hasta]
  );
  res.json({ copiadas: r.rowCount });
});

router.delete('/:id', requireSectionAccess('clientes', 'full'), async (req, res) => {
  const r = await pool.query('DELETE FROM pautas WHERE id = $1', [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Pauta no encontrada.' });
  res.json({ ok: true });
});

module.exports = router;
