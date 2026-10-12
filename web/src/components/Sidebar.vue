<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import Icono from './Icono.vue';
import MiCuenta from './MiCuenta.vue';
import logo from '../logo.jpg';
import { st, puede, esAdmin } from '../lib/store';
import { api } from '../lib/api';

// En pantallas chicas el menú es un cajón que se abre desde la barra de arriba
// (App.vue). Se cierra solo al cambiar de pantalla.
const props = defineProps({ menuAbierto: Boolean });
const emit = defineEmits(['cerrar']);
const router = useRouter();
const route = useRoute();
watch(() => route.fullPath, () => { if (props.menuAbierto) emit('cerrar'); });

// Cada ítem dice qué permiso necesita para aparecer. Están agrupados por para
// qué se usan: el trabajo del día, la plata, y la configuración del estudio.
const ITEMS = [
  { to: '/', n: 'dashboard', l: 'Dashboard', sec: 'dashboard' },
  { to: '/clientes', n: 'clientes', l: 'Clientes', sec: 'clientes' },
  { to: '/tareas', n: 'tareas', l: 'Tareas', sec: 'delegacion' },
  { to: '/calendario', n: 'calendario', l: 'Calendario', sec: 'calendario' },
  { to: '/brainstorm', n: 'brainstorm', l: 'Brainstorming', sec: 'brainstorm' },
];
const PLATA = [
  { to: '/disenos', n: 'disenos', l: 'Liquidaciones', sec: 'tareas' },
  { to: '/pauta', n: 'pauta', l: 'Pauta', sec: 'clientes' },
  { to: '/cotizador', n: 'cotizador', l: 'Cotizador', sec: 'clientes', nivel: 'full' },
];
const ESTUDIO = [
  { to: '/equipo', n: 'equipo', l: 'Equipo', sec: 'equipo' },
  { to: '/estudio', n: 'estudio', l: 'El estudio', sec: 'estudio' },
  { to: '/usuarios', n: 'usuarios', l: 'Usuarios', sec: 'usuarios', nivel: 'full' },
];
const grupos = computed(() => [
  { t: null, items: ITEMS }, { t: 'Plata', items: PLATA }, { t: 'Estudio', items: ESTUDIO },
].map((g) => ({ ...g, items: g.items.filter((i) => puede(i.sec, i.nivel)) })).filter((g) => g.items.length));
const cuenta = ref(false);

// ---------- Tema ----------
// Se aplica en main.js antes de montar, así la pantalla de carga ya sale con
// el tema elegido; acá solo se alterna.
const tema = ref(document.documentElement.dataset.tema || 'claro');
function alternarTema() {
  tema.value = tema.value === 'oscuro' ? 'claro' : 'oscuro';
  localStorage.setItem('ck-tema', tema.value);
  document.documentElement.dataset.tema = tema.value;
}

// ---------- Notificaciones ----------
const notifs = ref([]);
const abierto = ref(false);
const noLeidas = computed(() => notifs.value.filter((n) => !n.leida).length);
let timer;
async function cargarNotifs() {
  const r = await api('/api/notificaciones');
  if (r) notifs.value = r;
}
async function marcarTodas() {
  await api('/api/notificaciones/marcar-todas', { method: 'POST' });
  cargarNotifs();
}
// Los avisos traen la pantalla a la que llevan ('/app/tareas'...).
function irA(n) {
  api(`/api/notificaciones/${n.id}/leida`, { method: 'PATCH' });
  n.leida = true;
  abierto.value = false;
  router.push((n.link || '').replace(/^\/app/, '') || '/');
}
function cerrarAfuera(e) { if (!e.target.closest('.notif-wrap')) abierto.value = false; }
onMounted(() => {
  cargarNotifs();
  timer = setInterval(cargarNotifs, 30000);
  document.addEventListener('click', cerrarAfuera);
});
onBeforeUnmount(() => { clearInterval(timer); document.removeEventListener('click', cerrarAfuera); });

async function salir() {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/app/login';
}
</script>

