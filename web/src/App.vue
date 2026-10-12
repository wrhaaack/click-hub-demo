<script setup>
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import Sidebar from './components/Sidebar.vue';
import Cargando from './components/Cargando.vue';
import Icono from './components/Icono.vue';
import logo from './logo.jpg';
import { st, cargarTodo } from './lib/store';
import { avisos, fallaServidor } from './lib/api';

const route = useRoute();
// El login no tiene sesión todavía: pedir el estado ahí sería un 401 seguro.
if (!route.meta.publica) cargarTodo();
const recargarPagina = () => window.location.reload();

// En celular el menú es un cajón que se abre con el botón de la barra de arriba.
const menu = ref(false);
</script>

<template>
  <RouterView v-if="route.meta.publica" />
  <template v-else>
    <div v-if="st.listo" class="layout">
      <Sidebar :menu-abierto="menu" @cerrar="menu = false" />
      <div class="contenido">
        <header class="barra-movil">
          <button class="icono-btn" aria-label="Abrir menú" :aria-expanded="menu" @click="menu = true"><Icono n="menu" :t="22" /></button>
          <img :src="logo" alt="" class="barra-logo">
          <span class="barra-titulo">Click Hub</span>
        </header>
        <main class="main"><RouterView /></main>
      </div>
    </div>
    <div v-else-if="fallaServidor.mensaje" class="falla">
      <h2>No se pudo cargar Click Hub</h2>
      <p>{{ fallaServidor.mensaje }}</p>
      <button class="btn p" @click="recargarPagina">Reintentar</button>
    </div>
    <Cargando v-else />
  </template>
  <div class="avisos" aria-live="polite">
    <div v-for="a in avisos" :key="a.id" class="aviso" :class="a.tipo">{{ a.mensaje }}</div>
  </div>
</template>

<style scoped>
.falla { max-width: 520px; margin: 18vh auto 0; text-align: center; padding: 0 20px; }
.falla h2 { font-size: 20px; margin-bottom: 10px; }
.falla p { color: var(--mut); margin-bottom: 18px; overflow-wrap: anywhere; }
</style>
