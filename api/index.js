// Función de Vercel: todo /api/* llega acá (ver vercel.json) y lo atiende la
// misma app de Express que usa server.js. La pantalla no pasa por acá: Vercel
// la sirve directo desde web/dist.
module.exports = require('../src/app').app;
