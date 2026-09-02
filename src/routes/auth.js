const { crearRouter } = require('../lib/router');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');

const router = crearRouter();

// Anti fuerza-bruta: máximo 8 intentos de login por IP cada 15 minutos.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá unos minutos antes de volver a probar.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Faltan email o contraseña.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, nombre, rol, activo, permisos FROM usuarios WHERE email = $1',
      [String(email).toLowerCase().trim()]
    );
    const user = result.rows[0];

    // Mismo mensaje genérico tanto si el email no existe como si la contraseña está mal.
    const genericError = { error: 'Email o contraseña incorrectos.' };
    if (!user || !user.activo) {
      return res.status(401).json(genericError);
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json(genericError);
    }

    req.session.userId = user.id;
    req.session.rol = user.rol;
    req.session.nombre = user.nombre;
    req.session.permisos = user.permisos || {};

    await pool.query('UPDATE usuarios SET ultimo_login = now() WHERE id = $1', [user.id]);

    res.json({ id: user.id, email: user.email, nombre: user.nombre, rol: user.rol, permisos: user.permisos || {} });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  const result = await pool.query(
    'SELECT email, nombre, rol, permisos, activo FROM usuarios WHERE id = $1',
    [req.session.userId]
  );
  const user = result.rows[0];
  if (!user || !user.activo) {
    return req.session.destroy(() => res.status(401).json({ error: 'Tu cuenta ya no está activa.' }));
  }
  // Se refrescan desde la base: si un admin te cambia los permisos, no hace
  // falta que cierres sesión para que apliquen.
  req.session.rol = user.rol;
  req.session.nombre = user.nombre;
  req.session.permisos = user.permisos || {};

  res.json({
    id: req.session.userId,
    nombre: user.nombre,
    rol: user.rol,
    permisos: user.permisos || {},
    email: user.email,
  });
});

// Cambiar el propio email y/o contraseña. Siempre pide la contraseña actual
// para confirmar, incluso solo para cambiar el email.
router.put('/perfil', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  const { email, password_actual, password_nueva } = req.body || {};
  if (!password_actual) {
    return res.status(400).json({ error: 'Ingresá tu contraseña actual para confirmar los cambios.' });
  }
  if (password_nueva && password_nueva.length < 10) {
    return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 10 caracteres.' });
  }

  const result = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [req.session.userId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const ok = await bcrypt.compare(password_actual, result.rows[0].password_hash);
  // 400 y no 401: un 401 hace que ckFetch() interprete "sesión vencida" y redirija al login.
  if (!ok) return res.status(400).json({ error: 'La contraseña actual no es correcta.' });

  const nuevoEmail = email ? String(email).toLowerCase().trim() : null;
  const nuevoHash = password_nueva ? await bcrypt.hash(password_nueva, 12) : null;

  try {
    await pool.query(
      `UPDATE usuarios SET
         email = COALESCE($1, email),
         password_hash = COALESCE($2, password_hash)
       WHERE id = $3`,
      [nuevoEmail, nuevoHash, req.session.userId]
    );
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese email ya lo usa otro usuario.' });
    throw err;
  }

  res.json({ ok: true });
});

module.exports = router;
