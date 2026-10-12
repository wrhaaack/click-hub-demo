<script setup>
import { ref, computed, watch } from 'vue';
import Icono from '../components/Icono.vue';
import MesSel from '../components/MesSel.vue';
import { st, puede, plata, fechaCorta, nombreDelMes, tareasDelMes, porLiquidar, isoDe, DIAS, ESTADOS } from '../lib/store';
import { api } from '../lib/api';

const agenda = ref({ tareas: [], especiales: [], eventos: [] });
const actividad = ref([]);

async function cargar() {
  if (!puede('dashboard', 'full')) return;
  const [a, act] = await Promise.all([
    api(`/api/dashboard/agenda?periodo=${st.periodo}`),
    api('/api/dashboard/actividad?limite=25'),
  ]);
  if (a) agenda.value = a;
  if (act) actividad.value = act;
}
watch(() => st.periodo, cargar, { immediate: true });

const activos = computed(() => st.clientes.filter((c) => c.tipo !== 'prospecto'));
const tareas = computed(() => tareasDelMes(st.periodo));
const terminadas = computed(() => tareas.value.filter((t) => t.estado === 'listo' || t.estado === 'cumplido').length);
const abonos = computed(() => {
  const total = activos.value.reduce((s, c) => s + (c.aPagar || 0), 0);
  const cobrado = activos.value.reduce((s, c) => s + (c.estadoPago === 'pagado' ? c.aPagar || 0
    : c.estadoPago === 'parcial' ? c.abonado || 0 : 0), 0);
  return { total, cobrado };
});
const pautaMes = computed(() => st.pautas.filter((p) => p.periodo === st.periodo));
const deuda = computed(() => porLiquidar.value.reduce((s, t) => s + t.monto, 0));
const aumentos = computed(() => activos.value
  .filter((c) => c.proximaActualizacion && c.proximaActualizacion.slice(0, 7) <= st.periodo)
  .sort((a, b) => a.proximaActualizacion.localeCompare(b.proximaActualizacion)));

// Cuántas tareas del mes hay en cada estado; cada una lleva a la lista.
const porEstado = computed(() => ESTADOS.map((e) => ({ ...e, n: tareas.value.filter((t) => t.estado === e.k).length })));

// Agenda: un renglón por día con todo lo que cae ese día. Un evento de varios
// días aparece en cada uno ("qué pasa el jueves"), con la hora solo el primero
// y "(sigue)" los demás.
const soloConAlgo = ref(true);
const dias = computed(() => {
  const m = new Map();
  const sumar = (fecha, item) => { if (!m.has(fecha)) m.set(fecha, []); m.get(fecha).push(item); };
  const [a, mm] = st.periodo.split('-').map(Number);
  const primero = `${st.periodo}-01`;
  const ultimo = isoDe(new Date(a, mm, 0));
  agenda.value.eventos.forEach((e) => {
    const fin = (e.hasta || e.desde) > ultimo ? ultimo : (e.hasta || e.desde);
    for (let f = e.desde > primero ? e.desde : primero; f <= fin;) {
      sumar(f, { tipo: 'ev', txt: f === e.desde ? (e.horaInicio ? e.horaInicio + ' ' : '') + e.titulo : `${e.titulo} (sigue)` });
      const d = new Date(f + 'T00:00'); d.setDate(d.getDate() + 1); f = isoDe(d);
    }
  });
  agenda.value.especiales.forEach((e) => sumar(e.fecha, { tipo: 'esp', txt: `★ ${e.label} · ${e.cliente}` }));
  agenda.value.tareas.forEach((t) => sumar(t.fecha, { tipo: 'tarea', txt: `${t.formato ? t.formato + ': ' : ''}${t.descripcion} · ${t.cliente}` }));
  const out = [];
  const hoy = isoDe(new Date());
  for (let d = 1; d <= new Date(a, mm, 0).getDate(); d++) {
    const f = `${st.periodo}-${String(d).padStart(2, '0')}`;
    const dow = new Date(a, mm - 1, d).getDay();
    const items = m.get(f) || [];
    if (soloConAlgo.value && !items.length && f !== hoy) continue;
    out.push({ f, d, dow: DIAS[dow], finde: dow === 0 || dow === 6, hoy: f === hoy, items });
  }
  return out;
});
</script>

