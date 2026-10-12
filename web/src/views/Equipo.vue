<script setup>
import { ref, reactive, computed } from 'vue';
import Icono from '../components/Icono.vue';
import Modal from '../components/Modal.vue';
import { st, esAdmin, recargar, guardarEn, sacarDe, plata, porLiquidar, tareasDelMes } from '../lib/store';
import { api, avisar } from '../lib/api';

// Las personas a las que se les asignan tareas, y los roles.
//
// Al equipo solo entra gente que ya tiene usuario: se la elige de una lista,
// no se escribe un nombre. Así el nombre tiene un solo dueño (el usuario) y a
// toda persona del equipo le llegan los avisos de sus tareas.
const tab = ref('personas');

const cargaMes = (p) => tareasDelMes(st.periodo).filter((t) => t.asigIds.includes(p.id) && t.estado !== 'cumplido').length;
const deuda = (p) => porLiquidar.value.filter((t) => t.asigIds.includes(p.id)).reduce((s, t) => s + t.monto, 0);
const porRol = computed(() => st.roles.map((r) => ({ rol: r, n: st.equipo.filter((p) => p.rol === r).length })));

// ---------- Persona ----------
const persona = ref(null);
const libres = ref([]);
async function abrirPersona(p) {
  persona.value = reactive({ id: p?.id ?? null, nombre: p?.nombre ?? '', rol: p?.rol || st.roles[0] || '', elegido: '' });
  libres.value = [];
  if (!p) {
    libres.value = (await api('/api/equipo/disponibles')) || [];
    persona.value.elegido = libres.value[0]?.id ?? '';
  }
}
async function guardarPersona() {
  const p = persona.value;
  if (!p.id && !p.elegido) return avisar('Elegí a quién sumar.');
  const r = p.id
    ? await api(`/api/equipo/${p.id}`, { method: 'PUT', body: { rol: p.rol } })
    : await api('/api/equipo', { method: 'POST', body: { usuario_id: p.elegido, rol: p.rol } });
  if (!r) return;
  guardarEn('equipo', r);
  persona.value = null;
}
async function sacarPersona() {
  if (!confirm(`¿Sacar a ${persona.value.nombre} del equipo? Las tareas donde figura la siguen mostrando.`)) return;
  if (!(await api(`/api/equipo/${persona.value.id}`, { method: 'DELETE' }))) return;
  sacarDe('equipo', persona.value.id);
  persona.value = null;
}

// ---------- Roles ----------
// Se editan con su id: si se renombra uno, el servidor arrastra el nombre
// nuevo a las tareas y personas que ya lo tenían. Los permisos de cada rol se
// editan en Usuarios; acá viajan tal cual para no pisarlos.
const roles = ref(null);
async function abrirRoles() {
  const lista = await api('/api/roles');
  if (lista) roles.value = lista.map((r) => ({ id: r.id, nombre: r.nombre, permisos: r.permisos }));
}
async function guardarRoles() {
  const limpios = roles.value.filter((r) => r.nombre.trim());
  if (!limpios.length) return avisar('Tiene que quedar al menos un rol.');
  const r = await api('/api/roles', { method: 'PUT', body: { roles: limpios } });
  if (!r) return;
  roles.value = null;
  if (r.borrados?.length) avisar(`Se borró el rol ${r.borrados.join(', ')}. Revisá en Usuarios a quién le quedó sin rol.`);
  await recargar();
}
</script>

