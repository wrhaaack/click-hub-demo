# Poner Click Hub en Vercel

Vercel no deja un servidor prendido todo el tiempo como Railway: sirve la
pantalla desde su CDN y corre la API como una función que se despierta con cada
pedido. El repo ya viene preparado para eso:

| Archivo | Qué hace en Vercel |
|---|---|
| `vercel.json` | compila con `npm run build`, sirve `web/dist` en `/app`, manda `/api/*` a la función y programa el cron diario |
| `api/index.js` | la función: es la misma app de Express de `src/app.js` |
| `server.js` | **no se usa en Vercel** (es para tu compu y para Railway) |

Vercel **no trae base de datos propia**: se conecta una de Neon (Postgres) desde
el mismo panel. Es gratis para este tamaño.

---

## 1. Importar el proyecto

En la pantalla de importación de Vercel (repo `wrhaaack/click-hub-demo`):

- **Framework Preset**: dejalo como venga (Vite u Other). `vercel.json` manda
  igual sobre el build, la carpeta de salida y las rutas.
- **Root Directory**: `./` (la raíz del repo).
- **Build / Output / Install**: no los toques; los define `vercel.json`.
- Las variables de entorno cargalas en el paso 3. El primer deploy puede fallar
  por falta de variables; es normal.

Apretá **Deploy**.

## 2. Conectar la base (Neon)

En el proyecto de Vercel → pestaña **Storage** → **Create Database** → **Neon**
(Serverless Postgres) → elegí la región más cercana (São Paulo si está, si no
Washington) → **Connect** al proyecto, marcando los entornos **Production** y
**Preview**.

Eso carga sola la variable `DATABASE_URL` en el proyecto. No hace falta copiar
nada. Es la URL con *pooling*, la indicada para funciones.

## 3. Variables de entorno

Proyecto → **Settings → Environment Variables**. Cargá estas, para Production
(y Preview si vas a usar deploys de prueba):

| Variable | Valor |
|---|---|
| `SESSION_SECRET` | un valor largo y aleatorio: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | otro valor aleatorio distinto. Vercel lo manda solo al llamar al cron, y sin él el cron no corre |
| `ADMIN_EMAIL` | tu email (para crear el primer usuario) |
| `ADMIN_PASSWORD` | una clave de 10 caracteres o más |

`DATABASE_URL` ya está por el paso 2. **No cargues** `PORT` ni `NODE_ENV`: los
maneja Vercel.

## 4. Volver a desplegar

**Deployments** → el último → **⋯ → Redeploy**. Las variables nuevas solo
aplican a los deploys que se hacen después de cargarlas.

## 5. Entrar

Abrí el dominio que te dio Vercel (`click-hub-demo-xxxx.vercel.app`). Te lleva a
`/app/login`. El primer pedido tarda un par de segundos más: es la función
despertándose, que la primera vez además crea las tablas y tu usuario.

Entrá con `ADMIN_EMAIL` / `ADMIN_PASSWORD`, cambiá la contraseña desde **Mi
cuenta** (tocando tu nombre abajo en el menú), y **después borrá
`ADMIN_EMAIL` y `ADMIN_PASSWORD`** de las variables: ya no hacen falta.

## Comprobar que quedó bien

- [ ] `/` lleva a `/app/login`.
- [ ] Entrás y ves el Dashboard; recargás la página y seguís adentro.
- [ ] Creás un cliente, recargás, y sigue estando.
- [ ] Abrís `/app/clientes` de incógnito y termina en el login.
- [ ] Settings → **Cron Jobs** muestra `/api/cron/diario`.

## Diferencias con Railway, para tener en cuenta

- **El cron corre una vez por día** (11:00 UTC, las 8 de Argentina; en el plan
  gratis Vercel lo puede correr en cualquier momento de esa hora). Revisa
  tareas vencidas y clientes sin planificar, y limpia sesiones vencidas.
- **Arranque en frío**: si nadie usó la app por un rato, el primer pedido tarda
  1 a 3 segundos. Después va rápido.
- **El límite de intentos de login** (8 cada 15 minutos) se cuenta por
  instancia de la función: protege, pero menos que en un servidor único.
- **Cada `git push` a `main` redespliega solo.** Los push a otras ramas crean
  deploys de prueba (Preview) con su propia URL.

## Si algo falla

Los errores están en el proyecto → **Logs** (o en el deploy → **Functions**).

| Lo que ves | Qué pasa |
|---|---|
| `Falta DATABASE_URL y SESSION_SECRET` en los logs | Faltan variables, o se cargaron después del último deploy: hacé Redeploy. |
| Entrás y te devuelve al login una y otra vez | Falta `SESSION_SECRET`, o entraste por `http://`. Vercel siempre usa HTTPS: usá la dirección `https://`. |
| `Email o contraseña incorrectos` la primera vez | Faltaban `ADMIN_EMAIL`/`ADMIN_PASSWORD` cuando se creó la base, o la clave tenía menos de 10 caracteres. Cargalas, Redeploy, y probá de nuevo (solo crea el admin si no hay ningún usuario). |
| Las páginas cargan pero todo da "Error interno" | Mirá los logs: casi siempre es la conexión a la base. Revisá que Neon esté conectado al entorno Production. |
| `Demasiados intentos` | El límite anti fuerza bruta. Esperá unos minutos. |
