// Consultas compartidas entre rutas.
//
// Las fechas se leen siempre con to_char(...,'YYYY-MM-DD'): una columna DATE
// vuelve de pg como objeto Date en hora local y al serializarse a JSON se
// convierte a UTC, lo que puede correr el día uno para atrás. Devolviéndolas ya
// como texto, lo que ve el navegador es exactamente lo que hay guardado.

const { pool } = require('../db');

// Devuelve las tareas con la forma exacta que usa la interfaz del hub:
// { id, cid, desc, rol, asig:[nombres], asigIds:[ids], formato, fecha,
//   fechaLimite, notas, estado, pagado }
const SELECT_TAREAS = `
  SELECT t.id,
         t.cliente_id                          AS cid,
         t.descripcion                         AS "desc",
         t.rol,
         t.formato,
         to_char(t.fecha, 'YYYY-MM-DD')        AS fecha,
         to_char(t.fecha_limite, 'YYYY-MM-DD') AS "fechaLimite",
         COALESCE(t.notas, '')                 AS notas,
         t.estado,
         t.pagado,
         COALESCE(
           (SELECT json_agg(e.nombre ORDER BY e.nombre)
            FROM tarea_asignados ta JOIN equipo e ON e.id = ta.miembro_id
            WHERE ta.tarea_id = t.id),
           '[]'
         ) AS asig,
         COALESCE(
           (SELECT json_agg(ta.miembro_id)
            FROM tarea_asignados ta
            WHERE ta.tarea_id = t.id),
           '[]'
         ) AS "asigIds"
  FROM tareas t
  JOIN clientes c ON c.id = t.cliente_id
  WHERE c.activo = true
`;

async function tareaPorId(id) {
  const result = await pool.query(`${SELECT_TAREAS} AND t.id = $1`, [id]);
  return result.rows[0] || null;
}

async function todasLasTareas() {
  const result = await pool.query(`${SELECT_TAREAS} ORDER BY t.fecha ASC NULLS LAST, t.id ASC`);
  return result.rows;
}

// 'YYYY-MM' (lo que manda el front) -> 'YYYY-MM-01' (lo que guarda la base).
function periodoADate(periodo) {
  if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) return null;
  return `${periodo}-01`;
}

// Guarda los asignados de una tarea. Ignora ids que no existan en equipo.
async function guardarAsignados(client, tareaId, miembroIds) {
  const tid = parseInt(tareaId, 10);
  await client.query('DELETE FROM tarea_asignados WHERE tarea_id = $1', [tid]);
  const ids = [...new Set((miembroIds || []).map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n)))];
  if (ids.length === 0) return;
  await client.query(
    `INSERT INTO tarea_asignados (tarea_id, miembro_id)
     SELECT $1::bigint, e.id FROM equipo e WHERE e.id = ANY($2::bigint[])`,
    [tid, ids]
  );
}

module.exports = { SELECT_TAREAS, tareaPorId, todasLasTareas, periodoADate, guardarAsignados };
