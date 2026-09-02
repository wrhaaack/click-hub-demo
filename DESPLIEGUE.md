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

En el servicio **de la app** (no el de Postgres) → pestaña **Variables** →
**New Variable**, y cargá estas tres:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `SESSION_SECRET` | un valor largo y aleatorio, ver abajo |
| `NODE_ENV` | `production` |

El valor de `DATABASE_URL` se escribe **tal cual**, con las llaves: es una
referencia a la otra base del proyecto, no un texto fijo. Si tu servicio de
Postgres se llama distinto que "Postgres", usá ese nombre adentro de las llaves.

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

Te va a listar las 12 tablas y los 4 roles iniciales. Es repetible: si lo corrés
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
| El deploy queda reiniciándose y en los logs dice `DATABASE_URL` o `ECONNREFUSED` | Falta la variable del paso 3, o está escrita sin las llaves `${{...}}`. |
| `relation "usuarios" does not exist` | Falta el paso 4: la base está pero sin tablas. |
| `secret option required for sessions` | Falta `SESSION_SECRET`. |
| Entrás, ponés la contraseña bien y te devuelve al login una y otra vez | Falta `NODE_ENV=production`, o el dominio está entrando por HTTP en vez de HTTPS. La cookie de sesión es `Secure`: solo viaja cifrada. |
| `Email o contraseña incorrectos` con los datos correctos | El usuario del paso 5 quedó en otra base. Verificá que `railway link` apuntaba a este proyecto. |
| `Demasiados intentos` | El límite anti fuerza-bruta: 8 intentos cada 15 minutos por IP. Esperá y volvé a probar. |
| `The server does not support SSL connections` | Ya está contemplado: la app apaga SSL sola contra direcciones `.railway.internal`. Si igual aparece, poné la variable `DATABASE_SSL=off`. |
| El healthcheck falla pero la app arranca bien en los logs | Sacá la variable `PORT` si la agregaste a mano. |

Los logs están en el servicio de la app, pestaña **Deployments** → el deploy →
**View Logs**.

---

## Conectar Google Calendar (opcional)

El hub puede trabajar sobre **una agenda compartida del estudio**: la conecta un
administrador una sola vez, y de ahí en más cualquiera del equipo con permiso
"Full" en Calendario crea, edita y borra eventos desde el hub. Quién hizo cada
cosa queda en el registro de actividad del dashboard.

Se eligió una sola agenda y no la cuenta de cada persona para que nadie más
tenga que pasar por la pantalla de permisos de Google ni dar acceso a su
calendario personal.

Sin esto el hub anda igual: la vista Calendario simplemente avisa que no hay
agenda conectada.

### Probarlo en tu compu primero

Conviene. Es el mismo procedimiento, con dos diferencias:

- La URI de redireccionamiento es `http://localhost:3000/api/google/callback`.
  Google acepta `http://localhost` sin certificado; es la única excepción que hace.
- Las variables van en tu `.env` (ya está preparado con los nombres), no en Railway.

Podés cargar **las dos URIs** en el mismo ID de cliente de Google Cloud — la de
localhost y la de Railway — y usar el mismo par de credenciales en los dos lados.
No hace falta crear un proyecto aparte para probar.

Un detalle que se pasa por alto: **el `.env` se lee una sola vez, al arrancar**.
Después de pegar las credenciales hay que cortar el server (Ctrl+C) y volver a
hacer `npm start`; si no, va a seguir diciendo que falta configurar.

### 1. Crear las credenciales en Google Cloud

1. Entrá a [console.cloud.google.com](https://console.cloud.google.com) y creá
   un proyecto (o usá uno que ya tengas).
2. **APIs y servicios → Biblioteca**, buscá **Google Calendar API** y activala.
3. **APIs y servicios → Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **Externo** (salvo que tengas Google Workspace, ahí va Interno).
   - Completá nombre de la app, tu email de soporte y el de contacto.
   - En **Usuarios de prueba**, agregá la cuenta de Google del estudio que va a
     tener la agenda. Mientras la app esté en modo prueba, solo esa cuenta puede
     conectarse — que es justo lo que necesitás.
4. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**.
   - En **URI de redireccionamiento autorizados**, agregá la dirección exacta:
     - Local: `http://localhost:3000/api/google/callback`
     - Railway: `https://TU-DOMINIO/api/google/callback`
   - Guardá y copiá el **ID de cliente** y el **Secreto**.

### 2. Cargar las variables

En Railway, servicio de la app → **Variables**:

| Variable | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | el ID de cliente que te dio Google |
| `GOOGLE_CLIENT_SECRET` | el secreto |
| `GOOGLE_REDIRECT_URI` | `https://TU-DOMINIO/api/google/callback` |
| `TZ_ESTUDIO` | `America/Argentina/Buenos_Aires` (o la tuya) |

El `GOOGLE_REDIRECT_URI` tiene que coincidir **carácter por carácter** con el que
cargaste en Google Cloud. Es el error más común: una barra de más al final y
Google rechaza la conexión con `redirect_uri_mismatch`.

### 3. Conectar la agenda desde el hub

Entrá como administrador → **Calendario** → **Conectar Google Calendar**. Te
lleva a Google, elegís la cuenta del estudio, aceptás, y volvés al hub con la
agenda conectada. Una sola vez.

### Si algo falla

| Lo que ves | Qué pasa |
|---|---|
| `redirect_uri_mismatch` | La URI de Google Cloud y la variable `GOOGLE_REDIRECT_URI` no son idénticas. Fijate en el `http` vs `https` y en la barra final. |
| "Google no mandó el permiso de largo plazo" | Esa cuenta ya había autorizado antes. Entrá a [los permisos de tu cuenta](https://myaccount.google.com/permissions), quitale el acceso a la app y volvé a conectar. |
| `access_blocked` o "app no verificada" | La cuenta que estás usando no está en **Usuarios de prueba** de la pantalla de consentimiento. |
| Los eventos no aparecen | Fijate que la agenda conectada sea la correcta. La cuenta usa su calendario principal salvo que elijas otro. |

---

## Después del primer despliegue

- **Actualizar la app**: `git push` y Railway redespliega solo.
- **Si ya tenías datos** de la versión anterior del hub (la que guardaba todo en
  el navegador), mirá `db/importar-localstorage.js`.
- **Si venías de una versión anterior de esta app**, con los permisos cargados a
  mano en cada usuario, corré una vez `db/migracion-permisos-por-rol.sql`.
- **Backups**: el servicio de Postgres en Railway tiene su propia pestaña de
  backups. Vale la pena dejarlos activados.
