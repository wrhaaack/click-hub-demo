# Poner Click Hub en Railway

De la carpeta en tu compu a la app andando con dominio propio. Son unos 20
minutos la primera vez.

Antes de arrancar necesitás: una cuenta en [railway.app](https://railway.app)
(entrar con GitHub es lo más cómodo) y Node.js instalado localmente.

---

## 1. Subir el código

Railway despliega desde un repositorio de GitHub. Si esta carpeta todavía no es
un repo, desde adentro de `click_hub_final_v3`:

```bash
git init && git add . && git commit -m "Click Hub"
```

Después creás un repositorio **privado** en GitHub (sin README ni .gitignore,
vacío) y lo conectás con los dos comandos que te muestra la propia página:

```bash
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git branch -M main && git push -u origin main
```

> El `.gitignore` ya excluye `node_modules` y el `.env`, así que no se sube
> ninguna clave.

**¿No querés usar GitHub?** Se puede desplegar directo desde la carpeta con la
CLI: `npm i -g @railway/cli`, después `railway login`, `railway init` y
`railway up`. El resto de los pasos es igual.

---

## 2. Crear el proyecto y la base

1. En Railway: **New Project → Deploy from GitHub repo** y elegí el repo.
   Railway detecta que es Node y lo despliega solo. El primer intento va a
   fallar o quedar reiniciándose: todavía no tiene base ni variables. Es normal.
2. Dentro del **mismo proyecto**: **New → Database → Add PostgreSQL**.

Ahora tenés dos servicios en el proyecto: tu app y Postgres.

---

## 3. Conectar la base con la app

**Este es el paso que más se saltea.** Tener el Postgres en el mismo proyecto no
alcanza: hay que decirle a la app dónde está.

> ⚠️ **Railway te va a ofrecer una lista de "Suggested Variables"** con valores
> ya cargados. **No le des Add.** Esos valores los sacó de `.env.example`, que es
> una plantilla: el `DATABASE_URL` apunta a `127.0.0.1` (tu compu) y el
> `SESSION_SECRET` es el texto `cambiar-por-un-valor-largo-y-aleatorio`. Si los
> agregás así, la app arranca contra una base que no existe.

En el servicio **de la app** (no el de Postgres) → pestaña **Variables**, y cargá
**estas tres, nada más**:

| Variable | Valor |
|---|---|
| `SESSION_SECRET` | un valor largo y aleatorio, ver abajo |
| `NODE_ENV` | `production` |

Y el `DATABASE_URL`, que necesita explicación:

```
DATABASE_URL=postgresql://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
```

Se arma pieza por pieza a propósito. Lo intuitivo sería `${{Postgres.DATABASE_URL}}`
o `${{Postgres.DATABASE_PRIVATE_URL}}`, y **las dos fallan**:

- `DATABASE_PRIVATE_URL` **no existe en todos los servicios de Postgres** de
  Railway. Si el tuyo no la tiene, la referencia apunta a la nada.
- `DATABASE_URL` sí existe, pero **es a su vez una variable compuesta**, y la
  referencia anidada tampoco resuelve.

Y acá está la trampa que hace que esto sea tan difícil de diagnosticar: cuando una
referencia `${{...}}` no resuelve, **Railway no avisa ni deja el texto literal:
pasa la variable vacía**. En el panel la ves cargada, con su nombre y todo, pero
al contenedor le llega en blanco.

Las cinco piezas de arriba (`PGUSER`, `PGPASSWORD`, `RAILWAY_PRIVATE_DOMAIN`,
`PGPORT`, `PGDATABASE`) son valores literales y siempre están. Igual va por la red
privada (`postgres.railway.internal`), así que no paga tráfico de salida ni expone
la base.

Si tu servicio de Postgres **no se llama `Postgres`**, cambiá esa palabra por el
nombre de la tarjeta, respetando mayúsculas.

**Para verificar que resolvió de verdad**, no mires el panel — el panel te muestra
la referencia, no el valor. Usá la CLI:

```bash
railway run --service TU-APP -- node -e "console.log(process.env.DATABASE_URL ? 'OK' : 'VACIA')"
```

**Las demás variables que aparezcan en la lista, borralas con la ✕:**

| No la agregues | Por qué |
|---|---|
| `PORT` | La asigna Railway. Si la fijás, el healthcheck no encuentra la app. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE`, `ADMIN_ROL` | Solo las lee `db/seed-admin.js`, que corrés una vez (paso 5). Como variables fijas te dejan la contraseña del admin guardada para siempre. |
| `PGLOCAL_PORT` | Solo sirve para el Postgres embebido de tu compu. |
| `DATABASE_SSL` | Una escotilla de escape. Con la URL privada el código decide solo. |

Si falta `DATABASE_URL` o `SESSION_SECRET`, **la app no arranca** y el log te dice
cuál falta en el primer renglón. Es a propósito: es preferible un deploy en rojo
que uno "Online" que falla recién cuando alguien intenta entrar.

Para el `SESSION_SECRET`, generá uno en tu terminal y pegá lo que salga:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **No agregues `PORT`.** Railway lo asigna solo y la app lo toma de ahí. Si lo
> fijás a mano, el healthcheck no encuentra la app y el deploy queda en rojo.

Cuando guardes las variables, Railway redespliega. Esta vez tiene que quedar en
verde.

---

## 4. Crear las tablas y el primer usuario

**Esto ya no se hace a mano.** Al arrancar, la app aplica `db/schema.sql` sola si
la base está vacía, y si todavía no hay ningún usuario crea el primer admin.

Cargá **dos variables más** en el servicio de la app:

| Variable | Valor |
|---|---|
| `ADMIN_EMAIL` | tu email |
| `ADMIN_PASSWORD` | una clave de 10 caracteres o más |

Guardá, esperá el redeploy, y en los logs vas a ver:

```
Base vacía: esquema aplicado (11 tablas).

Primer usuario creado: vos@tuestudio.com (administrador).
```

**Después de entrar, borrá esas dos variables.** Ya no hacen falta y no conviene
dejar una contraseña guardada en el servicio. Al resto del equipo lo das de alta
desde la propia app, en **Usuarios**.

### Por qué es seguro dejarlo automático

El primer admin **solo se crea si no hay ningún usuario**. Sobre una instalación
que ya tiene gente no hace nada, aunque las variables sigan puestas. Y el
esquema usa `CREATE TABLE IF NOT EXISTS` de punta a punta, así que aplicarlo de
nuevo en cada arranque no toca lo que ya está — solo agrega lo que falte.

Si hay más de una réplica levantando a la vez, un lock de Postgres hace que solo
una aplique el esquema y la otra espere.

### Si preferís hacerlo a mano

Los scripts siguen ahí: `npm run db:init` y `npm run seed:admin`. Ojo que desde
tu compu **no llegás a la base**: vive en la red privada de Railway. Para llegar
hay que abrir un proxy TCP temporal:

```bash
railway tcp-proxy add --service Postgres --port 5432
```

Eso te da un `host:puerto` público. Con eso:

```bash
$env:DATABASE_URL="postgresql://postgres:LA-CLAVE@EL-HOST:EL-PUERTO/railway"; $env:DATABASE_SSL="on"; npm run db:init
```

La clave sale de `railway variables --service Postgres --kv`. **Cerrá el proxy
al terminar** (`railway tcp-proxy delete --service Postgres <ID>`): mientras esté
abierto, tu base es accesible desde internet.

---

## 5. Abrir la app

Servicio de la app → **Settings → Networking → Generate Domain**. Railway te da
una dirección tipo `tu-app.up.railway.app`. Entrás ahí y tenés el login.

### Dominio propio

1. **Settings → Networking → Custom Domain** y escribí un subdominio, por
   ejemplo `hub.tudominio.com`. Conviene un subdominio y no el dominio pelado,
   para no tocar donde ya tenés algo.
2. Railway te da un registro **CNAME**.
3. En el panel DNS de tu dominio (Hostinger, Namecheap, donde sea) agregás ese
   CNAME con el nombre `hub`.
4. Tarda entre unos minutos y un par de horas en propagar. El certificado HTTPS
   lo emite Railway solo.

---

## 6. Comprobar que quedó bien

Entrá al dominio y fijate:

- [ ] `/` te lleva al login (no muestra el hub sin sesión).
- [ ] Entrás con el usuario del paso 4 y ves el hub con el mes actual.
- [ ] Creás un cliente y sigue estando después de recargar.
- [ ] En **Usuarios** aparecen las dos pestañas: Usuarios y Permisos por rol.
- [ ] Abrís el hub en otro navegador (o de incógnito) sin sesión y te rebota.

---

## Si algo falla

| Lo que ves | Qué pasa |
|---|---|
| En el log dice `No puedo arrancar: falta DATABASE_URL` | Falta la variable del paso 3, o la referencia `${{...}}` apunta a un servicio con otro nombre. |
| `ECONNREFUSED ::1:5432` | La variable está pero llegó vacía: la referencia no resolvió. Cargala con **Add a Reference** en vez de a mano. |
| `relation "usuarios" does not exist` | No debería pasar: la app aplica el esquema al arrancar. Mirá los logs del arranque, ahí está el motivo real. |
| En el log dice `No puedo arrancar: falta SESSION_SECRET` | Falta esa variable. |
| Entrás, ponés la contraseña bien y te devuelve al login una y otra vez | Falta `NODE_ENV=production`, o el dominio está entrando por HTTP en vez de HTTPS. La cookie de sesión es `Secure`: solo viaja cifrada. |
| `Email o contraseña incorrectos` con los datos correctos | Revisá en los logs que diga "Primer usuario creado". Si no aparece, faltaban `ADMIN_EMAIL`/`ADMIN_PASSWORD` o la clave tenía menos de 10 caracteres. |
| `Demasiados intentos` | El límite anti fuerza-bruta: 8 intentos cada 15 minutos por IP. Esperá y volvé a probar. |
| `The server does not support SSL connections` | Ya está contemplado: la app apaga SSL sola contra direcciones `.railway.internal`. Si igual aparece, poné la variable `DATABASE_SSL=off`. |
| El healthcheck falla pero la app arranca bien en los logs | Sacá la variable `PORT` si la agregaste a mano. |

Los logs están en el servicio de la app, pestaña **Deployments** → el deploy →
**View Logs**.
## Después del primer despliegue

- **Actualizar la app**: `git push` y Railway redespliega solo.
- **Si ya tenías datos** de la versión anterior del hub (la que guardaba todo en
  el navegador), mirá `db/importar-localstorage.js`.
- **Si venías de una versión anterior de esta app**, corré una vez las
  migraciones. **Casi nunca hace falta**: la app aplica `db/schema.sql` en cada
  arranque, y ese archivo crea las tablas que falten y agrega las columnas que
  falten (bloque PUESTA AL DÍA), tanto en una base nueva como en una vieja.

  Esto último se agregó después de que un despliegue saliera sin un solo error y
  la app se cayera igual con `column "a_pagar" does not exist`: hasta entonces el
  arranque solo creaba tablas nuevas, y una columna agregada a una tabla que ya
  existía no llegaba nunca.

  Las únicas que todavía hacen algo que el arranque no hace son las que **borran**
  cosas, porque `schema.sql` no borra nada: `db/migracion-quitar-historial-comunicacion.sql`
  (**ojo, borra el chat y las notas por cliente**) y `db/migracion-quitar-google.sql`
  (saca la tabla de la integración con Google; el calendario en sí se conserva).
  Correrlas es opcional: sin ellas quedan un par de tablas sin uso, nada más.
- **Backups**: el servicio de Postgres en Railway tiene su propia pestaña de
  backups. Vale la pena dejarlos activados.
