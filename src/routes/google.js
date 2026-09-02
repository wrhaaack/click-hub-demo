// Google Calendar: conectar la agenda del estudio (solo admin) y manejar sus
// eventos (cualquiera con Calendario en "full").
//
// Ver src/lib/google.js para el porqué del modelo de una sola agenda compartida.

const { crearRouter } = require('../lib/router');
const { requireAuth, requireAdmin, requireSectionAccess, tieneAcceso } = require('../middleware/auth');
const { avisarAlEquipo } = require('../lib/notificaciones');
const g = require('../lib/google');

const router = crearRouter();
router.use(requireAuth);

const LINK = '/hub.html#calendario';
// Las horas se mandan a Google con la zona del estudio. Si algún día trabajan
// desde otro huso, se cambia con la variable TZ.
const ZONA = process.env.TZ_ESTUDIO || 'America/Argentina/Buenos_Aires';

// Cuando la conexión caducó no es un problema de Google ni del pedido: es que
// alguien tiene que reconectar. Se devuelve 409 para que la pantalla lo pueda
// distinguir de un error cualquiera.
function responderError(res, err, queHacia) {
  if (err.caducado) return res.status(409).json({ error: err.message, caducado: true });
  if (err.status === 404 || err.status === 410) {
    return res.status(404).json({ error: 'Ese evento ya no está en la agenda.' });
  }
  console.error('Google Calendar (' + queHacia + '):', err.message);
  return res.status(502).json({ error: 'Google rechazó la operación: ' + err.message });
}

function fechaValida(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
}
function horaValida(v) {
  return v === '' || v === undefined || v === null || /^\d{2}:\d{2}$/.test(String(v));
}

// Estado de la conexión. Lo consulta el hub al arrancar para saber si mostrar
// los eventos o el cartel de "todavía no está conectado".
router.get('/estado', async (req, res) => {
  const cuenta = await g.leerConexion();
  res.json({
    configurado: g.estaConfigurado(),   // ¿están las credenciales en el .env?
    conectado: !!cuenta,
    email: cuenta ? cuenta.email : null,
    calendarioId: cuenta ? cuenta.calendario_id : null,
    conectadoEn: cuenta ? cuenta.conectado_en : null,
    puedeConectar: req.session.rol === 'admin',
    puedeEditarEventos: tieneAcceso(req.session, 'calendario', 'full'),
  });
});

// ---------------------------------------------------------------- conexión
// Conectar y desconectar la agenda es configuración del estudio: solo admin.

router.get('/conectar', requireAdmin, async (req, res) => {
  if (!g.estaConfigurado()) {
    return res.status(400).json({
      error: 'Faltan las credenciales de Google. Cargá GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET '
        + 'y GOOGLE_REDIRECT_URI (ver DESPLIEGUE.md).',
    });
  }
  // El "state" evita que alguien nos haga volver de un consentimiento que no
  // pedimos: se guarda en la sesión y se compara al volver.
  const estado = require('crypto').randomBytes(16).toString('hex');
  req.session.googleEstado = estado;
  res.json({ url: g.urlDeConsentimiento(estado) });
});

// Acá vuelve Google después de que el admin acepta. Es una pantalla, no una
// llamada de la API: responde HTML.
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const volver = (mensaje, ok) => res.send(
    `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
     <title>Google Calendar</title>
     <style>body{font-family:system-ui,sans-serif;background:#F5F2EE;color:#1A1714;
     display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
     .c{background:#fff;border-radius:10px;padding:28px 32px;max-width:420px;text-align:center;
     box-shadow:0 4px 20px rgba(0,0,0,.08)}a{color:#7A6149}</style></head>
     <body><div class="c"><p>${mensaje}</p>
     <p><a href="/hub.html#calendario">Volver al hub</a></p></div></body></html>`
  );

  if (error) return volver('Google no autorizó la conexión: ' + String(error) + '.');
  if (!req.session || req.session.rol !== 'admin') return volver('Esta acción es solo para administradores.');
  if (!state || state !== req.session.googleEstado) {
    return volver('El pedido de conexión no coincide con el que empezaste. Probá de nuevo desde el hub.');
  }
  delete req.session.googleEstado;
  if (!code) return volver('Google no devolvió el código de autorización.');

  try {
    const tokens = await g.canjearCodigo(String(code));
    if (!tokens.refresh_token) {
      // Sin refresh_token la conexión dura una hora. Pasa cuando la cuenta ya
      // había autorizado antes; se resuelve revocando el acceso y reconectando.
      const previa = await g.leerConexion();
      if (!previa || !previa.refresh_token) {
        return volver('Google no mandó el permiso de largo plazo. Entrá a '
          + '<a href="https://myaccount.google.com/permissions" target="_blank">los permisos de tu cuenta</a>, '
          + 'quitale el acceso a Click Hub y volvé a conectar.');
      }
    }
    const email = await g.emailDeLaCuenta(tokens.access_token);
    await g.guardarConexion(req.session, tokens, email);
    volver('Listo: la agenda de <strong>' + (email || 'Google') + '</strong> quedó conectada.');
  } catch (err) {
    console.error('Error conectando Google Calendar:', err);
    volver('No se pudo completar la conexión: ' + err.message);
  }
});

