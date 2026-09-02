const { crearRouter } = require('../lib/router');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireAuth, requireAdmin, permisosEfectivos, SECCIONES, SECCIONES_SOLO_ADMIN } = require('../middleware/auth');
const { avisarAlEquipo } = require('../lib/notificaciones');

const router = crearRouter();
router.use(requireAuth);
router.use(requireAdmin); // Toda esta pantalla es admin-only.

// Los permisos que se guardan en el usuario son EXCEPCIONES a lo que dice su
// rol, no el mapa completo. Solo entran las secciones que vengan con un nivel
// válido; las que no estén se heredan del rol.
//
// Las secciones admin-only (Usuarios y Equipo) nunca se pueden otorgar, ni
// siquiera como excepción: guardarlas como "full" para un empleado dejaría un
// permiso fantasma que la pantalla mostraría pero el backend igual bloquearía.
function sanitizarExcepciones(input) {
  const out = {};
  if (!input) return out;
  for (const [seccion, nivelesValidos] of Object.entries(SECCIONES)) {
    if (SECCIONES_SOLO_ADMIN.includes(seccion)) continue;
    const valor = input[seccion];
    if (valor && nivelesValidos.includes(valor)) out[seccion] = valor;
  }
  return out;
}

const CAMPOS = `u.id, u.nombre, u.email, u.rol, u.activo, u.permisos, u.rol_id,
                u.creado_en, u.ultimo_login`;

// Devuelve, además de lo guardado, el mapa de permisos que le queda de verdad a
// la persona (rol + excepciones). Es lo que la pantalla muestra como resultado.
function conEfectivos(fila) {
  return {
    ...fila,
    efectivos: permisosEfectivos({
      rol: fila.rol,
      permisosRol: fila.permisos_rol,
      permisosPropios: fila.permisos,
    }),
  };
}

const SELECT_USUARIOS = `
  SELECT ${CAMPOS},
         r.nombre AS rol_nombre, r.permisos AS permisos_rol,
         (SELECT json_build_object('id', e.id, 'nombre', e.nombre, 'rol', e.rol)
          FROM equipo e WHERE e.usuario_id = u.id LIMIT 1) AS miembro
  FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id`;

router.get('/', async (req, res) => {
  const result = await pool.query(`${SELECT_USUARIOS} ORDER BY u.nombre ASC`);
  res.json(result.rows.map(conEfectivos));
});

async function devolverUno(res, id, status) {
  const result = await pool.query(`${SELECT_USUARIOS} WHERE u.id = $1`, [id]);
  res.status(status || 200).json(conEfectivos(result.rows[0]));
}

function rolIdValido(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

// Para que el registro de actividad diga con qué rol se sumó la persona.
async function nombreDelRol(rolId) {
  if (!rolId) return null;
  const r = await pool.query('SELECT nombre FROM roles WHERE id = $1', [rolId]);
  return r.rows[0] ? r.rows[0].nombre : null;
}

router.post('/', async (req, res) => {
  const { nombre, email, password, rol, permisos, rol_id } = req.body || {};
  if (!nombre || !nombre.trim() || !email || !email.trim() || !password) {
    return res.status(400).json({ error: 'Faltan nombre, email o contraseña.' });
  }
  if (password.length < 10) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 10 caracteres.' });
  }
  const rolFinal = rol === 'admin' ? 'admin' : 'empleado';
  const hash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, permisos, rol_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [nombre.trim(), String(email).toLowerCase().trim(), hash, rolFinal,
       JSON.stringify(sanitizarExcepciones(permisos)), rolIdValido(rol_id)]
    );
    // Se avisa al resto del equipo, pero no a la persona recién creada: su
    // primera notificación no puede ser que la dieron de alta a ella misma.
    const rolNombre = rolFinal === 'admin'
      ? 'administrador'
      : (await nombreDelRol(rolIdValido(rol_id))) || 'sin rol asignado';
    await avisarAlEquipo(
      req.session, 'usuario_nuevo',
      `${req.session.nombre} sumó a ${nombre.trim()} como ${rolNombre}`,
      '/hub.html',
      [result.rows[0].id]
    );
    await devolverUno(res, result.rows[0].id, 201);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese email ya está en uso.' });
    throw err;
  }
});

