<script setup>
import { reactive, ref } from 'vue';
import Modal from './Modal.vue';
import { api, avisar } from '../lib/api';

// Cambiar el email o la contraseña propios. Siempre pide la contraseña actual.
const props = defineProps({ email: String });
const emit = defineEmits(['cerrar']);
const f = reactive({ email: props.email || '', password_nueva: '', password_actual: '' });
const ver = ref(false);
// /api/estado no trae el email: se pide aparte.
if (!f.email) api('/api/auth/me').then((me) => { if (me?.email) f.email = me.email; });

async function guardar() {
  if (!f.password_actual) return avisar('Poné tu contraseña actual para confirmar.');
  if (f.password_nueva && f.password_nueva.length < 10) return avisar('La contraseña nueva tiene que tener al menos 10 caracteres.');
  if (!(await api('/api/auth/perfil', { method: 'PUT', body: f }))) return;
  avisar('Guardado.', 'ok');
  emit('cerrar');
}
async function salir() {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/app/login';
}
</script>

<template>
  <Modal @cerrar="emit('cerrar')">
    <div class="modal-cuerpo">
      <h3>Mi cuenta</h3>
      <div class="campo"><label>Email</label><input v-model="f.email" type="email"></div>
      <div class="campo"><label>Contraseña nueva (vacío = no cambiarla)</label>
        <input v-model="f.password_nueva" :type="ver ? 'text' : 'password'" autocomplete="new-password" placeholder="Mínimo 10 caracteres"></div>
      <div class="campo"><label>Contraseña actual (para confirmar)</label>
        <input v-model="f.password_actual" :type="ver ? 'text' : 'password'" autocomplete="current-password"></div>
      <label class="chk"><input type="checkbox" v-model="ver"> Mostrar contraseñas</label>
      <div class="modal-pie">
        <button class="btn izq" @click="salir">Cerrar sesión</button>
        <button class="btn" @click="emit('cerrar')">Cancelar</button>
        <button class="btn p" @click="guardar">Guardar</button>
      </div>
    </div>
  </Modal>
</template>
