<script setup>
import { ref, reactive, computed } from 'vue';
import Icono from '../components/Icono.vue';
import MesSel from '../components/MesSel.vue';
import Modal from '../components/Modal.vue';
import { st, puede, plata, nombreDelMes, moverMes, guardarEn, sacarDe } from '../lib/store';
import { api, avisar } from '../lib/api';

// Reemplaza la planilla "Pauta Publicitaria", que se duplicaba a mano cada
// mes. El "Mes N" lo calcula el servidor.
const editable = puede('clientes', 'full');
const filas = computed(() => st.pautas.filter((p) => p.periodo === st.periodo)
  .sort((a, b) => a.cliente.localeCompare(b.cliente)));
const suma = (k) => filas.value.reduce((s, p) => s + p[k], 0);
const anterior = computed(() => moverMes(st.periodo, -1));
const hayAnterior = computed(() => st.pautas.some((p) => p.periodo === anterior.value));

const form = ref(null);
const sinPauta = computed(() => st.clientes.filter((c) => c.tipo !== 'prospecto' && !filas.value.some((p) => p.clienteId === c.id)));

function nueva() {
  form.value = reactive({ id: null, clienteId: sinPauta.value[0]?.id ?? null, pauta: 0, capacitacion: 0, feeClick: 0, nota: '', pagado: false });
}
function editar(p) { if (editable) form.value = reactive({ ...p }); }

async function guardar() {
  const f = form.value;
  if (!f.clienteId) return avisar('Elegí un cliente.');
  const r = await api(f.id ? `/api/pautas/${f.id}` : '/api/pautas', {
    method: f.id ? 'PUT' : 'POST', body: { ...f, periodo: st.periodo },
  });
  if (!r) return;
  guardarEn('pautas', r);
  form.value = null;
}
async function eliminar() {
  if (!confirm('¿Borrar esta fila de pauta?')) return;
  if (!(await api(`/api/pautas/${form.value.id}`, { method: 'DELETE' }))) return;
  sacarDe('pautas', form.value.id);
  form.value = null;
}
async function alternarPago(p) {
  const r = await api(`/api/pautas/${p.id}`, { method: 'PUT', body: { ...p, pagado: !p.pagado } });
  if (r) guardarEn('pautas', r);
}
async function copiarAnterior() {
  const r = await api('/api/pautas/copiar', { method: 'POST', body: { desde: anterior.value, hasta: st.periodo } });
  if (!r) return;
  st.pautas = (await api('/api/pautas')) || st.pautas;
  avisar(r.copiadas ? `Se copiaron ${r.copiadas} clientes de ${nombreDelMes(anterior.value)}.` : 'No había nada nuevo para copiar.', 'ok');
}
</script>

<template>
  <div class="pagina">
    <div class="pag-head">
      <h1>Pauta publicitaria</h1>
      <span class="info" title="Inversión en anuncios por cliente y mes. El número de mes se cuenta solo desde la primera pauta del cliente."><Icono n="info" /></span>
      <div class="der"><MesSel /></div>
    </div>

    <div class="barra">
      <div class="tabs"><span class="tab on">{{ nombreDelMes(st.periodo) }} <span class="cuenta">{{ filas.length }}</span></span></div>
      <div v-if="editable" class="acciones">
        <button v-if="hayAnterior" class="btn" @click="copiarAnterior">Copiar {{ nombreDelMes(anterior).split(' ')[0].toLowerCase() }}</button>
        <button class="btn p" :disabled="!sinPauta.length" @click="nueva"><Icono n="mas" :t="16" />Agregar</button>
      </div>
    </div>

    <table v-if="filas.length" class="tabla">
      <thead>
        <tr><th>Cliente</th><th>Mes</th><th class="num">Pauta</th><th class="num">Capacitación</th><th class="num">Click</th><th class="num">Total</th><th>Nota</th><th>Pago</th></tr>
      </thead>
      <tbody>
        <tr v-for="p in filas" :key="p.id" @click="editar(p)">
          <td><span class="nombre"><span class="avatar">{{ p.cliente[0] }}</span>{{ p.cliente }}</span></td>
          <td><span class="pill neutro">Mes {{ p.mes }}</span></td>
          <td class="num">{{ plata(p.pauta) }}</td>
          <td class="num">{{ plata(p.capacitacion) }}</td>
          <td class="num">{{ plata(p.feeClick) }}</td>
          <td class="num"><b>{{ plata(p.total) }}</b></td>
          <td class="muted">{{ p.nota }}</td>
          <td @click.stop>
            <button class="pill" :class="p.pagado ? 'ok' : 'warn'" style="border:none;cursor:pointer" :disabled="!editable" @click="alternarPago(p)">
              {{ p.pagado ? 'Pagado' : 'Pendiente' }}
            </button>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr><td colspan="2">Total del mes</td><td class="num">{{ plata(suma('pauta')) }}</td><td class="num">{{ plata(suma('capacitacion')) }}</td>
          <td class="num">{{ plata(suma('feeClick')) }}</td><td class="num">{{ plata(suma('total')) }}</td><td colspan="2"></td></tr>
      </tfoot>
    </table>
    <div v-else class="vacio">
      No hay pauta cargada en {{ nombreDelMes(st.periodo).toLowerCase() }}.
      <template v-if="hayAnterior && editable"><br><button class="btn" style="margin-top:12px" @click="copiarAnterior">Arrancar copiando el mes anterior</button></template>
    </div>

    <Modal v-if="form" @cerrar="form = null">
      <div class="modal-cuerpo">
        <h3>{{ form.id ? 'Editar pauta' : 'Agregar pauta' }} · {{ nombreDelMes(st.periodo) }}</h3>
        <div class="campo"><label>Cliente</label>
          <select v-model="form.clienteId" :disabled="!!form.id">
            <option v-for="c in (form.id ? st.clientes : sinPauta)" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </div>
        <div class="fila3">
          <div class="campo"><label>Pauta</label><input type="number" min="0" step="10000" v-model.number="form.pauta"></div>
          <div class="campo"><label>Capacitación</label><input type="number" min="0" step="10000" v-model.number="form.capacitacion"></div>
          <div class="campo"><label>Fee Click</label><input type="number" min="0" step="5000" v-model.number="form.feeClick"></div>
        </div>
        <div class="campo"><label>Nota</label><input v-model="form.nota" placeholder="Ej: 3 meses de capacitación incluida"></div>
        <label class="chk"><input type="checkbox" v-model="form.pagado"> Pagado</label>
        <div class="modal-pie">
          <button v-if="form.id" class="btn peligro izq" @click="eliminar">Borrar</button>
          <button class="btn" @click="form = null">Cancelar</button>
          <button class="btn p" @click="guardar">Guardar</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
