<script setup>
import { ref, reactive, computed } from 'vue';
import Icono from './Icono.vue';
import Modal from './Modal.vue';
import { st, puede, DIAS, rangoEnTexto, guardarEn, sacarDe } from '../lib/store';
import { COLORES, color } from '../lib/colores';
import { filasDelMes, visiblesEn } from '../lib/grilla';
import { exportarPlan } from '../lib/exportarPlan';
import { api, avisar } from '../lib/api';

// La planificación que se le muestra al cliente: tramos de varios días
// ("Diseño", "Grabación", "Revisión") escritos para que los lea el cliente.
// No sale de las tareas a propósito: lo que el equipo escribe para trabajar
// no es lo que se le muestra a un cliente. Se exporta como imagen PNG.
const props = defineProps({ cid: { type: Number, required: true } });

const editable = puede('calendario', 'full');
const cliente = computed(() => st.clientes.find((c) => c.id === props.cid));
const etapas = computed(() => st.etapas.filter((e) => e.clienteId === props.cid));
const filas = computed(() => filasDelMes(etapas.value, st.periodo));
const visibles = computed(() => visiblesEn(etapas.value, filas.value));

const form = ref(null);
const exportando = ref(false);

function nueva(desde) {
  if (!editable) return;
  form.value = reactive({ id: null, titulo: '', desde: desde || `${st.periodo}-01`, hasta: '', color: 'azul', nota: '' });
}
function abrir(et) {
  // "Hasta" vacío = un solo día. Si se llenara con la misma fecha parecería un
  // rango de un día y no "no puse fin".
  form.value = reactive({ ...et, hasta: et.hasta !== et.desde ? et.hasta : '' });
}
async function guardar() {
  const f = form.value;
  if (!f.titulo.trim()) return avisar('Poné un título para la etapa.');
  if (f.hasta && f.hasta < f.desde) return avisar('La etapa no puede terminar antes de empezar.');
  const r = await api(f.id ? `/api/etapas/${f.id}` : '/api/etapas', {
    method: f.id ? 'PUT' : 'POST', body: { ...f, clienteId: props.cid },
  });
  if (!r) return;
  guardarEn('etapas', r);
  form.value = null;
}
async function borrar() {
  if (!confirm(`¿Eliminar la etapa "${form.value.titulo}"?`)) return;
  if (!(await api(`/api/etapas/${form.value.id}`, { method: 'DELETE' }))) return;
  sacarDe('etapas', form.value.id);
  form.value = null;
}
async function exportar() {
  exportando.value = true;
  try {
    const ok = await exportarPlan(cliente.value, etapas.value, st.periodo, st.estudio?.nombre);
    if (!ok) avisar('No se pudo generar la imagen.');
  } finally {
    exportando.value = false;
  }
}

// Alto de cada semana según cuántas barras apiladas tenga.
const altoSem = (f) => 34 + Math.max(f.carriles, 1) * 28 + 8;
</script>

