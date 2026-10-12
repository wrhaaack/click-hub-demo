<script setup>
import { ref, computed } from 'vue';
import Modal from './Modal.vue';
import Icono from './Icono.vue';
import MesSel from './MesSel.vue';
import ModalTarea from './ModalTarea.vue';
import ModalCliente from './ModalCliente.vue';
import PlanCliente from './PlanCliente.vue';
import FechasEspeciales from './FechasEspeciales.vue';
import { st, puede, esAdmin, plata, fechaCorta, inicial, nombreDelMes, tareasDelMes, urlDe, ESTADOS, DIAS, MESES, isoDe, guardarEn, sacarDe } from '../lib/store';
import { exportarClienteExcel } from '../lib/exportarExcel';
import { api } from '../lib/api';

// El detalle del cliente, con la forma del modal de la referencia: avatar
// grande, nombre, métricas y tabs con contador. Junta todo lo del cliente:
// tareas por rol, calendario con fechas especiales, planificación, pauta,
// historial, info y la exportación a Excel.
const props = defineProps({ id: Number, tabInicial: { type: String, default: 'tareas' } });
const emit = defineEmits(['cerrar']);

const c = computed(() => st.clientes.find((x) => x.id === props.id));
const tab = ref(props.tabInicial);
const delMes = computed(() => tareasDelMes(st.periodo, props.id));
const activas = computed(() => delMes.value.filter((t) => t.estado !== 'cumplido'));
const cumplidas = computed(() => st.tareas.filter((t) => t.cid === props.id && t.estado === 'cumplido')
  .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')));
const pautas = computed(() => st.pautas.filter((p) => p.clienteId === props.id));
const etapasMes = computed(() => st.etapas.filter((e) => e.clienteId === props.id
  && e.desde.slice(0, 7) <= st.periodo && (e.hasta || e.desde).slice(0, 7) >= st.periodo));

// Tareas agrupadas por rol, con un grupo al final para las que quedaron con un
// rol que ya no existe: si no, borrar un rol las haría desaparecer.
const grupos = computed(() => {
  const out = st.roles.map((r) => ({ rol: r, tareas: activas.value.filter((t) => t.rol === r) }));
  const huerfanas = activas.value.filter((t) => !st.roles.includes(t.rol));
  if (huerfanas.length) out.push({ rol: null, tareas: huerfanas });
  return out.filter((g) => g.tareas.length);
});

const historial = computed(() => {
  const m = new Map();
  cumplidas.value.forEach((t) => { const k = t.fecha ? t.fecha.slice(0, 7) : 'sf'; if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
  return [...m.entries()];
});

// Calendario del cliente: tareas por fecha de publicación y fechas especiales.
const fechasMes = computed(() => (st.fechasEspeciales[`fe-${props.id}-${st.periodo}`] || []).filter((f) => f.fecha && f.label));
const celdas = computed(() => {
  const [a, m] = st.periodo.split('-').map(Number);
  const pd = new Date(a, m - 1, 1).getDay();
  const dm = new Date(a, m, 0).getDate();
  const hoy = isoDe(new Date());
  const out = Array.from({ length: pd }, () => null);
  for (let d = 1; d <= dm; d++) {
    const ds = `${st.periodo}-${String(d).padStart(2, '0')}`;
    out.push({ d, ds, hoy: ds === hoy, tareas: delMes.value.filter((t) => t.fecha === ds), esp: fechasMes.value.filter((f) => f.fecha === ds) });
  }
  return out;
});

const tareaAbierta = ref(undefined);
const editando = ref(false);

function estadoL(k) { return ESTADOS.find((e) => e.k === k)?.l ?? k; }
function claseEstado(k) { return k === 'cumplido' || k === 'listo' ? 'ok' : k === 'pendiente' ? 'neutro' : 'warn'; }
const COBRO = { pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado' };

async function cambiarEstado(t, estado) {
  const r = await api(`/api/tareas/${t.id}/estado`, { method: 'PATCH', body: { estado } });
  if (r) guardarEn('tareas', r);
}
async function alternarPago(t) {
  const r = await api(`/api/tareas/${t.id}/pago`, { method: 'PATCH', body: { pagado: !t.pagado } });
  if (r) guardarEn('tareas', r);
}
async function borrarTarea(t) {
  if (!confirm(`¿Eliminar "${t.desc}"? No tiene vuelta atrás.`)) return;
  if (await api(`/api/tareas/${t.id}`, { method: 'DELETE' })) sacarDe('tareas', t.id);
}
</script>

<template>
  <Modal ancho @cerrar="emit('cerrar')">
    <template v-if="c">
      <div class="cabeza">
        <span class="avatar grande">{{ inicial(c.nombre) }}</span>
        <h2>{{ c.nombre }}</h2>
        <div class="metricas">
          <span v-if="c.ig" class="metrica"><Icono n="ig" :t="16" />{{ c.ig }}</span>
          <span class="metrica" title="Tareas del mes"><Icono n="bandeja" :t="16" /><b>{{ delMes.length }}</b> tareas</span>
          <span v-if="c.aPagar" class="metrica" title="Abono mensual"><Icono n="plata" :t="16" /><b>{{ plata(c.aPagar) }}</b>/mes</span>
          <span v-if="c.tipo === 'prospecto'" class="pill warn">Prospecto</span>
        </div>
        <div class="botones">
          <MesSel />
          <button v-if="puede('clientes','full')" class="btn chico" @click="editando = true">Editar datos</button>
          <button class="btn chico" title="Planilla con todos los datos del cliente, para uso interno" @click="exportarClienteExcel(c)"><Icono n="descargar" :t="14" />Excel</button>
          <button v-if="puede('tareas','full')" class="btn chico p" @click="tareaAbierta = null"><Icono n="mas" :t="14" />Tarea</button>
        </div>
      </div>

      <div class="barra interna">
        <div class="tabs">
          <button class="tab" :class="{ on: tab === 'tareas' }" @click="tab = 'tareas'">Tareas <span class="cuenta">{{ activas.length }}</span></button>
          <button class="tab" :class="{ on: tab === 'calendario' }" @click="tab = 'calendario'">Calendario <span class="cuenta">{{ fechasMes.length }}</span></button>
          <button v-if="puede('calendario')" class="tab" :class="{ on: tab === 'plan' }" @click="tab = 'plan'">Planificación <span class="cuenta">{{ etapasMes.length }}</span></button>
          <button class="tab" :class="{ on: tab === 'pauta' }" @click="tab = 'pauta'">Pauta <span class="cuenta">{{ pautas.length }}</span></button>
          <button class="tab" :class="{ on: tab === 'historial' }" @click="tab = 'historial'">Historial <span class="cuenta">{{ cumplidas.length }}</span></button>
          <button class="tab" :class="{ on: tab === 'info' }" @click="tab = 'info'">Info</button>
        </div>
      </div>

      <div class="cuerpo">
        <!-- TAREAS DEL MES, por rol -->
        <template v-if="tab === 'tareas'">
          <div v-if="!grupos.length" class="vacio">Sin tareas pendientes en {{ nombreDelMes(st.periodo).toLowerCase() }}.</div>
          <section v-for="g in grupos" :key="g.rol ?? 'otros'" class="grupo-rol">
            <div class="rol-lbl">{{ g.rol ?? 'Sin rol asignado' }}</div>
            <table class="tabla">
              <thead><tr><th>Tarea</th><th>Asignado</th><th>Límite</th><th>Publica</th><th class="num">Pago</th><th>Estado</th><th class="acc"></th></tr></thead>
              <tbody>
                <tr v-for="t in g.tareas" :key="t.id" @click="tareaAbierta = t">
                  <td><b style="font-weight:500">{{ t.desc }}</b>
                    <div class="sub">{{ t.formato }}<template v-if="t.notas"> · {{ t.notas }}</template></div></td>
                  <td class="muted">{{ t.asig.join(', ') || '—' }}</td>
                  <td class="muted">{{ fechaCorta(t.fechaLimite) || '—' }}</td>
                  <td class="muted">{{ fechaCorta(t.fecha) }}</td>
                  <td class="num" @click.stop>
                    <span v-if="t.nivel" class="pill tan">{{ t.nivel }}</span> {{ t.monto ? plata(t.monto) : '' }}
                    <button class="pill" :class="t.pagado ? 'ok' : 'neutro'" style="border:none;cursor:pointer" :disabled="!puede('tareas')" @click="alternarPago(t)">{{ t.pagado ? 'pagada' : 'sin pagar' }}</button>
                  </td>
                  <td @click.stop>
                    <select class="sel" :value="t.estado" :disabled="!puede('tareas')" aria-label="Estado" @change="cambiarEstado(t, $event.target.value)">
                      <option v-for="e in ESTADOS" :key="e.k" :value="e.k">{{ e.l }}</option>
                    </select>
                  </td>
                  <td class="acc" @click.stop><button v-if="esAdmin" class="icono-btn" title="Eliminar" @click="borrarTarea(t)"><Icono n="cerrar" :t="14" /></button></td>
                </tr>
              </tbody>
            </table>
          </section>
        </template>

        <!-- CALENDARIO DEL CLIENTE + fechas especiales -->
        <template v-else-if="tab === 'calendario'">
          <div class="cc">
            <div v-for="d in DIAS" :key="d" class="cc-dn">{{ d }}</div>
            <div v-for="(cel, i) in celdas" :key="i" class="cc-cel" :class="{ vacia: !cel, hoy: cel?.hoy }">
              <template v-if="cel">
                <div class="cc-num">{{ cel.d }}</div>
                <div v-for="(f, j) in cel.esp" :key="'f' + j" class="cc-esp" :title="f.label"><Icono n="estrella" :t="11" /> {{ f.label }}</div>
                <button v-for="t in cel.tareas" :key="t.id" class="cc-t" :class="{ hecha: t.estado === 'cumplido' || t.estado === 'listo' }" :title="t.desc" @click="tareaAbierta = t">
                  {{ t.formato ? t.formato + ': ' : '' }}{{ t.desc }}
                </button>
              </template>
            </div>
          </div>
          <FechasEspeciales :cid="id" />
        </template>

        <!-- PLANIFICACIÓN para el cliente (se exporta como imagen) -->
        <PlanCliente v-else-if="tab === 'plan'" :cid="id" />

        <!-- PAUTA -->
        <template v-else-if="tab === 'pauta'">
          <table v-if="pautas.length" class="tabla">
            <thead><tr><th>Mes</th><th></th><th class="num">Pauta</th><th class="num">Capacitación</th><th class="num">Click</th><th class="num">Total</th><th>Pago</th></tr></thead>
            <tbody>
              <tr v-for="p in pautas" :key="p.id" style="cursor:default">
                <td>{{ nombreDelMes(p.periodo) }}</td>
                <td class="muted">Mes {{ p.mes }}</td>
                <td class="num">{{ plata(p.pauta) }}</td>
                <td class="num">{{ plata(p.capacitacion) }}</td>
                <td class="num">{{ plata(p.feeClick) }}</td>
                <td class="num"><b>{{ plata(p.total) }}</b></td>
                <td><span class="pill" :class="p.pagado ? 'ok' : 'warn'">{{ p.pagado ? 'Pagado' : 'Pendiente' }}</span></td>
              </tr>
            </tbody>
          </table>
          <div v-else class="vacio">Este cliente no tiene pauta cargada.</div>
        </template>

        <!-- HISTORIAL: lo cumplido, por mes -->
        <template v-else-if="tab === 'historial'">
          <div v-if="!historial.length" class="vacio">Sin tareas cumplidas todavía.</div>
          <section v-for="[mes, lista] in historial" :key="mes" class="grupo-rol">
            <div class="rol-lbl">{{ mes === 'sf' ? 'Sin fecha' : MESES[Number(mes.slice(5)) - 1] + ' ' + mes.slice(0, 4) }}</div>
            <table class="tabla">
              <tbody>
                <tr v-for="t in lista" :key="t.id" @click="tareaAbierta = t">
                  <td>{{ t.desc }}</td>
                  <td class="muted">{{ t.formato }}</td>
                  <td class="muted">{{ t.asig.join(', ') }}</td>
                  <td><span class="pill" :class="claseEstado(t.estado)">{{ estadoL(t.estado) }}</span></td>
                  <td class="acc" @click.stop><button v-if="esAdmin" class="icono-btn" title="Eliminar" @click="borrarTarea(t)"><Icono n="cerrar" :t="14" /></button></td>
                </tr>
              </tbody>
            </table>
          </section>
        </template>

        <!-- INFO -->
        <div v-else class="datos">
          <div><span>Instagram</span>{{ c.ig || '—' }}</div>
          <div><span>Contacto</span>{{ c.contacto || '—' }}</div>
          <div><span>Teléfono</span>{{ c.tel || '—' }}</div>
          <div><span>Tipo</span>{{ c.tipo === 'prospecto' ? 'Prospecto' : 'Cliente' }}</div>
          <div><span>Cobro</span>
            <template v-if="c.aPagar != null">{{ plata(c.aPagar) }} · {{ COBRO[c.estadoPago] }}<template v-if="c.estadoPago === 'parcial'"> ({{ plata(c.abonado) }} abonado, falta {{ plata(c.aPagar - c.abonado) }})</template></template>
            <template v-else>Sin monto acordado</template>
          </div>
          <div><span>Próxima actualización</span>{{ c.proximaActualizacion ? fechaCorta(c.proximaActualizacion) + '/' + c.proximaActualizacion.slice(0, 4) : '—' }}</div>
          <div class="ancho"><span>Links</span>
            <a v-for="l in c.links" :key="l.url" :href="urlDe(l.url)" target="_blank" rel="noopener" class="link"><Icono n="link" :t="14" />{{ l.label || l.url }}</a>
            <template v-if="!c.links.length">—</template>
          </div>
          <div class="ancho"><span>Notas</span><p class="notas">{{ c.notas || '—' }}</p></div>
        </div>
      </div>
    </template>
  </Modal>
  <ModalTarea v-if="tareaAbierta !== undefined" :tarea="tareaAbierta" :cid="id" @cerrar="tareaAbierta = undefined" />
  <ModalCliente v-if="editando" :cliente="c" @cerrar="editando = false" />
</template>

<style scoped>
.cabeza { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px 28px 22px; text-align: center; }
.cabeza h2 { font-size: 22px; }
.metricas { display: flex; gap: 18px; flex-wrap: wrap; justify-content: center; }
.botones { display: flex; gap: 8px; margin-top: 6px; align-items: center; flex-wrap: wrap; justify-content: center; }
.interna { padding: 0 28px; margin-bottom: 0; overflow-x: auto; }
.cuerpo { padding: 18px 28px 28px; min-height: 260px; }
.grupo-rol { margin-bottom: 18px; }
.rol-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--hin); margin-bottom: 4px; }
.sub { font-size: 12px; color: var(--mut); max-width: 340px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.datos { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 28px; }
.datos span { display: block; font-size: 12px; color: var(--hin); margin-bottom: 3px; }
.datos .ancho { grid-column: 1 / -1; }
.notas { white-space: pre-wrap; background: var(--sur3); border-radius: var(--rs); padding: 12px; }
.link { display: inline-flex; align-items: center; gap: 5px; margin-right: 14px; color: var(--tand); }
.cc { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--bor); border: 1px solid var(--bor); border-radius: var(--r); overflow: hidden; margin-bottom: 20px; }
.cc-dn { background: var(--sur3); font-size: 11px; color: var(--hin); text-transform: uppercase; text-align: center; padding: 6px; }
.cc-cel { background: var(--sur); min-height: 88px; padding: 5px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cc-cel.vacia { background: var(--sur3); }
.cc-cel.hoy { background: var(--tanl); }
.cc-num { font-size: 12px; color: var(--mut); text-align: right; }
.cc-esp { font-size: 11px; color: var(--amber); background: var(--amberbg); border-radius: 4px; padding: 1px 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 3px; }
.cc-t { border: none; text-align: left; font-size: 11px; background: var(--sur2); color: var(--txt); border-radius: 4px; padding: 2px 5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-t.hecha { opacity: .5; text-decoration: line-through; }

@media (max-width: 900px) {
  .cabeza { padding: 28px 16px 16px; }
  .interna { padding: 0 16px; }
  .cuerpo { padding: 14px 16px 24px; }
  .cc { grid-template-columns: repeat(7, minmax(84px, 1fr)); overflow-x: auto; }
}
@media (max-width: 600px) {
  .avatar.grande { width: 64px; height: 64px; font-size: 26px; }
  .cabeza h2 { font-size: 19px; }
  .datos { grid-template-columns: 1fr; gap: 14px; }
  .botones .btn { flex: 1 1 auto; justify-content: center; }
}
</style>
