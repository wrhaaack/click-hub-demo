// Recuperar el acceso: crea un administrador, o le pone contraseña nueva a uno
// que ya existe. El primer admin lo crea solo el arranque (ADMIN_EMAIL y
// ADMIN_PASSWORD en el .env); esto es para cuando nadie puede entrar.
//
//   ADMIN_EMAIL=vos@click.com ADMIN_PASSWORD="unaClaveLarga123" ADMIN_NOMBRE="Alan" npm run seed:admin

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

async function main() {
  const email = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '';
  const nombre = process.env.ADMIN_NOMBRE || 'Admin';
  if (!email || password.length < 10) {
    console.error('Hacen falta ADMIN_EMAIL y ADMIN_PASSWORD (de al menos 10 caracteres).');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const r = await pool.query(
    `INSERT INTO usuarios (email, password_hash, nombre, rol) VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, rol = 'admin', activo = true
     RETURNING (xmax = 0) AS nuevo`,
    [email, hash, nombre]
  );
  console.log(r.rows[0].nuevo ? `Admin creado: ${email}` : `Contraseña actualizada y cuenta reactivada: ${email}`);
}

main()
  .catch((err) => { console.error('No se pudo:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
