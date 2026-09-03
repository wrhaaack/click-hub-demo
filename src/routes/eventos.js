// Eventos del calendario: lo que pasa en una fecha y no es una tarea de un
// cliente (una reunión, una grabación, un feriado del estudio).
//
// Se ven con permiso "limitado" en Calendario; crearlos, editarlos y borrarlos
// pide "full". A diferencia de las tareas, borrar un evento NO es admin-only:
// un evento mal cargado es ruido en la grilla, no un dato que se pierde.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireSectionAccess } = require('../middleware/auth');
const { avisarAlEquipo } = require('../lib/notificaciones');

const router = crearRouter();
router.use(requireAuth);
router.use(requireSectionAccess('calendario', 'limitado'));

const CAMPOS = `id, titulo, to_char(fecha, 'YYYY-MM-DD') AS fecha,
                to_char(hora_inicio, 'HH24:MI') AS "horaInicio",
                to_char(hora_fin, 'HH24:MI') AS "horaFin",
                COALESCE(descripcion, '') AS descripcion, autor, usuario_id`;

function fechaONull(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
}
// La hora llega del <input type="time"> como HH:MM. Vacío es válido: significa
// "todo el día", que es distinto de una hora mal escrita.
//
// No alcanza con mirar la forma: "25:99" tiene la forma correcta y Postgres la
// rechaza como TIME, así que el alta entera moría con un 500. Se validan los
// rangos y lo que no pasa queda en null: es preferible perder la hora que
// perder el evento.
function horaONull(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return (h <= 23 && min <= 59) ? s : null;
}

// Para el aviso: "Reunión con Lumá (15/09)".
function comoSeLee(ev) {
  const [a, m, d] = ev.fecha.split('-');
  return `"${ev.titulo}" (${d}/${m})`;
}

router.get('/', async (req, res) => {
  const { desde, hasta } = req.query;
  const d = fechaONull(desde);
  const h = fechaONull(hasta);
  // Sin rango se devuelve todo: la pantalla los quiere en memoria para poder
  // cambiar de mes sin volver a pedir.
  const result = d && h
    ? await pool.query(
        `SELECT ${CAMPOS} FROM eventos WHERE fecha BETWEEN $1 AND $2
         ORDER BY fecha ASC, hora_inicio ASC NULLS FIRST`, [d, h])
    : await pool.query(
        `SELECT ${CAMPOS} FROM eventos ORDER BY fecha ASC, hora_inicio ASC NULLS FIRST`);
  res.json(result.rows);
});

router.post('/', requireSectionAccess('calendario', 'full'), async (req, res) => {
  const { titulo, fecha, horaInicio, horaFin, descripcion } = req.body || {};
  if (!titulo || !String(titulo).trim()) return res.status(400).json({ error: 'Falta el título.' });
  const f = fechaONull(fecha);
  if (!f) return res.status(400).json({ error: 'La fecha tiene que ser YYYY-MM-DD.' });

  const result = await pool.query(
    `INSERT INTO eventos (titulo, fecha, hora_inicio, hora_fin, descripcion, usuario_id, autor)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${CAMPOS}`,
    [String(titulo).trim(), f, horaONull(horaInicio), horaONull(horaFin),
     descripcion || null, req.session.userId, req.session.nombre]
  );
  const ev = result.rows[0];
  await avisarAlEquipo(req.session, 'evento_nuevo',
    `${req.session.nombre} agregó el evento ${comoSeLee(ev)}`, '/hub.html#calendario', null, ev.id);
  res.status(201).json(ev);
});

router.put('/:id', requireSectionAccess('calendario', 'full'), async (req, res) => {
  const { titulo, fecha, horaInicio, horaFin, descripcion } = req.body || {};
  if (!titulo || !String(titulo).trim()) return res.status(400).json({ error: 'Falta el título.' });
  const f = fechaONull(fecha);
  if (!f) return res.status(400).json({ error: 'La fecha tiene que ser YYYY-MM-DD.' });

  const result = await pool.query(
    `UPDATE eventos SET titulo = $1, fecha = $2, hora_inicio = $3, hora_fin = $4, descripcion = $5
     WHERE id = $6 RETURNING ${CAMPOS}`,
    [String(titulo).trim(), f, horaONull(horaInicio), horaONull(horaFin),
     descripcion || null, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado.' });
  const ev = result.rows[0];
  await avisarAlEquipo(req.session, 'evento_editado',
    `${req.session.nombre} editó el evento ${comoSeLee(ev)}`, '/hub.html#calendario', null, ev.id);
  res.json(ev);
});

router.delete('/:id', requireSectionAccess('calendario', 'full'), async (req, res) => {
  // Se lee antes de borrar para que el aviso pueda nombrarlo: después de la
  // baja ya no hay de dónde sacar el título.
  const previo = await pool.query(
    `SELECT ${CAMPOS} FROM eventos WHERE id = $1`, [req.params.id]);
  if (previo.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado.' });

  await pool.query('DELETE FROM eventos WHERE id = $1', [req.params.id]);
  await avisarAlEquipo(req.session, 'evento_borrado',
    `${req.session.nombre} eliminó el evento ${comoSeLee(previo.rows[0])}`, '/hub.html#calendario');
  res.json({ ok: true });
});

module.exports = router;
