// GET /api/estado — todo lo que la app necesita para dibujarse, de una sola vez.
//
// La app pide todo de una al arrancar y después cada acción manda su propio
// pedido chico.
//
// Lo que el usuario no puede ver por permisos no se manda: si alguien tiene
// "sin acceso" a Clientes, sus datos no llegan ni siquiera al navegador.
//
// Todas las consultas salen EN PARALELO: con la base lejos (Neon, Railway por
// la red), cada una cuesta un viaje de ida y vuelta, y en fila se sumaban
// segundos de "Cargando…".

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, tieneAcceso, nivelDe, SECCIONES } = require('../middleware/auth');
const { todasLasTareas, todasLasPautas } = require('../lib/consultas');

const router = crearRouter();
router.use(requireAuth);

const filas = (sql) => pool.query(sql).then((r) => r.rows);
const nada = (valor) => Promise.resolve(valor);

router.get('/', async (req, res) => {
  const ses = req.session;
  const puede = (seccion, nivel = 'limitado') => tieneAcceso(ses, seccion, nivel);

  const permisos = {};
  Object.keys(SECCIONES).forEach((s) => { permisos[s] = nivelDe(ses, s); });

  // Casi todas las vistas nombran clientes (calendario, tareas, brainstorming).
  // Sin acceso a Clientes igual se manda la lista reducida — id, nombre y tipo —
  // para que esas pantallas no muestren filas anónimas.
  const veClientes = puede('clientes');
  const veNombres = veClientes || puede('calendario') || puede('delegacion') || puede('brainstorm');
  const veTareas = veClientes || puede('calendario') || puede('delegacion');

  const [roles, clientes, equipo, config, tareas, brainstorm, fechas, eventos, etapas, pautas] = await Promise.all([
    filas('SELECT nombre FROM roles ORDER BY orden ASC, id ASC'),
    veNombres ? filas(
      `SELECT id, nombre, COALESCE(ig,'') AS ig, COALESCE(contacto,'') AS contacto,
              COALESCE(tel,'') AS tel, links, COALESCE(notas,'') AS notas,
              a_pagar::float8 AS "aPagar", estado_pago AS "estadoPago",
              abonado::float8 AS abonado, tipo,
              to_char(proxima_actualizacion, 'YYYY-MM-DD') AS "proximaActualizacion",
              puntajes
       FROM clientes WHERE activo = true ORDER BY nombre ASC`
    ) : nada([]),
    (puede('equipo') || veTareas)
      ? filas(`SELECT id, nombre, COALESCE(rol, '') AS rol FROM equipo WHERE activo = true ORDER BY id ASC`)
      : nada([]),
    filas(`SELECT clave, valor FROM configuracion WHERE clave IN ('estudio', 'tarifas')`),
    veTareas ? todasLasTareas() : nada([]),
    puede('brainstorm')
      ? filas(`SELECT cliente_id, to_char(periodo, 'YYYY-MM') AS periodo, ideas, inspo FROM brainstorm`)
      : nada([]),
    veClientes ? filas(
      `SELECT id, cliente_id, to_char(periodo, 'YYYY-MM') AS periodo,
              to_char(fecha, 'YYYY-MM-DD') AS fecha, COALESCE(label,'') AS label
       FROM fechas_especiales ORDER BY orden ASC, id ASC`
    ) : nada([]),
    // Eventos y etapas viajan todos: son pocos y así se cambia de mes sin pedir nada.
    puede('calendario') ? filas(
      `SELECT id, titulo, to_char(desde, 'YYYY-MM-DD') AS desde,
              to_char(COALESCE(hasta, desde), 'YYYY-MM-DD') AS hasta,
              to_char(hora_inicio, 'HH24:MI') AS "horaInicio",
              to_char(hora_fin, 'HH24:MI') AS "horaFin",
              COALESCE(descripcion, '') AS descripcion, color, autor
       FROM eventos ORDER BY desde ASC, hora_inicio ASC NULLS FIRST`
    ) : nada([]),
    puede('calendario') ? filas(
      `SELECT id, cliente_id AS "clienteId", titulo,
              to_char(desde, 'YYYY-MM-DD') AS desde, to_char(hasta, 'YYYY-MM-DD') AS hasta,
              color, COALESCE(nota, '') AS nota
       FROM etapas ORDER BY desde ASC, id ASC`
    ) : nada([]),
    // La pauta es plata de clientes: va con Clientes.
    veClientes ? todasLasPautas() : nada([]),
  ]);

  // Sin acceso a Clientes, ni el contacto ni el cobro llegan al navegador.
  const clientesVisibles = veClientes ? clientes : clientes.map((c) => ({
    id: c.id, nombre: c.nombre, tipo: c.tipo, ig: '', contacto: '', tel: '', links: [], notas: '',
    aPagar: null, estadoPago: 'pendiente', abonado: null, proximaActualizacion: null, puntajes: {},
  }));

  // { '<cid>-YYYY-MM' | 'gen-YYYY-MM': {ideas, inspo} }
  const ideas = {};
  brainstorm.forEach((r) => {
    ideas[(r.cliente_id === null ? 'gen' : r.cliente_id) + '-' + r.periodo] = { ideas: r.ideas || [], inspo: r.inspo || [] };
  });

  // { 'fe-<cid>-YYYY-MM': [{id, fecha, label}] }
  const fechasEspeciales = {};
  fechas.forEach((r) => {
    const clave = 'fe-' + r.cliente_id + '-' + r.periodo;
    (fechasEspeciales[clave] ||= []).push({ id: r.id, fecha: r.fecha || '', label: r.label });
  });

  const conf = Object.fromEntries(config.map((r) => [r.clave, r.valor]));

  res.json({
    yo: {
      id: ses.userId,
      nombre: ses.nombre,
      rol: ses.rol,              // 'admin' o 'empleado' (el rol de login)
      rolNombre: ses.rolNombre,  // 'Editor', 'Diseñadora'... (de dónde hereda los permisos)
      permisos,
    },
    roles: roles.map((r) => r.nombre),
    clientes: clientesVisibles,
    tareas,
    equipo,
    ideas,
    fechasEspeciales,
    eventos,
    etapas,
    estudio: puede('estudio')
      ? (conf.estudio || { nombre: 'Click', ig: '', email: '', tel: '', wa: '', links: [], notas: '' })
      : null,
    // Las tarifas las necesita cualquiera que cargue una tarea (sugieren el
    // monto según el nivel).
    tarifas: conf.tarifas || null,
    pautas,
  });
});

module.exports = router;