<template>
  <div>
    <div class="plan-barra">
      <span class="muted">{{ editable ? 'Tocá un día para agregar una etapa, o una etapa para editarla.' : 'Así se le muestra la planificación al cliente.' }}</span>
      <div style="display:flex;gap:8px;margin-left:auto">
        <button v-if="editable" class="btn" @click="nueva()"><Icono n="mas" :t="16" />Etapa</button>
        <button class="btn p" :disabled="exportando" @click="exportar"><Icono n="imagen" :t="16" />{{ exportando ? 'Generando…' : 'Exportar imagen' }}</button>
      </div>
    </div>

    <div class="plan">
      <div class="plan-cab"><div v-for="d in DIAS" :key="d">{{ d }}</div></div>
      <div v-for="(f, i) in filas" :key="i" class="plan-sem" :style="{ height: altoSem(f) + 'px' }">
        <div v-for="(d, j) in f.dias" :key="d.ds" class="plan-dia" :class="{ fuera: d.fuera, hoy: d.hoy, clic: editable }"
             :style="{ left: (j * 100 / 7) + '%' }" @click="nueva(d.ds)">
          <span class="plan-num">{{ d.d }}</span>
        </div>
        <button v-for="b in f.barras" :key="b.et.id" class="plan-barra-et"
                :style="{ left: `calc(${b.col * 100 / 7}% + 4px)`, width: `calc(${b.span * 100 / 7}% - 8px)`, top: (30 + b.carril * 28) + 'px',
                          background: color(b.et.color).f, color: color(b.et.color).t, borderLeftColor: color(b.et.color).b }"
                :class="{ izq: b.sigueIzq, der: b.sigueDer }"
                :title="`${b.et.titulo} · ${rangoEnTexto(b.et)}${b.et.nota ? '\n' + b.et.nota : ''}`" @click="abrir(b.et)">
          {{ b.et.titulo }}
        </button>
      </div>
    </div>

    <!-- En la grilla los títulos largos se cortan; acá se leen enteros. -->
    <div v-if="visibles.length" class="leyenda">
      <div v-for="e in visibles" :key="e.id" class="lg">
        <span class="lg-c" :style="{ background: color(e.color).b }" />
        <span><b>{{ e.titulo }}</b> · {{ rangoEnTexto(e) }}<template v-if="e.nota"> · {{ e.nota }}</template></span>
      </div>
    </div>
    <div v-else class="vacio" style="padding:24px">Este mes no tiene etapas cargadas{{ editable ? '. Tocá un día para agregar la primera.' : '.' }}</div>

    <Modal v-if="form" @cerrar="form = null">
      <div class="modal-cuerpo">
        <h3>{{ form.id ? 'Editar etapa' : 'Nueva etapa' }}</h3>
        <fieldset :disabled="!editable" style="border:none">
          <div class="campo"><label>Título</label><input v-model="form.titulo" placeholder="Ej: Diseño de piezas"></div>
          <div class="fila">
            <div class="campo"><label>Desde</label><input type="date" v-model="form.desde"></div>
            <div class="campo"><label>Hasta</label><input type="date" v-model="form.hasta"><span class="nota">Vacío = un solo día</span></div>
          </div>
          <div class="campo"><label>Color</label>
            <div class="colores">
              <button v-for="(c, k) in COLORES" :key="k" type="button" class="color" :class="{ on: form.color === k }"
                      :style="{ background: c.f, boxShadow: `inset 0 0 0 3px ${c.b}` }" :title="c.n" :aria-label="c.n" @click="form.color = k" />
            </div>
          </div>
          <div class="campo"><label>Nota (opcional)</label><textarea v-model="form.nota" placeholder="Qué incluye esta etapa" /></div>
        </fieldset>
        <div class="modal-pie">
          <button v-if="form.id && editable" class="btn peligro izq" @click="borrar">Eliminar</button>
          <button class="btn" @click="form = null">{{ editable ? 'Cancelar' : 'Cerrar' }}</button>
          <button v-if="editable" class="btn p" @click="guardar">Guardar</button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.plan-barra { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.muted { color: var(--mut); font-size: 13px; }
.plan { border: 1px solid var(--bor2); border-radius: var(--r); overflow: hidden; background: var(--sur); }
.plan-cab { display: grid; grid-template-columns: repeat(7, 1fr); background: var(--sur3); border-bottom: 1px solid var(--bor); }
.plan-cab div { padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--hin); text-align: center; }
.plan-sem { position: relative; border-bottom: 1px solid var(--bor); }
.plan-sem:last-child { border-bottom: none; }
.plan-dia { position: absolute; top: 0; bottom: 0; width: calc(100% / 7); border-right: 1px solid var(--bor); }
.plan-dia:nth-child(7) { border-right: none; }
.plan-dia.clic { cursor: pointer; }
.plan-dia.clic:hover { background: var(--sur3); }
.plan-dia.fuera { background: repeating-linear-gradient(45deg, transparent 0 6px, var(--sur2) 6px 7px); }
.plan-dia.fuera .plan-num { opacity: .45; }
.plan-dia.hoy { background: var(--tanl); }
.plan-num { position: absolute; top: 6px; right: 9px; font-size: 12px; color: var(--hin); font-variant-numeric: tabular-nums; }
.plan-dia.hoy .plan-num { color: var(--tand); font-weight: 600; }
.plan-barra-et {
  position: absolute; height: 22px; border: none; border-left: 3px solid; border-radius: 4px;
  font-size: 12px; font-weight: 500; text-align: left; padding: 0 8px; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; z-index: 1;
}
.plan-barra-et.izq { border-top-left-radius: 0; border-bottom-left-radius: 0; }
.plan-barra-et.der { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.leyenda { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; }
.lg { display: flex; align-items: center; gap: 9px; }
.lg-c { width: 11px; height: 11px; border-radius: 3px; flex-shrink: 0; }
.colores { display: flex; gap: 8px; }
.color { width: 30px; height: 30px; border-radius: 8px; border: 2px solid transparent; cursor: pointer; }
.color.on { border-color: var(--txt); }

@media (max-width: 900px) {
  .plan { overflow-x: auto; }
  .plan-cab, .plan-sem { min-width: 680px; }
  .plan-barra > div { width: 100%; margin-left: 0 !important; }
  .plan-barra .btn { flex: 1; justify-content: center; }
}
</style>
