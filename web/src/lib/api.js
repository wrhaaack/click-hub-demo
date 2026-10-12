// Si la sesión venció se va al login, y si algo falla se muestra el error del servidor y se devuelve
// null, así el que llama solo pregunta "¿vino algo?".
import { reactive } from 'vue';

export const avisos = reactive([]);

export function avisar(mensaje, tipo = 'error') {
  const aviso = { id: Date.now() + Math.random(), mensaje, tipo };
  avisos.push(aviso);
  setTimeout(() => {
    const i = avisos.indexOf(aviso);
    if (i >= 0) avisos.splice(i, 1);
  }, 4000);
}

export async function api(url, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    avisar('No se pudo conectar con el servidor.');
    return null;
  }
  if (res.status === 401) {
    window.location.href = '/app/login';
    return null;
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    avisar((data && data.error) || 'No se pudo completar la acción.');
    return null;
  }
  return data === null ? {} : data;
}
