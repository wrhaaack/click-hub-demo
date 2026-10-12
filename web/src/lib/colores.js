// La paleta de eventos y etapas vive acá y en ningún otro lado: la usan las
// barras del calendario, la planificación del cliente y la imagen exportada.
// Por eso la imagen no puede salir con otros colores que los que se ven.
// f = fondo, b = borde/acento, t = texto (con buen contraste sobre f).
export const COLORES = {
  azul: { f: '#DBEAFE', b: '#3B82F6', t: '#1E40AF', n: 'Azul' },
  rosa: { f: '#FCE7F3', b: '#EC4899', t: '#9D174D', n: 'Rosa' },
  ambar: { f: '#FEF3C7', b: '#F59E0B', t: '#92400E', n: 'Ámbar' },
  verde: { f: '#D1FAE5', b: '#10B981', t: '#065F46', n: 'Verde' },
  violeta: { f: '#EDE9FE', b: '#8B5CF6', t: '#5B21B6', n: 'Violeta' },
  turquesa: { f: '#CCFBF1', b: '#14B8A6', t: '#115E59', n: 'Turquesa' },
};
export const color = (k) => COLORES[k] || COLORES.azul;
