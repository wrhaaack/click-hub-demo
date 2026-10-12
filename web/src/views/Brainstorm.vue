<script setup>
import { ref, computed } from 'vue';
import Icono from '../components/Icono.vue';
import MesSel from '../components/MesSel.vue';
import ModalTarea from '../components/ModalTarea.vue';
import { st, puede, urlDe, inicial } from '../lib/store';
import { api } from '../lib/api';

// Ideas y links de inspiración por cliente y por mes, más un bloque de ideas
// generales. Una idea se puede pasar a tarea con la flecha.
//
// Con permiso "limitado" se lee pero no se toca. Cada bloque se guarda entero
// con un respiro de medio segundo, para no mandar un pedido por cada tecla.
const editable = puede('brainstorm', 'full');
const q = ref('');
const nuevaTarea = ref(null);

const clientes = computed(() => st.clientes.filter((c) => !q.value || c.nombre.toLowerCase().includes(q.value.toLowerCase())));

// Para leer: el bloque del mes, o uno vacío que no se toca. Crearlo recién al
// escribir evita llenar el estado de bloques vacíos solo por mirar la pantalla.
const VACIO = Object.freeze({ ideas: [], inspo: [] });
const bloque = (cid) => st.ideas[`${cid}-${st.periodo}`] || VACIO;
function asegurar(cid) {
  const k = `${cid}-${st.periodo}`;
  if (!st.ideas[k]) st.ideas[k] = { ideas: [], inspo: [] };
  return st.ideas[k];
}
const timers = {};
function guardar(cid) {
  const periodo = st.periodo;
  const d = bloque(cid);
  const k = `${cid}-${periodo}`;
  clearTimeout(timers[k]);
  timers[k] = setTimeout(() => api('/api/brainstorm', { method: 'PUT', body: { cliente: cid, periodo, ideas: d.ideas, inspo: d.inspo } }), 500);
}
function agregarIdea(cid) { asegurar(cid).ideas.push(''); guardar(cid); }
function agregarInspo(cid) { asegurar(cid).inspo.push({ label: '', url: '' }); guardar(cid); }
function quitar(cid, lista, i) { asegurar(cid)[lista].splice(i, 1); guardar(cid); }
function aTarea(cid, texto) {
  if (!texto?.trim()) return;
  nuevaTarea.value = { cid, desc: texto.trim() };
}
const cuantas = (cid) => bloque(cid).ideas.filter(Boolean).length + bloque(cid).inspo.filter((l) => l.url).length;
const nombre = (cid) => st.clientes.find((c) => c.id === cid)?.nombre ?? '';
</script>

<template>
  <div class="pagina">
    <div class="pag-head">
      <h1>Brainstorming</h1>
      <span class="info" title="Ideas y links de inspiración del mes, por cliente. La flecha pasa una idea a tarea."><Icono n="info" /></span>
      <div class="der"><MesSel /></div>
    </div>

    <div class="barra">
      <div class="tabs"><span class="tab on">Clientes <span class="cuenta">{{ st.clientes.length }}</span></span></div>
      <div class="acciones"><label class="buscar"><Icono n="buscar" :t="16" /><input v-model="q" placeholder="Buscar cliente…" aria-label="Buscar cliente"></label></div>
    </div>

    <div class="bs-grid">
      <section v-for="cid in ['gen', ...clientes.map((c) => c.id)]" :key="cid" class="tarjeta bs" :class="{ general: cid === 'gen' }">
        <div class="bs-cab">
          <span v-if="cid === 'gen'" class="avatar"><Icono n="brainstorm" :t="15" /></span>
          <span v-else class="avatar">{{ inicial(nombre(cid)) }}</span>
          <h3>{{ cid === 'gen' ? 'Ideas generales del mes' : nombre(cid) }}</h3>
          <span class="cuenta">{{ cuantas(cid) }}</span>
        </div>
        <div class="bs-cols">
          <div>
            <div class="sep">Ideas</div>
            <div v-for="(idea, i) in bloque(cid).ideas" :key="i" class="fila-in">
              <input class="sel" v-model="bloque(cid).ideas[i]" :readonly="!editable" placeholder="Idea…" @input="guardar(cid)">
              <button v-if="cid !== 'gen' && puede('tareas','full')" class="icono-btn" title="Pasar a tarea" @click="aTarea(cid, idea)"><Icono n="flecha" :t="15" /></button>
              <button v-if="editable" class="icono-btn" aria-label="Quitar" @click="quitar(cid, 'ideas', i)"><Icono n="cerrar" :t="14" /></button>
            </div>
            <button v-if="editable" class="btn chico" @click="agregarIdea(cid)"><Icono n="mas" :t="14" />Idea</button>
          </div>
          <div>
            <div class="sep">Links de inspo</div>
            <div v-for="(l, i) in bloque(cid).inspo" :key="i" class="fila-in link">
              <input class="sel" v-model="l.label" :readonly="!editable" placeholder="Etiqueta" @input="guardar(cid)">
              <input class="sel" v-model="l.url" :readonly="!editable" placeholder="https://…" @input="guardar(cid)">
              <a v-if="l.url" :href="urlDe(l.url)" target="_blank" rel="noopener" class="icono-btn" title="Abrir"><Icono n="externo" :t="15" /></a>
              <span v-else style="width:34px" />
              <button v-if="editable" class="icono-btn" aria-label="Quitar" @click="quitar(cid, 'inspo', i)"><Icono n="cerrar" :t="14" /></button>
            </div>
            <button v-if="editable" class="btn chico" @click="agregarInspo(cid)"><Icono n="mas" :t="14" />Link</button>
          </div>
        </div>
      </section>
    </div>

    <ModalTarea v-if="nuevaTarea" :tarea="null" :cid="nuevaTarea.cid" :desc="nuevaTarea.desc" @cerrar="nuevaTarea = null" />
  </div>
</template>

<style scoped>
.bs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 16px; }
.bs.general { grid-column: 1 / -1; border-color: var(--tan); }
.bs-cab { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.bs-cab h3 { font-size: 16px; flex: 1; }
.bs-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.fila-in { display: flex; gap: 4px; margin-bottom: 6px; align-items: center; }
.fila-in .sel { flex: 1; min-width: 0; padding: 6px 9px; font-size: 13px; }
.fila-in.link .sel:first-child { flex: 0 0 34%; }
@media (max-width: 700px) { .bs-grid { grid-template-columns: 1fr; } .bs-cols { grid-template-columns: 1fr; } }

@media (max-width: 1100px) { .bs-grid { grid-template-columns: 1fr; } }
</style>
