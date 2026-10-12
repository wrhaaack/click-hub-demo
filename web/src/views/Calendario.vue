<script setup>
import { ref, reactive, computed } from 'vue';
import Icono from '../components/Icono.vue';
import MesSel from '../components/MesSel.vue';
import Modal from '../components/Modal.vue';
import ModalTarea from '../components/ModalTarea.vue';
import PlanCliente from '../components/PlanCliente.vue';
import { st, puede, clientePorId, tareasDelMes, guardarEn, sacarDe } from '../lib/store';
import { COLORES as PALETA } from '../lib/colores';
import { api, avisar } from '../lib/api';

// Dos vistas, a propósito separadas:
//   Equipo  -> tareas por fecha de publicación y eventos del estudio, con los
//              nombres internos con los que trabaja el equipo.
//   Cliente -> la planificación por etapas que se le muestra al cliente y se
//              exporta como imagen.
const COLORES = Object.fromEntries(Object.entries(PALETA).map(([k, c]) => [k, c.b]));
const vista = ref('equipo');
const planCid = ref(st.clientes.find((c) => c.tipo !== 'prospecto')?.id ?? st.clientes[0]?.id ?? null);
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const rol = ref('');
const tareaAbierta = ref(undefined);
const evento = ref(null);
const editaEventos = puede('calendario', 'full');

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoy = iso(new Date());

// Semanas de lunes a domingo que cubren el mes entero.
const celdas = computed(() => {
  const [a, m] = st.periodo.split('-').map(Number);
  const primero = new Date(a, m - 1, 1);
  const inicio = new Date(primero);
  inicio.setDate(1 - ((primero.getDay() + 6) % 7));
  const ultimo = new Date(a, m, 0);
  const out = [];
  for (let d = new Date(inicio); d <= ultimo || out.length % 7; d.setDate(d.getDate() + 1)) {
    out.push({ fecha: iso(d), dia: d.getDate(), delMes: d.getMonth() === m - 1 });
  }
  return out;
});

const tareas = computed(() => tareasDelMes(st.periodo).filter((t) => !rol.value || t.rol === rol.value));
// Las fechas especiales de todos los clientes (las cargadas en su ficha).
const especiales = computed(() => Object.entries(st.fechasEspeciales)
  .filter(([k]) => k.endsWith(st.periodo))
  .flatMap(([k, lista]) => lista.filter((f) => f.fecha && f.label)
    .map((f) => ({ ...f, cliente: clientePorId(Number(k.split('-')[1]))?.nombre }))));
const deDia = (fecha) => ({
  esp: especiales.value.filter((f) => f.fecha === fecha),
  eventos: st.eventos.filter((e) => e.desde <= fecha && e.hasta >= fecha),
  tareas: tareas.value.filter((t) => t.fecha === fecha),
});

function nuevoEvento(fecha) {
  if (!editaEventos) return;
  evento.value = reactive({ id: null, titulo: '', desde: fecha, hasta: '', horaInicio: '', horaFin: '', color: 'violeta', descripcion: '' });
}
function abrirEvento(e) { evento.value = reactive({ ...e, hasta: e.hasta === e.desde ? '' : e.hasta }); }
async function guardarEvento() {
  const e = evento.value;
  const r = await api(e.id ? `/api/eventos/${e.id}` : '/api/eventos', { method: e.id ? 'PUT' : 'POST', body: e });
  if (!r) return;
  guardarEn('eventos', { ...r, hasta: r.hasta || r.desde });
  evento.value = null;
  avisar('Evento guardado.', 'ok');
}
async function borrarEvento() {
  if (!confirm('¿Borrar este evento?')) return;
  if (!(await api(`/api/eventos/${evento.value.id}`, { method: 'DELETE' }))) return;
  sacarDe('eventos', evento.value.id);
  evento.value = null;
}
</script>

