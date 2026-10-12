<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import Icono from './Icono.vue';

defineProps({ ancho: Boolean });
const emit = defineEmits(['cerrar']);

function tecla(e) { if (e.key === 'Escape') emit('cerrar'); }
onMounted(() => document.addEventListener('keydown', tecla));
onBeforeUnmount(() => document.removeEventListener('keydown', tecla));
</script>

<template>
  <Teleport to="body">
    <div class="velo" @mousedown.self="emit('cerrar')">
      <div class="modal" :class="{ ancho }" role="dialog" aria-modal="true">
        <button class="icono-btn modal-cerrar" aria-label="Cerrar" @click="emit('cerrar')"><Icono n="cerrar" /></button>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
