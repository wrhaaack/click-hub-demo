// Helpers compartidos por las pantallas con sesión (el hub y usuarios).
//
// Viene del shared.js del proyecto base, adaptado a Click: mismo esquema de
// fetch con manejo de sesión vencida, mismo panel de notificaciones y mismo
// modal de "Mi cuenta", pero con la paleta y el vocabulario del hub.

async function ckFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (err) {
    // Sin conexión con el servidor: se avisa y se devuelve null, igual que un 401,
    // para que quien llama no siga adelante como si hubiera guardado.
    avisar('No se pudo conectar con el servidor.');
    return null;
  }
  if (res.status === 401) {
    window.location.href = '/login.html';
    return null;
  }
  return res;
}

// Pide y ya devuelve el JSON. Si algo falla muestra el error del servidor y
// devuelve null, así el que llama solo tiene que preguntar "¿vino algo?".
async function ckJson(url, options = {}) {
  const res = await ckFetch(url, options);
  if (!res) return null;
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    avisar((data && data.error) || 'No se pudo completar la acción.');
    return null;
  }
  return data === null ? {} : data;
}

// Aviso flotante arriba a la derecha. Reemplaza al alert() del navegador, que
// frena todo hasta que le das OK.
function avisar(mensaje, tipo) {
  let cont = document.getElementById('ckAvisos');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'ckAvisos';
    cont.style.cssText = 'position:fixed;top:14px;right:14px;z-index:3000;display:flex;flex-direction:column;gap:8px;max-width:320px';
    document.body.appendChild(cont);
  }
  const el = document.createElement('div');
  const esOk = tipo === 'ok';
  el.style.cssText = 'background:' + (esOk ? '#D1FAE5' : '#FEE2E2') + ';color:' + (esOk ? '#064E3B' : '#991B1B')
    + ';padding:10px 14px;border-radius:8px;font-size:13px;font-family:"DM Sans",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.12)';
  el.textContent = mensaje;
  cont.appendChild(el);
  setTimeout(() => { el.remove(); }, 4000);
}

const NIVEL_RANGO = { sin_acceso: 0, limitado: 1, full: 2 };

// Mismo criterio que el backend (src/middleware/auth.js): admin siempre full.
function puedeSeccion(me, seccion, nivelMinimo) {
  if (!me) return false;
  if (me.rol === 'admin') return true;
  const nivel = (me.permisos || {})[seccion] || 'sin_acceso';
  return (NIVEL_RANGO[nivel] || 0) >= (NIVEL_RANGO[nivelMinimo || 'limitado'] || 1);
}

// ---------- Contraseñas con ojo ----------
// Arranca siempre oculta y no recuerda el estado entre visitas: si alguien
// vuelve a la pantalla, la contraseña no queda a la vista.
function activarOjosPassword(contenedor) {
  const raiz = contenedor || document;
  raiz.querySelectorAll('.btn-ojo').forEach((btn) => {
    const campo = btn.closest('.campo-password');
    const input = campo && campo.querySelector('input');
    if (!input || btn.dataset.listo) return;
    btn.dataset.listo = '1';
    btn.addEventListener('click', () => {
      const mostrar = input.type === 'password';
      input.type = mostrar ? 'text' : 'password';
      btn.textContent = mostrar ? '🙈' : '👁️';
      btn.setAttribute('aria-pressed', String(mostrar));
      const etiqueta = mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña';
      btn.setAttribute('aria-label', etiqueta);
      btn.setAttribute('title', etiqueta);
      input.focus();
    });
  });
}

function resetearOjosPassword(contenedor) {
  const raiz = contenedor || document;
  raiz.querySelectorAll('.campo-password input').forEach((input) => { input.type = 'password'; });
  raiz.querySelectorAll('.btn-ojo').forEach((btn) => {
    btn.textContent = '👁️';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', 'Mostrar contraseña');
    btn.setAttribute('title', 'Mostrar contraseña');
  });
}

function campoPasswordHtml(id, atributos) {
  return '<div class="campo-password">'
    + '<input type="password" id="' + id + '" ' + (atributos || '') + '>'
    + '<button type="button" class="btn-ojo" aria-label="Mostrar contraseña" aria-pressed="false" title="Mostrar contraseña">👁️</button>'
    + '</div>';
}

