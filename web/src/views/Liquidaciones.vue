<script setup>
import { ref, reactive, computed } from 'vue';
import Icono from '../components/Icono.vue';
import Modal from '../components/Modal.vue';
import ModalTarea from '../components/ModalTarea.vue';
import { st, puede, esAdmin, plata, fechaCorta, nombreDelMes, clientePorId, porLiquidar } from '../lib/store';
import { api, avisar } from '../lib/api';

// Reemplaza la planilla "Diseños Click": cada bloque con su "Total" era una
// liquidación. Acá las piezas terminadas con monto se juntan por persona, se
// eligen y se liquidan de una.
const tab = ref('pendientes');
const elegidas = reactive(new Set());
const abierta = ref(undefined);

const quien = (t) => t.asig.join(' + ') || 'Sin asignar';
const grupos = computed(() => {
  const m = new Map();
  porLiquidar.value.forEach((t) => { const k = quien(t); if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
});
const liquidadas = computed(() => {
  const m = new Map();
  st.tareas.filter((t) => t.pagado && t.monto > 0).forEach((t) => {
    const k = (t.fecha || '').slice(0, 7) || 'sin-fecha';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  });
  return [...m.entries()].sort(([a], [b]) => b.localeCompare(a));
});
const total = (lista) => lista.reduce((s, t) => s + (t.monto || 0), 0);
const totalElegido = computed(() => total(porLiquidar.value.filter((t) => elegidas.has(t.id))));

function alternarGrupo(lista, marcar) { lista.forEach((t) => (marcar ? elegidas.add(t.id) : elegidas.delete(t.id))); }
const todasDe = (lista) => lista.every((t) => elegidas.has(t.id));

async function liquidar() {
  const ids = [...elegidas];
  if (!ids.length) return;
  if (!confirm(`¿Liquidar ${ids.length} pieza(s) por ${plata(totalElegido.value)}?`)) return;
  const r = await api('/api/tareas/liquidar', { method: 'POST', body: { ids } });
  if (!r) return;
  st.tareas.forEach((t) => { if (elegidas.has(t.id)) t.pagado = true; });
  elegidas.clear();
  avisar(`Liquidadas ${r.liquidadas} piezas por ${plata(r.total)}.`, 'ok');
}

// ---------- Tarifas (solo admin) ----------
const editTarifas = ref(null);
function abrirTarifas() { editTarifas.value = JSON.parse(JSON.stringify(st.tarifas)); }
async function guardarTarifas() {
  const r = await api('/api/tarifas', { method: 'PUT', body: editTarifas.value });
  if (!r) return;
  st.tarifas = r;
  editTarifas.value = null;
  avisar('Tarifas guardadas.', 'ok');
}
</script>

<template>
  <div class="pagina">
    <div class="pag-head">
      <h1>Liquidaciones</h1>
      <span class="info" title="Piezas terminadas (listo o cumplido), con monto y sin pagar. El monto sale del nivel N1/N2/N3 de cada tarea."><Icono n="info" /></span>
      <div class="der"><button v-if="esAdmin" class="btn" @click="abrirTarifas">Tarifas</button></div>
    </div>

    <div class="barra">
      <div class="tabs">
        <button class="tab" :class="{ on: tab === 'pendientes' }" @click="tab = 'pendientes'">Por liquidar <span class="cuenta">{{ porLiquidar.length }}</span></button>
        <button class="tab" :class="{ on: tab === 'hechas' }" @click="tab = 'hechas'">Liquidadas <span class="cuenta">{{ liquidadas.reduce((s, [, l]) => s + l.length, 0) }}</span></button>
      </div>
      <div v-if="tab === 'pendientes' && puede('tareas')" class="acciones">
        <span v-if="elegidas.size" class="muted">{{ elegidas.size }} elegidas · <b>{{ plata(totalElegido) }}</b></span>
        <button class="btn p" :disabled="!elegidas.size" @click="liquidar">Liquidar</button>
      </div>
    </div>

    <template v-if="tab === 'pendientes'">
      <div v-if="!grupos.length" class="vacio">No hay nada pendiente de pago. Las piezas aparecen acá cuando pasan a "listo" con un monto cargado.</div>
      <section v-for="[persona, lista] in grupos" :key="persona" class="grupo">
        <table class="tabla">
          <thead>
            <tr>
              <th style="width:34px"><input type="checkbox" :checked="todasDe(lista)" :aria-label="`Elegir todas de ${persona}`" @change="alternarGrupo(lista, $event.target.checked)"></th>
              <th><span class="nombre"><span class="avatar">{{ persona[0] }}</span>{{ persona }}</span></th>
              <th>Cliente</th><th>Publica</th><th>Nivel</th><th class="num">Monto</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in lista" :key="t.id" @click="abierta = t">
              <td @click.stop><input type="checkbox" :checked="elegidas.has(t.id)" aria-label="Elegir" @change="$event.target.checked ? elegidas.add(t.id) : elegidas.delete(t.id)"></td>
              <td>{{ t.desc }}</td>
              <td class="muted">{{ clientePorId(t.cid)?.nombre }}</td>
              <td class="muted">{{ fechaCorta(t.fecha) }}</td>
              <td><span v-if="t.nivel" class="pill tan">{{ t.nivel }}</span></td>
              <td class="num">{{ plata(t.monto) }}</td>
            </tr>
          </tbody>
          <tfoot><tr><td></td><td colspan="4">Total</td><td class="num">{{ plata(total(lista)) }}</td></tr></tfoot>
        </table>
      </section>
    </template>

    <template v-else>
      <div v-if="!liquidadas.length" class="vacio">Todavía no se liquidó nada.</div>
      <section v-for="[mes, lista] in liquidadas" :key="mes" class="grupo">
        <table class="tabla">
          <thead><tr><th>{{ mes === 'sin-fecha' ? 'Sin fecha' : nombreDelMes(mes) }}</th><th>Cliente</th><th>Quién</th><th>Nivel</th><th class="num">Monto</th></tr></thead>
          <tbody>
            <tr v-for="t in lista" :key="t.id" @click="abierta = t">
              <td>{{ t.desc }}</td>
              <td class="muted">{{ clientePorId(t.cid)?.nombre }}</td>
              <td class="muted">{{ quien(t) }}</td>
              <td><span v-if="t.nivel" class="pill tan">{{ t.nivel }}</span></td>
              <td class="num">{{ plata(t.monto) }}</td>
            </tr>
          </tbody>
          <tfoot><tr><td colspan="4">Total</td><td class="num">{{ plata(total(lista)) }}</td></tr></tfoot>
        </table>
      </section>
    </template>

    <ModalTarea v-if="abierta !== undefined" :tarea="abierta" @cerrar="abierta = undefined" />

    <Modal v-if="editTarifas" @cerrar="editTarifas = null">
      <div class="modal-cuerpo">
        <h3>Tarifas</h3>
        <div class="sep">Diseño, por pieza</div>
        <div class="fila3">
          <div v-for="n in ['N1','N2','N3']" :key="n" class="campo"><label>{{ n }}</label><input type="number" min="0" step="500" v-model.number="editTarifas.diseno[n]"></div>
        </div>
        <div class="sep">Video, por pieza</div>
        <div class="fila3">
          <div v-for="n in ['N1','N2','N3']" :key="n" class="campo"><label>{{ n }}</label><input type="number" min="0" step="500" v-model.number="editTarifas.video[n]"></div>
        </div>
        <div class="sep">Cotizador</div>
        <div class="fila">
          <div class="campo"><label>Valor del punto</label><input type="number" min="0" step="1000" v-model.number="editTarifas.puntoCotizador"></div>
          <div class="campo"><label>Tope de edición (0 a 1)</label><input type="number" min="0" max="1" step="0.05" v-model.number="editTarifas.topeEdicion"></div>
        </div>
        <p class="campo nota">Cambiar una tarifa no toca lo ya cargado: cada tarea guarda su monto.</p>
        <div class="modal-pie">
          <button class="btn" @click="editTarifas = null">Cancelar</button>
          <button class="btn p" @click="guardarTarifas">Guardar</button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.grupo { background: var(--sur); border: 1px solid var(--bor); border-radius: var(--r); margin-bottom: 18px; overflow: hidden; }
.grupo .tabla th { background: var(--sur3); }
.grupo .tabla thead tr th:first-child, .grupo .tabla td:first-child { padding-left: 18px; }
</style>
