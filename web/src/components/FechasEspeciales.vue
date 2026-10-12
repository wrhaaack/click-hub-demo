<script setup>
import { computed } from 'vue';
import Icono from './Icono.vue';
import { st, puede } from '../lib/store';
import { api } from '../lib/api';

// Fechas especiales de un cliente en el mes (lanzamientos, efemérides, días
// del amigo...). Aparecen con estrella en su calendario y en la agenda del
// dashboard. Se guarda la lista entera del mes, con un respiro de medio
// segundo para no mandar un pedido por cada tecla.
const props = defineProps({ cid: { type: Number, required: true } });
const editable = puede('clientes', 'full');
const clave = computed(() => `fe-${props.cid}-${st.periodo}`);
const lista = computed(() => st.fechasEspeciales[clave.value] || []);

let timer;
function guardar() {
  const periodo = st.periodo;
  const items = st.fechasEspeciales[clave.value] || [];
  clearTimeout(timer);
  timer = setTimeout(() => api('/api/fechas', { method: 'PUT', body: { cliente: props.cid, periodo, items } }), 500);
}
function agregar() {
  if (!st.fechasEspeciales[clave.value]) st.fechasEspeciales[clave.value] = [];
  st.fechasEspeciales[clave.value].push({ fecha: '', label: '' });
  guardar();
}
function quitar(i) { st.fechasEspeciales[clave.value].splice(i, 1); guardar(); }
</script>

<template>
  <div>
    <div class="sep">Fechas especiales del mes</div>
    <div v-for="(f, i) in lista" :key="i" class="fe">
      <input type="date" class="sel" v-model="f.fecha" :readonly="!editable" @change="guardar">
      <input class="sel" v-model="f.label" :readonly="!editable" placeholder="Ej: Día de la madre, lanzamiento…" @input="guardar">
      <button v-if="editable" class="icono-btn" aria-label="Quitar" @click="quitar(i)"><Icono n="cerrar" :t="14" /></button>
    </div>
    <p v-if="!lista.length" class="nota">No hay fechas especiales cargadas este mes.</p>
    <button v-if="editable" class="btn chico" style="margin-top:8px" @click="agregar"><Icono n="mas" :t="14" />Agregar fecha especial</button>
  </div>
</template>

<style scoped>
.fe { display: grid; grid-template-columns: 170px 1fr 34px; gap: 8px; margin-bottom: 8px; }
.nota { font-size: 13px; color: var(--hin); }

@media (max-width: 600px) {
  .fe { grid-template-columns: 1fr 34px; }
  .fe input[type="date"] { grid-column: 1 / -1; }
}
</style>
