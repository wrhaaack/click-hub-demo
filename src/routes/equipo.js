// Equipo = las personas a las que se les asignan tareas.
// Roles  = los roles de producción (Editor, Diseñadora, CM, SMM...) con los que
//          se etiquetan tareas y personas. No son los roles de login.
//
// Al equipo solo entra gente que YA tiene usuario creado por el admin. O sea:
// primero se da de alta el usuario en la pantalla de Usuarios, y recién después
// se lo suma acá eligiéndolo de la lista. Por eso no hay campo de nombre libre:
// el nombre es el del usuario, y esta tabla no lo puede contradecir.
//
// Consecuencia buena: como toda persona del equipo tiene usuario detrás, los
// avisos de "te asignaron una tarea" siempre encuentran a quién avisarle. Antes
// una persona suelta sin usuario enlazado se quedaba sin recibirlos.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireAdmin, tieneAcceso } = require('../middleware/auth');

const router = crearRouter();
router.use(requireAuth);

// La SECCIÓN Equipo es admin-only: verla y tocarla es solo del administrador.
//
// El GET es la excepción y no lleva requireAdmin a propósito. Esta lista es la
// que llena las pastillas de "asignado a" del modal de tarea: si se cerrara,
// cualquiera que puede crear o editar una tarea se quedaría sin poder asignarla.
// Se abre exactamente a quien ve tareas, con el mismo criterio que usa
// src/routes/estado.js para decidir si le manda la lista en el arranque.
function puedeVerLaLista(req, res, next) {
  if (req.session.rol === 'admin') return next();
  const ve = ['clientes', 'calendario', 'delegacion']
    .some((seccion) => tieneAcceso(req.session, seccion, 'limitado'));
  if (ve) return next();
  return res.status(403).json({ error: 'No tenés acceso a esta sección.' });
}

router.get('/', puedeVerLaLista, async (req, res) => {
  const result = await pool.query(
    `SELECT id, nombre, COALESCE(rol,'') AS rol, usuario_id
     FROM equipo WHERE activo = true ORDER BY id ASC`
  );
  res.json(result.rows);
});

// Los usuarios que todavía se pueden sumar: activos y que no estén ya adentro.
// Es lo que llena el desplegable de "Agregar persona".
router.get('/disponibles', requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.nombre, u.email, u.rol
       FROM usuarios u
      WHERE u.activo = true
        AND NOT EXISTS (
          SELECT 1 FROM equipo e WHERE e.usuario_id = u.id AND e.activo = true
        )
      ORDER BY u.nombre ASC`
  );
  res.json(result.rows);
});

// Trae al usuario si se puede sumar, o el motivo por el que no.
// Devolver el motivo (y no un "datos inválidos" genérico) importa: son tres
// situaciones distintas y el admin necesita saber cuál le tocó.
async function usuarioSumable(usuarioId) {
  if (!usuarioId) return { error: 'Elegí a quién sumar.', status: 400 };
  const u = await pool.query('SELECT id, nombre, activo FROM usuarios WHERE id = $1', [usuarioId]);
  if (u.rows.length === 0) return { error: 'Ese usuario no existe.', status: 404 };
  if (!u.rows[0].activo) return { error: 'Ese usuario está desactivado.', status: 400 };
  const ya = await pool.query(
    'SELECT 1 FROM equipo WHERE usuario_id = $1 AND activo = true', [usuarioId]
  );
  if (ya.rows.length > 0) return { error: 'Esa persona ya está en el equipo.', status: 409 };
  return { usuario: u.rows[0] };
}

router.post('/', requireAdmin, async (req, res) => {
  const { usuario_id, rol } = req.body || {};
  const chequeo = await usuarioSumable(usuario_id);
  if (chequeo.error) return res.status(chequeo.status).json({ error: chequeo.error });

  try {
    const result = await pool.query(
      `INSERT INTO equipo (nombre, rol, usuario_id) VALUES ($1, $2, $3)
       RETURNING id, nombre, COALESCE(rol,'') AS rol, usuario_id`,
      [chequeo.usuario.nombre, rol || null, usuario_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // El índice único es la red de seguridad para dos altas simultáneas: el
    // chequeo de arriba puede pasar en las dos y la base frena a la segunda.
    if (err.code === '23505') return res.status(409).json({ error: 'Esa persona ya está en el equipo.' });
    throw err;
  }
});

// Se edita el rol de producción y, en un solo caso, se enlaza un usuario.
//
// El nombre no se toca acá: es el del usuario, y se actualiza solo cuando el
// admin lo renombra en Usuarios.
//
// Lo de enlazar es para las filas viejas sin usuario: las que dejó el importador
// de localStorage (db/importar-localstorage.js), que venía de una época en la
// que el equipo eran nombres sueltos. Se las adopta en vez de crearlas de nuevo
// para no perder el historial: las tareas ya asignadas apuntan a ESE id, así que
// dar de baja la fila y crear otra dejaría las asignaciones viejas colgando de
// alguien dado de baja.
//
// Una fila que ya tiene usuario no se puede reasignar a otro: sería quedarse con
// el nombre de uno y el usuario de otro, justo lo que la regla evita. Para eso
// está la baja, que libera al usuario y permite volver a sumarlo.
router.put('/:id', requireAdmin, async (req, res) => {
  const { rol, usuario_id } = req.body || {};
  const actual = await pool.query(
    'SELECT id, usuario_id FROM equipo WHERE id = $1 AND activo = true', [req.params.id]
  );
  if (actual.rows.length === 0) return res.status(404).json({ error: 'Persona no encontrada.' });

  if (usuario_id && actual.rows[0].usuario_id) {
    return res.status(409).json({ error: 'Esta persona ya tiene un usuario enlazado.' });
  }

  if (usuario_id) {
    const chequeo = await usuarioSumable(usuario_id);
    if (chequeo.error) return res.status(chequeo.status).json({ error: chequeo.error });
    try {
      const result = await pool.query(
        `UPDATE equipo SET rol = $1, usuario_id = $2, nombre = $3 WHERE id = $4 AND activo = true
         RETURNING id, nombre, COALESCE(rol,'') AS rol, usuario_id`,
        [rol || null, usuario_id, chequeo.usuario.nombre, req.params.id]
      );
      return res.json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Esa persona ya está en el equipo.' });
      throw err;
    }
  }

  const result = await pool.query(
    `UPDATE equipo SET rol = $1 WHERE id = $2 AND activo = true
     RETURNING id, nombre, COALESCE(rol,'') AS rol, usuario_id`,
    [rol || null, req.params.id]
  );
  res.json(result.rows[0]);
});

// Baja lógica: la persona desaparece de la lista de asignables, pero las tareas
// donde ya figuraba la siguen mostrando. La fila queda (con activo = false) para
// que ese nombre no se pierda del historial.
//
// El usuario_id se limpia a propósito: libera al usuario para volver a sumarlo
// más adelante, y es lo que hace que el índice único mire solo a los activos.
router.delete('/:id', requireAdmin, async (req, res) => {
  const result = await pool.query(
    'UPDATE equipo SET activo = false, usuario_id = NULL WHERE id = $1 RETURNING id',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Persona no encontrada.' });
  res.json({ ok: true });
});

module.exports = router;
