// Lo que necesita la vista Dashboard: el resumen del mes, la agenda día por día
// y el registro de las últimas cosas que pasaron.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireSectionAccess } = require('../middleware/auth');
const { periodoADate } = require('../lib/consultas');

const router = crearRouter();
router.use(requireAuth);
router.use(requireSectionAccess('dashboard', 'full'));

// Últimas cosas que pasaron, ya con el texto listo para mostrar.
router.get('/actividad', async (req, res) => {
  const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 40, 1), 200);
  const result = await pool.query(
    `SELECT a.id, a.tipo, a.accion, a.entidad, a.entidad_id, a.descripcion, a.autor,
            a.usuario_id, a.creado_en,
            to_char(a.creado_en, 'DD/MM HH24:MI') AS fecha
     FROM actividad a
     ORDER BY a.creado_en DESC, a.id DESC
     LIMIT $1`,
    [limite]
  );
  res.json(result.rows);
});

// La agenda del mes: un renglón por día, con lo que cae ese día.
// El calendario de Google se suma aparte desde el navegador, para que si Google
// no responde el dashboard igual cargue.
router.get('/agenda', async (req, res) => {
  const periodoSql = periodoADate(req.query.periodo);
  if (!periodoSql) return res.status(400).json({ error: 'Periodo inválido (se espera YYYY-MM).' });

  const tareas = await pool.query(
    `SELECT to_char(t.fecha, 'YYYY-MM-DD') AS fecha, t.descripcion, t.rol, t.formato, t.estado,
            c.nombre AS cliente
     FROM tareas t JOIN clientes c ON c.id = t.cliente_id
     WHERE c.activo = true
       AND date_trunc('month', t.fecha) = date_trunc('month', $1::date)
     ORDER BY t.fecha ASC, t.id ASC`,
    [periodoSql]
  );

  const fechas = await pool.query(
    `SELECT to_char(f.fecha, 'YYYY-MM-DD') AS fecha, f.label, c.nombre AS cliente
     FROM fechas_especiales f JOIN clientes c ON c.id = f.cliente_id
     WHERE c.activo = true AND f.fecha IS NOT NULL
       AND date_trunc('month', f.fecha) = date_trunc('month', $1::date)
     ORDER BY f.fecha ASC`,
    [periodoSql]
  );

  res.json({ tareas: tareas.rows, especiales: fechas.rows });
});

module.exports = router;
