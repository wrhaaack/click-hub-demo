# Click Hub

El sistema interno de Click: clientes y prospectos, tareas del equipo,
calendario, planificación para el cliente (exportable como imagen),
brainstorming, liquidaciones al equipo, pauta publicitaria y cotizador.

- Ponerlo a andar en tu compu: **[EMPEZAR-ACA.md](EMPEZAR-ACA.md)**
- Subirlo a Vercel: **[DESPLIEGUE-VERCEL.md](DESPLIEGUE-VERCEL.md)**
- Subirlo a Railway: **[DESPLIEGUE.md](DESPLIEGUE.md)**

## Cómo está armado

Una app de **Vue 3 + Vite** (la pantalla) sobre un servidor **Express +
PostgreSQL** (los datos, el login y los permisos).

```
server.js              servidor propio (tu compu, Railway): la app + la pantalla + el puerto
api/index.js           la función de Vercel (la misma app)
vercel.json            build, rutas y cron de Vercel
src/
  app.js               la app de Express: sesiones y /api (la usan los dos de arriba)
  db.js                pool de Postgres
  middleware/auth.js   requireAuth / requireAdmin / requireSectionAccess
  lib/
    arranque.js        aplica db/schema.sql y crea el primer admin
    consultas.js       consultas que comparten varias rutas
    notificaciones.js  avisos al equipo y registro de actividad
    alertas.js         revisión diaria: tareas vencidas, clientes sin planificar
    router.js          manda los errores async al middleware de error
  routes/              una por tema; estado.js es lo que la app pide al arrancar
web/
  index.html
  src/
    main.js            rutas de la app
    App.vue            menú + pantalla, o el login
    estilos.css        la paleta y los componentes base
    lib/               estado compartido, API, grilla, colores, exportar imagen y Excel
    components/        menú, modales, ficha del cliente, planificación...
    views/             una por pantalla
db/
  schema.sql           todas las tablas (se aplica en cada arranque)
  postgres-local.js    PostgreSQL embebido para desarrollo
  seed-admin.js        recuperar el acceso
```

`npm run build` compila `web/` a `web/dist`. En un servidor propio lo sirve
`server.js`; en Vercel, la propia plataforma.

## Pantallas

| Pantalla | Para qué |
|---|---|
| Dashboard | El mes de un vistazo: tareas, cobros, pauta, lo que se le debe al equipo, aumentos que tocan, agenda y actividad. |
| Clientes | Clientes y prospectos. La ficha tiene tareas por rol, calendario con fechas especiales, planificación, pauta, historial, info y Excel. |
| Tareas | Lo que se publica en el mes, quién lo hace y en qué estado está. Cada tarea lleva nivel (N1/N2/N3) y monto. |
| Calendario | Vista del equipo (tareas, eventos, fechas especiales) y vista del cliente (la planificación por etapas que se exporta como imagen). |
| Brainstorming | Ideas e inspiración por cliente y mes; una idea pasa a tarea con la flecha. |
| Liquidaciones | Piezas terminadas sin pagar, por persona; se liquidan de una. Las tarifas se editan acá. |
| Pauta | Inversión en anuncios por cliente y mes. El "Mes N" se cuenta solo; un mes nuevo se arranca copiando el anterior. |
| Cotizador | 8 criterios de 1 a 3 → precio sugerido, y control de que la edición no pase el tope (30%). |
| Equipo | Quiénes reciben tareas y con qué rol. Solo admin. |
| El estudio | Datos, links útiles y notas internas de Click. |
| Usuarios | Quién entra y qué puede hacer: permisos por rol y excepciones por persona. Solo admin. |

## La API

Todo cuelga de `/api` y todo pide sesión (menos el login). `GET /api/estado`
trae de una todo lo que la app necesita para dibujarse, recortado según los
permisos; después cada acción manda su propio pedido chico.

| Ruta | Para qué | Permiso |
|---|---|---|
| `/api/auth` | login, logout, `me`, mi cuenta | — |
| `/api/estado` | todo lo del arranque | recorta según permisos |
| `/api/dashboard` | agenda del mes y actividad | `dashboard` |
| `/api/clientes` | alta y edición (la baja, solo admin) | `clientes` |
| `/api/tareas` | alta, edición, estado, pago, liquidar (eliminar, solo admin) | `tareas` |
| `/api/pautas` | pauta por cliente y mes | `clientes` |
| `/api/tarifas` | tarifas y parámetros del cotizador | leer: cualquiera; cambiar: admin |
| `/api/eventos`, `/api/etapas` | calendario y planificación del cliente | `calendario` |
| `/api/brainstorm` | ideas por cliente y mes | `brainstorm` |
| `/api/fechas` | fechas especiales | `clientes` |
| `/api/estudio` | datos del estudio | `estudio` |
| `/api/equipo`, `/api/roles`, `/api/usuarios` | personas, roles y cuentas | solo admin (el `GET` de equipo, quien ve tareas) |
| `/api/notificaciones` | campanita | — |

## Permisos

Los lleva el **rol** (Editor, Diseñadora, CM…): cada persona hereda los de su
rol, con excepciones puntuales si hacen falta, y el admin puede todo siempre.
Esconder un botón en pantalla es comodidad; el bloqueo real está siempre en el
servidor. Equipo, Usuarios, roles y tarifas son solo del admin.

## Seguridad

- Contraseñas con bcrypt; sin registro público.
- Límite de 8 intentos de login cada 15 minutos por IP.
- Cookies de sesión `httpOnly` y `secure` en producción, guardadas en Postgres.
- `requireAuth` relee al usuario en cada pedido: desactivar a alguien o
  cambiarle un permiso aplica en el momento.
- `GET /api/estado` no manda lo que la persona no puede ver.

## Ojo con los ids

`pg` devuelve los `BIGINT` como texto por defecto, y con `"1"` en vez de `1`
las comparaciones de la pantalla fallan en silencio. `src/db.js` registra un
parser que los convierte a número: no saques esa línea.
