require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./src/db');
const { revisarAlertas } = require('./src/lib/alertas');
const { prepararBase } = require('./src/lib/arranque');

// Sin estas dos la app no puede funcionar, así que no arranca: fallar acá pone
// el motivo en el primer renglón del log, que es donde uno mira.
const FALTAN = ['DATABASE_URL', 'SESSION_SECRET'].filter((v) => !process.env[v]);
if (FALTAN.length) {
  console.error(`\nNo puedo arrancar: falta ${FALTAN.join(' y ')}.`);
  if (FALTAN.includes('DATABASE_URL')) {
    console.error('  DATABASE_URL    en tu compu, copiá .env.example a .env. En Railway, ver DESPLIEGUE.md.');
  }
  if (FALTAN.includes('SESSION_SECRET')) {
    console.error(`  SESSION_SECRET  generá uno con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
  }
  process.exit(1);
}

// La app compilada (npm run build). Sin ella no hay pantalla que servir.
const DIST = path.join(__dirname, 'web', 'dist');
const INDEX = path.join(DIST, 'index.html');
if (!fs.existsSync(INDEX)) {
  console.error('\nNo encuentro la app compilada (web/dist). Corré "npm run build" antes de "npm start".');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // Railway está detrás de un proxy; necesario para cookies "secure"
app.use(express.json({ limit: '1mb' }));
app.use(session({
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // solo por HTTPS en producción
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8, // 8 horas
  },
}));

// ---------- API ----------
// Cada archivo de src/routes es un tema, y cada uno pide sesión y el permiso de
// su sección. La protección real de los datos vive acá, no en la pantalla.
const RUTAS = ['auth', 'estado', 'dashboard', 'clientes', 'tareas', 'equipo', 'roles', 'brainstorm',
  'fechas', 'eventos', 'etapas', 'estudio', 'notificaciones', 'usuarios', 'pautas', 'tarifas'];
RUTAS.forEach((r) => app.use(`/api/${r}`, require(`./src/routes/${r}`)));
app.use('/api', (req, res) => res.status(404).json({ error: 'Esa ruta no existe.' }));

// ---------- La app ----------
// Los archivos compilados llevan un hash en el nombre, así que se pueden
// cachear para siempre. El index no: es el que dice qué archivos pedir.
app.use('/app/assets', express.static(path.join(DIST, 'assets'), { immutable: true, maxAge: '1y' }));
// Cualquier otra ruta de /app es una pantalla: decide el router de Vue. Sin
// sesión, todo lleva al login (la única pantalla pública).
app.get(['/app', '/app/*'], (req, res) => {
  const conSesion = !!(req.session && req.session.userId);
  const esLogin = req.path === '/app/login';
  if (!conSesion && !esLogin) return res.redirect('/app/login');
  if (conSesion && esLogin) return res.redirect('/app/');
  res.set('Cache-Control', 'no-cache');
  res.sendFile(INDEX);
});
app.get('/', (req, res) => res.redirect('/app/'));

// Cualquier error que se escape de una ruta async termina acá y no tira el
// proceso abajo. El detalle va al log, al navegador solo un aviso.
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error interno. Probá de nuevo.' });
});

// Primero se deja la base lista (esquema y, si hace falta, el primer admin) y
// recién después se abre el puerto.
const PORT = process.env.PORT || 3000;
prepararBase()
  .then(() => app.listen(PORT, () => console.log(`Click Hub corriendo en http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('\nNo pude preparar la base, así que no arranco:\n  ' + err.message);
    console.error('Casi siempre es DATABASE_URL: apunta a una base que no existe. Ver DESPLIEGUE.md.');
    process.exit(1);
  });

// Alertas automáticas (tareas vencidas, clientes sin planificar): una vez al
// arrancar, con margen para que la base esté lista, y después una vez por día.
const UN_DIA_MS = 24 * 60 * 60 * 1000;
const revisar = () => revisarAlertas().catch((err) => console.error('Error revisando alertas:', err));
setTimeout(() => { revisar(); setInterval(revisar, UN_DIA_MS); }, 30 * 1000);
