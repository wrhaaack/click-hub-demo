// Conexión a Postgres. DATABASE_URL la carga la plataforma: Railway al
// conectar su Postgres, Vercel al conectar una base de Neon desde Storage.
const { Pool, types } = require('pg');

// Por defecto el driver devuelve los BIGINT como texto, porque un bigint puede
// ser más grande de lo que un número de JavaScript representa sin perder
// precisión. Acá eso hace más mal que bien: los ids son BIGSERIAL, y si llegan
// como "1" en vez de 1, las comparaciones de la pantalla (x.id === cid) fallan
// en silencio y, por ejemplo, no abre la ficha del cliente.
//
// El límite seguro de JavaScript son 9.007.199.254.740.991 filas. No es un
// número al que este proyecto se vaya a acercar, así que se los pide como
// números y listo.
types.setTypeParser(types.builtins.INT8, (valor) => parseInt(valor, 10));

// Railway da dos direcciones para la misma base:
//   - la pública  (algo.proxy.rlwy.net)  -> sale a internet, necesita SSL
//   - la privada  (algo.railway.internal) -> red interna del proyecto, sin SSL
// Pedir SSL contra la privada hace que la conexión falle con "server does not
// support SSL", que es un error molesto de diagnosticar en el primer despliegue.
// Por eso se decide mirando a dónde apunta la URL y no solo el NODE_ENV.
function configuracionSSL() {
  const url = process.env.DATABASE_URL || '';
  if (process.env.DATABASE_SSL === 'off') return false;   // escotilla de escape
  if (process.env.DATABASE_SSL === 'on') return { rejectUnauthorized: false };
  if (/\.railway\.internal|localhost|127\.0\.0\.1|\[::1\]/.test(url)) return false;
  return process.env.NODE_ENV === 'production' || process.env.VERCEL ? { rejectUnauthorized: false } : false;
}

// En Vercel cada instancia de la función atiende de a un pedido y puede haber
// muchas a la vez: pocas conexiones por instancia y que se suelten rápido, para
// no agotar las de la base. En un servidor propio, un pool normal.
const enVercel = !!process.env.VERCEL;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: configuracionSSL(),
  max: enVercel ? 3 : 10,
  idleTimeoutMillis: enVercel ? 5000 : 30000,
  connectionTimeoutMillis: 10000,
});

module.exports = { pool };
