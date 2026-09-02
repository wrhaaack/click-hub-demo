// Los datos del estudio (nombre, contacto, links útiles, notas internas).
// Vive en la tabla configuracion, con la clave 'estudio': es un bloque único,
// no una lista, así que no necesita tabla propia.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireSectionAccess } = require('../middleware/auth');

const router = crearRouter();
router.use(requireAuth);
router.use(requireSectionAccess('estudio', 'limitado'));

const VACIO = { nombre: '', ig: '', email: '', tel: '', wa: '', links: [], notas: '' };

function sanitizarLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .filter((l) => l && typeof l.url === 'string' && l.url.trim())
    .map((l) => ({ label: String(l.label || '').trim(), url: String(l.url).trim() }))
    .slice(0, 50);
}

router.get('/', async (req, res) => {
  const result = await pool.query(`SELECT valor FROM configuracion WHERE clave = 'estudio'`);
  res.json(result.rows[0]?.valor || VACIO);
});

router.put('/', requireSectionAccess('estudio', 'full'), async (req, res) => {
  const b = req.body || {};
  const valor = {
    nombre: String(b.nombre || '').trim(),
    ig: String(b.ig || '').trim(),
    email: String(b.email || '').trim(),
    tel: String(b.tel || '').trim(),
    wa: String(b.wa || '').trim(),
    links: sanitizarLinks(b.links),
    notas: String(b.notas || '').trim(),
  };
  await pool.query(
    `INSERT INTO configuracion (clave, valor, actualizado_por, actualizado_en)
     VALUES ('estudio', $1, $2, now())
     ON CONFLICT (clave) DO UPDATE
       SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()`,
    [JSON.stringify(valor), req.session.userId]
  );
  res.json(valor);
});

module.exports = router;
