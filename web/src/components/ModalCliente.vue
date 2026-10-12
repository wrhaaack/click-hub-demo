<script setup>
import { reactive } from 'vue';
import Modal from './Modal.vue';
import { esAdmin, guardarEn, sacarDe } from '../lib/store';
import { api, avisar } from '../lib/api';

const props = defineProps({ cliente: Object, tipo: { type: String, default: 'cliente' } });
const emit = defineEmits(['cerrar', 'guardado']);

const c = props.cliente;
const f = reactive({
  nombre: c?.nombre ?? '',
  ig: c?.ig ?? '',
  contacto: c?.contacto ?? '',
  tel: c?.tel ?? '',
  tipo: c?.tipo ?? props.tipo,
  aPagar: c?.aPagar ?? '',
  estadoPago: c?.estadoPago ?? 'pendiente',
  abonado: c?.abonado ?? '',
  proximaActualizacion: c?.proximaActualizacion ?? '',
  links: (c?.links ?? []).map((l) => ({ ...l })),
  notas: c?.notas ?? '',
  puntajes: { ...(c?.puntajes ?? {}) },
});

async function guardar() {
  if (!f.nombre.trim()) return avisar('Falta el nombre.');
  const r = await api(c ? `/api/clientes/${c.id}` : '/api/clientes', { method: c ? 'PUT' : 'POST', body: f });
  if (!r) return;
  guardarEn('clientes', r);
  avisar('Guardado.', 'ok');
  emit('guardado', r);
  emit('cerrar');
}
async function darDeBaja() {
  if (!confirm(`¿Dar de baja a ${c.nombre}? Deja de aparecer, pero su historial se conserva.`)) return;
  if (!(await api(`/api/clientes/${c.id}`, { method: 'DELETE' }))) return;
  sacarDe('clientes', c.id);
  emit('cerrar');
}
</script>

<template>
  <Modal @cerrar="emit('cerrar')">
    <div class="modal-cuerpo">
      <h3>{{ c ? 'Editar ' + (f.tipo === 'prospecto' ? 'prospecto' : 'cliente') : (f.tipo === 'prospecto' ? 'Nuevo prospecto' : 'Nuevo cliente') }}</h3>
      <div class="campo"><label>Nombre</label><input v-model="f.nombre" placeholder="Ej: Cara Medicina Estética"></div>
      <div class="fila">
        <div class="campo"><label>Instagram</label><input v-model="f.ig" placeholder="@usuario"></div>
        <div class="campo"><label>Contacto</label><input v-model="f.contacto"></div>
      </div>
      <div class="fila">
        <div class="campo"><label>Teléfono</label><input v-model="f.tel" placeholder="+54 9 ..."></div>
        <div class="campo"><label>Tipo</label>
          <select v-model="f.tipo"><option value="cliente">Cliente</option><option value="prospecto">Prospecto</option></select>
        </div>
      </div>

      <div class="sep">Cobro</div>
      <div class="fila">
        <div class="campo"><label>Abono mensual</label><input type="number" min="0" step="1000" v-model="f.aPagar" placeholder="0"></div>
        <div class="campo"><label>Estado</label>
          <select v-model="f.estadoPago">
            <option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="pagado">Pagado</option>
          </select>
        </div>
      </div>
      <div class="fila">
        <div v-if="f.estadoPago === 'parcial'" class="campo"><label>Cuánto abonó</label><input type="number" min="0" v-model="f.abonado"></div>
        <div class="campo"><label>Próxima actualización de precio</label><input type="date" v-model="f.proximaActualizacion"></div>
      </div>

      <div class="sep">Links útiles</div>
      <div v-for="(l, i) in f.links" :key="i" class="link-fila">
        <input v-model="l.label" placeholder="Drive, fotos…" class="sel">
        <input v-model="l.url" placeholder="https://" class="sel">
        <button class="icono-btn" aria-label="Quitar link" @click="f.links.splice(i, 1)">✕</button>
      </div>
      <button class="btn chico" style="margin-bottom:14px" @click="f.links.push({ label: '', url: '' })">+ Agregar link</button>

      <div class="campo"><label>Notas</label><textarea v-model="f.notas" placeholder="Briefing, tono de voz…" /></div>

      <div class="modal-pie">
        <button v-if="c && esAdmin" class="btn peligro izq" @click="darDeBaja">Dar de baja</button>
        <button class="btn" @click="emit('cerrar')">Cancelar</button>
        <button class="btn p" @click="guardar">Guardar</button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.link-fila { display: grid; grid-template-columns: 1fr 2fr 34px; gap: 8px; margin-bottom: 8px; }

@media (max-width: 600px) {
  .link-fila { grid-template-columns: 1fr 34px; }
  .link-fila input:nth-child(2) { grid-column: 1; }
}
</style>
