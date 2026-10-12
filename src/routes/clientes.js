const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireAdmin, requireSectionAccess } = require('../middleware/auth');
const { avisarAlEquipo } = require('../lib/notificaciones');

const router = crearRouter();
router.use(requireAuth);
router.use(requireSectionAccess('clientes', 'limitado'));

const CAMPOS = `id, nombre, COALESCE(ig,'') AS ig, COALESCE(contacto,'') AS contacto,
                COALESCE(tel,'') AS tel, links, COALESCE(notas,'') AS notas,
                a_pagar::float8 AS "aPagar", estado_pago AS "estadoPago",
                abonado::float8 AS abonado, tipo,
                to_char(proxima_actualizacion, 'YYYY-MM-DD') AS "proximaActualizacion",
                puntajes`;

const ESTADOS_PAGO = ['pendiente', 'parcial', 'pagado'];

// El monto llega del formulario como texto. Vacío es NULL a propósito: significa
// "todavía no se acordó cuánto", que no es lo mismo que acordar cero. Se rechaza
// lo que no sea un número: guardar 0 en silencio ante un dedazo sería peor.
function montoONull(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return undefined;   // undefined = inválido
  return Math.round(n * 100) / 100;
}

// El cobro entero: el monto acordado, en qué estado está y cuánto abonó.
// Devuelve un error para mostrar, o los tres valores ya normalizados.
function revisarCobro(body) {
  const aPagar = montoONull(body && body.aPagar);
  if (aPagar === undefined) return { error: 'El monto a pagar tiene que ser un número.' };

  const estado = String((body && body.estadoPago) || 'pendiente');
  if (!ESTADOS_PAGO.includes(estado)) return { error: 'Ese estado de pago no existe.' };

  // Cuánto abonó solo se guarda en 'parcial'. En los otros dos el monto ya está
  // dicho por el estado, y dejarlo cargado permitiría que digan cosas distintas.
  if (estado !== 'parcial') return { datos: { aPagar, estado, abonado: null } };

  const abonado = montoONull(body && body.abonado);
  if (abonado === undefined) return { error: 'Lo abonado tiene que ser un número.' };
  if (abonado === null) return { error: 'Si el pago es parcial, poné cuánto abonó.' };
  // Abonar más de lo acordado no es un pago parcial. Solo se controla cuando hay
  // monto acordado: sin monto no hay con qué comparar.
  if (aPagar !== null && abonado > aPagar) {
    return { error: 'Lo abonado no puede ser mayor a lo que hay que pagar.' };
  }
  return { datos: { aPagar, estado, abonado } };
}

// La frase del aviso, sin el nombre de quien lo hizo (lo agrega el que llama):
//   "marcó como PAGADO a Lumá ($15.000)"
//   "registró un pago parcial de Lumá: $5.000 de $15.000"
function frasePago(nombre, c) {
  const plata = (n) => '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  if (c.estadoPago === 'parcial') {
    const total = c.aPagar !== null ? ` de ${plata(c.aPagar)}` : '';
    return `registró un pago parcial de ${nombre}: ${plata(c.abonado)}${total}`;
  }
  const monto = c.aPagar !== null ? ` (${plata(c.aPagar)})` : '';
  return c.estadoPago === 'pagado'
    ? `marcó como PAGADO a ${nombre}${monto}`
    : `marcó como pendiente de pago a ${nombre}${monto}`;
}

// Lo que agregó la unión con las planillas: si es cliente o prospecto, cuándo
// le toca el aumento y los puntajes del cotizador.
const CRITERIOS = ['estrategia', 'contenido', 'produccion', 'edicion', 'creatividad', 'equipo', 'atencion', 'urgencia'];
function leerExtras(body) {
  const tipo = body && body.tipo === 'prospecto' ? 'prospecto' : 'cliente';
  const prox = /^\d{4}-\d{2}-\d{2}$/.test(String((body && body.proximaActualizacion) || ''))
    ? body.proximaActualizacion : null;
  const puntajes = {};
  const crudo = (body && body.puntajes) || {};
  CRITERIOS.forEach((k) => {
    const n = parseInt(crudo[k], 10);
    if (n >= 1 && n <= 3) puntajes[k] = n;
  });
  return { tipo, prox, puntajes: JSON.stringify(puntajes) };
}

