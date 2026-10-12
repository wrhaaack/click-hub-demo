<script setup>
import { ref, computed } from 'vue';
import Icono from '../components/Icono.vue';
import MesSel from '../components/MesSel.vue';
import ClienteDetalle from '../components/ClienteDetalle.vue';
import ModalCliente from '../components/ModalCliente.vue';
import { st, puede, plata, fechaCorta, inicial, tareasDelMes } from '../lib/store';

const tab = ref('cliente');
const q = ref('');
const abierto = ref(null);
const nuevo = ref(false);

const deTipo = (tipo) => st.clientes.filter((c) => (c.tipo || 'cliente') === tipo);
const cuentas = computed(() => ({ cliente: deTipo('cliente').length, prospecto: deTipo('prospecto').length }));
const filas = computed(() => {
  const txt = q.value.trim().toLowerCase();
  return deTipo(tab.value).filter((c) => !txt
    || c.nombre.toLowerCase().includes(txt) || (c.ig || '').toLowerCase().includes(txt)
    || (c.contacto || '').toLowerCase().includes(txt));
});

// Conteos del mes por cliente, calculados una vez por render y no por celda.
const resumen = computed(() => {
  const m = {};
  tareasDelMes(st.periodo).forEach((t) => {
    const r = (m[t.cid] ||= { total: 0, listas: 0 });
    r.total++;
    if (t.estado === 'listo' || t.estado === 'cumplido') r.listas++;
  });
  return m;
});
const pautasMes = computed(() => Object.fromEntries(st.pautas.filter((p) => p.periodo === st.periodo).map((p) => [p.clienteId, p])));

const COBRO = { pendiente: ['Pendiente', 'warn'], parcial: ['Parcial', 'warn'], pagado: ['Pagado', 'ok'] };

// Avisa si el aumento cae este mes o ya pasó (la hoja "Actualizaciones").
function actualizacion(c) {
  if (!c.proximaActualizacion) return null;
  const vencida = c.proximaActualizacion.slice(0, 7) <= st.periodo;
  return { txt: fechaCorta(c.proximaActualizacion) + '/' + c.proximaActualizacion.slice(2, 4), vencida };
}
</script>

<template>
  <div class="pagina">
    <div class="pag-head">
      <h1>Clientes</h1>
      <span class="info" title="Clientes activos y prospectos (presupuestos que todavía no arrancaron). Tocá una fila para ver el detalle."><Icono n="info" /></span>
      <div class="der"><MesSel /></div>
    </div>

    <div class="barra">
      <div class="tabs">
        <button class="tab" :class="{ on: tab === 'cliente' }" @click="tab = 'cliente'">Clientes <span class="cuenta">{{ cuentas.cliente }}</span></button>
        <button class="tab" :class="{ on: tab === 'prospecto' }" @click="tab = 'prospecto'">Prospectos <span class="cuenta">{{ cuentas.prospecto }}</span></button>
      </div>
      <div class="acciones">
        <label class="buscar"><Icono n="buscar" :t="16" /><input v-model="q" placeholder="Buscar…" aria-label="Buscar clientes"></label>
        <button v-if="puede('clientes','full')" class="btn p" @click="nuevo = true"><Icono n="mas" :t="16" />Agregar</button>
      </div>
    </div>

    <table v-if="filas.length" class="tabla">
      <thead>
        <tr>
          <th>Nombre</th><th>Instagram</th><th>Contacto</th>
          <th>Tareas del mes</th><th class="num">Pauta del mes</th><th class="num">Abono</th><th>Cobro</th><th>Actualiza</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in filas" :key="c.id" @click="abierto = c.id">
          <td><span class="nombre"><span class="avatar">{{ inicial(c.nombre) }}</span>{{ c.nombre }}</span></td>
          <td class="muted">{{ c.ig || '—' }}</td>
          <td class="muted">{{ c.contacto || '—' }}</td>
          <td>
            <span class="metrica" :title="`${resumen[c.id]?.listas ?? 0} listas de ${resumen[c.id]?.total ?? 0}`">
              <Icono n="bandeja" :t="16" /><b>{{ resumen[c.id]?.listas ?? 0 }}</b>/{{ resumen[c.id]?.total ?? 0 }}
            </span>
          </td>
          <td class="num">{{ pautasMes[c.id] ? plata(pautasMes[c.id].total) : '—' }}</td>
          <td class="num">{{ plata(c.aPagar) }}</td>
          <td><span v-if="c.aPagar" class="pill" :class="COBRO[c.estadoPago][1]">{{ COBRO[c.estadoPago][0] }}</span></td>
          <td>
            <span v-if="actualizacion(c)" class="pill" :class="actualizacion(c).vencida ? 'mal' : 'neutro'"
                  :title="actualizacion(c).vencida ? 'Ya toca actualizar el precio' : 'Próxima actualización'">{{ actualizacion(c).txt }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else class="vacio">
      {{ q ? 'Nada coincide con la búsqueda.' : (tab === 'cliente' ? 'Todavía no hay clientes.' : 'No hay prospectos cargados.') }}
    </div>

    <ClienteDetalle v-if="abierto" :id="abierto" @cerrar="abierto = null" />
    <ModalCliente v-if="nuevo" :tipo="tab" @cerrar="nuevo = false" />
  </div>
</template>
