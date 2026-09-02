// Trae a la base los datos que hayan quedado guardados en el navegador con la
// versión anterior del hub (la que era un solo archivo HTML y guardaba todo en
// localStorage).
//
// Paso 1 — sacar los datos del navegador:
//   Abrí el click_hub_final_v3.html viejo, apretá F12, pegá esto en la consola
//   y guardá lo que imprime en un archivo (por ejemplo datos-viejos.json):
//
//     copy(JSON.stringify({
//       roles: JSON.parse(localStorage.getItem('ck2_roles') || 'null'),
//       clientes: JSON.parse(localStorage.getItem('ck2_cli') || '[]'),
//       tareas: JSON.parse(localStorage.getItem('ck2_tar') || '[]'),
//       ideas: JSON.parse(localStorage.getItem('ck2_ideas') || '{}'),
//       equipo: JSON.parse(localStorage.getItem('ck2_eq') || '[]'),
//       estudio: JSON.parse(localStorage.getItem('ck2_est') || 'null'),
//       mensajes: JSON.parse(localStorage.getItem('ck2_msg') || '[]'),
//       notas: JSON.parse(localStorage.getItem('ck2_nota') || '{}'),
//       fechas: JSON.parse(localStorage.getItem('ck2_fe') || '{}')
//     }))
//
//   (copy() deja el texto en el portapapeles; después lo pegás en el archivo.)
//
// Paso 2 — importarlo:
//   node db/importar-localstorage.js datos-viejos.json
//
// Es seguro correrlo una sola vez sobre una base vacía. Si la base ya tiene
// clientes, avisa y no hace nada, para no duplicar todo.

require('dotenv').config();
const fs = require('fs');
const { pool } = require('../src/db');