router.delete('/conexion', requireAdmin, async (req, res) => {
  await g.desconectar();
  res.json({ ok: true });
});

// Qué agendas tiene disponibles la cuenta conectada, y cuál usa el estudio.
router.get('/calendarios', requireAdmin, async (req, res) => {
  const cuenta = await g.leerConexion();
  if (!cuenta) return res.status(400).json({ error: 'No hay ninguna cuenta de Google conectada.' });
  res.json(await g.listarCalendarios());
});

router.put('/calendario', requireAdmin, async (req, res) => {
  const id = String((req.body || {}).calendarioId || '').trim();
  if (!id) return res.status(400).json({ error: 'Falta el calendario.' });
  await g.elegirCalendario(id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- eventos

router.get('/eventos', requireSectionAccess('calendario', 'limitado'), async (req, res) => {
  const { desde, hasta } = req.query;
  if (!fechaValida(desde) || !fechaValida(hasta)) {
    return res.status(400).json({ error: 'Faltan las fechas desde/hasta (YYYY-MM-DD).' });
  }
  const cuenta = await g.leerConexion();
  if (!cuenta) return res.json([]);          // sin conectar no es un error: no hay eventos
  try {
    res.json(await g.listarEventos(desde, hasta));
  } catch (err) {
    responderError(res, err, 'leyendo los eventos');
  }
});

function leerEvento(body) {
  return {
    titulo: String((body || {}).titulo || '').trim(),
    descripcion: String((body || {}).descripcion || '').trim(),
    fecha: (body || {}).fecha,
    horaInicio: (body || {}).horaInicio || '',
    horaFin: (body || {}).horaFin || '',
  };
}

function validar(datos) {
  if (!datos.titulo) return 'Falta el título del evento.';
  if (!fechaValida(datos.fecha)) return 'Falta la fecha del evento.';
  if (!horaValida(datos.horaInicio) || !horaValida(datos.horaFin)) return 'Las horas tienen que ser HH:MM.';
  if (datos.horaInicio && datos.horaFin && datos.horaFin <= datos.horaInicio) {
    return 'La hora de fin tiene que ser posterior a la de inicio.';
  }
  return null;
}

router.post('/eventos', requireSectionAccess('calendario', 'full'), async (req, res) => {
  const datos = leerEvento(req.body);
  const mal = validar(datos);
  if (mal) return res.status(400).json({ error: mal });
  if (!(await g.leerConexion())) {
    return res.status(400).json({ error: 'Todavía no hay ninguna agenda de Google conectada.' });
  }
  try {
    const evento = await g.crearEvento(datos, ZONA);
    await avisarAlEquipo(
      req.session, 'evento_nuevo',
      `${req.session.nombre} agregó el evento "${evento.titulo}" (${evento.fecha.slice(8)}/${evento.fecha.slice(5, 7)})`,
      LINK
    );
    res.status(201).json(evento);
  } catch (err) {
    responderError(res, err, 'creando un evento');
  }
});

router.put('/eventos/:id', requireSectionAccess('calendario', 'full'), async (req, res) => {
  const datos = leerEvento(req.body);
  const mal = validar(datos);
  if (mal) return res.status(400).json({ error: mal });
  try {
    const evento = await g.editarEvento(req.params.id, datos, ZONA);
    await avisarAlEquipo(
      req.session, 'evento_editado',
      `${req.session.nombre} editó el evento "${evento.titulo}"`,
      LINK
    );
    res.json(evento);
  } catch (err) {
    responderError(res, err, 'editando un evento');
  }
});

router.delete('/eventos/:id', requireSectionAccess('calendario', 'full'), async (req, res) => {
  const titulo = String((req.query.titulo || '')).trim();
  try {
    await g.borrarEvento(req.params.id);
    await avisarAlEquipo(
      req.session, 'evento_borrado',
      `${req.session.nombre} eliminó el evento ${titulo ? '"' + titulo + '"' : 'de la agenda'}`,
      LINK
    );
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err, 'borrando un evento');
  }
});

module.exports = router;
