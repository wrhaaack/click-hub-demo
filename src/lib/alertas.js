const { pool } = require('../db');
const { crearNotificaciones } = require('./notificaciones');

// Misma idea que el "cliente estancado" del proyecto base, traída a lo que
// importa en el hub: tareas que se pasaron de la fecha límite sin terminar, y
// clientes que llegaron a mitad de mes sin ninguna tarea cargada.
//
// Las dos revisiones se corren una vez al arrancar y después una vez por día
// (ver el final de server.js).

const DIA_CORTE_MES = 10; // desde el día 10 avisa por los clientes sin planificar

// Una tarea está vencida si tiene fecha límite pasada y todavía no está
// 'listo' ni 'cumplido'. Se avisa a las personas asignadas que tengan login,
// y si no hay ninguna, a todos los usuarios activos.
async function revisarTareasVencidas() {
  const vencidas = await pool.query(
    `SELECT t.id, t.descripcion, t.fecha_limite, c.nombre AS cliente,
            COALESCE(
              (SELECT array_agg(e.usuario_id)
               FROM tarea_asignados ta JOIN equipo e ON e.id = ta.miembro_id
               WHERE ta.tarea_id = t.id AND e.usuario_id IS NOT NULL),
              '{}'
            ) AS usuarios_asignados
     FROM tareas t
     JOIN clientes c ON c.id = t.cliente_id
     WHERE t.fecha_limite IS NOT NULL
       AND t.fecha_limite < current_date
       AND t.estado NOT IN ('listo', 'cumplido')
       AND c.activo = true`
  );
  if (vencidas.rows.length === 0) return;

  const activos = await pool.query('SELECT id FROM usuarios WHERE activo = true');
  const todos = activos.rows.map((u) => u.id);

  for (const tarea of vencidas.rows) {
    const link = '/hub.html#delegacion';
    // Destinatarios: los asignados con login; si nadie tiene login, todos.
    const asignados = (tarea.usuarios_asignados || []).filter(Boolean);
    const destinatarios = asignados.length > 0 ? asignados : todos;

    // No repetir el mismo aviso mientras la tarea siga vencida: si ya se avisó
    // por esta tarea en los últimos 7 días, se saltea. A propósito no se filtra
    // por 'oculta': una fila oculta sigue contando como "ya avisado", que es
    // justo lo que silencia el aviso cuando el usuario eligió no volver a verlo.
    const yaAvisados = await pool.query(
      `SELECT DISTINCT usuario_id FROM notificaciones
       WHERE tipo = 'tarea_vencida' AND mensaje LIKE $1
         AND creado_en > now() - interval '7 days'`,
      [`%[#${tarea.id}]%`]
    );
    const yaTienen = new Set(yaAvisados.rows.map((r) => r.usuario_id));
    const faltan = destinatarios.filter((id) => !yaTienen.has(id));
    if (faltan.length === 0) continue;

    await crearNotificaciones(
      faltan,
      'tarea_vencida',
      `Se pasó la fecha límite de "${tarea.descripcion}" (${tarea.cliente}) [#${tarea.id}]`,
      link
    );
  }
}

// Clientes activos que ya pasado el día 10 del mes no tienen ninguna tarea
// cargada para ese mes. Se avisa a todos los usuarios activos, una vez por mes.
async function revisarClientesSinPlanificar() {
  const hoy = new Date();
  if (hoy.getDate() < DIA_CORTE_MES) return;

  const sinPlan = await pool.query(
    `SELECT c.id, c.nombre
     FROM clientes c
     WHERE c.activo = true
       AND NOT EXISTS (
         SELECT 1 FROM tareas t
         WHERE t.cliente_id = c.id
           AND date_trunc('month', t.fecha) = date_trunc('month', current_date)
       )`
  );
  if (sinPlan.rows.length === 0) return;

  const activos = await pool.query('SELECT id FROM usuarios WHERE activo = true');
  const todos = activos.rows.map((u) => u.id);

  for (const cliente of sinPlan.rows) {
    const marca = `[c#${cliente.id}]`;
    const yaAvisados = await pool.query(
      `SELECT DISTINCT usuario_id FROM notificaciones
       WHERE tipo = 'cliente_sin_planificar' AND mensaje LIKE $1
         AND date_trunc('month', creado_en) = date_trunc('month', current_date)`,
      [`%${marca}%`]
    );
    const yaTienen = new Set(yaAvisados.rows.map((r) => r.usuario_id));
    const faltan = todos.filter((id) => !yaTienen.has(id));
    if (faltan.length === 0) continue;

    await crearNotificaciones(
      faltan,
      'cliente_sin_planificar',
      `${cliente.nombre} todavía no tiene tareas cargadas para este mes ${marca}`,
      '/hub.html'
    );
  }
}

async function revisarAlertas() {
  await revisarTareasVencidas();
  await revisarClientesSinPlanificar();
}

module.exports = { revisarAlertas, revisarTareasVencidas, revisarClientesSinPlanificar };
