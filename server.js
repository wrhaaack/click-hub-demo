// Servidor propio: para tu compu y para Railway. Usa la misma app de
// src/app.js que Vercel y le suma lo que en Vercel hace la plataforma: servir
// la pantalla compilada, abrir el puerto y correr las tareas diarias.
const fs = require('fs');
const path = require('path');
const express = require('express');

let base;
try {
  base = require('./src/app');
} catch (err) {
  console.error('\nNo puedo arrancar: ' + err.message);
  process.exit(1);
}
const { app, prepararBase, tareasProgramadas } = base;

const DIST = path.join(__dirname, 'web', 'dist');
const INDEX = path.join(DIST, 'index.html');
if (!fs.existsSync(INDEX)) {
  console.error('\nNo encuentro la app compilada (web/dist). Corré "npm run build" antes de "npm start".');
  process.exit(1);
}

// Los archivos compilados llevan un hash en el nombre, así que se pueden
// cachear para siempre. El index no: es el que dice qué archivos pedir.
app.use('/app/assets', express.static(path.join(DIST, 'assets'), { immutable: true, maxAge: '1y' }));
// Cualquier otra ruta de /app es una pantalla: decide el router de Vue. Sin
// sesión, todo lleva al login (la única pantalla pública).
app.get(['/app', '/app/*'], (req, res) => {
  const conSesion = !!(req.session && req.session.userId);
  const esLogin = req.path === '/app/login';
  if (!conSesion && !esLogin) return res.redirect('/app/login');
  if (conSesion && esLogin) return res.redirect('/app/');
  res.set('Cache-Control', 'no-cache');
  res.sendFile(INDEX);
});
app.get('/', (req, res) => res.redirect('/app/'));

// Primero se deja la base lista (esquema y, si hace falta, el primer admin) y
// recién después se abre el puerto.
const PORT = process.env.PORT || 3000;
prepararBase()
  .then(() => app.listen(PORT, () => console.log(`Click Hub corriendo en http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('\nNo pude preparar la base, así que no arranco:\n  ' + err.message);
    console.error('Casi siempre es DATABASE_URL: apunta a una base que no existe.');
    process.exit(1);
  });

// Alertas y limpieza de sesiones: una vez al arrancar, con margen para que la
// base esté lista, y después una vez por día.
const UN_DIA_MS = 24 * 60 * 60 * 1000;
const revisar = () => tareasProgramadas().catch((err) => console.error('Error en las tareas diarias:', err));
setTimeout(() => { revisar(); setInterval(revisar, UN_DIA_MS); }, 30 * 1000);
