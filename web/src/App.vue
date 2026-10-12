<script setup>
import { useRoute } from 'vue-router';
import Sidebar from './components/Sidebar.vue';
import { st, cargarTodo } from './lib/store';
import { avisos } from './lib/api';

const route = useRoute();
// El login no tiene sesión todavía: pedir el estado ahí sería un 401 seguro.
if (!route.meta.publica) cargarTodo();
</script>

<template>
  <RouterView v-if="route.meta.publica" />
  <div v-else class="layout">
    <Sidebar v-if="st.listo" />
    <main class="main">
      <RouterView v-if="st.listo" />
      <div v-else class="vacio">Cargando…</div>
    </main>
  </div>
  <div class="avisos" aria-live="polite">
    <div v-for="a in avisos" :key="a.id" class="aviso" :class="a.tipo">{{ a.mensaje }}</div>
  </div>
</template>
