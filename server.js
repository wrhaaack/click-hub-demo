require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./src/db');

const authRoutes = require('./src/routes/auth');
const estadoRoutes = require('./src/routes/estado');
const dashboardRoutes = require('./src/routes/dashboard');
const clientesRoutes = require('./src/routes/clientes');
const tareasRoutes = require('./src/routes/tareas');
const equipoRoutes = require('./src/routes/equipo');
const rolesRoutes = require('./src/routes/roles');
const brainstormRoutes = require('./src/routes/brainstorm');
const fechasRoutes = require('./src/routes/fechas');
const estudioRoutes = require('./src/routes/estudio');
const notificacionesRoutes = require('./src/routes/notificaciones');
const usuariosRoutes = require('./src/routes/usuarios');

const { tieneAcceso } = require('./src/middleware/auth');
const { revisarAlertas } = require('./src/lib/alertas');

const app = express();
app.set('trust proxy', 1); // Railway está detrás de un proxy; necesario para cookies "secure"

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // cookies solo por HTTPS en producción
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8, // 8 horas de sesión
    },
  })
);

// ---------- Rutas de la API ----------
app.use('/api/auth', authRoutes);
app.use('/api/estado', estadoRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/tareas', tareasRoutes);
app.use('/api/equipo', equipoRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/brainstorm', brainstormRoutes);
app.use('/api/fechas', fechasRoutes);
app.use('/api/estudio', estudioRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api/usuarios', usuariosRoutes);

// ---------- Páginas públicas (sin login) ----------
// Solo el login, el CSS y las imágenes. Nada de datos.
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Páginas protegidas (requieren sesión iniciada) ----------
// La protección real de los DATOS vive en la API (arriba); esto es solo la
// pantalla, para que alguien sin sesión ni siquiera vea la interfaz.
function servePrivate(file, seccion, nivelMinimo = 'limitado') {
  return (req, res) => {
    if (!req.session || !req.session.userId) {
      return res.redirect('/login.html');
    }
    if (seccion && !tieneAcceso(req.session, seccion, nivelMinimo)) {
      return res.redirect('/hub.html');
    }
    res.sendFile(path.join(__dirname, 'views', file));
  };
}

// El hub no tiene sección propia: lo abre cualquiera con sesión y adentro cada
// vista aparece o no según los permisos (ver el menú lateral en hub.html).
app.get('/hub.html', servePrivate('hub.html'));
app.get('/usuarios.html', servePrivate('usuarios.html', 'usuarios', 'full'));

app.get('/', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/hub.html');
  res.redirect('/login.html');
});

// Cualquier error que se escape de una ruta async termina acá y no tira el
// proceso abajo. El detalle va al log del servidor, al navegador solo un aviso.
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error interno. Probá de nuevo.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Click Hub corriendo en el puerto ${PORT}`);
});

// Alertas automáticas (tareas vencidas + clientes sin planificar): se revisan
// una vez al arrancar, con un margen para que la base esté lista, y después una
// vez por día.
const UN_DIA_MS = 24 * 60 * 60 * 1000;
setTimeout(() => {
  revisarAlertas().catch((err) => console.error('Error revisando alertas:', err));
  setInterval(() => {
    revisarAlertas().catch((err) => console.error('Error revisando alertas:', err));
  }, UN_DIA_MS);
}, 30 * 1000);
