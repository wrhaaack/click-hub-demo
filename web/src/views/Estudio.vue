<script setup>
import { ref, reactive } from 'vue';
import Icono from '../components/Icono.vue';
import Modal from '../components/Modal.vue';
import { st, puede, urlDe } from '../lib/store';
import { api, avisar } from '../lib/api';

// Los datos de Click: contacto, links útiles (drives, accesos, plantillas) y
// notas internas. Es un bloque único, no una lista.
const form = ref(null);
function editar() {
  const e = st.estudio || {};
  form.value = reactive({ nombre: e.nombre || '', ig: e.ig || '', email: e.email || '', tel: e.tel || '', wa: e.wa || '',
    links: (e.links || []).map((l) => ({ ...l })), notas: e.notas || '' });
}
async function guardar() {
  const r = await api('/api/estudio', { method: 'PUT', body: { ...form.value, links: form.value.links.filter((l) => l.url) } });
  if (!r) return;
  st.estudio = r;
  form.value = null;
  avisar('Guardado.', 'ok');
}
const CAMPOS = [['nombre', 'Nombre'], ['ig', 'Instagram'], ['email', 'Email'], ['tel', 'Teléfono'], ['wa', 'WhatsApp']];
</script>

<template>
  <div class="pagina">
    <div class="pag-head">
      <h1>El estudio</h1>
      <span class="info" title="Datos de contacto, links útiles y notas internas de Click."><Icono n="info" /></span>
      <div class="der"><button v-if="puede('estudio','full')" class="btn" @click="editar">Editar</button></div>
    </div>

    <div v-if="st.estudio" class="grilla">
      <section class="tarjeta">
        <h3>Datos</h3>
        <div v-for="[k, l] in CAMPOS" :key="k" class="dato"><span>{{ l }}</span>{{ st.estudio[k] || '—' }}</div>
      </section>
      <section class="tarjeta">
        <h3>Links útiles</h3>
        <a v-for="l in st.estudio.links" :key="l.url" :href="urlDe(l.url)" target="_blank" rel="noopener" class="link">
          <Icono n="link" :t="15" /><b>{{ l.label || 'Link' }}</b><span>{{ l.url }}</span>
        </a>
        <p v-if="!st.estudio.links?.length" class="vacio" style="padding:20px">Sin links.</p>
      </section>
      <section v-if="st.estudio.notas" class="tarjeta ancho">
        <h3>Notas internas</h3>
        <p style="white-space:pre-wrap">{{ st.estudio.notas }}</p>
      </section>
    </div>
    <div v-else class="vacio">No tenés acceso a esta sección.</div>

    <Modal v-if="form" @cerrar="form = null">
      <div class="modal-cuerpo">
        <h3>Editar datos del estudio</h3>
        <div class="campo"><label>Nombre</label><input v-model="form.nombre"></div>
        <div class="fila">
          <div class="campo"><label>Instagram</label><input v-model="form.ig"></div>
          <div class="campo"><label>Email</label><input v-model="form.email"></div>
        </div>
        <div class="fila">
          <div class="campo"><label>Teléfono</label><input v-model="form.tel"></div>
          <div class="campo"><label>WhatsApp</label><input v-model="form.wa"></div>
        </div>
        <div class="sep">Links útiles</div>
        <div v-for="(l, i) in form.links" :key="i" class="link-fila">
          <input v-model="l.label" class="sel" placeholder="Etiqueta">
          <input v-model="l.url" class="sel" placeholder="https://">
          <button class="icono-btn" aria-label="Quitar" @click="form.links.splice(i, 1)"><Icono n="cerrar" :t="14" /></button>
        </div>
        <button class="btn chico" style="margin-bottom:14px" @click="form.links.push({ label: '', url: '' })"><Icono n="mas" :t="14" />Agregar link</button>
        <div class="campo"><label>Notas internas</label><textarea v-model="form.notas" style="min-height:100px" /></div>
        <div class="modal-pie">
          <button class="btn" @click="form = null">Cancelar</button>
          <button class="btn p" @click="guardar">Guardar</button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.grilla { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.grilla h3 { font-size: 16px; margin-bottom: 12px; }
.ancho { grid-column: 1 / -1; }
.dato { padding: 9px 0; border-top: 1px solid var(--bor); }
.dato span { display: block; font-size: 12px; color: var(--hin); }
.link { display: grid; grid-template-columns: 20px auto 1fr; gap: 8px; align-items: center; padding: 9px 0; border-top: 1px solid var(--bor); }
.link b { font-weight: 500; }
.link span { color: var(--tand); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
.link-fila { display: grid; grid-template-columns: 1fr 2fr 34px; gap: 8px; margin-bottom: 8px; }
@media (max-width: 800px) { .grilla { grid-template-columns: 1fr; } }
</style>