<template>
  <div class="pagina">
    <div class="pag-head">
      <h1>Calendario</h1>
      <span class="info" title="Tareas por fecha de publicación y eventos del estudio. Tocá un día vacío para agregar un evento."><Icono n="info" /></span>
      <div class="der"><MesSel /></div>
    </div>

    <div class="vistas">
      <button class="vista" :class="{ on: vista === 'equipo' }" @click="vista = 'equipo'">Equipo</button>
      <button class="vista" :class="{ on: vista === 'cliente' }" @click="vista = 'cliente'">Cliente</button>
    </div>

    <template v-if="vista === 'cliente'">
      <div class="barra">
        <div class="tabs"><span class="tab on">Planificación</span></div>
        <div class="acciones">
          <select v-model="planCid" class="sel" aria-label="Cliente">
            <option v-for="c in st.clientes" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </div>
      </div>
      <PlanCliente v-if="planCid" :key="planCid" :cid="planCid" />
      <div v-else class="vacio">No hay clientes para planificar.</div>
    </template>

    <template v-else>
    <div class="barra">
      <div class="tabs">
        <button class="tab" :class="{ on: !rol }" @click="rol = ''">Todo <span class="cuenta">{{ tareasDelMes(st.periodo).length }}</span></button>
        <button v-for="r in st.roles" :key="r" class="tab" :class="{ on: rol === r }" @click="rol = r">
          {{ r }} <span class="cuenta">{{ tareasDelMes(st.periodo).filter((t) => t.rol === r).length }}</span>
        </button>
      </div>
      <div class="acciones">
        <button v-if="editaEventos" class="btn p" @click="nuevoEvento(`${st.periodo}-01`)"><Icono n="mas" :t="16" />Evento</button>
      </div>
    </div>

    <div class="cal">
      <div v-for="d in DIAS" :key="d" class="cal-cab">{{ d }}</div>
      <div v-for="c in celdas" :key="c.fecha" class="cal-dia" :class="{ fuera: !c.delMes, hoy: c.fecha === hoy }" @click.self="nuevoEvento(c.fecha)">
        <div class="cal-num" @click="nuevoEvento(c.fecha)">{{ c.dia }}</div>
        <div v-for="(f, i) in deDia(c.fecha).esp" :key="'f' + i" class="cal-esp" :title="`${f.label} · ${f.cliente}`">★ {{ f.label }} · {{ f.cliente }}</div>
        <button v-for="e in deDia(c.fecha).eventos" :key="'e' + e.id" class="cal-ev" :style="{ background: COLORES[e.color] }" @click="abrirEvento(e)">
          {{ e.horaInicio ? e.horaInicio + ' ' : '' }}{{ e.titulo }}
        </button>
        <button v-for="t in deDia(c.fecha).tareas" :key="t.id" class="cal-t" :class="{ hecha: t.estado === 'listo' || t.estado === 'cumplido' }" @click="tareaAbierta = t">
          <b>{{ clientePorId(t.cid)?.nombre }}</b> {{ t.desc }}
        </button>
      </div>
    </div>
    </template>

    <ModalTarea v-if="tareaAbierta !== undefined" :tarea="tareaAbierta" @cerrar="tareaAbierta = undefined" />

    <Modal v-if="evento" @cerrar="evento = null">
      <div class="modal-cuerpo">
        <h3>{{ evento.id ? 'Evento' : 'Nuevo evento' }}</h3>
        <fieldset :disabled="!editaEventos" style="border:none">
          <div class="campo"><label>Título</label><input v-model="evento.titulo" placeholder="Ej: Grabación Be Epic"></div>
          <div class="fila">
            <div class="campo"><label>Desde</label><input type="date" v-model="evento.desde"></div>
            <div class="campo"><label>Hasta</label><input type="date" v-model="evento.hasta"><span class="nota">Vacío = un solo día</span></div>
          </div>
          <div class="fila">
            <div class="campo"><label>Hora de inicio</label><input type="time" v-model="evento.horaInicio"></div>
            <div class="campo"><label>Hora de fin</label><input type="time" v-model="evento.horaFin"></div>
          </div>
          <div class="campo"><label>Color</label>
            <div style="display:flex;gap:8px">
              <button v-for="(hex, k) in COLORES" :key="k" type="button" class="color" :class="{ on: evento.color === k }"
                      :style="{ background: hex }" :aria-label="k" @click="evento.color = k" />
            </div>
          </div>
          <div class="campo"><label>Descripción</label><textarea v-model="evento.descripcion" /></div>
        </fieldset>
        <div class="modal-pie">
          <button v-if="evento.id && editaEventos" class="btn peligro izq" @click="borrarEvento">Borrar</button>
          <button class="btn" @click="evento = null">{{ editaEventos ? 'Cancelar' : 'Cerrar' }}</button>
          <button v-if="editaEventos" class="btn p" @click="guardarEvento">Guardar</button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.cal { display: grid; grid-template-columns: repeat(7, 1fr); border: 1px solid var(--bor); border-radius: var(--r); overflow: hidden; background: var(--bor); gap: 1px; }
.cal-cab { background: var(--sur3); padding: 8px 10px; font-size: 13px; color: var(--mut); }
.cal-dia { background: var(--sur); min-height: 118px; padding: 6px; display: flex; flex-direction: column; gap: 3px; cursor: default; }
.cal-dia.fuera { background: var(--sur3); }
.cal-dia.fuera .cal-num { color: var(--hin); }
.cal-num { font-size: 13px; color: var(--mut); padding: 0 4px 2px; font-variant-numeric: tabular-nums; cursor: pointer; align-self: flex-start; }
.cal-dia.hoy .cal-num { background: var(--tan); color: #fff; border-radius: 10px; padding: 0 7px; }
.cal-ev, .cal-t {
  border: none; text-align: left; font-size: 12px; padding: 3px 6px; border-radius: 5px; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cal-ev { color: #fff; }
.cal-esp { font-size: 12px; padding: 2px 6px; border-radius: 5px; background: var(--amberbg); color: var(--amber); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cal-t { background: var(--tanl); color: var(--tanlt); }
.cal-t.hecha { opacity: .55; text-decoration: line-through; }
.color { width: 26px; height: 26px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.color.on { border-color: var(--txt); }
.vistas { display: inline-flex; background: var(--sur2); border-radius: var(--rs); padding: 3px; margin-bottom: 18px; }
.vista { border: none; background: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; color: var(--mut); font-size: 14px; }
.vista.on { background: var(--sur); color: var(--txt); font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,.08); }

/* En celular la grilla no se aplasta: cada día conserva un ancho legible y la
   semana se desliza de costado. */
@media (max-width: 900px) {
  .cal { grid-template-columns: repeat(7, minmax(96px, 1fr)); overflow-x: auto; }
  .cal-dia { min-height: 96px; }
  .vistas { width: 100%; }
  .vista { flex: 1; }
}
</style>
