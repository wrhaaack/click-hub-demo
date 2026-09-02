const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireAdmin, requireSectionAccess } = require('../middleware/auth');
const { crearNotificaciones, usuariosDeMiembros, avisarAlEquipo } = require('../lib/notificaciones');
const { tareaPorId, todasLasTareas, guardarAsignados } = require('../lib/consultas');

const router = crearRouter();
router.use(requireAuth);
// 'sin_acceso' en tareas = solo lectura. 'limitado' = puede mover el estado y el
// pago de tareas que ya existen. 'full' = crear, editar y asignar.
// Eliminar no está en ningún nivel: es solo del admin (ver el DELETE al final).
router.use(requireSectionAccess('tareas', 'sin_acceso'));

const ESTADOS = ['pendiente', 'en progreso', 'revisión', 'listo', 'cumplido'];
const LINK = '/hub.html#delegacion';

function fechaONull(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
}

// Datos comunes a crear y editar.
function leerCuerpo(body) {
  return {
    cid: parseInt(body.cid, 10),
    desc: String(body.desc || '').trim(),
    rol: body.rol ? String(body.rol).trim() : null,
    formato: body.formato ? String(body.formato).trim() : null,
    fecha: fechaONull(body.fecha),
    fechaLimite: fechaONull(body.fechaLimite),
    notas: body.notas ? String(body.notas).trim() : null,
    pagado: !!body.pagado,
    asignados: Array.isArray(body.asignados) ? body.asignados : [],
  };
}

// A los asignados les llega un aviso personal ("te asignó"). Devuelve a quiénes
// les llegó, para que el aviso general no se los mande repetido.
async function avisarAsignados(session, miembroIds, tarea, clienteNombre) {
  const usuarios = (await usuariosDeMiembros(miembroIds)).filter((u) => u !== session.userId);
  await crearNotificaciones(
    usuarios,
    'tarea_asignada',
    `${session.nombre} te asignó "${tarea.desc}" (${clienteNombre})`,
    LINK
  );
  return usuarios;
}

router.get('/', async (req, res) => {
  res.json(await todasLasTareas());
});

