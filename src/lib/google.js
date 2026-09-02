// Conexión con Google Calendar.
//
// El modelo es: UNA agenda del estudio, que un administrador conecta una sola
// vez. A partir de ahí, cualquiera del hub con permiso "full" en Calendario crea,
// edita y borra eventos ahí, sin que cada persona tenga que dar permisos sobre su
// cuenta de Google. Quién hizo cada cosa queda registrado del lado del hub, en la
// tabla de actividad.
//
// No se usa la librería oficial de Google: son cuatro llamadas HTTP y el paquete
// pesa bastante. Node 18+ ya trae fetch.
//
// Hace falta configurar en el .env (ver DESPLIEGUE.md):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

const { pool } = require('../db');

// Las direcciones de Google se pueden apuntar a otro lado con GOOGLE_BASE_*.
// Sirve para probar toda la ida y vuelta contra un servidor de mentira, sin
// depender de credenciales reales. En producción no se define ninguna y quedan
// las de Google.
const AUTH_URL = process.env.GOOGLE_BASE_AUTH || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = process.env.GOOGLE_BASE_TOKEN || 'https://oauth2.googleapis.com/token';
const API = process.env.GOOGLE_BASE_API || 'https://www.googleapis.com/calendar/v3';
const USERINFO = process.env.GOOGLE_BASE_USERINFO || 'https://www.googleapis.com/oauth2/v2/userinfo';

// calendar.events alcanza para crear/editar/borrar; no pedimos más que eso.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

function estaConfigurado() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

function urlDeConsentimiento(estado) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    // offline + consent son los que hacen que Google mande el refresh_token.
    // Sin refresh_token la conexión se muere en una hora y hay que reconectar.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: estado,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function pedirTokens(cuerpo) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(cuerpo).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error('Google rechazó la petición de token: ' + (data.error_description || data.error || res.status));
    // El código seco ('invalid_grant', 'invalid_client'...) es lo estable: la
    // descripción es texto para humanos y Google la cambia cuando quiere.
    err.codigo = data.error || null;
    throw err;
  }
  return data;
}

// Paso final del login con Google: se cambia el "code" de la URL por los tokens.
async function canjearCodigo(code) {
  return pedirTokens({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });
}

async function emailDeLaCuenta(accessToken) {
  const res = await fetch(USERINFO, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.email || null;
}

async function guardarConexion(session, tokens, email) {
  await pool.query(
    `INSERT INTO google_cuenta (id, email, access_token, refresh_token, expira_en, conectado_por, conectado_en)
     VALUES (1, $1, $2, $3, now() + ($4 || ' seconds')::interval, $5, now())
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       access_token = EXCLUDED.access_token,
       -- Google solo manda refresh_token la primera vez: si ahora no vino, se
       -- conserva el que ya teníamos en vez de pisarlo con NULL.
       refresh_token = COALESCE(EXCLUDED.refresh_token, google_cuenta.refresh_token),
       expira_en = EXCLUDED.expira_en,
       conectado_por = EXCLUDED.conectado_por,
       conectado_en = now()`,
    [email, tokens.access_token, tokens.refresh_token || null, String(tokens.expires_in || 3600), session.userId]
  );
}

async function leerConexion() {
  const r = await pool.query(
    `SELECT email, calendario_id, access_token, refresh_token, conectado_por,
            expira_en, (expira_en < now() + interval '2 minutes') AS vencido,
            to_char(conectado_en, 'DD/MM/YYYY HH24:MI') AS conectado_en
     FROM google_cuenta WHERE id = 1`
  );
  return r.rows[0] || null;
}

async function desconectar() {
  await pool.query('DELETE FROM google_cuenta WHERE id = 1');
}

// Devuelve un access_token usable, renovándolo si está por vencer.
async function tokenVigente() {
  const cuenta = await leerConexion();
  if (!cuenta) return null;
  if (!cuenta.vencido && cuenta.access_token) return cuenta;

  if (!cuenta.refresh_token) {
    const e = new Error('La conexión con Google caducó. Un administrador tiene que volver a conectar la agenda.');
    e.caducado = true;
    throw e;
  }

  let tokens;
  try {
    tokens = await pedirTokens({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: cuenta.refresh_token,
      grant_type: 'refresh_token',
    });
  } catch (err) {
    // invalid_grant = Google ya no acepta ese refresh token. Pasa cuando le
    // quitaron el acceso a la app desde la cuenta, o cuando el proyecto sigue en
    // "modo prueba" en Google Cloud, donde los permisos caducan a los 7 días.
    // No es un error para mostrar crudo: hay que decirle a alguien que reconecte.
    if (err.codigo === 'invalid_grant') {
      await pool.query('UPDATE google_cuenta SET access_token = NULL, refresh_token = NULL WHERE id = 1');
      const e = new Error(
        'La conexión con Google caducó. Un administrador tiene que volver a conectar la agenda. '
        + 'Si esto pasa cada pocos días, es porque el proyecto de Google Cloud sigue en modo prueba: '
        + 'publicalo para que la conexión deje de vencerse (ver DESPLIEGUE.md).'
      );
      e.caducado = true;
      throw e;
    }
    throw err;
  }
  await pool.query(
    `UPDATE google_cuenta
     SET access_token = $1, expira_en = now() + ($2 || ' seconds')::interval
     WHERE id = 1`,
    [tokens.access_token, String(tokens.expires_in || 3600)]
  );
  return { ...cuenta, access_token: tokens.access_token, vencido: false };
}

// Llamada genérica a la API de Calendar, ya con el token puesto.
async function llamar(ruta, opciones = {}) {
  const cuenta = await tokenVigente();
  if (!cuenta) throw new Error('No hay ninguna cuenta de Google conectada.');

  const res = await fetch(API + ruta, {
    ...opciones,
    headers: {
      Authorization: 'Bearer ' + cuenta.access_token,
      'Content-Type': 'application/json',
      ...(opciones.headers || {}),
    },
  });
  if (res.status === 204) return {};                 // los DELETE no devuelven cuerpo
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = (data.error && data.error.message) || res.statusText || String(res.status);
    const err = new Error(detalle);
    err.status = res.status;
    throw err;
  }
  return data;
}