// Los links vienen del formulario como [{label,url}]. Se limpia lo que no
// tenga url.
function sanitizarLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .filter((l) => l && typeof l.url === 'string' && l.url.trim())
    .map((l) => ({ label: String(l.label || '').trim(), url: String(l.url).trim() }))
    .slice(0, 50);
}

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT ${CAMPOS} FROM clientes WHERE activo = true ORDER BY nombre ASC`
  );
  res.json(result.rows);
});

router.post('/', requireSectionAccess('clientes', 'full'), async (req, res) => {
  const { nombre, ig, contacto, tel, links, notas } = req.body || {};
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'Falta el nombre del cliente.' });
  }
  const { error, datos } = revisarCobro(req.body);
  if (error) return res.status(400).json({ error });

  const ex = leerExtras(req.body);
  const result = await pool.query(
    `INSERT INTO clientes (nombre, ig, contacto, tel, links, notas, a_pagar, estado_pago, abonado,
                           tipo, proxima_actualizacion, puntajes, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING ${CAMPOS}`,
    [
      String(nombre).trim(), ig || null, contacto || null, tel || null,
      JSON.stringify(sanitizarLinks(links)), notas || null,
      datos.aPagar, datos.estado, datos.abonado, ex.tipo, ex.prox, ex.puntajes, req.session.userId,
    ]
  );
  const cliente = result.rows[0];

  await avisarAlEquipo(
    req.session, 'cliente_nuevo',
    `${req.session.nombre} agregó un cliente nuevo: "${cliente.nombre}"`,
    '/app/clientes', null, cliente.id
  );

  res.status(201).json(cliente);
});

router.put('/:id', requireSectionAccess('clientes', 'full'), async (req, res) => {
  const { nombre, ig, contacto, tel, links, notas } = req.body || {};
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'Falta el nombre del cliente.' });
  }
  const { error, datos } = revisarCobro(req.body);
  if (error) return res.status(400).json({ error });

  const previo = await pool.query(
    `SELECT nombre, estado_pago, abonado::float8 AS abonado
       FROM clientes WHERE id = $1 AND activo = true`, [req.params.id]);
  if (previo.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const ex = leerExtras(req.body);
  const result = await pool.query(
    `UPDATE clientes SET nombre = $1, ig = $2, contacto = $3, tel = $4, links = $5, notas = $6,
                         a_pagar = $7, estado_pago = $8, abonado = $9,
                         tipo = $10, proxima_actualizacion = $11, puntajes = $12
     WHERE id = $13 AND activo = true RETURNING ${CAMPOS}`,
    [
      String(nombre).trim(), ig || null, contacto || null, tel || null,
      JSON.stringify(sanitizarLinks(links)), notas || null,
      datos.aPagar, datos.estado, datos.abonado, ex.tipo, ex.prox, ex.puntajes, req.params.id,
    ]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const anterior = previo.rows[0].nombre;
  const actual = result.rows[0].nombre;

  // El cobro lleva su propio aviso: "marcó como pagado a Lumá" dice algo, y
  // "editó los datos de Lumá" lo taparía. Si además se renombró, gana el pago:
  // es el cambio que al equipo le importa enterarse.
  //
  // Cambiar cuánto abonó también cuenta como novedad de cobro, aunque el estado
  // siga siendo 'parcial': pasar de 5000 a 12000 es la noticia.
  const cambioElPago = previo.rows[0].estado_pago !== datos.estado
    || previo.rows[0].abonado !== datos.abonado;
  if (cambioElPago) {
    await avisarAlEquipo(
      req.session, 'cliente_pago',
      `${req.session.nombre} ${frasePago(actual, result.rows[0])}`,
      '/app/clientes', null, req.params.id
    );
  } else {
    await avisarAlEquipo(
      req.session, 'cliente_editado',
      anterior === actual
        ? `${req.session.nombre} editó los datos de ${actual}`
        : `${req.session.nombre} renombró "${anterior}" a "${actual}"`,
      '/app/clientes', null, req.params.id
    );
  }
  res.json(result.rows[0]);
});

// Baja lógica: el cliente deja de aparecer pero no se pierde su historial.
// Es solo del admin: se lleva puesto un cliente entero de la vista de todos.
router.delete('/:id', requireAdmin, async (req, res) => {
  const result = await pool.query(
    'UPDATE clientes SET activo = false WHERE id = $1 AND activo = true RETURNING nombre',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado.' });
  await avisarAlEquipo(
    req.session, 'cliente_baja',
    `${req.session.nombre} dio de baja al cliente ${result.rows[0].nombre}`,
    '/app/clientes', null, req.params.id
  );
  res.json({ ok: true });
});

module.exports = router;
