// Crea (o actualiza) un usuario a mano. No hay pantalla de registro público:
// el primer login se crea corriendo este script, y desde ahí se administran
// los demás en la pantalla de Usuarios.
//
// Uso:
//   ADMIN_EMAIL=vos@click.com ADMIN_PASSWORD="unaClaveLarga123!" ADMIN_NOMBRE="Alan" ADMIN_ROL=admin npm run seed:admin
//
// Si al usuario le corresponde una persona del equipo con el mismo nombre,
// se enlazan solos para que le lleguen las notificaciones de sus tareas.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const nombre = process.env.ADMIN_NOMBRE || 'Usuario';
  const rol = process.env.ADMIN_ROL === 'empleado' ? 'empleado' : 'admin';

  if (!email || !password) {
    console.error('Faltan ADMIN_EMAIL y/o ADMIN_PASSWORD como variables de entorno.');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('La contraseña debe tener al menos 10 caracteres.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const emailNormalizado = String(email).toLowerCase().trim();

  const existing = await pool.query('SELECT id FROM usuarios WHERE email = $1', [emailNormalizado]);
  let usuarioId;
  if (existing.rows.length > 0) {
    usuarioId = existing.rows[0].id;
    await pool.query(
      'UPDATE usuarios SET password_hash = $1, nombre = $2, rol = $3, activo = true WHERE id = $4',
      [hash, nombre, rol, usuarioId]
    );
    console.log(`Usuario actualizado: ${emailNormalizado} (rol: ${rol})`);
  } else {
    const insert = await pool.query(
      'INSERT INTO usuarios (email, password_hash, nombre, rol) VALUES ($1, $2, $3, $4) RETURNING id',
      [emailNormalizado, hash, nombre, rol]
    );
    usuarioId = insert.rows[0].id;
    console.log(`Usuario creado: ${emailNormalizado} (rol: ${rol})`);
  }

  // Enlazar con la persona del equipo que se llame igual, si existe y está suelta.
  const enlace = await pool.query(
    `UPDATE equipo SET usuario_id = $1
     WHERE lower(nombre) = lower($2) AND usuario_id IS NULL
     RETURNING id, nombre, rol`,
    [usuarioId, nombre]
  );
  if (enlace.rows.length > 0) {
    console.log(`Enlazado con la persona del equipo "${enlace.rows[0].nombre}".`);

    // Si esa persona tiene un rol de producción, se le asigna el mismo rol al
    // usuario para que herede sus permisos. Sin esto, un empleado creado por
    // este script entra sin acceso a ninguna sección.
    const rolPersona = enlace.rows[0].rol;
    if (rolPersona) {
      const asignado = await pool.query(
        `UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE nombre = $1)
         WHERE id = $2 AND rol_id IS NULL
         RETURNING (SELECT nombre FROM roles WHERE id = rol_id) AS rol`,
        [rolPersona, usuarioId]
      );
      if (asignado.rows.length > 0 && asignado.rows[0].rol) {
        console.log(`Rol asignado: ${asignado.rows[0].rol} (hereda sus permisos).`);
      }
    }
  }

  if (rol === 'empleado') {
    const chequeo = await pool.query('SELECT rol_id FROM usuarios WHERE id = $1', [usuarioId]);
    if (!chequeo.rows[0].rol_id) {
      console.log('');
      console.log('AVISO: este usuario quedó sin rol, así que todavía no ve ninguna sección.');
      console.log('Asignale un rol desde la pantalla de Usuarios para que herede permisos.');
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
