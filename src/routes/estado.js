// GET /api/estado — todo lo que el hub necesita para dibujarse, de una sola vez.
//
// Devuelve exactamente las mismas estructuras que antes vivían en localStorage
// (clientes, tareas, ideas, equipo, estudio, fechas), así que
// la pantalla no tuvo que cambiar de forma: solo cambió de dónde salen los datos.
//
// Lo que el usuario no puede ver por permisos no se manda: si alguien tiene
// "sin acceso" a Clientes, sus datos no llegan ni siquiera al navegador.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, tieneAcceso, nivelDe, SECCIONES } = require('../middleware/auth');
const { todasLasTareas } = require('../lib/consultas');

const router = crearRouter();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const ses = req.session;
  const puede = (seccion, nivel = 'limitado') => tieneAcceso(ses, seccion, nivel);

  const permisos = {};
  Object.keys(SECCIONES).forEach((s) => { permisos[s] = nivelDe(ses, s); });

  const [rolesRes, clientesRes, equipoRes, estudioRes] = await Promise.all([
    pool.query('SELECT nombre FROM roles ORDER BY orden ASC, id ASC'),
    pool.query(
      `SELECT id, nombre, COALESCE(ig,'') AS ig, COALESCE(contacto,'') AS contacto,
              COALESCE(tel,'') AS tel, links, COALESCE(notas,'') AS notas,
              a_pagar::float8 AS "aPagar", pagado
       FROM clientes WHERE activo = true ORDER BY nombre ASC`
    ),
    pool.query('SELECT id, nombre, COALESCE(rol, \'\') AS rol FROM equipo WHERE activo = true ORDER BY id ASC'),
    pool.query(`SELECT valor FROM configuracion WHERE clave = 'estudio'`),
  ]);

  // Casi todas las vistas nombran clientes (el calendario, la delegación, el
  // brainstorming). Sin acceso a Clientes igual se manda la lista reducida — id y nombre,
  // nada más — para que esas pantallas no queden mostrando filas anónimas. Los
  // datos de contacto, los links y las notas del cliente solo viajan con acceso.
  const veNombres = puede('clientes') || puede('calendario') || puede('delegacion')
    || puede('brainstorm');
  const clientesVisibles = puede('clientes')
    ? clientesRes.rows
    : (veNombres ? clientesRes.rows.map((c) => ({ id: c.id, nombre: c.nombre, ig: '', contacto: '', tel: '', links: [], notas: '', aPagar: null, pagado: false })) : []);

  // Tareas: se necesitan en Clientes, Calendario y Delegación. Si no tiene
  // acceso a ninguna de esas, no se mandan.
  const veTareas = puede('clientes') || puede('calendario') || puede('delegacion');
  const tareas = veTareas ? await todasLasTareas() : [];

  // ---------- Brainstorm: { '<cid>-YYYY-MM' | 'gen-YYYY-MM': {ideas, inspo} } ----------
  const ideas = {};
  if (puede('brainstorm')) {
    const bs = await pool.query(
      `SELECT cliente_id, to_char(periodo, 'YYYY-MM') AS periodo, ideas, inspo FROM brainstorm`
    );
    bs.rows.forEach((r) => {
      const clave = (r.cliente_id === null ? 'gen' : r.cliente_id) + '-' + r.periodo;
      ideas[clave] = { ideas: r.ideas || [], inspo: r.inspo || [] };
    });
  }

  // ---------- Fechas especiales: { 'fe-<cid>-YYYY-MM': [{fecha,label}] } ----------
  const fechasEspeciales = {};
  if (puede('clientes')) {
    const fe = await pool.query(
      `SELECT id, cliente_id, to_char(periodo, 'YYYY-MM') AS periodo,
              to_char(fecha, 'YYYY-MM-DD') AS fecha, COALESCE(label,'') AS label
       FROM fechas_especiales ORDER BY orden ASC, id ASC`
    );
    fe.rows.forEach((r) => {
      const clave = 'fe-' + r.cliente_id + '-' + r.periodo;
      if (!fechasEspeciales[clave]) fechasEspeciales[clave] = [];
      fechasEspeciales[clave].push({ id: r.id, fecha: r.fecha || '', label: r.label });
    });
  }

  // ---------- Eventos del calendario ----------
  // Viajan todos, como las fechas especiales: son pocos y así el hub puede
  // cambiar de mes sin volver a pedirlos.
  const eventos = puede('calendario')
    ? (await pool.query(
        `SELECT id, titulo, to_char(desde, 'YYYY-MM-DD') AS desde,
                to_char(COALESCE(hasta, desde), 'YYYY-MM-DD') AS hasta,
                to_char(hora_inicio, 'HH24:MI') AS "horaInicio",
                to_char(hora_fin, 'HH24:MI') AS "horaFin",
                COALESCE(descripcion, '') AS descripcion, color, autor
         FROM eventos ORDER BY desde ASC, hora_inicio ASC NULLS FIRST`
      )).rows
    : [];

  // ---------- Etapas: la planificación que se le muestra al cliente ----------
  // Van con Calendario, que es donde vive la pantalla. Viajan todas por lo mismo
  // que los eventos: son pocas y así se cambia de cliente y de mes sin pedir nada.
  const etapas = puede('calendario')
    ? (await pool.query(
        `SELECT id, cliente_id AS "clienteId", titulo,
                to_char(desde, 'YYYY-MM-DD') AS desde,
                to_char(hasta, 'YYYY-MM-DD') AS hasta,
                color, COALESCE(nota, '') AS nota
         FROM etapas ORDER BY desde ASC, id ASC`
      )).rows
    : [];

  const estudio = puede('estudio')
    ? (estudioRes.rows[0]?.valor || { nombre: 'Click', ig: '', email: '', tel: '', wa: '', links: [], notas: '' })
    : null;

  res.json({
    yo: {
      id: ses.userId,
      nombre: ses.nombre,
      rol: ses.rol,              // 'admin' o 'empleado' (el rol de login)
      rolNombre: ses.rolNombre,  // 'Editor', 'Diseñadora'... (de dónde hereda los permisos)
      permisos,
    },
    roles: rolesRes.rows.map((r) => r.nombre),
    clientes: clientesVisibles,
    tareas,
    // El equipo también viaja para quien ve tareas: sin la lista, las pastillas
    // de "asignado a" quedarían vacías y no se podría asignar a nadie.
    equipo: (puede('equipo') || veTareas) ? equipoRes.rows : [],
    ideas,
    fechasEspeciales,
    eventos,
    etapas,
    estudio,
  });
});

module.exports = router;
