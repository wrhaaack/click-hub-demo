<script setup>
// Tres puntos que rebotan, uno detrás del otro: la animación "Bobbing Dots" de
// loading-ui.com (1 s por rebote, 0,2 s de desfase entre puntos, baja 0,625em),
// hecha con CSS para no sumar una librería de animación por esto solo.
// Toma el color de acento de la paleta, así que sigue al tema claro y oscuro.
defineProps({ texto: { type: String, default: 'Cargando' } });
</script>

<template>
  <div class="cargando" role="status">
    <span class="puntos" aria-hidden="true"><span /><span /><span /></span>
    <span class="txt">{{ texto }}</span>
  </div>
</template>

<style scoped>
/* Centrado en toda la pantalla y de tamaño mediano. */
.cargando {
  position: fixed; inset: 0; z-index: 50;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px;
  background: var(--bg);
}
.puntos {
  display: inline-flex; align-items: flex-start; gap: 12%;
  width: 84px; height: 44px;
  font-size: 24px;          /* el rebote se mide en em: 0,625em = 15px */
  color: var(--tan);
}
.puntos span {
  flex: 1; aspect-ratio: 1; border-radius: 50%;
  background: currentColor; box-shadow: 0 1px 2px rgba(0, 0, 0, .12);
  animation: rebote 1s ease-in-out infinite;
}
.puntos span:nth-child(2) { animation-delay: .2s; }
.puntos span:nth-child(3) { animation-delay: .4s; }
@keyframes rebote {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(.625em); }
}
.txt { font-size: 13px; color: var(--mut); letter-spacing: .02em; }

/* Quien pidió menos movimiento al sistema ve los puntos latir en vez de saltar. */
@media (prefers-reduced-motion: reduce) {
  .puntos span { animation-name: latido; }
  @keyframes latido { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
}
</style>
