// Eventos del calendario: lo que pasa en el estudio y no es una tarea de un
// cliente (una reunión, una grabación, un feriado, un viaje de tres días).
//
// Se ven con permiso "limitado" en Calendario; crearlos, editarlos y borrarlos
// pide "full". A diferencia de las tareas, borrar un evento NO es admin-only:
// un evento mal cargado es ruido en la grilla, no un dato que se pierde.
//
// Dos cosas son opcionales y cada una significa algo distinto:
//   sin "hasta"        -> dura un solo día;
//   sin "hora inicio"  -> es de todo el día.
// Hacia afuera "hasta" siempre viaja con un valor (el mismo día que "desde"
// cuando no se puso), así la pantalla no tiene que decidir nada.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireSectionAccess } = require('../middleware/auth');
const { avisarAlEquipo } = require('../lib/notificaciones');

const router = crearRouter();
router.use(requireAuth);
router.use(requireSectionAccess('calendario', 'limitado'));

// Los mismos que acepta la base. Se repiten acá para poder rechazar con un 400
// que se entienda, en vez de dejar que reviente el CHECK con un 500.
const COLORES = ['azul', 'rosa', 'ambar', 'verde', 'violeta', 'turquesa'];

// COALESCE en hasta: las filas cargadas antes de que los eventos tuvieran rango
// lo tienen en NULL, y para la pantalla eso es "un solo día".
const CAMPOS = `id, titulo, to_char(desde, 'YYYY-MM-DD') AS desde,
                to_char(COALESCE(hasta, desde), 'YYYY-MM-DD') AS hasta,
                to_char(hora_inicio, 'HH24:MI') AS "horaInicio",
                to_char(hora_fin, 'HH24:MI') AS "horaFin",
                COALESCE(descripcion, '') AS descripcion, color, autor, usuario_id`;

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

// Devuelve el error a mostrar, o los datos ya normalizados. Se valida todo junto
// para no ir contestando de a un problema por vez.
function revisar(body) {
  const titulo = String((body && body.titulo) || '').trim();
  if (!titulo) return { error: 'Falta el título.' };

  const desde = fechaONull(body && body.desde);
  if (!desde) return { error: 'La fecha tiene que ser YYYY-MM-DD.' };

  // Sin "hasta" el evento dura un solo día. Una fecha mal escrita, en cambio, no
  // se ignora en silencio: si alguien quiso poner un rango, hay que decírselo.
  const crudo = String((body && body.hasta) || '').trim();
  let hasta = desde;
  if (crudo) {
    hasta = fechaONull(crudo);
    if (!hasta) return { error: 'La fecha de fin tiene que ser YYYY-MM-DD.' };
    if (hasta < desde) return { error: 'El evento no puede terminar antes de empezar.' };
  }

  const color = String((body && body.color) || 'violeta');
  if (!COLORES.includes(color)) return { error: 'Ese color no existe.' };

  return {
    datos: {
      titulo, desde, hasta, color,
      horaInicio: horaONull(body && body.horaInicio),
      horaFin: horaONull(body && body.horaFin),
      descripcion: (body && body.descripcion) || null,
    },
  };
}

// Para el aviso: "Reunión con Lumá" (15/09) o "Rodaje" (15/09 al 17/09).
function comoSeLee(ev) {
  const corto = (f) => f.slice(8, 10) + '/' + f.slice(5, 7);
  const cuando = ev.hasta === ev.desde ? corto(ev.desde) : corto(ev.desde) + ' al ' + corto(ev.hasta);
  return `"${ev.titulo}" (${cuando})`;
}

router.get('/', async (req, res) => {
  const { desde, hasta } = req.query;
  const d = fechaONull(desde);
  const h = fechaONull(hasta);
  // Sin rango se devuelve todo: la pantalla los quiere en memoria para poder
  // cambiar de mes sin volver a pedir.
  //
  // Con rango se piden los que SE CRUZAN con él, no los que arrancan adentro: un
  // evento que empezó el mes pasado y sigue este también cae en esta semana.
  const result = d && h
    ? await pool.query(
        `SELECT ${CAMPOS} FROM eventos
          WHERE desde <= $2 AND COALESCE(hasta, desde) >= $1
          ORDER BY desde ASC, hora_inicio ASC NULLS FIRST`, [d, h])
    : await pool.query(
        `SELECT ${CAMPOS} FROM eventos ORDER BY desde ASC, hora_inicio ASC NULLS FIRST`);
  res.json(result.rows);
});

router.post('/', requireSectionAccess('calendario', 'full'), async (req, res) => {
  const { error, datos } = revisar(req.body);
  if (error) return res.status(400).json({ error });

  const result = await pool.query(
    `INSERT INTO eventos (titulo, desde, hasta, hora_inicio, hora_fin, descripcion, color, usuario_id, autor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${CAMPOS}`,
    [datos.titulo, datos.desde, datos.hasta, datos.horaInicio, datos.horaFin,
     datos.descripcion, datos.color, req.session.userId, req.session.nombre]
  );
  const ev = result.rows[0];
  await avisarAlEquipo(req.session, 'evento_nuevo',
    `${req.session.nombre} agregó el evento ${comoSeLee(ev)}`, '/hub.html#calendario', null, ev.id);
  res.status(201).json(ev);
});

router.put('/:id', requireSectionAccess('calendario', 'full'), async (req, res) => {
  const { error, datos } = revisar(req.body);
  if (error) return res.status(400).json({ error });

  const result = await pool.query(
    `UPDATE eventos SET titulo = $1, desde = $2, hasta = $3, hora_inicio = $4, hora_fin = $5,
                        descripcion = $6, color = $7
     WHERE id = $8 RETURNING ${CAMPOS}`,
    [datos.titulo, datos.desde, datos.hasta, datos.horaInicio, datos.horaFin,
     datos.descripcion, datos.color, req.params.id]
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
