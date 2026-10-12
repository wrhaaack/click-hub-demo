<script setup>
import { ref, reactive, computed, watch } from 'vue';
import Icono from '../components/Icono.vue';
import { st, plata, guardarEn } from '../lib/store';
import { api, avisar } from '../lib/api';

// La planilla CLIENTES hecha pantalla: ocho criterios de 1 a 3, la suma da el
// "Total Nivel" y eso por el valor del punto da el precio sugerido. Después se
// controla la regla de que la edición no supere el tope (30%).
const CRITERIOS = [
  ['estrategia', 'Estrategia'], ['contenido', 'Contenido'], ['produccion', 'Producción'], ['edicion', 'Edición'],
  ['creatividad', 'Creatividad'], ['equipo', 'Equipo'], ['atencion', 'Atención'], ['urgencia', 'Urgencia'],
];

const cid = ref(null);
const puntos = reactive(Object.fromEntries(CRITERIOS.map(([k]) => [k, 2])));
const abono = ref(null);
const reels = ref(4);

watch(cid, (id) => {
  const c = st.clientes.find((x) => x.id === id);
  CRITERIOS.forEach(([k]) => { puntos[k] = c?.puntajes?.[k] ?? 2; });
  abono.value = c?.aPagar ?? null;
});

const nivel = computed(() => CRITERIOS.reduce((s, [k]) => s + puntos[k], 0));
const sugerido = computed(() => nivel.value * (st.tarifas?.puntoCotizador || 0));
const precio = computed(() => abono.value || sugerido.value);
const tope = computed(() => st.tarifas?.topeEdicion ?? 0.3);
const paraEdicion = computed(() => precio.value * tope.value);
const porReel = computed(() => (reels.value > 0 ? paraEdicion.value / reels.value : 0));
// El nivel de video más alto que entra en lo que hay por reel.
const nivelVideo = computed(() => {
  const v = st.tarifas?.video || {};
  return ['N3', 'N2', 'N1'].find((n) => v[n] <= porReel.value) || null;
});

async function guardar() {
  const c = st.clientes.find((x) => x.id === cid.value);
  if (!c) return;
  const r = await api(`/api/clientes/${c.id}`, {
    method: 'PUT',
    body: { ...c, puntajes: { ...puntos }, aPagar: abono.value || sugerido.value },
  });
  if (!r) return;
  guardarEn('clientes', r);
  avisar(`Guardado en ${c.nombre}.`, 'ok');
}
</script>

<template>
  <div class="pagina">
    <div class="pag-head">
      <h1>Cotizador</h1>
      <span class="info" title="Puntuá al cliente de 1 a 3 en cada criterio. El valor del punto y el tope de edición se cambian en Liquidaciones → Tarifas."><Icono n="info" /></span>
    </div>

    <div class="grilla">
      <section class="tarjeta">
        <div class="campo"><label>Cliente o prospecto</label>
          <select v-model="cid">
            <option :value="null">— Cotización suelta —</option>
            <option v-for="c in st.clientes" :key="c.id" :value="c.id">{{ c.nombre }}{{ c.tipo === 'prospecto' ? ' (prospecto)' : '' }}</option>
          </select>
        </div>
        <div v-for="[k, l] in CRITERIOS" :key="k" class="crit">
          <span>{{ l }}</span>
          <div class="seg" role="radiogroup" :aria-label="l">
            <button v-for="n in 3" :key="n" :class="{ on: puntos[k] === n }" role="radio" :aria-checked="puntos[k] === n" @click="puntos[k] = n">{{ n }}</button>
          </div>
        </div>
      </section>

      <section>
        <div class="kpis" style="grid-template-columns:1fr 1fr">
          <div class="kpi"><div class="et">Total nivel</div><div class="val">{{ nivel }}<span style="color:var(--hin);font-size:18px">/24</span></div></div>
          <div class="kpi"><div class="et">Precio sugerido</div><div class="val">{{ plata(sugerido) }}</div><div class="sub">{{ plata(st.tarifas?.puntoCotizador) }} por punto</div></div>
        </div>

        <div class="tarjeta">
          <div class="fila">
            <div class="campo"><label>Abono acordado</label><input type="number" min="0" step="10000" v-model.number="abono" :placeholder="String(sugerido)"></div>
            <div class="campo"><label>Reels por mes</label><input type="number" min="0" v-model.number="reels"></div>
          </div>
          <div class="linea"><span>Disponible para edición ({{ Math.round(tope * 100) }}%)</span><b>{{ plata(paraEdicion) }}</b></div>
          <div class="linea"><span>Por reel</span><b>{{ plata(porReel) }}</b></div>
          <div class="linea">
            <span>Alcanza para video</span>
            <span v-if="nivelVideo" class="pill ok">{{ nivelVideo }} · {{ plata(st.tarifas.video[nivelVideo]) }}</span>
            <span v-else class="pill mal">No alcanza ni para N1 ({{ plata(st.tarifas?.video?.N1) }})</span>
          </div>
          <div class="modal-pie" style="margin-top:16px">
            <button class="btn p" :disabled="!cid" @click="guardar">Guardar puntajes y abono</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.grilla { display: grid; grid-template-columns: minmax(320px, 1fr) minmax(320px, 1fr); gap: 18px; align-items: start; }
.crit { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-top: 1px solid var(--bor); }
.seg { display: inline-flex; border: 1px solid var(--bor2); border-radius: var(--rs); overflow: hidden; }
.seg button { width: 40px; padding: 6px 0; border: none; background: var(--sur); cursor: pointer; color: var(--mut); }
.seg button + button { border-left: 1px solid var(--bor2); }
.seg button.on { background: var(--tan); color: #fff; font-weight: 600; }
.linea { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px solid var(--bor); }
@media (max-width: 900px) { .grilla { grid-template-columns: 1fr; } }
</style>
