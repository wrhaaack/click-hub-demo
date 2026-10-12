<script setup>
import Icono from './Icono.vue';
import { st, nombreDelMes, moverMes } from '../lib/store';
</script>

<template>
  <div class="mes-sel">
    <button class="icono-btn" aria-label="Mes anterior" @click="st.periodo = moverMes(st.periodo, -1)"><Icono n="izq" /></button>
    <span>{{ nombreDelMes(st.periodo) }}</span>
    <button class="icono-btn" aria-label="Mes siguiente" @click="st.periodo = moverMes(st.periodo, 1)"><Icono n="der" /></button>
  </div>
</template>
