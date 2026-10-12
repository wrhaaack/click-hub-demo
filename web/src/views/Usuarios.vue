<script setup>
import { ref, reactive, computed } from 'vue';
import Icono from '../components/Icono.vue';
import Modal from '../components/Modal.vue';
import { st, recargar } from '../lib/store';
import { api, avisar } from '../lib/api';

// Quién entra al sistema y qué puede hacer. Solo para administradores.
//
// Los permisos los lleva el ROL: una persona hereda los de su rol, y se le
// pueden cargar excepciones puntuales que pisan lo heredado.
//
// Cada "ayuda" describe exactamente lo que deja hacer el servidor. Equipo y
// Usuarios no figuran a propósito: son admin-only y no se otorgan.
const SECCIONES = [
  { key: 'dashboard', label: 'Dashboard', niveles: ['full', 'sin_acceso'],
    ayuda: 'El resumen del mes, la agenda y el registro de actividad. Muestra nombres de clientes y tareas.' },
  { key: 'clientes', label: 'Clientes', niveles: ['full', 'limitado', 'sin_acceso'],
    ayuda: 'Limitado: ver clientes, su ficha y la pauta. Full: además crear y editar clientes, links, fechas especiales, cobro y pauta, y usar el cotizador.' },
  { key: 'tareas', label: 'Tareas', niveles: ['full', 'limitado', 'sin_acceso'],
    ayuda: 'Manda sobre las tareas donde aparezcan. Sin acceso: las ve. Limitado: mueve el estado, marca el pago y liquida. Full: además crea, edita y asigna. Eliminar es solo del admin.' },
  { key: 'calendario', label: 'Calendario', niveles: ['full', 'limitado', 'sin_acceso'],
    ayuda: 'Limitado: ver la grilla y la planificación del cliente, y exportarla. Full: además crear, editar y borrar eventos y etapas.' },
  { key: 'brainstorm', label: 'Brainstorming', niveles: ['full', 'limitado', 'sin_acceso'],
    ayuda: 'Limitado: leer ideas e inspiración. Full: además escribirlas, borrarlas y pasar una idea a tarea.' },
  { key: 'delegacion', label: 'Tareas (pantalla)', niveles: ['full', 'sin_acceso'],
    ayuda: 'Ver la pantalla Tareas, la tabla de quién tiene qué. Lo que se puede tocar ahí lo decide el permiso de Tareas.' },
  { key: 'estudio', label: 'El estudio', niveles: ['full', 'limitado', 'sin_acceso'],
    ayuda: 'Limitado: ver los datos y links del estudio. Full: además editarlos.' },
];
const NIVEL = { full: 'Full', limitado: 'Limitado', sin_acceso: 'Sin acceso' };
const SOLO_ADMIN = [
  'Crear, editar y desactivar usuarios, y resetear sus contraseñas',
  'Crear, renombrar y borrar roles, y definir qué permisos lleva cada uno',
  'Ver la sección Equipo, y sumar, editar y dar de baja a sus integrantes',
  'Cambiar las tarifas (diseño, video, cotizador)',
  'Dar de baja clientes',
  'Eliminar tareas',
];

const tab = ref('usuarios');
const usuarios = ref([]);
const roles = ref([]);
async function cargar() {
  const [u, r] = await Promise.all([api('/api/usuarios'), api('/api/roles')]);
  if (u) usuarios.value = u;
  if (r) roles.value = r;
}
cargar();

const activos = computed(() => usuarios.value.filter((u) => u.activo).length);
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
const abiertas = (permisos) => SECCIONES.filter((s) => permisos?.[s.key] && permisos[s.key] !== 'sin_acceso').length;

