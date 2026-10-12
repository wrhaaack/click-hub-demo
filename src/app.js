// La aplicación de Express: sesiones y /api. No abre ningún puerto ni sirve la
// pantalla, así se puede usar igual desde dos lugares:
//   - server.js       servidor propio (tu compu, Railway): suma la pantalla y el puerto
//   - api/index.js    función de Vercel: la pantalla la sirve Vercel desde web/dist
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./db');
const { prepararBase } = require('./lib/arranque');
const { revisarAlertas } = require('./lib/alertas');

const FALTAN = ['DATABASE_URL', 'SESSION_SECRET'].filter((v) => !process.env[v]);
if (FALTAN.length) {
  // Sin estas dos no hay app posible: mejor fallar con el motivo a la vista.
  throw new Error(`falta ${FALTAN.join(' y ')} en las variables de entorno (ver DESPLIEGUE-VERCEL.md o EMPEZAR-ACA.md).`);
}

const enVercel = !!process.env.VERCEL;
const app = express();
app.set('trust proxy', 1); // detrás del proxy de Railway o Vercel; hace falta para cookies "secure"
app.use(express.json({ limit: '1mb' }));

// La base se prepara (esquema y primer admin) una sola vez por proceso, antes
// del primer pedido. En un servidor propio eso es al arrancar; en Vercel, la
// primera vez que se despierta cada instancia.
let lista = null;
app.use('/api', (req, res, next) => {
  lista = lista || prepararBase().catch((err) => { lista = null; throw err; });
  lista.then(() => next(), (err) => {
    console.error('No se pudo preparar la base:', err);
    res.status(503).json({ error: `No se pudo conectar con la base de datos: ${err.message}`, configuracion: true });
  });
});

app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    // La tabla la crea db/schema.sql: así no depende de que connect-pg-simple
    // encuentre su propio archivo .sql, que en Vercel no siempre viaja.
    createTableIfMissing: false,
    // En Vercel no hay proceso vivo para limpiar cada tanto: lo hace el cron.
    pruneSessionInterval: enVercel ? false : 15 * 60,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || enVercel, // solo por HTTPS
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8, // 8 horas
  },
}));

// ---------- Tareas programadas ----------
// Las alertas automáticas (tareas vencidas, clientes sin planificar) y la
// limpieza de sesiones vencidas. En Vercel las dispara el cron de vercel.json
// con el CRON_SECRET; en un servidor propio, server.js las llama solo.
async function tareasProgramadas() {
  await revisarAlertas();
  await pool.query('DELETE FROM session WHERE expire < now()');
}
app.get('/api/cron/diario', async (req, res, next) => {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.get('authorization') !== `Bearer ${secreto}`) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  try {
    await tareasProgramadas();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- API ----------
// Cada archivo de src/routes es un tema, y cada uno pide sesión y el permiso de
// su sección. La protección real de los datos vive acá, no en la pantalla.
const RUTAS = ['auth', 'estado', 'dashboard', 'clientes', 'tareas', 'equipo', 'roles', 'brainstorm',
  'fechas', 'eventos', 'etapas', 'estudio', 'notificaciones', 'usuarios', 'pautas', 'tarifas'];
RUTAS.forEach((r) => app.use(`/api/${r}`, require(`./routes/${r}`)));
app.use('/api', (req, res) => res.status(404).json({ error: 'Esa ruta no existe.' }));

// Cualquier error que se escape de una ruta async termina acá y no tira el
// proceso abajo. El detalle va al log, al navegador solo un aviso.
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error interno. Probá de nuevo.' });
});

module.exports = { app, prepararBase, tareasProgramadas };