// El enlace usuario <-> persona del equipo NO se edita desde acá. Se define en
// un solo lugar, la sección Equipo, donde a alguien se lo suma eligiéndolo de
// entre los usuarios registrados (ver src/routes/equipo.js).
//
// Antes esta pantalla tenía un desplegable para enlazar a mano. Se sacó porque
// con la regla nueva podía romper justamente lo que la regla garantiza: enlazar
// al usuario B con una persona que ya era del usuario A dejaba una fila con el
// nombre de uno y el usuario_id del otro.
//
// El campo "miembro" que devuelve SELECT_USUARIOS sigue viajando, pero es solo
// para mostrar: dice si la persona está en el equipo y con qué rol.

router.put('/:id', async (req, res) => {
  const { nombre, email, rol, permisos, rol_id } = req.body || {};
  if (!nombre || !nombre.trim() || !email || !email.trim()) {
    return res.status(400).json({ error: 'Faltan nombre o email.' });
  }
  const rolFinal = rol === 'admin' ? 'admin' : 'empleado';

  const actual = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.params.id]);
  if (actual.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });

  // Si se está bajando de admin a empleado, no dejar que se quede sin ningún admin activo.
  if (rolFinal === 'empleado' && actual.rows[0].rol === 'admin') {
    const otrosAdmins = await pool.query(
      `SELECT id FROM usuarios WHERE rol = 'admin' AND activo = true AND id != $1`,
      [req.params.id]
    );
    if (otrosAdmins.rows.length === 0) {
      return res.status(400).json({ error: 'No podés bajar de admin al único administrador activo.' });
    }
  }

  try {
    const result = await pool.query(
      `UPDATE usuarios SET nombre = $1, email = $2, rol = $3, permisos = $4, rol_id = $5
       WHERE id = $6 RETURNING id`,
      [nombre.trim(), String(email).toLowerCase().trim(), rolFinal,
       JSON.stringify(sanitizarExcepciones(permisos)), rolIdValido(rol_id), req.params.id]
    );
    // El equipo guarda una copia del nombre (la leen las tareas asignadas sin
    // tener que joinear usuarios cada vez), así que al renombrar hay que
    // arrastrarla o quedarían dos nombres distintos para la misma persona.
    await pool.query(
      'UPDATE equipo SET nombre = $1 WHERE usuario_id = $2 AND activo = true',
      [nombre.trim(), req.params.id]
    );
    await devolverUno(res, result.rows[0].id);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese email ya está en uso.' });
    throw err;
  }
});

// Resetear/cambiar la contraseña de otro usuario. Nunca se muestra la actual,
// solo se permite setear una nueva (mismo criterio que /api/auth/perfil).
router.put('/:id/password', async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 10) {
    return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 10 caracteres.' });
  }
  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    'UPDATE usuarios SET password_hash = $1 WHERE id = $2 RETURNING id',
    [hash, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json({ ok: true });
});

// Activar/desactivar (soft-delete, igual que clientes.activo=false). Protege
// contra auto-desactivarse y contra quedarse sin ningún admin activo.
//
// Desactivar también saca a la persona del equipo. Si no, quedaba asignable:
// se le podían seguir dando tareas y le llegaban avisos que nunca iba a leer,
// porque no puede entrar. Volver a activarla NO la devuelve al equipo: eso se
// hace a mano desde la sección Equipo, que es donde se decide quién trabaja.
router.patch('/:id/activo', async (req, res) => {
  const activo = !!(req.body || {}).activo;

  if (!activo && req.params.id === req.session.userId) {
    return res.status(400).json({ error: 'No podés desactivar tu propia cuenta.' });
  }

  if (!activo) {
    const usuario = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.params.id]);
    if (usuario.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (usuario.rows[0].rol === 'admin') {
      const otrosAdmins = await pool.query(
        `SELECT id FROM usuarios WHERE rol = 'admin' AND activo = true AND id != $1`,
        [req.params.id]
      );
      if (otrosAdmins.rows.length === 0) {
        return res.status(400).json({ error: 'No podés desactivar al único administrador activo.' });
      }
    }
  }

  const result = await pool.query(
    'UPDATE usuarios SET activo = $1 WHERE id = $2 RETURNING id',
    [activo, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });

  if (!activo) {
    // Misma baja lógica que DELETE /api/equipo/:id: la fila queda con
    // activo = false para que las tareas donde ya figuraba la sigan mostrando,
    // y se libera el usuario_id por si más adelante se la vuelve a sumar.
    await pool.query(
      'UPDATE equipo SET activo = false, usuario_id = NULL WHERE usuario_id = $1 AND activo = true',
      [req.params.id]
    );
  }

  await devolverUno(res, result.rows[0].id);
});

module.exports = router;