router.post('/', requireSectionAccess('tareas', 'full'), async (req, res) => {
  const d = leerCuerpo(req.body || {});
  if (!d.desc) return res.status(400).json({ error: 'Falta la descripción de la tarea.' });
  if (Number.isNaN(d.cid)) return res.status(400).json({ error: 'Falta el cliente.' });

  const cliente = await pool.query('SELECT nombre FROM clientes WHERE id = $1 AND activo = true', [d.cid]);
  if (cliente.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const nombreCliente = cliente.rows[0].nombre;

  const client = await pool.connect();
  let tareaId;
  try {
    await client.query('BEGIN');
    const insert = await client.query(
      `INSERT INTO tareas (cliente_id, descripcion, rol, formato, fecha, fecha_limite, notas, pagado, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [d.cid, d.desc, d.rol, d.formato, d.fecha, d.fechaLimite, d.notas, d.pagado, req.session.userId]
    );
    tareaId = insert.rows[0].id;
    await guardarAsignados(client, tareaId, d.asignados);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const tarea = await tareaPorId(tareaId);
  const yaAvisados = await avisarAsignados(req.session, d.asignados, tarea, nombreCliente);
  await avisarAlEquipo(
    req.session, 'tarea_nueva',
    `${req.session.nombre} agregó "${tarea.desc}" en ${nombreCliente}${tarea.fecha ? ' (' + fechaCorta(tarea.fecha) + ')' : ''}`,
    LINK, yaAvisados, tarea.id
  );
  res.status(201).json(tarea);
});

function fechaCorta(iso) {
  return iso ? iso.slice(8) + '/' + iso.slice(5, 7) : '';
}

router.put('/:id', requireSectionAccess('tareas', 'full'), async (req, res) => {
  const d = leerCuerpo(req.body || {});
  if (!d.desc) return res.status(400).json({ error: 'Falta la descripción de la tarea.' });
  if (Number.isNaN(d.cid)) return res.status(400).json({ error: 'Falta el cliente.' });

  const previa = await pool.query(
    `SELECT t.id, t.descripcion, c.nombre AS cliente,
            COALESCE((SELECT array_agg(miembro_id) FROM tarea_asignados WHERE tarea_id = t.id), '{}') AS asignados
     FROM tareas t JOIN clientes c ON c.id = t.cliente_id WHERE t.id = $1`,
    [req.params.id]
  );
  if (previa.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada.' });
  const yaAsignados = new Set((previa.rows[0].asignados || []).map(Number));
  const descAnterior = previa.rows[0].descripcion;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE tareas SET cliente_id = $1, descripcion = $2, rol = $3, formato = $4,
              fecha = $5, fecha_limite = $6, notas = $7, pagado = $8, actualizado_en = now()
       WHERE id = $9`,
      [d.cid, d.desc, d.rol, d.formato, d.fecha, d.fechaLimite, d.notas, d.pagado, req.params.id]
    );
    await guardarAsignados(client, req.params.id, d.asignados);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const tarea = await tareaPorId(req.params.id);
  const cliente = await pool.query('SELECT nombre FROM clientes WHERE id = $1', [d.cid]);
  const nombreCliente = cliente.rows[0] ? cliente.rows[0].nombre : previa.rows[0].cliente;

  // Solo se avisa "te asignaron" a los que se sumaron ahora, no a los que ya estaban.
  const nuevos = d.asignados.map(Number).filter((id) => !yaAsignados.has(id));
  const yaAvisados = await avisarAsignados(req.session, nuevos, tarea, nombreCliente);
  await avisarAlEquipo(
    req.session, 'tarea_editada',
    descAnterior === tarea.desc
      ? `${req.session.nombre} editó "${tarea.desc}" (${nombreCliente})`
      : `${req.session.nombre} editó "${descAnterior}", ahora es "${tarea.desc}" (${nombreCliente})`,
    LINK, yaAvisados, tarea.id
  );
  res.json(tarea);
});

// Mover el estado es la acción del día a día: alcanza con 'limitado'.
router.patch('/:id/estado', requireSectionAccess('tareas', 'limitado'), async (req, res) => {
  const estado = String((req.body || {}).estado || '');
  if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido.' });

  const previa = await pool.query(
    `SELECT t.estado, t.descripcion, c.nombre AS cliente
     FROM tareas t JOIN clientes c ON c.id = t.cliente_id WHERE t.id = $1`,
    [req.params.id]
  );
  if (previa.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada.' });

  await pool.query(
    'UPDATE tareas SET estado = $1, actualizado_en = now() WHERE id = $2',
    [estado, req.params.id]
  );

  // Solo se avisa si de verdad cambió: la pantalla puede reenviar el mismo estado.
  if (previa.rows[0].estado !== estado) {
    await avisarAlEquipo(
      req.session, 'tarea_estado',
      `${req.session.nombre} pasó "${previa.rows[0].descripcion}" a ${estado} (${previa.rows[0].cliente})`,
      LINK, null, req.params.id
    );
  }
  res.json(await tareaPorId(req.params.id));
});

router.patch('/:id/pago', requireSectionAccess('tareas', 'limitado'), async (req, res) => {
  const pagado = !!(req.body || {}).pagado;

  const previa = await pool.query(
    `SELECT t.pagado, t.descripcion, c.nombre AS cliente
     FROM tareas t JOIN clientes c ON c.id = t.cliente_id WHERE t.id = $1`,
    [req.params.id]
  );
  if (previa.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada.' });

  await pool.query(
    'UPDATE tareas SET pagado = $1, actualizado_en = now() WHERE id = $2',
    [pagado, req.params.id]
  );

  if (previa.rows[0].pagado !== pagado) {
    await avisarAlEquipo(
      req.session, 'tarea_pago',
      `${req.session.nombre} marcó "${previa.rows[0].descripcion}" como ${pagado ? 'pagada' : 'sin pagar'} (${previa.rows[0].cliente})`,
      LINK, null, req.params.id
    );
  }
  res.json(await tareaPorId(req.params.id));
});

// Eliminar es solo del admin: es la única acción de tareas que no tiene vuelta
// atrás, y el historial del mes depende de que nadie borre por error.
router.delete('/:id', requireAdmin, async (req, res) => {
  const previa = await pool.query(
    `SELECT t.descripcion, c.nombre AS cliente
     FROM tareas t JOIN clientes c ON c.id = t.cliente_id WHERE t.id = $1`,
    [req.params.id]
  );
  if (previa.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada.' });

  await pool.query('DELETE FROM tareas WHERE id = $1', [req.params.id]);
  await avisarAlEquipo(
    req.session, 'tarea_borrada',
    `${req.session.nombre} eliminó "${previa.rows[0].descripcion}" de ${previa.rows[0].cliente}`,
    LINK, null, req.params.id
  );
  res.json({ ok: true });
});

module.exports = router;