function idCalendario(cuenta) {
  return encodeURIComponent((cuenta && cuenta.calendario_id) || 'primary');
}

// ---------------------------------------------------------------- eventos

// Pasa un evento de Google a la forma que dibuja el hub. Google usa "date" para
// los eventos de día completo y "dateTime" para los que tienen hora.
function aFormatoHub(ev) {
  const arranca = ev.start || {};
  const termina = ev.end || {};
  const todoElDia = !!arranca.date;
  return {
    id: ev.id,
    titulo: ev.summary || '(sin título)',
    descripcion: ev.description || '',
    fecha: todoElDia ? arranca.date : String(arranca.dateTime || '').slice(0, 10),
    horaInicio: todoElDia ? '' : String(arranca.dateTime || '').slice(11, 16),
    horaFin: todoElDia ? '' : String(termina.dateTime || '').slice(11, 16),
    todoElDia,
    link: ev.htmlLink || '',
  };
}

// Y al revés. Sin hora se manda como evento de día completo; con hora, Google
// necesita saber en qué zona horaria interpretarla.
function aFormatoGoogle(datos, zona) {
  const cuerpo = {
    summary: String(datos.titulo || '').trim(),
    description: String(datos.descripcion || '').trim() || undefined,
  };
  if (datos.horaInicio) {
    const fin = datos.horaFin || sumarUnaHora(datos.horaInicio);
    cuerpo.start = { dateTime: `${datos.fecha}T${datos.horaInicio}:00`, timeZone: zona };
    cuerpo.end = { dateTime: `${datos.fecha}T${fin}:00`, timeZone: zona };
  } else {
    // En los eventos de día completo Google toma "end" como exclusivo: para que
    // dure ese día hay que poner el día siguiente.
    cuerpo.start = { date: datos.fecha };
    cuerpo.end = { date: diaSiguiente(datos.fecha) };
  }
  return cuerpo;
}

function sumarUnaHora(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return String((h + 1) % 24).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function diaSiguiente(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function listarEventos(desde, hasta) {
  const cuenta = await tokenVigente();
  if (!cuenta) return [];
  const params = new URLSearchParams({
    timeMin: desde + 'T00:00:00Z',
    timeMax: hasta + 'T23:59:59Z',
    singleEvents: 'true',      // las series repetidas se expanden una por una
    orderBy: 'startTime',
    maxResults: '250',
  });
  const data = await llamar(`/calendars/${idCalendario(cuenta)}/events?${params}`);
  return (data.items || []).filter((e) => e.status !== 'cancelled').map(aFormatoHub);
}

async function crearEvento(datos, zona) {
  const cuenta = await tokenVigente();
  const data = await llamar(`/calendars/${idCalendario(cuenta)}/events`, {
    method: 'POST',
    body: JSON.stringify(aFormatoGoogle(datos, zona)),
  });
  return aFormatoHub(data);
}

async function editarEvento(id, datos, zona) {
  const cuenta = await tokenVigente();
  const data = await llamar(`/calendars/${idCalendario(cuenta)}/events/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(aFormatoGoogle(datos, zona)),
  });
  return aFormatoHub(data);
}

async function borrarEvento(id) {
  const cuenta = await tokenVigente();
  await llamar(`/calendars/${idCalendario(cuenta)}/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Las agendas a las que tiene acceso la cuenta conectada, para poder elegir
// cuál usa el estudio en vez de quedarse siempre con la principal.
async function listarCalendarios() {
  const data = await llamar('/users/me/calendarList?minAccessRole=writer&maxResults=100');
  return (data.items || []).map((c) => ({
    id: c.id,
    nombre: c.summary,
    principal: !!c.primary,
  }));
}

async function elegirCalendario(id) {
  await pool.query('UPDATE google_cuenta SET calendario_id = $1 WHERE id = 1', [id]);
}

module.exports = {
  estaConfigurado,
  urlDeConsentimiento,
  canjearCodigo,
  emailDeLaCuenta,
  guardarConexion,
  leerConexion,
  desconectar,
  listarEventos,
  crearEvento,
  editarEvento,
  borrarEvento,
  listarCalendarios,
  elegirCalendario,
  aFormatoHub,
  aFormatoGoogle,
  diaSiguiente,
  sumarUnaHora,
};
