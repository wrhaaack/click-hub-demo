// Etapas: la planificación que se le muestra al cliente.
//
// Son tramos de varios días ("Diseño", "Grabación", "Revisión") escritos para
// que los lea el cliente, no para trabajar. Por eso son una tabla aparte y no
// salen de las tareas: lo que el equipo escribe para organizarse casi nunca es
// lo que conviene mostrarle a quien paga.
//
// Viven adentro de Calendario, así que usan su permiso: se ven con "limitado" y
// se tocan con "full". Eso no abre nada nuevo — el calendario del equipo ya
// muestra las tareas de todos los clientes con su nombre.

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

const CAMPOS = `id, cliente_id AS "clienteId", titulo,
                to_char(desde, 'YYYY-MM-DD') AS desde,
                to_char(hasta, 'YYYY-MM-DD') AS hasta,
                color, COALESCE(nota, '') AS nota`;

function fechaONull(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
}

// Devuelve el error a mostrar, o null si los datos sirven. Se valida todo junto
// para no ir contestando de a un problema por vez.
function revisar(body) {
  const titulo = String((body && body.titulo) || '').trim();
  if (!titulo) return { error: 'Poné un título para la etapa.' };

  const clienteId = Number(body && body.clienteId);
  if (!Number.isInteger(clienteId) || clienteId <= 0) return { error: 'Falta el cliente.' };

  const desde = fechaONull(body && body.desde);
  if (!desde) return { error: 'La fecha tiene que ser YYYY-MM-DD.' };

  // Sin "hasta" la etapa dura un solo día. Una fecha mal escrita, en cambio, no
  // se ignora en silencio: si alguien quiso poner un rango, hay que decírselo.
  const crudo = String((body && body.hasta) || '').trim();
  let hasta = desde;
  if (crudo) {
    hasta = fechaONull(crudo);
    if (!hasta) return { error: 'La fecha de fin tiene que ser YYYY-MM-DD.' };
    // La base también lo controla; acá se corta antes para poder explicarlo.
    if (hasta < desde) return { error: 'La etapa no puede terminar antes de empezar.' };
  }

  const color = String((body && body.color) || 'azul');
  if (!COLORES.includes(color)) return { error: 'Ese color no existe.' };

  const nota = String((body && body.nota) || '').trim();
  return { datos: { titulo, clienteId, desde, hasta, color, nota: nota || null } };
}

// Para el aviso: "Diseño" (01/09 al 07/09) de Boutique Lumá.
function comoSeLee(et, cliente) {
  const corto = (f) => f.slice(8, 10) + '/' + f.slice(5, 7);
  const cuando = et.desde === et.hasta ? corto(et.desde) : corto(et.desde) + ' al ' + corto(et.hasta);
  return `"${et.titulo}" (${cuando}) de ${cliente}`;
}

async function nombreDelCliente(id) {
  const r = await pool.query('SELECT nombre FROM clientes WHERE id = $1', [id]);
  return r.rows[0] ? r.rows[0].nombre : 'un cliente';
}

router.get('/', async (req, res) => {
  const cliente = Number(req.query.cliente);
  // Sin ?cliente viajan todas: son pocas y así la pantalla puede cambiar de
  // cliente y de mes sin volver a pedir nada.
  const result = Number.isInteger(cliente) && cliente > 0
    ? await pool.query(
        `SELECT ${CAMPOS} FROM etapas WHERE cliente_id = $1 ORDER BY desde ASC, id ASC`, [cliente])
    : await pool.query(`SELECT ${CAMPOS} FROM etapas ORDER BY desde ASC, id ASC`);
  res.json(result.rows);
});

router.post('/', requireSectionAccess('calendario', 'full'), async (req, res) => {
  const { error, datos } = revisar(req.body);
  if (error) return res.status(400).json({ error });

  let result;
  try {
    result = await pool.query(
      `INSERT INTO etapas (cliente_id, titulo, desde, hasta, color, nota, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${CAMPOS}`,
      [datos.clienteId, datos.titulo, datos.desde, datos.hasta, datos.color, datos.nota,
       req.session.userId]
    );
  } catch (err) {
    // 23503 = la clave foránea no encontró al cliente. Es un dato mal mandado,
    // no una falla del servidor.
    if (err.code === '23503') return res.status(400).json({ error: 'Ese cliente no existe.' });
    throw err;
  }

  const et = result.rows[0];
  await avisarAlEquipo(req.session, 'etapa_nueva',
    `${req.session.nombre} agregó la etapa ${comoSeLee(et, await nombreDelCliente(et.clienteId))}`,
    '/hub.html#calendario', null, et.id);
  res.status(201).json(et);
});

router.put('/:id', requireSectionAccess('calendario', 'full'), async (req, res) => {
  const { error, datos } = revisar(req.body);
  if (error) return res.status(400).json({ error });

  let result;
  try {
    result = await pool.query(
      `UPDATE etapas SET cliente_id = $1, titulo = $2, desde = $3, hasta = $4, color = $5, nota = $6
       WHERE id = $7 RETURNING ${CAMPOS}`,
      [datos.clienteId, datos.titulo, datos.desde, datos.hasta, datos.color, datos.nota,
       req.params.id]
    );
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Ese cliente no existe.' });
    throw err;
  }
  if (result.rows.length === 0) return res.status(404).json({ error: 'Etapa no encontrada.' });

  const et = result.rows[0];
  await avisarAlEquipo(req.session, 'etapa_editada',
    `${req.session.nombre} editó la etapa ${comoSeLee(et, await nombreDelCliente(et.clienteId))}`,
    '/hub.html#calendario', null, et.id);
  res.json(et);
});

router.delete('/:id', requireSectionAccess('calendario', 'full'), async (req, res) => {
  // Se lee antes de borrar para que el aviso pueda nombrarla: después ya no hay
  // de dónde sacar el título.
  const previo = await pool.query(`SELECT ${CAMPOS} FROM etapas WHERE id = $1`, [req.params.id]);
  if (previo.rows.length === 0) return res.status(404).json({ error: 'Etapa no encontrada.' });

  const et = previo.rows[0];
  const cliente = await nombreDelCliente(et.clienteId);
  await pool.query('DELETE FROM etapas WHERE id = $1', [req.params.id]);
  await avisarAlEquipo(req.session, 'etapa_borrada',
    `${req.session.nombre} eliminó la etapa ${comoSeLee(et, cliente)}`, '/hub.html#calendario');
  res.json({ ok: true });
});

module.exports = router;