function escapar(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- Bloque de usuario: nombre, notificaciones, cuenta y salir ----------
// Se inyecta en el contenedor que le pases. Devuelve el usuario logueado (me),
// o null si la sesión ya no vale (en ese caso ckFetch ya redirigió al login).
async function montarBarraUsuario(containerId, me) {
  const el = document.getElementById(containerId);
  if (!el) return me;
  if (!me) {
    const res = await ckFetch('/api/auth/me');
    if (!res || !res.ok) return null;
    me = await res.json();
  }

  el.innerHTML = `
    <div class="ck-user">
      <div class="ck-user-top">
        <span class="ck-user-nom">${escapar(me.nombre)} · ${me.rol === 'admin' ? 'Admin' : 'Equipo'}</span>
        <div class="ck-notif-wrap">
          <button type="button" class="ck-mini" id="btnNotif" title="Notificaciones">
            🔔<span class="ck-notif-badge" id="notifBadge" style="display:none"></span>
          </button>
          <div class="ck-notif-panel" id="notifPanel" style="display:none">
            <div class="ck-notif-head">
              <strong>Notificaciones</strong>
              <button type="button" id="btnMarcarTodasLeidas">Marcar todas leídas</button>
            </div>
            <div class="ck-notif-barra" id="notifBarra" style="display:none">
              <label><input type="checkbox" id="notifCheckTodas"> Seleccionar todas</label>
              <button type="button" id="btnBorrarSeleccionadas" disabled>Borrar</button>
            </div>
            <div id="notifList"></div>
            <div class="ck-notif-vacio" id="notifEmpty" style="display:none">No hay notificaciones.</div>
          </div>
        </div>
      </div>
      <div class="ck-user-btns">
        ${me.rol === 'admin' ? '<a class="ck-mini" href="/usuarios.html" title="Usuarios">👤</a>' : ''}
        <button type="button" class="ck-mini" id="btnCuenta" title="Mi cuenta">⚙️</button>
        <button type="button" class="ck-mini ck-salir" id="btnLogout">Salir</button>
      </div>
    </div>

    <div class="mo" id="cuentaModal">
      <div class="mo-card" style="max-width:400px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="margin:0">Mi cuenta</h3>
          <button type="button" id="btnCerrarCuenta" style="font-size:12px;padding:5px 10px">Cerrar ✕</button>
        </div>
        <form id="cuentaForm">
          <div class="field"><label>Email</label><input type="email" id="cuentaEmail" value="${escapar(me.email || '')}"></div>
          <div class="field">
            <label>Contraseña nueva (dejalo vacío para no cambiarla)</label>
            ${campoPasswordHtml('cuentaPasswordNueva', 'placeholder="Mínimo 10 caracteres" autocomplete="new-password"')}
          </div>
          <div class="field">
            <label>Contraseña actual * (para confirmar)</label>
            ${campoPasswordHtml('cuentaPasswordActual', 'required autocomplete="current-password"')}
          </div>
          <p class="error-msg" id="cuentaError"></p>
          <p class="error-msg" id="cuentaOk" style="color:#166534">✓ Guardado.</p>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button type="button" id="btnLogoutCuenta" style="margin-right:auto">Cerrar sesión</button>
            <button type="submit" class="primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  async function cerrarSesion() {
    await ckFetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  }
  document.getElementById('btnLogout').addEventListener('click', cerrarSesion);
  document.getElementById('btnLogoutCuenta').addEventListener('click', cerrarSesion);

  montarNotificaciones();
  montarCuenta();
  return me;
}

// ---------- Notificaciones ----------
// La lista se refresca sola cada 30s, así que la selección se guarda afuera del
// dibujado y se vuelve a aplicar después. Si no, tildabas algo y el refresco te
// lo destildaba solo.
function montarNotificaciones() {
  const seleccionadas = new Set();
  let cache = [];

  function actualizarBarra() {
    const barra = document.getElementById('notifBarra');
    if (!barra) return;
    barra.style.display = cache.length === 0 ? 'none' : 'flex';
    const n = seleccionadas.size;
    const btn = document.getElementById('btnBorrarSeleccionadas');
    btn.disabled = n === 0;
    btn.textContent = n === 0 ? 'Borrar' : 'Borrar (' + n + ')';
    const todas = document.getElementById('notifCheckTodas');
    todas.checked = cache.length > 0 && n === cache.length;
    todas.indeterminate = n > 0 && n < cache.length;
  }

  async function cargar() {
    const res = await ckFetch('/api/notificaciones');
    if (!res || !res.ok) return;
    cache = await res.json();

    const noLeidas = cache.filter((n) => !n.leida).length;
    const badge = document.getElementById('notifBadge');
    badge.textContent = noLeidas > 9 ? '9+' : String(noLeidas);
    badge.style.display = noLeidas > 0 ? 'flex' : 'none';

    const list = document.getElementById('notifList');
    document.getElementById('notifEmpty').style.display = cache.length === 0 ? 'block' : 'none';
    list.innerHTML = cache.map((n) => `
      <div class="ck-notif-item${n.leida ? '' : ' no-leida'}" data-id="${n.id}">
        <input type="checkbox" class="ck-notif-check" aria-label="Seleccionar notificación">
        <a href="${escapar(n.link || '#')}" class="ck-notif-texto">
          ${escapar(n.mensaje)}
          <span class="ck-notif-time">${fmtFechaCorta(n.creado_en)}</span>
        </a>
        <button type="button" class="ck-notif-toggle" title="${n.leida ? 'Marcar como no leída' : 'Marcar como leída'}">${n.leida ? '●' : '✓'}</button>
      </div>
    `).join('');

    // Se cayeron de la lista (las borró otra sesión, o se pasó del límite de 50).
    const vivas = new Set(cache.map((n) => String(n.id)));
    [...seleccionadas].forEach((id) => { if (!vivas.has(id)) seleccionadas.delete(id); });

    list.querySelectorAll('.ck-notif-item').forEach((item) => {
      const id = item.dataset.id;
      const chk = item.querySelector('.ck-notif-check');
      chk.checked = seleccionadas.has(id);
      chk.addEventListener('change', () => {
        if (chk.checked) seleccionadas.add(id); else seleccionadas.delete(id);
        actualizarBarra();
      });
      item.querySelector('.ck-notif-texto').addEventListener('click', () => {
        ckFetch('/api/notificaciones/' + id + '/leida', { method: 'PATCH' });
      });
      item.querySelector('.ck-notif-toggle').addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const estaNoLeida = item.classList.contains('no-leida');
        await ckFetch('/api/notificaciones/' + id + '/' + (estaNoLeida ? 'leida' : 'no-leida'), { method: 'PATCH' });
        cargar();
      });
    });

    actualizarBarra();
  }

  async function borrar(volverAAvisar) {
    const ids = [...seleccionadas];
    if (ids.length === 0) return;
    await ckFetch('/api/notificaciones/borrar', {
      method: 'POST',
      body: JSON.stringify({ ids, volverAAvisar }),
    });
    seleccionadas.clear();
    cargar();
  }

  const panel = document.getElementById('notifPanel');
  document.getElementById('btnNotif').addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = panel.style.display !== 'block';
    if (abrir) {
      // El panel es position:fixed, así que se ancla a mano justo arriba de la
      // campanita. Si se sale por la derecha, se corre para adentro.
      const r = e.currentTarget.getBoundingClientRect();
      const ancho = 290;
      panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)) + 'px';
      panel.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    }
    panel.style.display = abrir ? 'block' : 'none';
  });
  document.addEventListener('click', (e) => {
    if (panel.style.display === 'block' && !panel.contains(e.target) && !e.target.closest('#btnNotif')) {
      panel.style.display = 'none';
    }
  });
  document.getElementById('btnMarcarTodasLeidas').addEventListener('click', async (e) => {
    e.preventDefault();
    await ckFetch('/api/notificaciones/marcar-todas', { method: 'POST' });
    cargar();
  });
  document.getElementById('notifCheckTodas').addEventListener('change', (e) => {
    seleccionadas.clear();
    if (e.target.checked) cache.forEach((n) => seleccionadas.add(String(n.id)));
    document.querySelectorAll('.ck-notif-check').forEach((c) => { c.checked = e.target.checked; });
    actualizarBarra();
  });

  // Los avisos que genera el sistema solo (tarea vencida, cliente sin planificar)
  // se vuelven a crear si se borran de verdad, así que antes de borrarlos se
  // pregunta si tienen que volver. El resto se oculta sin preguntar nada.
  document.getElementById('btnBorrarSeleccionadas').addEventListener('click', async () => {
    const automaticas = cache.filter(
      (n) => seleccionadas.has(String(n.id)) && (n.tipo === 'tarea_vencida' || n.tipo === 'cliente_sin_planificar')
    );
    if (automaticas.length === 0) { await borrar(false); return; }
    const vuelve = confirm(
      'Estás borrando ' + automaticas.length + ' aviso(s) que genera el sistema solo.\n\n'
      + 'Aceptar: volver a avisarme si el problema sigue.\n'
      + 'Cancelar: no avisarme más de esto.'
    );
    await borrar(vuelve);
  });

  cargar();
  setInterval(cargar, 30000);
}

// ---------- Modal "Mi cuenta" ----------
function montarCuenta() {
  const modal = document.getElementById('cuentaModal');
  activarOjosPassword(modal);
  document.getElementById('cuentaOk').style.display = 'none';

  document.getElementById('btnCuenta').addEventListener('click', () => {
    resetearOjosPassword(modal);
    document.getElementById('cuentaError').style.display = 'none';
    document.getElementById('cuentaOk').style.display = 'none';
    modal.classList.add('on');
  });
  document.getElementById('btnCerrarCuenta').addEventListener('click', () => modal.classList.remove('on'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('on'); });

  document.getElementById('cuentaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('cuentaError');
    const okEl = document.getElementById('cuentaOk');
    errorEl.style.display = 'none';
    okEl.style.display = 'none';
    const body = {
      email: document.getElementById('cuentaEmail').value.trim(),
      password_nueva: document.getElementById('cuentaPasswordNueva').value,
      password_actual: document.getElementById('cuentaPasswordActual').value,
    };
    const res = await ckFetch('/api/auth/perfil', { method: 'PUT', body: JSON.stringify(body) });
    if (!res) return;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      errorEl.textContent = data.error || 'No se pudo guardar.';
      errorEl.style.display = 'block';
      return;
    }
    okEl.style.display = 'block';
    document.getElementById('cuentaPasswordActual').value = '';
    document.getElementById('cuentaPasswordNueva').value = '';
  });
}

function fmtFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
function fmtFechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
