// POST /api/importar — carga en bloque clientes, pauta y tareas (por ejemplo,
// lo que vivía en las planillas). Solo admin.
//
// Va todo en una transacción: o entra completo o no entra nada. Y no dispara
// un aviso por cada fila (serían cientos): deja una sola línea en la
// actividad con el resumen.
//
// Se puede correr más de una vez sin duplicar:
//   - clientes: se reconocen por nombre (sin distinguir mayúsculas); si ya
//     existe se actualizan sus datos.
//   - pauta: una fila por cliente y mes; si ya está, se pisa.
//   - tareas: si ya hay una con el mismo cliente y descripción, se saltea.
//
// Los datos viajan en el cuerpo del pedido y no viven en el repo: son de
// clientes reales.

const { crearRouter } = require('../lib/router');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = crearRouter();
router.use(requireAuth, requireAdmin);

const CRITERIOS = ['estrategia', 'contenido', 'produccion', 'edicion', 'creatividad', 'equipo', 'atencion', 'urgencia'];
const ESTADOS = ['pendiente', 'en progreso', 'revisión', 'listo', 'cumplido'];
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const periodo = (v) => (/^\d{4}-\d{2}$/.test(String(v || '')) ? `${v}-01` : null);
const monto = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v) * 100) / 100 : null);
const texto = (v) => (v === null || v === undefined ? null : String(v).trim() || null);

router.post('/', async (req, res) => {
  const { clientes = [], pautas = [], tareas = [] } = req.body || {};
  if (![clientes, pautas, tareas].every(Array.isArray)) {
    return res.status(400).json({ error: 'Se esperan las listas clientes, pautas y tareas.' });
  }

  const client = await pool.connect();
  const cuenta = { clientesNuevos: 0, clientesActualizados: 0, pautas: 0, tareas: 0, tareasRepetidas: 0 };
  try {
    await client.query('BEGIN');

    // ---------- Clientes ----------
    const idPorNombre = new Map();
    const existentes = await client.query('SELECT id, nombre FROM clientes WHERE activo = true');
    existentes.rows.forEach((c) => idPorNombre.set(c.nombre.toLowerCase(), c.id));

    for (const c of clientes) {
      const nombre = texto(c.nombre);
      if (!nombre) continue;
      // Los puntajes del cotizador van de 1 a 3: lo que venga más alto se toma como 3.
      const puntajes = {};
      CRITERIOS.forEach((k) => {
        const n = parseInt(c.puntajes?.[k], 10);
        if (n >= 1) puntajes[k] = Math.min(n, 3);
      });
      const valores = [
        c.tipo === 'prospecto' ? 'prospecto' : 'cliente', texto(c.ig), texto(c.contacto), texto(c.tel),
        JSON.stringify((c.links || []).filter((l) => l?.url).map((l) => ({ label: String(l.label || ''), url: String(l.url) }))),
        texto(c.notas), monto(c.aPagar), fecha(c.proximaActualizacion), JSON.stringify(puntajes),
      ];
      const id = idPorNombre.get(nombre.toLowerCase());
      if (id) {
        await client.query(
          `UPDATE clientes SET tipo = $1, ig = COALESCE($2, ig), contacto = COALESCE($3, contacto), tel = COALESCE($4, tel),
                  links = $5, notas = $6, a_pagar = $7, proxima_actualizacion = $8, puntajes = $9
           WHERE id = $10`, [...valores, id]);
        cuenta.clientesActualizados++;
      } else {
        const r = await client.query(
          `INSERT INTO clientes (tipo, ig, contacto, tel, links, notas, a_pagar, proxima_actualizacion, puntajes, nombre, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [...valores, nombre, req.session.userId]);
        idPorNombre.set(nombre.toLowerCase(), r.rows[0].id);
        cuenta.clientesNuevos++;
      }
    }

    const idDe = (nombre) => {
      const id = idPorNombre.get(String(nombre || '').toLowerCase());
      if (!id) throw Object.assign(new Error(`No existe el cliente "${nombre}".`), { status: 400 });
      return id;
    };

    // ---------- Pauta ----------
    for (const p of pautas) {
      const per = periodo(p.periodo);
      if (!per) continue;
      await client.query(
        `INSERT INTO pautas (cliente_id, periodo, pauta, capacitacion, fee_click, nota, pagado)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (cliente_id, periodo) DO UPDATE
           SET pauta = EXCLUDED.pauta, capacitacion = EXCLUDED.capacitacion, fee_click = EXCLUDED.fee_click,
               nota = EXCLUDED.nota, pagado = EXCLUDED.pagado`,
        [idDe(p.cliente), per, monto(p.pauta) || 0, monto(p.capacitacion) || 0, monto(p.feeClick) || 0, texto(p.nota), !!p.pagado]
      );
      cuenta.pautas++;
    }

    // ---------- Tareas ----------
    for (const t of tareas) {
      const desc = texto(t.desc);
      if (!desc) continue;
      const cid = idDe(t.cliente);
      const ya = await client.query('SELECT 1 FROM tareas WHERE cliente_id = $1 AND lower(descripcion) = lower($2)', [cid, desc]);
      if (ya.rows.length) { cuenta.tareasRepetidas++; continue; }
      await client.query(
        `INSERT INTO tareas (cliente_id, descripcion, rol, formato, fecha, fecha_limite, notas, estado, nivel, monto, pagado, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [cid, desc, texto(t.rol), texto(t.formato), fecha(t.fecha), fecha(t.fechaLimite), texto(t.notas),
          ESTADOS.includes(t.estado) ? t.estado : 'pendiente', ['N1', 'N2', 'N3'].includes(t.nivel) ? t.nivel : null,
          monto(t.monto), !!t.pagado, req.session.userId]
      );
      cuenta.tareas++;
    }

    await client.query(
      `INSERT INTO actividad (tipo, accion, entidad, descripcion, usuario_id, autor) VALUES ('importacion', 'alta', 'cliente', $1, $2, $3)`,
      [`${req.session.nombre} importó ${cuenta.clientesNuevos + cuenta.clientesActualizados} clientes, ${cuenta.pautas} meses de pauta y ${cuenta.tareas} tareas`,
        req.session.userId, req.session.nombre]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
  res.json(cuenta);
});

module.exports = router;
