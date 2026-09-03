# Click Hub

Hub interno de Click: planificación de contenido por cliente (tareas, calendario,
brainstorming, delegación, equipo) atrás de un login,
con permisos por sección y base de datos Postgres.

Para ponerlo a andar, leé **[EMPEZAR-ACA.md](EMPEZAR-ACA.md)**.

---

## De dónde sale

Son dos cosas juntas:

- La **pantalla** es el `click_hub_final_v3.html` de siempre: clientes con su
  ficha, calendario del mes, ideas e inspiración por cliente, tabla de
  delegación, equipo con sus roles, datos del estudio, y el exportador que arma
  el HTML de planificación para mandarle al cliente.
- La **infraestructura** viene del proyecto base: Express + Postgres, sesiones,
  login con bcrypt, permisos por sección, notificaciones y alertas automáticas.

Lo que cambió de fondo es dónde viven los datos. Antes cada persona tenía su
copia en el `localStorage` de su navegador; ahora hay una sola base que ve todo
el equipo, con quién hizo qué.

## Cómo está armado

```
server.js              arranque: sesiones, rutas de la API, páginas protegidas
src/
  db.js                pool de Postgres
  middleware/auth.js   requireAuth / requireAdmin / requireSectionAccess
  lib/
    router.js          router que manda los errores async al middleware de error
    consultas.js       las consultas que comparten varias rutas
    notificaciones.js  alta de notificaciones
    alertas.js         revisión diaria: tareas vencidas, clientes sin planificar
  routes/              una por tema; estado.js es el arranque del hub
views/
  hub.html             el hub entero
  usuarios.html        alta y permisos de usuarios (admins)
public/
  login.html           única página sin sesión
  css/, js/, img/
db/
  schema.sql                  todas las tablas
  seed-admin.js               crea el primer usuario a mano
  importar-localstorage.js    trae los datos de la versión vieja
```

## La API

Todo cuelga de `/api` y todo pide sesión.

| Ruta | Para qué | Permiso |
|---|---|---|
| `POST /api/auth/login` · `/logout` · `GET /me` · `PUT /perfil` | sesión y cuenta propia | — |
| `GET /api/estado` | todo lo que el hub necesita para dibujarse | recorta según permisos |
| `/api/dashboard` | agenda del mes y registro de actividad | `dashboard` |
| `/api/clientes` | alta y edición | `clientes` (la baja, solo admin) |
| `/api/tareas` | alta, edición, estado y pago | `tareas` (eliminar, solo admin) |
| `/api/equipo` | las personas del equipo | solo admin (el `GET`, quien vea tareas) |
| `/api/roles` | roles y los permisos que llevan | solo admin |
| `/api/brainstorm` | ideas y links por cliente y mes | `brainstorm` |
| `/api/fechas` | fechas especiales por cliente y mes | `clientes` |
| `/api/eventos` | eventos del calendario, de uno o varios días | `calendario` (crear/editar, `full`) |
| `/api/etapas` | la planificación que se le muestra al cliente | `calendario` (crear/editar, `full`) |
| `/api/estudio` | datos del estudio | `estudio` |
| `/api/notificaciones` | campanita | — |
| `/api/usuarios` | alta y permisos | solo admin |

`GET /api/estado` es la clave del diseño: la pantalla pide todo de una y después
cada acción manda su propio pedido chico. Por eso el hub sigue siendo el mismo
archivo de siempre con las mismas estructuras en memoria — lo único que cambió es
de dónde salen y a dónde se guardan.

## Permisos, en una línea

Los permisos los lleva el **rol** (Editor, Diseñadora, CM…), no cada usuario. Una
persona hereda los de su rol, con excepciones puntuales si hacen falta, y el
admin puede todo siempre. El detalle está en
[EMPEZAR-ACA.md](EMPEZAR-ACA.md#permisos-los-lleva-el-rol).

Dos consecuencias de diseño que conviene tener presentes:

- **Desactivar a alguien lo saca del equipo.** Baja lógica: la fila queda para
  que las tareas viejas sigan mostrando su nombre, y se libera el `usuario_id`.
  Reactivarlo no lo devuelve al equipo; se lo suma a mano.
- **Al equipo solo entra gente con usuario.** Primero se crea el usuario en
  Usuarios y después se lo suma en Equipo, eligiéndolo de una lista: no hay campo
  de nombre libre. Así el nombre tiene un solo dueño (el usuario) y toda persona
  del equipo tiene a quién avisarle cuando le asignan una tarea. El enlace se
  define únicamente desde Equipo; en Usuarios se muestra pero no se edita.
- **Equipo y Usuarios son admin-only.** No aparecen en la grilla de permisos por
  rol y tampoco se pueden dar como excepción: quién trabaja acá y quién entra al
  sistema lo decide el administrador. Están juntas en `SECCIONES_SOLO_ADMIN`
  (`src/middleware/auth.js`), y `permisosEfectivos` las fuerza a `sin_acceso`, así
  que un permiso viejo guardado en la base se ignora sin necesidad de migrar.
  La única puerta abierta es `GET /api/equipo`: la lista de personas la necesita
  cualquiera que asigne tareas, así que ese endpoint se abre a quien ve tareas.
- **Editar roles es admin-only.** Si no lo fuera, cualquiera con permiso sobre
  los roles podría subirle los permisos a su propio rol.
- **`requireAuth` relee al usuario en cada pedido.** Es una consulta por índice
  primario, y a cambio desactivar a alguien o cambiar un permiso aplica en el
  momento, sin esperar a que venza su sesión.

## Seguridad — qué ya está resuelto

- Contraseñas con bcrypt (nunca en texto plano).
- Límite de intentos de login (8 cada 15 min por IP).
- Cookies de sesión `httpOnly` + `secure` en producción, guardadas en Postgres.
- Sin registro público: el primer usuario se crea con `seed-admin.js`.
- Toda la API pasa por `requireAuth` y por el permiso de su sección. Esconder un
  botón en pantalla es comodidad; el bloqueo real está siempre en el servidor.
- `GET /api/estado` no manda lo que la persona no puede ver: si no tiene acceso a
  Clientes, sus datos de contacto no llegan ni siquiera al navegador.

## Convención de ids

`usuarios` usa UUID, igual que en el proyecto base: es lo que viaja en la sesión.
El resto de las tablas usa `BIGSERIAL`, porque la pantalla del hub trabaja con
ids numéricos y así no hay que traducir nada entre el front y la base.

Ojo con un detalle de `pg`: por defecto devuelve los `BIGINT` como **texto**
(porque un bigint puede pasarse del entero seguro de JavaScript). Con los ids
llegando como `"1"` en vez de `1`, comparaciones como `x.id === cid` fallan en
silencio y, por ejemplo, no abre la ficha del cliente. Por eso `src/db.js`
registra un parser que los convierte a número. Si algún día tocás ese archivo,
no saques esa línea.
