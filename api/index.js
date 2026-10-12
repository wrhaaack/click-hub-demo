// Función de Vercel: todo /api/* llega acá (ver vercel.json) y lo atiende la
// misma app de Express que usa server.js. La pantalla no pasa por acá: Vercel
// la sirve directo desde web/dist.
//
// Si la app no puede cargar (casi siempre, faltan variables de entorno), en vez
// de que Vercel muestre su 500 genérico se responde el motivo, así la pantalla
// lo muestra y en los logs queda escrito.
let app;
try {
  ({ app } = require('../src/app'));
} catch (err) {
  console.error('Click Hub no pudo arrancar:', err.message);
  const motivo = err.message;
  app = (req, res) => {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: `El servidor no está configurado: ${motivo}`, configuracion: true }));
  };
}
module.exports = app;