// ---------- Alta / edición ----------
const form = ref(null);
const verClave = ref(false);
function abrir(u) {
  verClave.value = false;
  form.value = reactive({
    id: u?.id ?? null, nombre: u?.nombre ?? '', email: u?.email ?? '', password: '',
    rol: u?.rol ?? 'empleado', rol_id: u?.rol_id ?? roles.value[0]?.id ?? null,
    permisos: { ...(u?.permisos ?? {}) }, miembro: u?.miembro ?? null,
  });
}
// Lo que hereda del rol elegido, para mostrarlo al lado de cada excepción.
const heredado = computed(() => roles.value.find((r) => r.id === form.value?.rol_id)?.permisos || {});
async function guardar() {
  const f = form.value;
  if (!f.nombre.trim() || !f.email.trim()) return avisar('Faltan nombre o email.');
  if (!f.id && f.password.length < 10) return avisar('La contraseña tiene que tener al menos 10 caracteres.');
  const permisos = Object.fromEntries(Object.entries(f.permisos).filter(([, v]) => v));
  const r = await api(f.id ? `/api/usuarios/${f.id}` : '/api/usuarios', {
    method: f.id ? 'PUT' : 'POST', body: { ...f, permisos },
  });
  if (!r) return;
  if (f.id && f.password) {
    if (f.password.length < 10) return avisar('La contraseña nueva tiene que tener al menos 10 caracteres.');
    if (!(await api(`/api/usuarios/${f.id}/password`, { method: 'PUT', body: { password: f.password } }))) return;
  }
  form.value = null;
  avisar('Usuario guardado.', 'ok');
  await cargar();
  recargar();   // el nombre se copia al equipo y a las tareas asignadas
}
async function alternarActivo(u) {
  const accion = u.activo ? 'desactivar' : 'reactivar';
  if (!confirm(`¿${accion[0].toUpperCase() + accion.slice(1)} a ${u.nombre}?${u.activo ? ' También sale del equipo.' : ''}`)) return;
  const r = await api(`/api/usuarios/${u.id}/activo`, { method: 'PATCH', body: { activo: !u.activo } });
  if (r) { await cargar(); recargar(); }
}

// ---------- Permisos por rol ----------
const rolAbierto = ref(null);
async function guardarRoles() {
  const r = await api('/api/roles', { method: 'PUT', body: { roles: roles.value } });
  if (!r) return;
  roles.value = r.roles;
  avisar('Guardado. Ya les aplica a todos los que tengan estos roles.', 'ok');
  cargar();
}
</script>

