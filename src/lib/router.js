// Express 4 no atrapa los errores de un handler async: si una consulta falla,
// la promesa queda rechazada, el pedido se cuelga y el middleware de error de
// server.js nunca se entera. Este router envuelve cada handler para mandar esos
// errores a next(), que es lo que el middleware de error espera.

const express = require('express');

const METODOS = ['use', 'all', 'get', 'post', 'put', 'patch', 'delete'];

function envolver(fn) {
  if (typeof fn !== 'function') return fn;
  if (fn.length === 4) return fn; // middleware de error: se deja tal cual
  return function (req, res, next) {
    try {
      const resultado = fn.call(this, req, res, next);
      if (resultado && typeof resultado.then === 'function') resultado.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

function crearRouter() {
  const router = express.Router();
  METODOS.forEach((metodo) => {
    const original = router[metodo].bind(router);
    router[metodo] = (...args) => original(...args.map(envolver));
  });
  return router;
}

module.exports = { crearRouter };
