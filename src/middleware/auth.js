// Login y permisos.
//
// Cómo se decide qué puede hacer alguien, en orden:
//   1. Si es admin, puede todo. Punto.
//   2. Si no, se mira el rol que tiene asignado (Editor, Diseñadora, CM...) y se
//      toman los permisos de ese rol.
//   3. Si además tiene una excepción cargada para esa sección puntual, esa
//      excepción pisa lo que dice el rol.
//   4. Si no hay ni rol ni excepción, no tiene acceso.
//
// La idea es no configurar diez desplegables por persona: le asignás el rol y
// hereda. Las excepciones son para los casos sueltos.

const { pool } = require('../db');

const SECCIONES = {
  // sección          niveles permitidos
  dashboard:     ['full', 'sin_acceso'],
  clientes:      ['full', 'limitado', 'sin_acceso'],
  tareas:        ['full', 'limitado', 'sin_acceso'],
  // 'limitado' ve la grilla del mes; 'full' además crea, edita y borra eventos
  // en la agenda de Google que tenga conectada el estudio.
  calendario:    ['full', 'limitado', 'sin_acceso'],
  brainstorm:    ['full', 'limitado', 'sin_acceso'],
  delegacion:    ['full', 'sin_acceso'],
  historial:     ['full', 'sin_acceso'],
  comunicacion:  ['full', 'limitado', 'sin_acceso'],
  // Equipo y Usuarios son admin-only (ver SECCIONES_SOLO_ADMIN más abajo): se
  // dejan acá para que el admin las tenga en 'full' en su mapa de permisos.
  equipo:        ['full', 'sin_acceso'],
  estudio:       ['full', 'limitado', 'sin_acceso'],
  usuarios:      ['full', 'sin_acceso'],
};

const NIVEL_RANGO = { sin_acceso: 0, limitado: 1, full: 2 };

// Secciones que no se otorgan ni por rol ni por excepción: son del admin y de
// nadie más. La lista vive acá para que roles.js y usuarios.js apliquen la misma
// regla en vez de repetir el caso especial cada uno por su lado.
//
// permisosEfectivos las fuerza a sin_acceso ADEMÁS de que al guardar se limpien.
// Es a propósito: si en la base quedó un 'equipo: full' de cuando la sección era
// configurable, se ignora desde el primer request, sin necesidad de migrar nada
// ni de que alguien vuelva a guardar los roles.
const SECCIONES_SOLO_ADMIN = ['usuarios', 'equipo'];

// Acciones que son solamente del admin, pase lo que pase con los permisos por
// sección. Son las estructurales (cambiar quién puede qué) y las destructivas
// (borrar de verdad). Se listan acá para que estén todas juntas y a la vista.
//
// Ojo con "roles": como los roles llevan los permisos, dejar que los edite
// alguien que no sea admin sería darle la llave para subirse los permisos a sí
// mismo. Por eso es admin-only y no un permiso más de la sección Equipo.
const SOLO_ADMIN = [
  'Crear, editar y desactivar usuarios, y resetear sus contraseñas',
  'Crear, renombrar y borrar roles, y definir qué permisos lleva cada uno',
  'Ver la sección Equipo, y agregar, editar y dar de baja a sus integrantes',
  'Dar de baja clientes',
  'Eliminar tareas',
  'Borrar mensajes y notas escritos por otra persona',
];

function requireAdmin(req, res, next) {
  if (!req.session || req.session.rol !== 'admin') {
    return res.status(403).json({ error: 'Esta acción es solo para administradores.' });
  }
  next();
}

// Combina los permisos del rol con las excepciones de la persona.
// Devuelve el mapa completo: una entrada por sección.
function permisosEfectivos({ rol, permisosRol, permisosPropios }) {
  const out = {};
  for (const seccion of Object.keys(SECCIONES)) {
    if (rol === 'admin') { out[seccion] = 'full'; continue; }
    if (SECCIONES_SOLO_ADMIN.includes(seccion)) { out[seccion] = 'sin_acceso'; continue; }
    const excepcion = permisosPropios && permisosPropios[seccion];
    const delRol = permisosRol && permisosRol[seccion];
    const nivel = excepcion || delRol || 'sin_acceso';
    out[seccion] = SECCIONES[seccion].includes(nivel) ? nivel : 'sin_acceso';
  }
  return out;
}

// Nivel efectivo de una sesión sobre una sección. requireAuth ya dejó el mapa
// calculado en la sesión, así que acá solo se lee.
function nivelDe(session, seccion) {
  if (!session || !session.userId) return 'sin_acceso';
  if (session.rol === 'admin') return 'full';
  return (session.permisos || {})[seccion] || 'sin_acceso';
}

function tieneAcceso(session, seccion, nivelMinimo = 'limitado') {
  return (NIVEL_RANGO[nivelDe(session, seccion)] ?? 0) >= NIVEL_RANGO[nivelMinimo];
}

// Cada pedido vuelve a leer al usuario de la base en vez de creerle a la sesión.
// Es una consulta por índice primario, y compra tres cosas que sin esto no pasan:
//   - Desactivar a alguien le corta el acceso en el momento, no cuando se le
//     vence la sesión ocho horas después.
//   - Cambiarle el rol o los permisos aplica enseguida, incluso si tiene la
//     pantalla abierta desde antes.
//   - Cambiar los permisos de un rol alcanza a todos los que lo tienen, sin que
//     nadie tenga que volver a entrar.
async function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'No autenticado. Iniciá sesión de nuevo.' });
  }
  const result = await pool.query(
    `SELECT u.nombre, u.rol, u.activo, u.permisos, u.rol_id,
            r.nombre AS rol_nombre, r.permisos AS permisos_rol
     FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [req.session.userId]
  );
  const usuario = result.rows[0];
  if (!usuario || !usuario.activo) {
    return req.session.destroy(() =>
      res.status(401).json({ error: 'Tu cuenta ya no está activa. Iniciá sesión de nuevo.' })
    );
  }
  // Si no cambió nada, escribir los mismos valores no marca la sesión como
  // modificada, así que esto no genera un guardado extra por pedido.
  req.session.nombre = usuario.nombre;
  req.session.rol = usuario.rol;
  req.session.rolNombre = usuario.rol_nombre || null;
  req.session.permisos = permisosEfectivos({
    rol: usuario.rol,
    permisosRol: usuario.permisos_rol,
    permisosPropios: usuario.permisos,
  });
  next();
}

// admin siempre tiene full en todo; para 'empleado' se fija en el mapa efectivo
// que dejó requireAuth.
function requireSectionAccess(seccion, nivelMinimo = 'limitado') {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'No autenticado. Iniciá sesión de nuevo.' });
    }
    if (!tieneAcceso(req.session, seccion, nivelMinimo)) {
      return res.status(403).json({ error: 'No tenés acceso a esta sección.' });
    }
    req.nivelAcceso = nivelDe(req.session, seccion);
    next();
  };
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireSectionAccess,
  tieneAcceso,
  nivelDe,
  permisosEfectivos,
  SECCIONES,
  SECCIONES_SOLO_ADMIN,
  NIVEL_RANGO,
  SOLO_ADMIN,
};
