# Click Hub — cómo dejarlo andando en tu compu

Hace falta **Node.js 18 o mayor** ([nodejs.org](https://nodejs.org)). Para
subirlo a internet, seguí después con [DESPLIEGUE.md](DESPLIEGUE.md).

## 1. Instalar

```bash
npm install
```

## 2. La base de datos

Sin instalar nada, con un PostgreSQL de verdad que vive dentro de la carpeta:

```bash
npm run db:local
```

Se queda corriendo: dejá esa terminal abierta y abrí otra para lo que sigue.
Los datos quedan en `.postgres-local/`. Para empezar de cero, cerrala y borrá
esa carpeta.

Si ya tenés un PostgreSQL instalado, creá una base vacía y usá su URL en el
paso 3.

## 3. El archivo `.env`

Copiá `.env.example` a `.env`. Con `npm run db:local` el `DATABASE_URL` ya está
bien. Cambiá:

- `SESSION_SECRET`: cualquier texto largo. Para generar uno:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `ADMIN_EMAIL` y `ADMIN_PASSWORD`: tu usuario. Se crea solo la primera vez que
  arranca el servidor, si la base no tiene ningún usuario.

## 4. Compilar y arrancar

```bash
npm run build
npm start
```

Abrí http://localhost:3000 y entrá con el usuario del `.env`. Las tablas se
crean solas al arrancar.

### Mientras programás

En vez de compilar cada vez: `npm start` en una terminal y `npm run dev` en
otra, y abrí **http://localhost:5173/app/**. Los cambios en `web/` se ven al
guardar. Vite le pasa `/api` al servidor de Express, así la sesión es la misma.

## 5. Primeros pasos en la app

1. **Usuarios** → creá a cada persona del estudio con su rol (Editor,
   Diseñadora, CM, SMM). El rol define qué puede ver y tocar.
2. **Equipo** → sumá a quienes van a recibir tareas (se eligen de los usuarios).
3. **Liquidaciones → Tarifas** → revisá los precios de N1/N2/N3 y el valor del
   punto del cotizador.
4. **Clientes** → cargá los clientes (o los prospectos, en su pestaña).

## Si nadie puede entrar

```bash
ADMIN_EMAIL=vos@click.com ADMIN_PASSWORD="unaClaveLarga123" npm run seed:admin
```

Crea un admin, o le pone esa contraseña a uno que ya existe y lo reactiva.