<template>
  <div class="pagina">
    <div class="pag-head">
      <h1>Dashboard</h1>
      <span class="info" title="Resumen del mes elegido."><Icono n="info" /></span>
      <div class="der"><MesSel /></div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="et"><Icono n="clientes" :t="16" />Clientes activos</div>
        <div class="val">{{ activos.length }}</div>
        <div class="sub">{{ st.clientes.length - activos.length }} prospectos</div>
      </div>
      <RouterLink to="/tareas" class="kpi enlace">
        <div class="et"><Icono n="tareas" :t="16" />Tareas de {{ nombreDelMes(st.periodo).split(' ')[0].toLowerCase() }}</div>
        <div class="val">{{ terminadas }}<span style="color:var(--hin);font-size:18px">/{{ tareas.length }}</span></div>
        <div class="barrita"><span :style="{ width: (tareas.length ? terminadas * 100 / tareas.length : 0) + '%' }" /></div>
        <div class="sub">{{ porEstado.filter((e) => e.n).map((e) => `${e.n} ${e.l.toLowerCase()}`).join(' · ') || 'sin tareas' }}</div>
      </RouterLink>
      <div v-if="puede('clientes')" class="kpi">
        <div class="et"><Icono n="plata" :t="16" />Abonos cobrados</div>
        <div class="val">{{ plata(abonos.cobrado) }}</div>
        <div class="sub">de {{ plata(abonos.total) }} por mes</div>
      </div>
      <div v-if="puede('clientes')" class="kpi">
        <div class="et"><Icono n="pauta" :t="16" />Pauta del mes</div>
        <div class="val">{{ plata(pautaMes.reduce((s, p) => s + p.total, 0)) }}</div>
        <div class="sub">{{ pautaMes.filter((p) => !p.pagado).length }} sin pagar · fee Click {{ plata(pautaMes.reduce((s, p) => s + p.feeClick, 0)) }}</div>
      </div>
      <div class="kpi">
        <div class="et"><Icono n="disenos" :t="16" />Por liquidar al equipo</div>
        <div class="val">{{ plata(deuda) }}</div>
        <div class="sub">{{ porLiquidar.length }} piezas terminadas</div>
      </div>
    </div>

    <div v-if="aumentos.length" class="tarjeta aumentos">
      <b>Toca actualizar precio:</b>
      <span v-for="c in aumentos" :key="c.id" class="pill mal">{{ c.nombre }} · {{ fechaCorta(c.proximaActualizacion) }}</span>
    </div>

    <div class="cols">
      <section class="tarjeta">
        <div class="cab-sec"><h3>Fechas del mes</h3>
          <label class="chk" style="margin:0;font-size:13px"><input type="checkbox" v-model="soloConAlgo"> Solo días con algo</label></div>
        <div v-if="!dias.length" class="vacio">Nada agendado este mes.</div>
        <div v-for="d in dias" :key="d.f" class="dia" :class="{ hoy: d.hoy, finde: d.finde }">
          <div class="dia-num"><b>{{ d.d }}</b><span>{{ d.dow }}</span></div>
          <div class="dia-items">
            <div v-for="(it, i) in d.items" :key="i" class="it" :class="it.tipo">{{ it.txt }}</div>
            <span v-if="!d.items.length" class="it nada">—</span>
          </div>
        </div>
      </section>
      <section class="tarjeta">
        <h3>Últimas actividades</h3>
        <div v-if="!actividad.length" class="vacio">Sin movimientos todavía.</div>
        <div v-for="a in actividad" :key="a.id" class="act">
          <span class="avatar">{{ a.autor[0] }}</span>
          <div><div>{{ a.descripcion }}</div><div class="act-fecha">{{ a.fecha }}</div></div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.aumentos { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 20px; padding: 14px 18px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.cols h3 { font-size: 16px; margin-bottom: 14px; }
.cab-sec { display: flex; justify-content: space-between; align-items: baseline; }
.enlace { display: block; transition: border-color .15s; }
.enlace:hover { border-color: var(--tan); }
.barrita { height: 4px; background: var(--sur2); border-radius: 2px; margin-top: 8px; overflow: hidden; }
.barrita span { display: block; height: 100%; background: var(--tan); }
.dia.hoy { background: var(--tanl); margin: 0 -10px; padding-left: 10px; padding-right: 10px; border-radius: 6px; }
.dia.finde .dia-num { opacity: .6; }
.dia-num { display: flex; flex-direction: column; line-height: 1.2; }
.dia-num span { font-size: 11px; color: var(--hin); }
.dia { display: flex; gap: 14px; padding: 9px 0; border-top: 1px solid var(--bor); }
.dia-num { width: 46px; font-variant-numeric: tabular-nums; color: var(--mut); font-size: 13px; padding-top: 1px; }
.dia-items { flex: 1; display: flex; flex-direction: column; gap: 3px; font-size: 13.5px; }
.it.esp { color: var(--tand); font-weight: 500; }
.it.ev { color: var(--mut); }
.it.ev::before { content: '● '; color: var(--tan); }
.it.nada { color: var(--hin); }
.act { display: flex; gap: 10px; padding: 9px 0; border-top: 1px solid var(--bor); font-size: 13.5px; }
.act-fecha { font-size: 12px; color: var(--hin); }
@media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }

@media (max-width: 600px) {
  .aumentos { padding: 12px 14px; }
  .cab-sec { flex-wrap: wrap; gap: 6px; }
  .cols .tarjeta { padding: 16px; }
}
</style>
