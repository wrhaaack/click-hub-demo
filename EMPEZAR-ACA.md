# Click Hub — cómo dejarlo andando

> ¿Lo querés poner online en Railway? Los pasos están en
> **[DESPLIEGUE.md](DESPLIEGUE.md)**. Esta guía es para correrlo en tu compu.

Esto es el hub de Click de siempre (clientes, calendario, brainstorming,
delegación, equipo, el estudio) pero ahora con **login,
base de datos y permisos por persona**, tomando la estructura del proyecto base.

Antes era un archivo HTML suelto que guardaba todo en el navegador de cada uno:
si abrías el hub en otra compu, no veías nada de lo que habías cargado. Ahora los
datos viven en una base Postgres y los ve todo el equipo.

---

## 1. Instalar las dependencias

Abrí una terminal dentro de esta carpeta y corré:

    npm install

Hace falta Node.js 18 o mayor (https://nodejs.org).

---

## 2. Levantar la base de datos

El hub necesita PostgreSQL. Hay dos caminos: elegí uno.

### Sin instalar nada (recomendado para probar)

    npm run db:local

Levanta un PostgreSQL de verdad, solo para desarrollo, con los archivos dentro de
`.postgres-local/` (que no se sube a GitHub). La primera vez tarda unos segundos
en armarse.

**Se queda corriendo: dejá esa terminal abierta y abrí otra para lo que sigue.**
Ctrl+C la apaga. Para empezar de cero, la apagás y borrás la carpeta
`.postgres-local`.

Usa el puerto **5433**, no el 5432, para no chocar si algún día instalás
PostgreSQL de verdad. Si ese puerto ya está ocupado:

    PGLOCAL_PORT=5435 npm run db:local

(y ajustá el puerto en el `DATABASE_URL` de tu `.env`).

### Con un PostgreSQL instalado

Si ya tenés PostgreSQL, o preferís instalarlo, creá una base vacía y usá su
dirección en el `.env` del paso siguiente. También podés apuntar a una base de
Railway, pero conviene que sea **otra**, no la de producción.

---

## 3. Crear el archivo `.env`

En la raíz hay un `.env.example` con las variables que hacen falta. Copialo como
`.env` y completá:

- `DATABASE_URL` — la dirección de tu base. Si usás `npm run db:local`, es
  exactamente la que te imprime al arrancar:

      postgres://clickhub:clickhub@127.0.0.1:5433/clickhub

- `SESSION_SECRET` — para desarrollo sirve cualquier valor largo. Para producción
  generá uno con:

      node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

- `NODE_ENV` — `development`
- `PORT` — 3000

El `.env` nunca se sube a GitHub: ya está listado en el `.gitignore`.

> **Ojo con `NODE_ENV`.** Si lo ponés en `production` en tu compu, la cookie de
> sesión pasa a ser `Secure` y por `http://localhost` no viaja: vas a poder
> escribir bien la contraseña y aun así volver al login una y otra vez.

---

## 4. Crear las tablas

    npm run db:init

Deja las 11 tablas vacías y cargados los 4 roles con los que arranca el hub
(Editor, Diseñadora, CM, SMM), cada uno con sus permisos de base. Se puede correr
más de una vez sin romper nada.

---

## 5. Crear tu usuario

No hay registro público: el primer usuario se crea a mano. En PowerShell:

    $env:ADMIN_EMAIL="vos@click.com"; $env:ADMIN_PASSWORD="unaClaveLarga123!"; $env:ADMIN_NOMBRE="Alan"; $env:ADMIN_ROL="admin"; npm run seed:admin

En bash / Mac / Linux:

    ADMIN_EMAIL=vos@click.com ADMIN_PASSWORD="unaClaveLarga123!" ADMIN_NOMBRE="Alan" ADMIN_ROL=admin npm run seed:admin

La contraseña tiene que tener 10 caracteres o más.

De ahí en más, los usuarios del resto del equipo los creás desde la pantalla de
**Usuarios** (el ícono 👤 abajo a la izquierda, solo lo ven los admins). Ahí no
hace falta configurar permisos uno por uno: elegís el rol de la persona y hereda
los permisos de ese rol (ver más abajo).

El orden importa y es siempre el mismo:

1. **Usuarios** → creás la cuenta (nombre, email, contraseña, rol).
2. **Equipo** → la sumás eligiéndola de la lista de usuarios ya registrados.

Recién cuando está en Equipo se le pueden asignar tareas. No hay forma de cargar
a alguien "suelto" escribiendo un nombre: si no tiene usuario, no hay a quién
avisarle cuando le toque una tarea, que es justo para lo que sirve la lista.

**Cuando alguien se va**, lo desactivás en Usuarios y con eso sale del equipo:
deja de aparecer para asignarle trabajo. Las tareas que ya tenía asignadas se
conservan tal cual, con su nombre. Si vuelve, reactivarla la deja entrar de nuevo
pero **no** la devuelve al equipo: eso se hace a mano, para que sumar a alguien
al trabajo sea siempre una decisión y nunca un efecto secundario.

---

## 6. Arrancar

    npm start

Y entrás a http://localhost:3000

Del día a día en adelante son solo dos terminales:

| Terminal 1 | Terminal 2 |
|---|---|
| `npm run db:local` | `npm start` |

Los pasos 4 y 5 se hacen una sola vez.

---

## 7. (Opcional) Traer lo que ya tenías cargado

Si venías usando el `click_hub_final_v3.html` viejo y tenés datos ahí, se pueden
importar. Los pasos están explicados arriba de todo en
`db/importar-localstorage.js`: sacás un JSON desde la consola del navegador con
el hub viejo abierto, y después corrés:

    node db/importar-localstorage.js datos-viejos.json

Solo funciona sobre una base vacía, para no duplicar nada.

---

## Permisos: los lleva el rol

La idea es no configurar diez opciones por cada persona. **Los permisos viven en
el rol** (Editor, Diseñadora, CM, SMM…): le asignás el rol a alguien y hereda de
ahí lo que puede ver y tocar.

Cómo se decide qué puede hacer una persona, en orden:

1. Si es **administrador**, puede todo. Punto.
2. Si no, se miran los permisos de **su rol**.
3. Si además tiene una **excepción** cargada para una sección puntual, esa
   excepción pisa lo que dice el rol.
4. Si no tiene ni rol ni excepción, no ve nada.

Los permisos del rol se editan en **Usuarios → Permisos por rol**. Cambiar algo
ahí alcanza a todos los que tengan ese rol, en el momento, sin que nadie tenga
que volver a entrar. Las excepciones se cargan en la ficha de cada usuario, y
solo para los casos sueltos ("a Sofi además dejala editar el estudio").

Para cada sección se elige un nivel:

| Nivel | Qué significa |
|---|---|
| **Full** | Ve la sección y la modifica: crear, editar, asignar. |
| **Limitado** | Ve la sección y la usa en el día a día, pero no cambia lo de fondo. |
| **Sin acceso** | La sección no le aparece en el menú. |

Un detalle que no es obvio: **Tareas** no es una vista del menú, es un permiso
transversal. Manda sobre las tareas donde sea que aparezcan (en la ficha del
cliente, en el calendario, en la delegación):

- *Sin acceso* — las ve pero no las toca.
- *Limitado* — mueve el estado (pendiente → en progreso → …) y marca el pago.
- *Full* — además crea, edita y asigna.

Así podés tener a alguien que trabaja con las tareas todos los días sin que pueda
inventar tareas nuevas.

### Lo que solo puede hacer un administrador

Estas seis cosas no las habilita ningún rol ni ninguna excepción:

- Crear, editar y desactivar usuarios, y resetear sus contraseñas.
- Crear, renombrar y borrar roles, y definir qué permisos lleva cada uno.
- Ver la sección **Equipo**, y agregar, editar y dar de baja a sus integrantes.
- Dar de baja clientes.
- Eliminar tareas.

Las tres primeras son estructurales: definen quién trabaja acá y qué puede hacer
cada uno. Si alguien que no es admin pudiera editar un rol, se subiría los
permisos a sí mismo. Las otras tres son las que no tienen vuelta atrás.

Por eso **Equipo** y **Usuarios** no aparecen en la grilla de Permisos por rol:
no hay nivel que elegir, ya está decidido. A quien no es administrador, Equipo
directamente no le figura en el menú.

Con una salvedad: los nombres del equipo se siguen usando para **asignar
tareas**. Esa lista sí la recibe cualquiera que trabaje con tareas — si no, las
pastillas de "asignado a" quedarían vacías y nadie podría delegar. Lo que queda
cerrado es la sección: verla completa, y agregar, editar o dar de baja gente.

---

## Avisos: todos se enteran de todo

Como el hub lo usan varias personas a la vez, **cada cosa que pasa le llega al
resto** por la campanita de abajo a la izquierda. Nunca al que hizo la acción:
nadie necesita que le avisen de lo que acaba de hacer.

| Qué pasó | A quién le llega |
|---|---|
| Se cargó un cliente nuevo | A todos |
| Se editó o se dio de baja un cliente | A todos |
| Se creó, editó o eliminó una tarea | A todos |
| Se le asignó una tarea a alguien | Aviso personal a esa persona ("te asignó…") |
| Se movió el estado de una tarea | A todos |
| Se marcó o desmarcó un pago | A todos |
| Se dio de alta un usuario | A todos, menos al que se acaba de crear |

Si a alguien le asignan una tarea, recibe el aviso personal y **no** además el
general: nunca llegan dos notificaciones por la misma cosa.

Además hay dos avisos que genera el sistema solo, una vez por día:

- **Tarea vencida** — se pasó la fecha límite y no está en Listo ni Cumplido.
  Le llega a las personas asignadas que tengan login; si no hay ninguna, a todos.
- **Cliente sin planificar** — pasado el día 10 del mes, un cliente activo que
  todavía no tiene ninguna tarea cargada para ese mes.

Esos dos, si los borrás, te pregunta si querés que vuelvan a aparecer mientras el
problema siga.

---

## El Dashboard

Es la pantalla que abre por defecto. Tiene tres cosas:

- **El resumen del mes** arriba: tareas totales, pendientes, en progreso y
  listas. Las tres últimas llevan un anillo con qué porcentaje del total son, así
  se ve de un vistazo cómo viene el mes. El total no lleva anillo: sería 100%
  siempre.
- **Fechas del mes** a la izquierda: un renglón por cada día, con lo que cae ese
  día — las tareas, las fechas especiales y los eventos del calendario. El día de hoy
  queda resaltado y la lista arranca ahí.
- **Últimas actividades** a la derecha: qué se agregó, editó o eliminó, quién lo
  hizo y cuándo, y quién se sumó al equipo con qué rol. El puntito de la
  izquierda dice de qué se trata: verde un alta, azul una edición, rojo una baja.

A propósito **no** se registran las cosas de configuración (sumar gente al
equipo, cargar fechas especiales, escribir ideas en el brainstorming): llenarían
la lista de ruido y taparían los movimientos que importan.

---

## Clientes

Una tarjeta por cliente, con las tareas del mes que está seleccionado arriba.
Los botones **+ Cliente** y **+ Tarea** están dentro de la sección, igual que
"+ Etapa" en Calendario. Arriba a la derecha aparecen los mismos dos botones
pero **solo en el Dashboard**: ahí son el acceso rápido, y en el resto de las
pantallas estorbaban o apuntaban a otra sección.

Entrando a un cliente, la pestaña **Info** muestra sus datos y también el cobro,
con el botón "Editar info y cobro" que abre todo en el mismo formulario.

### El cobro

Cada cliente tiene un monto (**A pagar**) y un **estado**, que es un desplegable
con tres opciones:

- **Pendiente** — todavía no pagó nada.
- **Parcial** — pagó una parte. Ahí aparece un campo más, **Cuánto abonó**, con
  la cuenta al lado ("De $15.000 · falta $10.000"). El campo solo se muestra con
  este estado: en los otros dos el monto ya está dicho por el estado, y dejarlo
  cargado permitiría que la ficha se contradiga.
- **Pagado** — cobrado completo.

En la tarjeta se ve como una pastilla: `a pagar $15.000` en rojo, `parcial
$5.000 de $15.000` en ámbar, `pagado $15.000` en verde. Con estado pendiente y
sin monto acordado no se muestra nada: una pastilla de impago sería una alarma
sobre algo que nadie definió todavía.

No se puede abonar más de lo que hay que pagar — eso no es un pago parcial. Y la
base lo sostiene además del servidor: `abonado` solo puede tener valor cuando el
estado es `parcial`.

Cualquier cambio de cobro deja su propio renglón en "Últimas actividades" y le
avisa al equipo, incluido pasar de $5.000 a $12.000 abonados sin cambiar de
estado: ese es justamente el dato.

---

## El calendario

Arriba de la grilla dice el mes que estás viendo, en las dos pestañas. Los dos
calendarios —el del equipo y el del cliente— usan la **misma** estructura y los
mismos estilos: los días del mes de al lado rayados, los números arriba a la
derecha, el día de hoy resaltado y las barras cruzando los días. Antes eran dos
hojas de estilo parecidas pero no iguales, y se iban separando solas cada vez
que se tocaba una.

Muestra dos cosas distintas y las dibuja distinto. Las **tareas** de los
clientes van adentro de la celda de su día, con el color del rol que las tiene
que hacer. Los **eventos** del estudio (reuniones, grabaciones, feriados, un
rodaje de tres días) van como **barras que cruzan los días**, con el color que
les elegiste. Los eventos no tienen rol, así que al filtrar por rol se ocultan.

Un evento tiene **desde** y **hasta**. Si no ponés "hasta", dura un solo día. Y
tiene **hora de inicio** y **hora de fin**: si no ponés hora, es de todo el día.
Las dos cosas son independientes — un rodaje puede durar tres días y arrancar
9:30 el primero.

Cuando una barra pasa de una semana a la otra se parte sola y se corta al ras de
ese lado, para que se lea como una barra sola y no como dos eventos. La hora
aparece solo en el tramo donde el evento arranca de verdad.

Con permiso **full** en Calendario, la grilla se maneja tocándola:

- **Tocás un día** y se abre el alta con esa fecha ya puesta. Al pasar el mouse
  por encima aparece un `+` en la esquina; en un celular no hay dónde pasar el
  mouse, así que el texto de arriba lo dice. No hay botón "+ Evento": tocar el
  día ya lo hace, también en pantalla táctil, y el botón era una segunda puerta
  al mismo formulario.
- **Tocás un evento** y se abre para editarlo o eliminarlo. Podés cambiarle las
  fechas y la barra se muda sola.
- **Tocar una tarea no hace nada** a propósito: es de un cliente y se maneja
  desde su ficha, y abrir el alta de un evento porque tocaste una tarea sería
  peor que no hacer nada.

En el dashboard, un evento de varios días aparece en **cada** día que ocupa
dentro de "Fechas del mes": la agenda contesta "qué pasa el jueves", y un rodaje
de tres días pasa los tres. Los días que no son el primero llevan "(sigue)".

Si creás un evento con un filtro por rol puesto, el filtro se saca solo: si no,
el evento recién creado no se vería y parecería que falló.

Con permiso **limitado** el calendario se mira y no se toca: se ven las tareas y
los eventos, pero no hay `+`, ni cursor de mano, ni botón. Y si alguien igual
intenta escribir por su cuenta, el servidor responde 403.

---

### El calendario del cliente

La sección tiene dos pestañas. **Equipo** es el calendario de arriba. **Cliente**
es otra cosa: es cómo se le muestra a un cliente su proyecto, y sirve para
mandárselo.

Ahí no hay tareas ni eventos: hay **etapas**, que son tramos con un nombre
escrito para que lo lea el cliente ("Diseño de piezas", "Grabación",
"Revisión"), un color y una nota opcional. Igual que los eventos: si no ponés
"hasta", la etapa dura un solo día. Se dibujan como barras que cruzan los días,
se parten solas cuando pasan de una semana a la otra y se acomodan en filas para
no pisarse.

No salen de las tareas a propósito: lo que el equipo escribe para organizarse
casi nunca es lo que conviene mostrarle a quien paga.

Se maneja igual que el otro: **tocás un día** y se abre el alta con esa fecha,
**tocás una etapa** y se abre para editarla o eliminarla. Debajo de la grilla
queda la lista con los nombres completos, porque en las barras los títulos
largos se cortan.

**Exportar imagen** baja un PNG de 4200px de ancho, con el logo, el nombre del
cliente, el mes y la misma grilla que ves en pantalla. Está a 3x para que se
pueda ampliar o imprimir sin que se vea pixelado; pesa alrededor de 600 KB.

Con permiso **limitado** en Calendario se ve y se exporta, pero no se toca: sirve
para que alguien pueda mostrarle la planificación a un cliente sin poder
cambiarla.

---

## Los links que cargás

Los links útiles de un cliente, los del estudio y los de inspiración del
brainstorming **abren en una pestaña nueva** y van a la página, aunque los
escribas sin protocolo. Antes, un `google.com.ar` sin `https://` el navegador lo
leía como una ruta del propio hub y el click terminaba en un 404: ahora se le
pone `https://` adelante solo. `mailto:` y `tel:` se respetan tal cual.

Cualquier otro tipo de link (por ejemplo un `javascript:...`) se muestra como
texto y no se puede abrir. No es una restricción caprichosa: estos links los
carga una persona y los ve todo el equipo, así que un `javascript:` guardado ahí
sería código corriendo en la sesión de quien lo clickee.

---

## Detalles de la pantalla

**Anda en cualquier resolución.** En escritorio se ve igual que siempre. Por
debajo de 860px el menú lateral se convierte en un cajón que se abre con el botón
de las tres rayas y se cierra al elegir algo, al tocar afuera o con Escape. Los
modales pasan a ser una hoja que sube desde abajo, el calendario scrollea solo en
horizontal en vez de aplastarse, y las tarjetas se apilan en una columna.

---

## Qué hay adentro, para orientarte

- `server.js` — el arranque: registra las rutas y sirve las páginas
- `src/routes/` — un archivo por tema (clientes, tareas, equipo, roles,
  brainstorm, fechas, estudio, usuarios, notificaciones)
- `src/routes/estado.js` — devuelve de una sola vez todo lo que el hub necesita
  para dibujarse; es lo primero que pide la pantalla al abrirse
- `src/middleware/auth.js` — login y el sistema de permisos por sección
- `src/lib/` — lógica suelta: alertas automáticas, notificaciones, consultas
  compartidas, y el router que atrapa los errores async
- `views/hub.html` — el hub entero (es la misma pantalla de siempre)
- `views/usuarios.html` — alta y permisos de usuarios (solo admins)
- `public/` — lo que se sirve sin login: el login, el CSS y el logo
- `db/schema.sql` — todas las tablas, y `db/init.js` que las aplica
- `db/postgres-local.js` — el PostgreSQL de desarrollo (`npm run db:local`)
- `DESPLIEGUE.md` — los pasos para ponerlo online en Railway
- `db/migracion-permisos-por-rol.sql` — solo si ya tenías la base andando de
  antes, cuando los permisos se cargaban a mano en cada usuario

Si vas a cambiar los colores, las variables están al principio del `<style>` de
`views/hub.html` y arriba de `public/css/click.css`.
