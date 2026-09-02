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
| `DATABASE_URL` | `${{Postgres.DATABASE_PRIVATE_URL}}` |
| `SESSION_SECRET` | un valor largo y aleatorio, ver abajo |
| `NODE_ENV` | `production` |

Para el `DATABASE_URL`, en vez de tipearlo usá el botón **Add a Reference** (o el
banner morado *"Trying to connect a database?"*): elegís el servicio de una lista
y la referencia queda con el nombre correcto, sin riesgo de escribirlo mal. Si lo
escribís a mano, el nombre entre llaves tiene que ser **exactamente** el de tu
servicio de Postgres, respetando mayúsculas.

Se usa `DATABASE_PRIVATE_URL` y no `DATABASE_URL` porque va por la red interna de
Railway: no paga tráfico de salida y no expone la base a internet.

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

## 4. Crear las tablas

La base arranca vacía. Hay dos formas de aplicarle el esquema; cualquiera sirve.

**Opción A — desde tu compu (recomendada).** Con la CLI conectada al proyecto,
corre el script contra la base de Railway sin que tengas que copiar nada:

```bash
npm i -g @railway/cli
railway login
railway link
railway run npm run db:init
```

Te va a listar las 11 tablas y los 4 roles iniciales. Es repetible: si lo corrés
dos veces no rompe ni duplica nada.

**Opción B — desde el panel.** Servicio de Postgres → pestaña **Data** → **Query**,
y pegás entero el contenido de `db/schema.sql`.

---

## 5. Crear tu usuario administrador

No hay registro público: el primer usuario se crea a mano, una sola vez.

```bash
railway run bash -c "ADMIN_EMAIL=vos@click.com ADMIN_PASSWORD='UnaClaveLargaDeVerdad!' ADMIN_NOMBRE='Alan' ADMIN_ROL=admin npm run seed:admin"
```

En Windows, si `bash -c` te da problemas, corré esto en su lugar:

```bash
railway run --service TU-APP npm run seed:admin
```

...habiendo cargado antes `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE` y
`ADMIN_ROL` como variables temporales en el servicio (y borrándolas después).

> La contraseña tiene que tener 10 caracteres o más. Usá una de verdad: es la
> cuenta que puede todo.

Al resto del equipo lo das de alta desde la propia app, en **Usuarios**.

---

## 6. Abrir la app

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

## 7. Comprobar que quedó bien

Entrá al dominio y fijate:

- [ ] `/` te lleva al login (no muestra el hub sin sesión).
- [ ] Entrás con el usuario del paso 5 y ves el hub con el mes actual.
- [ ] Creás un cliente y sigue estando después de recargar.
- [ ] En **Usuarios** aparecen las dos pestañas: Usuarios y Permisos por rol.
- [ ] Abrís el hub en otro navegador (o de incógnito) sin sesión y te rebota.

---

## Si algo falla

| Lo que ves | Qué pasa |
|---|---|
| En el log dice `No puedo arrancar: falta DATABASE_URL` | Falta la variable del paso 3, o la referencia `${{...}}` apunta a un servicio con otro nombre. |
| `ECONNREFUSED ::1:5432` | La variable está pero llegó vacía: la referencia no resolvió. Cargala con **Add a Reference** en vez de a mano. |
| `relation "usuarios" does not exist` | Falta el paso 4: la base está pero sin tablas. |
| En el log dice `No puedo arrancar: falta SESSION_SECRET` | Falta esa variable. |
| Entrás, ponés la contraseña bien y te devuelve al login una y otra vez | Falta `NODE_ENV=production`, o el dominio está entrando por HTTP en vez de HTTPS. La cookie de sesión es `Secure`: solo viaja cifrada. |
| `Email o contraseña incorrectos` con los datos correctos | El usuario del paso 5 quedó en otra base. Verificá que `railway link` apuntaba a este proyecto. |
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
  migraciones que te falten, en este orden:
  `db/migracion-permisos-por-rol.sql` (permisos cargados a mano en cada usuario),
  `db/migracion-dashboard.sql` (el dashboard),
  `db/migracion-equipo-admin.sql` (Equipo pasa a ser admin-only y solo admite
  usuarios registrados) y `db/migracion-quitar-historial-comunicacion.sql` (se
  eliminan esas dos secciones; **ojo, esa borra el chat y las notas por
  cliente**) y `db/migracion-quitar-google.sql` (se elimina la integración con
  Google Calendar; el calendario en sí se conserva). En una base **nueva no hace
  falta ninguna**: `db:init` ya aplica el `schema.sql`, que las trae
  incorporadas.
- **Backups**: el servicio de Postgres en Railway tiene su propia pestaña de
  backups. Vale la pena dejarlos activados.