<template>
  <div v-if="menuAbierto" class="sb-fondo" @click="emit('cerrar')" />
  <aside class="sb" :class="{ abierto: menuAbierto }" aria-label="Menú principal">
    <div class="sb-top">
      <img :src="logo" alt="" class="sb-logo">
      <span class="sb-titulo">Click Hub</span>
      <span class="sb-badge">{{ esAdmin ? 'Admin' : (st.yo?.rolNombre || 'Equipo') }}</span>
      <button class="icono-btn sb-cerrar" aria-label="Cerrar menú" @click="emit('cerrar')"><Icono n="cerrar" /></button>
    </div>

    <nav class="sb-nav">
      <template v-for="g in grupos" :key="g.t ?? 'base'">
        <div v-if="g.t" class="sb-sec">{{ g.t }}</div>
        <RouterLink v-for="i in g.items" :key="i.to" :to="i.to" class="sb-item" exact-active-class="on">
          <Icono :n="i.n" :t="20" />{{ i.l }}
        </RouterLink>
      </template>
    </nav>

    <div class="sb-pie">
      <button class="sb-yo" title="Mi cuenta" @click="cuenta = true">
        <span class="avatar">{{ (st.yo?.nombre || '?')[0] }}</span>
        <span class="sb-nom">{{ st.yo?.nombre }}</span>
      </button>
      <div class="sb-btns">
        <div class="notif-wrap">
          <button class="icono-btn" title="Notificaciones" @click="abierto = !abierto">
            <Icono n="campana" /><span v-if="noLeidas" class="notif-badge">{{ noLeidas > 9 ? '9+' : noLeidas }}</span>
          </button>
          <div v-if="abierto" class="notif-panel">
            <div class="notif-head"><b>Notificaciones</b><button class="btn chico" @click="marcarTodas">Marcar leídas</button></div>
            <div v-if="!notifs.length" class="vacio">No hay notificaciones.</div>
            <button v-for="n in notifs" :key="n.id" class="notif-item" :class="{ nueva: !n.leida }" @click="irA(n)">
              {{ n.mensaje }}
            </button>
          </div>
        </div>
        <button class="icono-btn" :title="tema === 'oscuro' ? 'Tema claro' : 'Tema oscuro'" @click="alternarTema">
          <Icono :n="tema === 'oscuro' ? 'sol' : 'luna'" />
        </button>
        <button class="icono-btn" title="Salir" @click="salir"><Icono n="salir" /></button>
      </div>
    </div>
  </aside>
  <MiCuenta v-if="cuenta" :email="st.yo?.email" @cerrar="cuenta = false" />
</template>

<style scoped>
.sb {
  width: 264px; flex-shrink: 0; background: var(--sur3); border-right: 1px solid var(--bor);
  display: flex; flex-direction: column; padding: 26px 16px 16px;
}
.sb-top { display: flex; align-items: center; gap: 10px; padding: 0 8px 30px; }
.sb-logo { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
.sb-titulo { font-family: 'Syne', sans-serif; font-size: 19px; font-weight: 600; white-space: nowrap; }
.sb-badge { font-size: 11px; background: var(--tanl); color: var(--tanlt); border-radius: 20px; padding: 1px 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.sb-nav { display: flex; flex-direction: column; gap: 4px; flex: 1; overflow-y: auto; }
.sb-item {
  display: flex; align-items: center; gap: 13px; padding: 10px 12px; border-radius: var(--rs);
  color: var(--mut); font-size: 15.5px; transition: background .12s, color .12s;
}
.sb-item:hover { color: var(--txt); background: var(--sur2); }
.sb-item.on { color: var(--txt); background: var(--sur2); font-weight: 500; }
.sb-sec { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--hin); padding: 18px 12px 6px; }
.sb-pie { border-top: 1px solid var(--bor); padding-top: 14px; display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.sb-yo { display: flex; align-items: center; gap: 8px; min-width: 0; background: none; border: none; cursor: pointer; padding: 4px; border-radius: var(--rs); }
.sb-yo:hover { background: var(--sur2); }
.sb-nom { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sb-btns { display: flex; }
.notif-wrap { position: relative; }
.notif-badge {
  position: absolute; top: 3px; right: 3px; background: var(--red); color: #fff;
  font-size: 10px; border-radius: 10px; padding: 0 4px; line-height: 15px;
}
.notif-panel {
  position: absolute; bottom: 42px; left: -120px; width: 320px; max-height: 420px; overflow-y: auto;
  background: var(--sur); border: 1px solid var(--bor); border-radius: var(--r); box-shadow: var(--sombra); z-index: 50;
}
.notif-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--bor); }
.notif-item {
  display: block; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--bor);
  padding: 10px 14px; font-size: 13px; color: var(--mut); cursor: pointer;
}
.notif-item.nueva { color: var(--txt); background: var(--sur3); }
.notif-item:hover { background: var(--sur2); }
.sb-cerrar, .sb-fondo { display: none; }

/* ---------- Pantallas chicas: el menú es un cajón ---------- */
@media (max-width: 900px) {
  .sb {
    position: fixed; top: 0; bottom: 0; left: 0; z-index: 90; width: min(300px, 86vw);
    transform: translateX(-100%); transition: transform .22s ease; box-shadow: var(--sombra);
    padding-top: 18px;
  }
  .sb.abierto { transform: none; }
  .sb-top { padding-bottom: 20px; }
  .sb-cerrar { display: inline-flex; margin-left: auto; }
  .sb-fondo { display: block; position: fixed; inset: 0; z-index: 89; background: var(--velo); }
  .sb-item { padding: 12px; }   /* más alto: se toca con el dedo */
  /* El panel de avisos se abre hacia arriba y ocupa el ancho del cajón. */
  .notif-panel { position: fixed; left: 12px; right: 12px; bottom: 70px; width: auto; max-height: 60vh; }
}
@media (prefers-reduced-motion: reduce) { .sb { transition: none; } }
</style>