<template>
  <div class="pagina">
    <div class="pag-head">
      <h1>Equipo</h1>
      <span class="info" title="Quiénes trabajan en Click y con qué rol. Solo lo administra un admin."><Icono n="info" /></span>
    </div>

    <div class="barra">
      <div class="tabs">
        <button class="tab" :class="{ on: tab === 'personas' }" @click="tab = 'personas'">Personas <span class="cuenta">{{ st.equipo.length }}</span></button>
        <button class="tab" :class="{ on: tab === 'roles' }" @click="tab = 'roles'">Roles <span class="cuenta">{{ st.roles.length }}</span></button>
      </div>
      <div v-if="esAdmin" class="acciones">
        <button v-if="tab === 'roles'" class="btn" @click="abrirRoles">Editar roles</button>
        <button v-else class="btn p" @click="abrirPersona(null)"><Icono n="mas" :t="16" />Sumar al equipo</button>
      </div>
    </div>

    <template v-if="tab === 'personas'">
      <table v-if="st.equipo.length" class="tabla">
        <thead><tr><th>Nombre</th><th>Rol</th><th>Tareas abiertas del mes</th><th class="num">Por liquidar</th></tr></thead>
        <tbody>
          <tr v-for="p in st.equipo" :key="p.id" @click="esAdmin && abrirPersona(p)">
            <td><span class="nombre"><span class="avatar">{{ p.nombre.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() }}</span>{{ p.nombre }}</span></td>
            <td><span class="pill tan">{{ p.rol || '—' }}</span></td>
            <td><span class="metrica"><Icono n="bandeja" :t="16" /><b>{{ cargaMes(p) }}</b></span></td>
            <td class="num">{{ deuda(p) ? plata(deuda(p)) : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="vacio">Todavía no hay nadie en el equipo.</div>
    </template>

    <table v-else class="tabla">
      <thead><tr><th>Rol</th><th>Personas</th></tr></thead>
      <tbody>
        <tr v-for="r in porRol" :key="r.rol" style="cursor:default">
          <td><b style="font-weight:500">{{ r.rol }}</b></td>
          <td class="muted">{{ r.n }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="tab === 'roles'" class="nota-pie">Los permisos de cada rol se definen en <RouterLink to="/usuarios" class="enlace">Usuarios → Permisos por rol</RouterLink>.</p>

    <Modal v-if="persona" @cerrar="persona = null">
      <div class="modal-cuerpo">
        <h3>{{ persona.id ? 'Editar persona' : 'Sumar al equipo' }}</h3>
        <div v-if="persona.id" class="campo"><label>Nombre</label><div class="fijo">{{ persona.nombre }}</div>
          <span class="nota">Para cambiarlo, editá el usuario en Usuarios.</span></div>
        <div v-else class="campo"><label>Usuario</label>
          <select v-model="persona.elegido">
            <option v-if="!libres.length" value="">— no hay usuarios disponibles —</option>
            <option v-for="u in libres" :key="u.id" :value="u.id">{{ u.nombre }} · {{ u.email }}</option>
          </select>
          <span class="nota">Solo aparecen usuarios ya registrados. Si falta alguien, creale el usuario en Usuarios.</span>
        </div>
        <div class="campo"><label>Rol</label><select v-model="persona.rol"><option v-for="r in st.roles" :key="r">{{ r }}</option></select></div>
        <div class="modal-pie">
          <button v-if="persona.id" class="btn peligro izq" @click="sacarPersona">Sacar del equipo</button>
          <button class="btn" @click="persona = null">Cancelar</button>
          <button class="btn p" @click="guardarPersona">Guardar</button>
        </div>
      </div>
    </Modal>

    <Modal v-if="roles" @cerrar="roles = null">
      <div class="modal-cuerpo">
        <h3>Editar roles</h3>
        <div v-for="(r, i) in roles" :key="r.id ?? 'n' + i" class="fila-rol">
          <input v-model="r.nombre" class="sel" placeholder="Nombre del rol">
          <button class="icono-btn" aria-label="Quitar" @click="roles.splice(i, 1)"><Icono n="cerrar" :t="14" /></button>
        </div>
        <button class="btn chico" @click="roles.push({ id: null, nombre: '', permisos: null })"><Icono n="mas" :t="14" />Agregar rol</button>
        <p class="nota-pie">Renombrar un rol actualiza las tareas y personas que lo tenían. Borrarlo deja sin permisos a quien lo tuviera asignado.</p>
        <div class="modal-pie">
          <button class="btn" @click="roles = null">Cancelar</button>
          <button class="btn p" @click="guardarRoles">Guardar</button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.fijo { padding: 8px 10px; background: var(--sur2); border-radius: var(--rs); }
.fila-rol { display: flex; gap: 6px; margin-bottom: 8px; }
.fila-rol .sel { flex: 1; }
.nota-pie { font-size: 13px; color: var(--mut); margin-top: 14px; }
.enlace { color: var(--tand); text-decoration: underline; }
</style>