function periodoDeClave(clave) {
  // '3-2026-05' -> '2026-05-01'   |   'gen-2026-05' -> '2026-05-01'
  const m = String(clave).match(/(\d{4})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-01` : null;
}

function fechaONull(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
}

const ESTADOS = ['pendiente', 'en progreso', 'revisión', 'listo', 'cumplido'];

// Mismo arranque que db/schema.sql para los roles que se importan.
const PERMISOS_ARRANQUE = {
  clientes: 'limitado', tareas: 'limitado', calendario: 'full', brainstorm: 'full',
  delegacion: 'full', historial: 'full', comunicacion: 'full', equipo: 'sin_acceso',
  estudio: 'limitado', usuarios: 'sin_acceso',
};

async function main() {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error('Uso: node db/importar-localstorage.js <archivo.json>');
    process.exit(1);
  }
  const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));

  const yaHay = await pool.query('SELECT id FROM clientes LIMIT 1');
  if (yaHay.rows.length > 0) {
    console.error('La base ya tiene clientes cargados. Este script solo corre sobre una base vacía,');
    console.error('para no duplicar los datos. Si igual querés importar, vaciá las tablas primero.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ---------- Roles ----------
    // La versión vieja no tenía permisos por rol, así que los importados nacen
    // con el mismo arranque que trae schema.sql. El admin los ajusta después
    // desde la pantalla de Usuarios.
    if (Array.isArray(datos.roles) && datos.roles.length) {
      await client.query('DELETE FROM roles');
      for (let i = 0; i < datos.roles.length; i++) {
        await client.query(
          'INSERT INTO roles (nombre, orden, permisos) VALUES ($1, $2, $3) ON CONFLICT (nombre) DO NOTHING',
          [String(datos.roles[i]).trim(), i, JSON.stringify(PERMISOS_ARRANQUE)]
        );
      }
    }

    // ---------- Equipo ----------
    // Se guarda de qué nombre viene cada persona para poder reconstruir las
    // asignaciones de las tareas, que en la versión vieja eran nombres sueltos.
    //
    // Estas filas nacen SIN usuario, porque en la versión vieja el equipo eran
    // nombres y no cuentas. Es la única forma de que existan así: por la app ya
    // no se puede, al equipo solo entra gente con usuario (ver src/routes/equipo.js).
    // En el hub aparecen marcadas como "sin usuario" y se las enlaza editándolas.
    // Hasta que se las enlace no reciben avisos de sus tareas, pero las
    // asignaciones históricas se conservan intactas.
    const miembroPorNombre = new Map();
    for (const p of datos.equipo || []) {
      if (!p || !p.nombre) continue;
      const r = await client.query('INSERT INTO equipo (nombre, rol) VALUES ($1, $2) RETURNING id',
        [String(p.nombre).trim(), p.rol || null]);
      miembroPorNombre.set(String(p.nombre).trim(), r.rows[0].id);
    }

    // ---------- Clientes ----------
    const clientePorIdViejo = new Map();
    for (const c of datos.clientes || []) {
      if (!c || !c.nombre) continue;
      const r = await client.query(
        `INSERT INTO clientes (nombre, ig, contacto, tel, links, notas)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [String(c.nombre).trim(), c.ig || null, c.contacto || null, c.tel || null,
         JSON.stringify(Array.isArray(c.links) ? c.links : []), c.notas || null]
      );
      clientePorIdViejo.set(String(c.id), r.rows[0].id);
    }

    // ---------- Tareas ----------
    let tareasImportadas = 0;
    for (const t of datos.tareas || []) {
      const cid = clientePorIdViejo.get(String(t && t.cid));
      if (!cid || !t.desc) continue;
      const estado = ESTADOS.includes(t.estado) ? t.estado : 'pendiente';
      const r = await client.query(
        `INSERT INTO tareas (cliente_id, descripcion, rol, formato, fecha, fecha_limite, notas, estado, pagado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [cid, String(t.desc), t.rol || null, t.formato || null,
         fechaONull(t.fecha), fechaONull(t.fechaLimite), t.notas || null, estado, !!t.pagado]
      );
      const asig = Array.isArray(t.asig) ? t.asig : (t.asig ? [t.asig] : []);
      for (const nombre of asig) {
        const mid = miembroPorNombre.get(String(nombre).trim());
        if (mid) {
          await client.query(
            'INSERT INTO tarea_asignados (tarea_id, miembro_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [r.rows[0].id, mid]
          );
        }
      }
      tareasImportadas++;
    }

    // ---------- Brainstorm ----------
    for (const [clave, valor] of Object.entries(datos.ideas || {})) {
      const periodo = periodoDeClave(clave);
      if (!periodo) continue;
      const esGeneral = clave.startsWith('gen-');
      const cid = esGeneral ? null : clientePorIdViejo.get(clave.replace(/-\d{4}-\d{2}$/, ''));
      if (!esGeneral && !cid) continue;
      await client.query(
        'INSERT INTO brainstorm (cliente_id, periodo, ideas, inspo) VALUES ($1,$2,$3,$4)',
        [cid || null, periodo,
         JSON.stringify(Array.isArray(valor.ideas) ? valor.ideas : []),
         JSON.stringify(Array.isArray(valor.inspo) ? valor.inspo : [])]
      );
    }

    // ---------- Fechas especiales ----------
    for (const [clave, lista] of Object.entries(datos.fechas || {})) {
      const periodo = periodoDeClave(clave);
      const cidViejo = String(clave).replace(/^fe-/, '').replace(/-\d{4}-\d{2}$/, '');
      const cid = clientePorIdViejo.get(cidViejo);
      if (!periodo || !cid || !Array.isArray(lista)) continue;
      for (let i = 0; i < lista.length; i++) {
        await client.query(
          'INSERT INTO fechas_especiales (cliente_id, periodo, fecha, label, orden) VALUES ($1,$2,$3,$4,$5)',
          [cid, periodo, fechaONull(lista[i].fecha), lista[i].label || null, i]
        );
      }
    }

    // ---------- Notas por cliente ----------
    // El autor viejo era texto libre; se conserva tal cual, sin usuario asociado.
    for (const [clave, lista] of Object.entries(datos.notas || {})) {
      const periodo = periodoDeClave(clave);
      const cid = clientePorIdViejo.get(String(clave).replace(/-\d{4}-\d{2}$/, ''));
      if (!periodo || !cid || !Array.isArray(lista)) continue;
      for (const n of lista) {
        if (!n || !n.texto) continue;
        await client.query(
          'INSERT INTO notas (cliente_id, periodo, texto, autor) VALUES ($1,$2,$3,$4)',
          [cid, periodo, String(n.texto), n.autor || 'Equipo']
        );
      }
    }

    // ---------- Chat ----------
    for (const m of datos.mensajes || []) {
      if (!m || !m.texto) continue;
      await client.query('INSERT INTO mensajes (autor, texto) VALUES ($1,$2)',
        [m.autor || 'Equipo', String(m.texto)]);
    }

    // ---------- Estudio ----------
    if (datos.estudio) {
      await client.query(
        `INSERT INTO configuracion (clave, valor) VALUES ('estudio', $1)
         ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`,
        [JSON.stringify(datos.estudio)]
      );
    }

    await client.query('COMMIT');
    console.log('Importación terminada:');
    console.log(`  clientes: ${clientePorIdViejo.size}`);
    console.log(`  tareas:   ${tareasImportadas}`);
    console.log(`  equipo:   ${miembroPorNombre.size}`);
    console.log('Los mensajes y las notas quedan con el autor viejo como texto, sin usuario asociado.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
