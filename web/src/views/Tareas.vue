<script setup>
import { ref, computed } from 'vue';
import Icono from '../components/Icono.vue';
import MesSel from '../components/MesSel.vue';
import ModalTarea from '../components/ModalTarea.vue';
import { st, puede, plata, fechaCorta, clientePorId, tareasDelMes, guardarEn, ESTADOS } from '../lib/store';
import { api } from '../lib/api';

const tab = ref('todas');
const rol = ref('');
const q = ref('');
const abierta = ref(undefined);

const delMes = computed(() => tareasDelMes(st.periodo).filter((t) => !rol.value || t.rol === rol.value));
const cuenta = (k) => delMes.value.filter((t) => t.estado === k).length;
const filas = computed(() => {
  const txt = q.value.trim().toLowerCase();
  return delMes.value
    .filter((t) => tab.value === 'todas' || t.estado === tab.value)
    .filter((t) => !txt || t.desc.toLowerCase().includes(txt)
      || (clientePorId(t.cid)?.nombre || '').toLowerCase().includes(txt) || t.asig.join(' ').toLowerCase().includes(txt));
});
const hoy = new Date().toISOString().slice(0, 10);

async function cambiarEstado(t, estado) {
  const r = await api(`/api/tareas/${t.id}/estado`, { method: 'PATCH', body: { estado } });
  if (r) guardarEn('tareas', r);
}
</script>

<template>
  <div class="pagina">
    <div class="pag-head">
      <h1>Tareas</h1>
      <span class="info" title="Todo lo que se publica en el mes, quién lo hace y en qué estado está."><Icono n="info" /></span>
      <div class="der"><MesSel /></div>
    </div>

    <div class="barra">
      <div class="tabs">
        <button class="tab" :class="{ on: tab === 'todas' }" @click="tab = 'todas'">Todas <span class="cuenta">{{ delMes.length }}</span></button>
        <button v-for="e in ESTADOS" :key="e.k" class="tab" :class="{ on: tab === e.k }" @click="tab = e.k">
          {{ e.l }} <span class="cuenta">{{ cuenta(e.k) }}</span>
        </button>
      </div>
      <div class="acciones">
        <select v-model="rol" class="sel" aria-label="Filtrar por rol"><option value="">Todos los roles</option><option v-for="r in st.roles" :key="r">{{ r }}</option></select>
        <label class="buscar"><Icono n="buscar" :t="16" /><input v-model="q" placeholder="Buscar…" aria-label="Buscar tareas" style="width:200px"></label>
        <button v-if="puede('tareas','full')" class="btn p" @click="abierta = null"><Icono n="mas" :t="16" />Tarea</button>
      </div>
    </div>

    <table v-if="filas.length" class="tabla">
      <thead>
        <tr><th>Tarea</th><th>Cliente</th><th>Rol</th><th>Asignado</th><th>Límite</th><th>Publica</th><th class="num">Monto</th><th>Estado</th></tr>
      </thead>
      <tbody>
        <tr v-for="t in filas" :key="t.id" @click="abierta = t">
          <td><b style="font-weight:500">{{ t.desc }}</b><div class="muted" style="font-size:12px">{{ t.formato }}</div></td>
          <td>{{ clientePorId(t.cid)?.nombre }}</td>
          <td class="muted">{{ t.rol || '—' }}</td>
          <td class="muted">{{ t.asig.join(', ') || '—' }}</td>
          <td :style="t.fechaLimite && t.fechaLimite < hoy && t.estado !== 'cumplido' && t.estado !== 'listo' ? 'color:var(--red)' : ''">{{ fechaCorta(t.fechaLimite) || '—' }}</td>
          <td class="muted">{{ fechaCorta(t.fecha) }}</td>
          <td class="num">
            <span v-if="t.nivel" class="pill tan">{{ t.nivel }}</span> {{ t.monto ? plata(t.monto) : '' }}
            <span v-if="t.monto && t.pagado" class="pill ok">pagada</span>
          </td>
          <td @click.stop>
            <select class="sel" :value="t.estado" :disabled="!puede('tareas')" aria-label="Estado" @change="cambiarEstado(t, $event.target.value)">
              <option v-for="e in ESTADOS" :key="e.k" :value="e.k">{{ e.l }}</option>
            </select>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else class="vacio">No hay tareas para mostrar.</div>

    <ModalTarea v-if="abierta !== undefined" :tarea="abierta" @cerrar="abierta = undefined" />
  </div>
</template>
