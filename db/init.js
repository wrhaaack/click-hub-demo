// Aplica db/schema.sql sobre la base a la que apunte DATABASE_URL.
//
//   npm run db:init
//
// Normalmente no hace falta: el servidor lo aplica solo al arrancar (Railway,
// tu compu) o en el primer pedido (Vercel). Sirve para preparar una base a mano
// sin levantar la app. Se puede correr las veces que haga falta: el esquema usa
// CREATE TABLE IF NOT EXISTS y ON CONFLICT DO NOTHING.
//
// Contra Railway desde tu compu, ver DESPLIEGUE.md ("Si preferís hacerlo a mano").

require('dotenv').config();
const { pool } = require('../src/db');
const { aplicarEsquema, crearPrimerAdmin } = require('../src/lib/arranque');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL. Creá el .env (o usá "railway run") y volvé a probar.');
    process.exit(1);
  }
  console.log('Base: ' + process.env.DATABASE_URL.replace(/:\/\/[^@]*@/, '://***@'));

  const client = await pool.connect();
  try {
    await aplicarEsquema(client);
    // Solo crea el admin si no hay ningún usuario y están ADMIN_EMAIL y ADMIN_PASSWORD.
    await crearPrimerAdmin(client);
    const tablas = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
    console.log('Esquema aplicado.\n  tablas: ' + tablas.rows.map((t) => t.tablename).join(', '));
  } finally {
    client.release();
  }
}

main()
  .catch((err) => { console.error('No se pudo aplicar el esquema:\n' + err.message); process.exitCode = 1; })
  .finally(() => pool.end());
