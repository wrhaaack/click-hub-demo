// Deja la base lista antes de que el servidor acepte pedidos.
//
// POR QUÉ EXISTE ESTO
// Antes había que aplicar el esquema y crear el primer usuario a mano, desde
// afuera. En Railway eso es más difícil de lo que parece: la base vive en la red
// privada, así que desde tu compu no se llega sin abrir un proxy, y hacerlo
// desde adentro depende de que la imagen traiga shell. Un despliegue nuevo se
// quedaba a mitad de camino con la base vacía y un "relation does not exist"
// que no dice qué hacer.
//
// Ahora el arranque se ocupa solo: aplica el esquema y, si todavía no hay
// ningún usuario, crea el primer admin. Los scripts db/init.js y db/seed-admin.js
// siguen existiendo para hacerlo a mano cuando convenga.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

// Un número cualquiera, pero el mismo en todas las instancias: es la llave del
// lock. Si Railway levanta dos réplicas juntas, dos CREATE TABLE simultáneos
// pueden trabarse entre sí; con esto la segunda espera y encuentra el trabajo
// hecho en vez de chocar.
const LLAVE_LOCK = 528491;

async function aplicarEsquema(client) {
  const antes = await client.query("SELECT to_regclass('public.usuarios') IS NOT NULL AS existe");
  const eraNueva = !antes.rows[0].existe;

  // Se aplica siempre, no solo cuando la base está vacía: el schema.sql usa
  // CREATE TABLE IF NOT EXISTS y ON CONFLICT DO NOTHING de punta a punta, así
  // que correrlo de nuevo no toca nada de lo que ya está, pero sí agrega lo que
  // se haya sumado al esquema desde el último despliegue.
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8');
  await client.query(sql);

  if (eraNueva) {
    const t = await client.query(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'"
    );
    console.log(`Base vacía: esquema aplicado (${t.rows[0].n} tablas).`);
  }
  return eraNueva;
}

// El primer usuario solo se crea si no hay NINGUNO. Esa condición es la que hace
// que esto sea seguro: sobre una instalación que ya tiene gente no puede hacer
// nada, ni siquiera si alguien deja las variables puestas.
async function crearPrimerAdmin(client) {
  const n = await client.query('SELECT count(*)::int AS n FROM usuarios');
  if (n.rows[0].n > 0) return false;

  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const clave = process.env.ADMIN_PASSWORD || '';

  if (!email || !clave) {
    console.log('');
    console.log('La base no tiene ningún usuario todavía, así que nadie puede entrar.');
    console.log('Para crear el primero, cargá estas dos variables y volvé a desplegar:');
    console.log('');
    console.log('  ADMIN_EMAIL     vos@tuestudio.com');
    console.log('  ADMIN_PASSWORD  una clave de 10 caracteres o más');
    console.log('');
    console.log('Cuando puedas entrar, borralas: ya no hacen falta y no conviene');
    console.log('dejar una contraseña guardada en las variables del servicio.');
    console.log('');
    return false;
  }

  if (clave.length < 10) {
    console.error('ADMIN_PASSWORD tiene menos de 10 caracteres: no se creó el usuario.');
    return false;
  }

  const hash = await bcrypt.hash(clave, 12);
  await client.query(
    `INSERT INTO usuarios (email, password_hash, nombre, rol) VALUES ($1, $2, $3, 'admin')`,
    [email, hash, process.env.ADMIN_NOMBRE || 'Admin']
  );
  console.log('');
  console.log(`Primer usuario creado: ${email} (administrador).`);
  console.log('Entrá, cambiá la contraseña desde "Mi cuenta", y después borrá');
  console.log('ADMIN_EMAIL y ADMIN_PASSWORD de las variables del servicio.');
  console.log('');
  return true;
}

// Si esto falla, el servidor no arranca: una base a medio armar da errores
// sueltos y confusos más adelante, y es peor que no arrancar.
async function prepararBase() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LLAVE_LOCK]);
    await aplicarEsquema(client);
    await crearPrimerAdmin(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LLAVE_LOCK]).catch(() => {});
    client.release();
  }
}

module.exports = { prepararBase, aplicarEsquema, crearPrimerAdmin };
