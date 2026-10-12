<script setup>
import { ref } from 'vue';
import logo from '../logo.jpg';

// La única pantalla sin sesión. La contraseña arranca siempre oculta.
const email = ref('');
const password = ref('');
const ver = ref(false);
const error = ref('');
const enviando = ref(false);

async function entrar() {
  error.value = '';
  enviando.value = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email.value.trim(), password: password.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { error.value = data.error || 'No se pudo iniciar sesión.'; return; }
    // Recarga entera y no un cambio de ruta: así la app arranca de cero con
    // los datos y permisos de quien acaba de entrar.
    window.location.href = '/app/';
  } catch {
    error.value = 'No se pudo conectar con el servidor.';
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div class="login">
    <form class="caja" @submit.prevent="entrar">
      <img :src="logo" alt="" class="logo">
      <h1>Click Hub</h1>
      <p class="sub">Ingresá con tu cuenta del estudio</p>
      <div class="campo"><label for="email">Email</label>
        <input id="email" v-model="email" type="email" required autocomplete="username" autofocus></div>
      <div class="campo"><label for="pass">Contraseña</label>
        <div class="clave">
          <input id="pass" v-model="password" :type="ver ? 'text' : 'password'" required autocomplete="current-password">
          <button type="button" class="icono-btn" :aria-label="ver ? 'Ocultar contraseña' : 'Mostrar contraseña'" :aria-pressed="ver" @click="ver = !ver">{{ ver ? '🙈' : '👁️' }}</button>
        </div>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" class="btn p entrar" :disabled="enviando">{{ enviando ? 'Ingresando…' : 'Ingresar' }}</button>
    </form>
  </div>
</template>

<style scoped>
.login { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.caja { width: 100%; max-width: 380px; background: var(--sur); border: 1px solid var(--bor); border-radius: 16px; padding: 34px 30px; box-shadow: var(--sombra); }
.logo { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; display: block; margin: 0 auto 12px; }
h1 { text-align: center; font-size: 24px; }
.sub { text-align: center; color: var(--mut); font-size: 13px; margin: 2px 0 24px; }
.clave { display: flex; gap: 4px; }
.clave input { flex: 1; }
.error { color: var(--red); background: var(--redbg); border-radius: var(--rs); padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
.entrar { width: 100%; justify-content: center; padding: 10px; }
</style>
