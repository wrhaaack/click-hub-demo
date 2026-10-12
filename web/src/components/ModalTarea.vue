<script setup>
import { reactive, computed } from 'vue';
import Modal from './Modal.vue';
import { st, FORMATOS, puede, esAdmin, guardarEn, sacarDe, plata } from '../lib/store';
import { api, avisar } from '../lib/api';

// tarea = null crea una nueva; cid y desc la precargan (por ejemplo, al pasar
// una idea del brainstorming a tarea).
const props = defineProps({ tarea: Object, cid: Number, desc: String });
const emit = defineEmits(['cerrar']);

const t = props.tarea;
const f = reactive({
  cid: t?.cid ?? props.cid ?? st.clientes.find((c) => c.tipo !== 'prospecto')?.id ?? null,
  desc: t?.desc ?? props.desc ?? '',
  rol: t?.rol ?? st.roles[0] ?? '',
  formato: t?.formato ?? '',
  asignados: [...(t?.asigIds ?? [])],
  fechaLimite: t?.fechaLimite ?? '',
  fecha: t?.fecha ?? '',
  nivel: t?.nivel ?? '',
  monto: t?.monto ?? '',
  notas: t?.notas ?? '',
  pagado: t?.pagado ?? false,
});

const soloLectura = !puede('tareas', 'full');
const esVideo = computed(() => ['Reel', 'Video Story'].includes(f.formato));

// Elegir un nivel sugiere el monto de la tabla de tarifas: de video si el
// formato es un video, de diseño en cualquier otro caso. Se puede pisar a mano.
function elegirNivel() {
  if (!f.nivel || !st.tarifas) return;
  const tabla = esVideo.value ? st.tarifas.video : st.tarifas.diseno;
  f.monto = tabla[f.nivel];
}
function alternar(id) {
  const i = f.asignados.indexOf(id);
  if (i >= 0) f.asignados.splice(i, 1); else f.asignados.push(id);
}

async function guardar() {
  if (!f.desc.trim()) return avisar('Falta la descripción.');
  if (!f.cid) return avisar('Elegí un cliente.');
  const r = await api(t ? `/api/tareas/${t.id}` : '/api/tareas', { method: t ? 'PUT' : 'POST', body: f });
  if (!r) return;
  guardarEn('tareas', r);
  avisar('Tarea guardada.', 'ok');
  emit('cerrar');
}
async function eliminar() {
  if (!confirm('¿Eliminar esta tarea? No tiene vuelta atrás.')) return;
  if (!(await api(`/api/tareas/${t.id}`, { method: 'DELETE' }))) return;
  sacarDe('tareas', t.id);
  emit('cerrar');
}
</script>

<template>
  <Modal @cerrar="emit('cerrar')">
    <div class="modal-cuerpo">
      <h3>{{ t ? 'Editar tarea' : 'Nueva tarea' }}</h3>
      <fieldset :disabled="soloLectura" style="border:none">
        <div class="campo"><label>Cliente</label>
          <select v-model="f.cid"><option v-for="c in st.clientes" :key="c.id" :value="c.id">{{ c.nombre }}</option></select>
        </div>
        <div class="campo"><label>Descripción</label><input v-model="f.desc" placeholder="Ej: Cara - Hollywood Peel"></div>
        <div class="fila">
          <div class="campo"><label>Rol</label>
            <select v-model="f.rol"><option value="">—</option><option v-for="r in st.roles" :key="r">{{ r }}</option></select>
          </div>
          <div class="campo"><label>Formato</label>
            <select v-model="f.formato" @change="elegirNivel"><option value="">— Sin formato —</option><option v-for="x in FORMATOS" :key="x">{{ x }}</option></select>
          </div>
        </div>
        <div class="campo"><label>Asignado a</label>
          <div class="pills">
            <button v-for="m in st.equipo" :key="m.id" type="button" class="pill" :class="f.asignados.includes(m.id) ? 'tan' : 'neutro'"
                    @click="alternar(m.id)">{{ m.nombre }}</button>
            <span v-if="!st.equipo.length" class="nota">No hay nadie en el equipo todavía.</span>
          </div>
        </div>
        <div class="fila">
          <div class="campo"><label>Fecha límite</label><input type="date" v-model="f.fechaLimite"></div>
          <div class="campo"><label>Fecha de publicación</label><input type="date" v-model="f.fecha"></div>
        </div>
        <div class="sep">Pago a quien la hace</div>
        <div class="fila">
          <div class="campo"><label>Nivel</label>
            <select v-model="f.nivel" @change="elegirNivel">
              <option value="">— Sin nivel —</option>
              <option v-for="n in ['N1','N2','N3']" :key="n" :value="n">
                {{ n }} · {{ plata((esVideo ? st.tarifas?.video : st.tarifas?.diseno)?.[n]) }}
              </option>
            </select>
          </div>
          <div class="campo"><label>Monto</label><input type="number" min="0" step="500" v-model="f.monto" placeholder="0"></div>
        </div>
        <div class="campo"><label>Notas / links</label><textarea v-model="f.notas" placeholder="Links, instrucciones, accesos..." /></div>
        <label class="chk"><input type="checkbox" v-model="f.pagado"> Ya está pagada</label>
      </fieldset>
      <div class="modal-pie">
        <button v-if="t && esAdmin" class="btn peligro izq" @click="eliminar">Eliminar</button>
        <button class="btn" @click="emit('cerrar')">{{ soloLectura ? 'Cerrar' : 'Cancelar' }}</button>
        <button v-if="!soloLectura" class="btn p" @click="guardar">Guardar</button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.pills { display: flex; flex-wrap: wrap; gap: 6px; }
.pills .pill { border: none; cursor: pointer; font-size: 13px; padding: 4px 11px; }
</style>
