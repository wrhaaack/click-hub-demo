// El hub lo usan varias personas a la vez, así que cada cosa que pasa le tiene
// que llegar al resto: si alguien carga un cliente, crea una tarea, la edita, la
// mueve de estado o la borra, los demás se enteran sin tener que estar mirando.
//
// Regla general: se avisa a TODOS los usuarios activos menos a quien hizo la
// acción (nadie necesita que le avisen de lo que acaba de hacer).

const { pool } = require('../db');

// Inserta la misma notificación para varios usuarios de una sola consulta.
async function crearNotificaciones(usuarioIds, tipo, mensaje, link) {
  const ids = [...new Set(usuarioIds)].filter(Boolean);
  if (ids.length === 0) return;
  const values = [];
  const params = [];
  ids.forEach((id, i) => {
    values.push(`($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`);
    params.push(id, tipo, mensaje, link || null);
  });
  await pool.query(
    `INSERT INTO notificaciones (usuario_id, tipo, mensaje, link) VALUES ${values.join(', ')}`,
    params
  );
}

// Cada tipo de aviso es un alta, una edición o una baja. Se lista acá y no se
// deduce del nombre para que agregar un tipo nuevo obligue a decidirlo.
const ACCION_POR_TIPO = {
  cliente_nuevo: ['alta', 'cliente'],
  cliente_editado: ['edicion', 'cliente'],
  cliente_baja: ['baja', 'cliente'],
  tarea_nueva: ['alta', 'tarea'],
  tarea_editada: ['edicion', 'tarea'],
  tarea_borrada: ['baja', 'tarea'],
  tarea_estado: ['edicion', 'tarea'],
  tarea_pago: ['edicion', 'tarea'],
  cliente_pago: ['edicion', 'cliente'],
  usuario_nuevo: ['alta', 'usuario'],
  evento_nuevo: ['alta', 'evento'],
  evento_editado: ['edicion', 'evento'],
  evento_borrado: ['baja', 'evento'],
  etapa_nueva: ['alta', 'etapa'],
  etapa_editada: ['edicion', 'etapa'],
  etapa_borrada: ['baja', 'etapa'],
};

// Deja el hecho anotado en el registro de actividad, que es lo que muestra el
// dashboard. Es una fila sola, sin importar cuánta gente reciba el aviso.
async function registrarActividad(session, tipo, descripcion, entidadId) {
  const [accion, entidad] = ACCION_POR_TIPO[tipo] || [];
  if (!accion) return;   // un tipo sin clasificar no se registra en vez de mentir
  await pool.query(
    `INSERT INTO actividad (tipo, accion, entidad, entidad_id, descripcion, usuario_id, autor)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [tipo, accion, entidad, entidadId || null, descripcion, session.userId, session.nombre]
  );
}

// El aviso general: le llega a todo el equipo menos al que lo provocó, y de paso
// queda anotado en el registro de actividad.
//
// `exceptoUsuarios` sirve para no mandar dos avisos por lo mismo: cuando a
// alguien le asignan una tarea recibe el aviso personal ("te asignó X"), así
// que se lo saca del aviso general ("creó la tarea X").
async function avisarAlEquipo(session, tipo, mensaje, link, exceptoUsuarios, entidadId) {
  await registrarActividad(session, tipo, mensaje, entidadId);
  const fuera = new Set([session.userId, ...(exceptoUsuarios || [])]);
  const todos = await pool.query('SELECT id FROM usuarios WHERE activo = true');
  const destinatarios = todos.rows.map((u) => u.id).filter((id) => !fuera.has(id));
  await crearNotificaciones(destinatarios, tipo, mensaje, link);
}

// De una lista de miembros del equipo, los que tienen login propio.
// Sirve para avisarle a alguien que le asignaron una tarea.
async function usuariosDeMiembros(miembroIds) {
  if (!miembroIds || miembroIds.length === 0) return [];
  const ids = miembroIds.map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  if (ids.length === 0) return [];
  const result = await pool.query(
    'SELECT usuario_id FROM equipo WHERE id = ANY($1::bigint[]) AND usuario_id IS NOT NULL',
    [ids]
  );
  return result.rows.map((r) => r.usuario_id);
}

module.exports = {
  crearNotificaciones,
  usuariosDeMiembros,
  avisarAlEquipo,
};