<template>
  <div class="pagina">
    <div class="pag-head">
      <h1>Usuarios</h1>
      <span class="info" title="Quién entra al sistema y qué puede hacer. Solo para administradores."><Icono n="info" /></span>
    </div>

    <div class="barra">
      <div class="tabs">
        <button class="tab" :class="{ on: tab === 'usuarios' }" @click="tab = 'usuarios'">Usuarios <span class="cuenta">{{ activos }}</span></button>
        <button class="tab" :class="{ on: tab === 'roles' }" @click="tab = 'roles'">Permisos por rol <span class="cuenta">{{ roles.length }}</span></button>
      </div>
      <div class="acciones">
        <button v-if="tab === 'usuarios'" class="btn p" @click="abrir(null)"><Icono n="mas" :t="16" />Nuevo usuario</button>
        <button v-else class="btn p" @click="guardarRoles">Guardar permisos</button>
      </div>
    </div>

    <template v-if="tab === 'usuarios'">
      <table class="tabla">
        <thead><tr><th>Nombre</th><th>Email</th><th>Cuenta</th><th>Rol</th><th>Equipo</th><th>Estado</th><th>Último ingreso</th></tr></thead>
        <tbody>
          <tr v-for="u in usuarios" :key="u.id" :class="{ apagado: !u.activo }" @click="abrir(u)">
            <td><span class="nombre"><span class="avatar">{{ u.nombre[0] }}</span>{{ u.nombre }}<span v-if="u.id === st.yo.id" class="pill neutro">vos</span></span></td>
            <td class="muted">{{ u.email }}</td>
            <td><span class="pill" :class="u.rol === 'admin' ? 'tan' : 'neutro'">{{ u.rol === 'admin' ? 'Admin' : 'Equipo' }}</span></td>
            <td class="muted">{{ u.rol === 'admin' ? 'Todo' : (u.rol_nombre || 'Sin rol') }}<template v-if="u.rol !== 'admin' && Object.keys(u.permisos || {}).length"> · {{ Object.keys(u.permisos).length }} excepción(es)</template></td>
            <td class="muted">{{ u.miembro ? (u.miembro.rol || 'Sí') : '—' }}</td>
            <td @click.stop>
              <button class="pill" :class="u.activo ? 'ok' : 'mal'" style="border:none;cursor:pointer" :disabled="u.id === st.yo.id" @click="alternarActivo(u)">{{ u.activo ? 'Activo' : 'Inactivo' }}</button>
            </td>
            <td class="muted">{{ fecha(u.ultimo_login) }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <template v-else>
      <div class="tarjeta aviso-admin">
        <b><Icono n="candado" :t="15" /> Solo un administrador puede, sin importar el rol:</b>
        <ul><li v-for="t in SOLO_ADMIN" :key="t">{{ t }}</li></ul>
      </div>
      <section v-for="r in roles" :key="r.id" class="tarjeta rol">
        <button class="rol-cab" @click="rolAbierto = rolAbierto === r.id ? null : r.id">
          <b>{{ r.nombre }}</b>
          <span class="muted">{{ abiertas(r.permisos) }} de {{ SECCIONES.length }} secciones habilitadas</span>
          <Icono :n="rolAbierto === r.id ? 'izq' : 'der'" :t="16" style="margin-left:auto;transform:rotate(90deg)" />
        </button>
        <div v-if="rolAbierto === r.id" class="permisos">
          <div v-for="s in SECCIONES" :key="s.key" class="permiso">
            <div><b>{{ s.label }}</b><p>{{ s.ayuda }}</p></div>
            <select v-model="r.permisos[s.key]" class="sel">
              <option v-for="n in s.niveles" :key="n" :value="n">{{ NIVEL[n] }}</option>
            </select>
          </div>
        </div>
      </section>
    </template>

    <Modal v-if="form" @cerrar="form = null">
      <div class="modal-cuerpo">
        <h3>{{ form.id ? 'Editar usuario' : 'Nuevo usuario' }}</h3>
        <div class="fila">
          <div class="campo"><label>Nombre</label><input v-model="form.nombre" placeholder="Ej: Sofía"></div>
          <div class="campo"><label>Email</label><input v-model="form.email" type="email" placeholder="sofia@click.com"></div>
        </div>
        <div class="campo"><label>{{ form.id ? 'Contraseña nueva (vacío = no cambiarla)' : 'Contraseña (mínimo 10 caracteres)' }}</label>
          <div class="clave">
            <input v-model="form.password" :type="verClave ? 'text' : 'password'" autocomplete="new-password">
            <button type="button" class="icono-btn" :aria-label="verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="verClave = !verClave">{{ verClave ? '🙈' : '👁️' }}</button>
          </div>
        </div>
        <div class="fila">
          <div class="campo"><label>Cuenta</label>
            <select v-model="form.rol"><option value="empleado">Equipo</option><option value="admin">Administrador</option></select>
          </div>
          <div class="campo"><label>Rol (de dónde hereda los permisos)</label>
            <select v-model="form.rol_id" :disabled="form.rol === 'admin'">
              <option :value="null">— Sin rol —</option>
              <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.nombre }}</option>
            </select>
          </div>
        </div>
        <div v-if="form.id" class="campo"><label>Equipo</label>
          <span class="nota">{{ form.miembro ? 'En el equipo' + (form.miembro.rol ? ' como ' + form.miembro.rol : '') : 'No está en el equipo. Se suma desde la sección Equipo.' }}</span></div>

        <template v-if="form.rol !== 'admin'">
          <div class="sep">Excepciones al rol</div>
          <div v-for="s in SECCIONES" :key="s.key" class="excep">
            <span>{{ s.label }}</span>
            <select v-model="form.permisos[s.key]" class="sel">
              <option :value="undefined">Como el rol ({{ NIVEL[heredado[s.key] || 'sin_acceso'] }})</option>
              <option v-for="n in s.niveles" :key="n" :value="n">{{ NIVEL[n] }}</option>
            </select>
          </div>
        </template>
        <p v-else class="nota">Los administradores pueden todo siempre: ni el rol ni las excepciones les aplican.</p>

        <div class="modal-pie">
          <button class="btn" @click="form = null">Cancelar</button>
          <button class="btn p" @click="guardar">{{ form.id ? 'Guardar' : 'Crear usuario' }}</button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.apagado td { opacity: .5; }
.aviso-admin { margin-bottom: 16px; font-size: 13.5px; }
.aviso-admin b { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.aviso-admin ul { padding-left: 20px; color: var(--mut); }
.rol { margin-bottom: 10px; padding: 0; overflow: hidden; }
.rol-cab { display: flex; align-items: center; gap: 12px; width: 100%; padding: 16px 20px; background: none; border: none; cursor: pointer; text-align: left; }
.permisos { border-top: 1px solid var(--bor); padding: 4px 20px 12px; }
.permiso { display: grid; grid-template-columns: 1fr 150px; gap: 16px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--bor); }
.permiso:last-child { border-bottom: none; }
.permiso p { font-size: 12.5px; color: var(--mut); margin-top: 2px; }
.muted { color: var(--mut); font-size: 13px; }
.clave { display: flex; gap: 4px; }
.clave input { flex: 1; }
.excep { display: grid; grid-template-columns: 1fr 200px; align-items: center; gap: 10px; margin-bottom: 6px; font-size: 14px; }
.nota { font-size: 12.5px; color: var(--hin); }

@media (max-width: 600px) {
  .permiso { grid-template-columns: 1fr; gap: 8px; }
  .excep { grid-template-columns: 1fr; gap: 4px; margin-bottom: 12px; }
  .rol-cab { flex-wrap: wrap; padding: 14px 16px; }
  .permisos { padding: 4px 16px 12px; }
}
</style>
