// Aplica db/schema.sql sobre la base a la que apunte DATABASE_URL.
//
//   npm run db:init
//
// Es lo mismo que pegar el schema.sql a mano en el panel de Railway, pero sin
// pegar nada. Se puede correr las veces que haga falta: el schema usa
// CREATE TABLE IF NOT EXISTS y ON CONFLICT DO NOTHING, así que no rompe ni
// duplica nada si las tablas ya están.
//
// Para correrlo contra Railway desde tu compu, con la CLI:
//   railway run npm run db:init

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL. Creá el .env (o usá "railway run") y volvé a probar.');
    process.exit(1);
  }

  const destino = process.env.DATABASE_URL.replace(/:\/\/[^@]*@/, '://***@');
  console.log('Base: ' + destino);

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);

  const tablas = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  const roles = await pool.query('SELECT nombre FROM roles ORDER BY orden');

  console.log('Esquema aplicado.');
  console.log('  tablas: ' + tablas.rows.map((t) => t.tablename).join(', '));
  console.log('  roles:  ' + roles.rows.map((r) => r.nombre).join(', '));
  console.log('');
  console.log('Siguiente paso: crear tu usuario admin con "npm run seed:admin".');

  await pool.end();
}

main().catch((err) => {
  console.error('No se pudo aplicar el esquema:');
  console.error(err.message);
  process.exit(1);
});
