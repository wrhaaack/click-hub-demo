// Levanta un PostgreSQL de verdad, solo para desarrollo, sin instalar nada en la
// máquina. Los archivos de la base quedan en .postgres-local/ dentro de esta
// misma carpeta (está en el .gitignore, no se sube).
//
//   npm run db:local
//
// Se queda corriendo: dejalo en su propia terminal y abrí otra para el server.
// Para empezar de cero, cerralo y borrá la carpeta .postgres-local.
//
// Esto NO se usa en producción: en Railway la base es un servicio aparte.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// 5433 y no 5432, para no chocar si algún día instalás PostgreSQL de verdad en
// la máquina. Si ese puerto ya está tomado, se puede cambiar sin tocar el código:
//   PGLOCAL_PORT=5435 npm run db:local
// (y acordate de ajustar el puerto en el DATABASE_URL de tu .env).
const PUERTO = parseInt(process.env.PGLOCAL_PORT, 10) || 5433;
const USUARIO = 'clickhub';
const CLAVE = 'clickhub';
const BASE = 'clickhub';
const DATA_DIR = path.join(__dirname, '..', '.postgres-local');

function abortar(mensaje, detalle) {
  console.error('\n' + mensaje);
  if (detalle) console.error('\n' + detalle);
  process.exit(1);
}

// El paquete con los binarios trae un postinstall que arma unos symlinks. Las
// versiones nuevas de npm bloquean los postinstall por defecto, así que si no
// están armados los armamos acá en vez de fallar con un error críptico.
//
// Se busca por ruta y no con require.resolve porque ese paquete declara
// "exports", y eso hace que pedirle cualquier archivo interno (su package.json,
// sin ir más lejos) tire ERR_PACKAGE_PATH_NOT_EXPORTED.
function prepararBinarios() {
  const carpeta = path.join(__dirname, '..', 'node_modules', '@embedded-postgres');
  if (!fs.existsSync(carpeta)) return;
  for (const nombre of fs.readdirSync(carpeta)) {
    const raiz = path.join(carpeta, nombre);
    const hydrate = path.join(raiz, 'scripts', 'hydrate-symlinks.js');
    const bin = path.join(raiz, 'native', 'bin');
    const yaEsta = fs.existsSync(path.join(bin, 'initdb.exe')) || fs.existsSync(path.join(bin, 'initdb'));
    if (yaEsta || !fs.existsSync(hydrate)) continue;
    console.log('Preparando los binarios de PostgreSQL (una sola vez)...');
    execFileSync(process.execPath, [hydrate], { cwd: raiz, stdio: 'inherit' });
  }
}

async function main() {
  prepararBinarios();

  let EmbeddedPostgres;
  try {
    const mod = require('embedded-postgres');
    EmbeddedPostgres = mod.default || mod;
  } catch (e) {
    abortar(
      'Falta la dependencia de desarrollo que trae PostgreSQL.',
      'Corré:  npm install'
    );
  }

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USUARIO,
    password: CLAVE,
    port: PUERTO,
    persistent: true,
  });

  const primeraVez = !fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));
  if (primeraVez) {
    console.log('Creando la base local por primera vez (tarda unos segundos)...');
    await pg.initialise();
  }

  try {
    await pg.start();
  } catch (err) {
    // Ojo: cuando el puerto está tomado, esta promesa rechaza con undefined en
    // vez de con un Error, así que no se puede leer err.message a secas.
    const detalle = (err && err.message) ? err.message : 'el puerto ya está en uso';
    abortar(
      'No se pudo arrancar PostgreSQL en el puerto ' + PUERTO + '.',
      'Casi siempre es una de estas:\n\n'
      + '  1. Ya lo tenés corriendo en otra ventana. Fijate antes de volver a arrancarlo.\n\n'
      + '  2. Quedó un proceso postgres colgado de una corrida anterior. Cerralo con:\n'
      + '       taskkill /IM postgres.exe /F        (Windows)\n'
      + '       pkill postgres                      (Mac / Linux)\n\n'
      + '  3. Tenés otro PostgreSQL usando ese puerto. Usá uno distinto:\n'
      + '       PGLOCAL_PORT=5435 npm run db:local\n'
      + '     y ajustá el puerto en el DATABASE_URL de tu .env.\n\n'
      + 'Detalle: ' + detalle
    );
  }

  // La base se crea explícitamente en UTF-8, igual que la de Railway. Si se deja
  // que la arme el cluster con su configuración por defecto, en Windows queda en
  // WIN1252: los acentos entran, pero un emoji o una flecha "→" hacen fallar la
  // consulta con un error de codificación que no pasaría en producción.
  const { Client } = require('pg');
  const admin = new Client({ connectionString: `postgres://${USUARIO}:${CLAVE}@127.0.0.1:${PUERTO}/postgres` });
  await admin.connect();
  const existente = await admin.query(
    'SELECT pg_encoding_to_char(encoding) AS codificacion FROM pg_database WHERE datname = $1',
    [BASE]
  );
  if (existente.rows.length === 0) {
    await admin.query(`CREATE DATABASE ${BASE} WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
    console.log('Base "' + BASE + '" creada en UTF-8.');
  } else if (existente.rows[0].codificacion !== 'UTF8') {
    console.log('');
    console.log('AVISO: tu base local está en ' + existente.rows[0].codificacion + ', no en UTF-8.');
    console.log('Los acentos andan, pero los emojis y algunos símbolos van a fallar acá y no en');
    console.log('producción. Para rehacerla en UTF-8 (se pierden los datos de prueba):');
    console.log('  1. Cerrá esta ventana y la del server.');
    console.log('  2. Borrá la carpeta .postgres-local');
    console.log('  3. Volvé a correr: npm run db:local && npm run db:init && npm run seed:admin');
    console.log('');
  }
  await admin.end();

  const url = `postgres://${USUARIO}:${CLAVE}@127.0.0.1:${PUERTO}/${BASE}`;
  console.log('');
  console.log('  PostgreSQL local andando.');
  console.log('');
  console.log('  DATABASE_URL=' + url);
  console.log('');
  if (primeraVez) {
    console.log('  Es la primera vez, así que en OTRA terminal corré:');
    console.log('    npm run db:init      (crea las tablas)');
    console.log('    npm run seed:admin   (crea tu usuario, ver EMPEZAR-ACA.md)');
    console.log('    npm start');
  } else {
    console.log('  En otra terminal:  npm start');
  }
  console.log('');
  console.log('  Dejá esta ventana abierta. Ctrl+C para apagar la base.');

  const apagar = async () => {
    console.log('\nApagando PostgreSQL...');
    try { await pg.stop(); } catch (e) {}
    process.exit(0);
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
  setInterval(() => {}, 1 << 30); // se queda vivo
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
