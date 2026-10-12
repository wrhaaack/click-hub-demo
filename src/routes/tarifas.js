// Tarifas y parámetros de cálculo: lo que se paga por pieza de diseño y de
// video, cuánto vale un punto del cotizador y el tope de edición. Vive en
// configuracion con la clave 'tarifas', igual que los datos del estudio.
//
// Leerlas lo puede cualquiera con sesión: la pantalla de tareas las necesita
// para sugerir el monto al elegir un nivel. Cambiarlas es solo del admin,
// porque mueven lo que se le paga a la gente.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = crearRouter();
router.use(requireAuth);

const DEFECTO = {
  diseno: { N1: 10000, N2: 15000, N3: 20000 },
  video: { N1: 27700, N2: 41500, N3: 60000 },
  puntoCotizador: 30000,
  topeEdicion: 0.3,
};

function numero(v, defecto) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : defecto;
}

function niveles(obj, defecto) {
  const o = obj || {};
  return { N1: numero(o.N1, defecto.N1), N2: numero(o.N2, defecto.N2), N3: numero(o.N3, defecto.N3) };
}

router.get('/', async (req, res) => {
  const result = await pool.query(`SELECT valor FROM configuracion WHERE clave = 'tarifas'`);
  res.json({ ...DEFECTO, ...(result.rows[0]?.valor || {}) });
});

router.put('/', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const tope = numero(b.topeEdicion, DEFECTO.topeEdicion);
  if (tope > 1) return res.status(400).json({ error: 'El tope de edición es una proporción entre 0 y 1.' });
  const valor = {
    diseno: niveles(b.diseno, DEFECTO.diseno),
    video: niveles(b.video, DEFECTO.video),
    puntoCotizador: numero(b.puntoCotizador, DEFECTO.puntoCotizador),
    topeEdicion: tope,
  };
  await pool.query(
    `INSERT INTO configuracion (clave, valor, actualizado_por, actualizado_en)
     VALUES ('tarifas', $1, $2, now())
     ON CONFLICT (clave) DO UPDATE
       SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()`,
    [JSON.stringify(valor), req.session.userId]
  );
  res.json(valor);
});

module.exports = router;
