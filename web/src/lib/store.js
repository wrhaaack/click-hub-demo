// El estado compartido de la app. Arranca con GET /api/estado (todo de una) y
// después cada pantalla actualiza su pedazo con el resultado de su propio
// pedido, sin volver a pedir todo.
import { reactive, computed } from 'vue';
import { api } from './api';

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const ESTADOS = [
  { k: 'pendiente', l: 'Pendiente' },
  { k: 'en progreso', l: 'En progreso' },
  { k: 'revisión', l: 'Revisión' },
  { k: 'listo', l: 'Listo' },
  { k: 'cumplido', l: 'Cumplido' },
];

export const FORMATOS = ['Story', 'Reel', 'Post', 'Carrusel', 'Video Story'];

const hoy = new Date();

export const st = reactive({
  listo: false,
  yo: null,
  roles: [],
  clientes: [],
  tareas: [],
  equipo: [],
  eventos: [],
  etapas: [],
  // { '<cid>-YYYY-MM' | 'gen-YYYY-MM': {ideas, inspo} }
  ideas: {},
  // { 'fe-<cid>-YYYY-MM': [{fecha, label}] }
  fechasEspeciales: {},
  estudio: null,
  tarifas: null,
  pautas: [],
  // El mes que se está mirando, compartido por todas las pantallas: si cambiás
  // de mes en el dashboard, el calendario y las tareas ya lo muestran.
  periodo: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`,
});

// Lo que viene del servidor y se guarda tal cual en el estado.
const CLAVES = ['roles', 'clientes', 'tareas', 'equipo', 'eventos', 'etapas', 'ideas',
  'fechasEspeciales', 'estudio', 'tarifas', 'pautas'];

export async function cargarTodo() {
  const estado = await api('/api/estado');
  if (!estado) return;
  st.yo = estado.yo;
  CLAVES.forEach((k) => { st[k] = estado[k]; });
  st.listo = true;
}

// Vuelve a traer todo. Se usa después de cambios que tocan varias listas a la
// vez (renombrar un rol arrastra tareas y personas).
export const recargar = cargarTodo;

// ---------- Permisos ----------
// Espejo de src/middleware/auth.js, solo para no mostrar botones que el
// servidor va a rechazar. La decisión real es siempre del servidor.
const RANGO = { sin_acceso: 0, limitado: 1, full: 2 };
export function puede(seccion, nivel = 'limitado') {
  if (!st.yo) return false;
  if (st.yo.rol === 'admin') return true;
  return (RANGO[st.yo.permisos?.[seccion]] || 0) >= RANGO[nivel];
}
export const esAdmin = computed(() => st.yo?.rol === 'admin');

// ---------- Actualizar listas con lo que devolvió el servidor ----------
export function guardarEn(lista, item) {
  const i = st[lista].findIndex((x) => x.id === item.id);
  if (i >= 0) st[lista].splice(i, 1, item); else st[lista].push(item);
}
export function sacarDe(lista, id) {
  const i = st[lista].findIndex((x) => x.id === id);
  if (i >= 0) st[lista].splice(i, 1);
}

// ---------- Formatos ----------
export function plata(n) {
  if (n === null || n === undefined || n === '') return '—';
  return '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}
export function fechaCorta(iso) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '';
}
export function nombreDelMes(periodo) {
  const [a, m] = periodo.split('-');
  return `${MESES[Number(m) - 1]} ${a}`;
}
export function moverMes(periodo, delta) {
  const [a, m] = periodo.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// "3 de septiembre", "3 al 11 de septiembre", "24 de septiembre al 2 de octubre".
export function rangoEnTexto(et) {
  const num = (f) => String(Number(f.slice(8, 10)));
  const mes = (f) => MESES[Number(f.slice(5, 7)) - 1].toLowerCase();
  const hasta = et.hasta || et.desde;
  if (et.desde === hasta) return `${num(et.desde)} de ${mes(et.desde)}`;
  if (et.desde.slice(0, 7) === hasta.slice(0, 7)) return `${num(et.desde)} al ${num(hasta)} de ${mes(et.desde)}`;
  return `${num(et.desde)} de ${mes(et.desde)} al ${num(hasta)} de ${mes(hasta)}`;
}

export function isoDe(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function urlDe(u) {
  return /^https?:\/\//i.test(u) ? u : 'https://' + u;
}

export function inicial(nombre) {
  return (String(nombre || '?').trim()[0] || '?').toUpperCase();
}

export function clientePorId(id) {
  return st.clientes.find((c) => c.id === id);
}
export function tareasDelMes(periodo, cid) {
  return st.tareas.filter((t) => t.fecha && t.fecha.startsWith(periodo) && (cid === undefined || t.cid === cid));
}

// Lo que todavía se le debe a cada persona: tareas terminadas, con monto y sin
// pagar. Es lo que antes se sumaba a mano en la planilla de diseños.
export const porLiquidar = computed(() =>
  st.tareas.filter((t) => !t.pagado && t.monto > 0 && (t.estado === 'listo' || t.estado === 'cumplido'))
);
