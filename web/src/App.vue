<script setup>
import { useRoute } from 'vue-router';
import Sidebar from './components/Sidebar.vue';
import { st, cargarTodo } from './lib/store';
import { avisos, fallaServidor } from './lib/api';

const route = useRoute();
// El login no tiene sesión todavía: pedir el estado ahí sería un 401 seguro.
if (!route.meta.publica) cargarTodo();
const recargarPagina = () => window.location.reload();
</script>

<template>
  <RouterView v-if="route.meta.publica" />
  <div v-else class="layout">
    <Sidebar v-if="st.listo" />
    <main class="main">
      <RouterView v-if="st.listo" />
      <div v-else-if="fallaServidor.mensaje" class="falla">
        <h2>No se pudo cargar Click Hub</h2>
        <p>{{ fallaServidor.mensaje }}</p>
        <button class="btn p" @click="recargarPagina">Reintentar</button>
      </div>
      <div v-else class="vacio">Cargando…</div>
    </main>
  </div>
  <div class="avisos" aria-live="polite">
    <div v-for="a in avisos" :key="a.id" class="aviso" :class="a.tipo">{{ a.mensaje }}</div>
  </div>
</template>

<style scoped>
.falla { max-width: 520px; margin: 18vh auto 0; text-align: center; padding: 0 20px; }
.falla h2 { font-size: 20px; margin-bottom: 10px; }
.falla p { color: var(--mut); margin-bottom: 18px; overflow-wrap: anywhere; }
</style>
