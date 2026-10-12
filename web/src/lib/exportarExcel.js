// Planilla con todos los datos de un cliente, para uso interno: lleva el cobro
// y las notas del equipo. Lo que se le manda al cliente es la imagen de la
// planificación.
//
// Van TODAS las tareas y no solo las del mes, con una columna de mes: en una
// planilla filtrar es gratis, y volver a exportar doce veces no.
import { st, MESES } from './store';
import { COLORES } from './colores';
import { armarXlsx, bajarArchivo, sinAcentos } from './archivos';

const mesDe = (p) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

export function exportarClienteExcel(c) {
  const ESTADOS = { pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado' };
  const estado = c.estadoPago || 'pendiente';
  const falta = estado === 'parcial' && c.aPagar != null && c.abonado != null ? c.aPagar - c.abonado
    : estado === 'pendiente' ? c.aPagar : 0;
  const hojas = [];

  hojas.push({ nombre: 'Cliente', anchos: [24, 60], filas: [
    ['Campo', 'Valor'],
    ['Cliente', c.nombre],
    ['Tipo', c.tipo === 'prospecto' ? 'Prospecto' : 'Cliente'],
    ['Instagram', c.ig || ''],
    ['Contacto', c.contacto || ''],
    ['Teléfono', c.tel || ''],
    ['', ''],
    ['Abono mensual', c.aPagar == null ? 'sin monto acordado' : c.aPagar],
    ['Estado de pago', ESTADOS[estado]],
    ['Abonado', c.abonado ?? ''],
    ['Falta cobrar', c.aPagar == null || falta == null ? '' : falta],
    ['Próxima actualización', c.proximaActualizacion || ''],
    ['', ''],
    ['Notas', c.notas || ''],
  ] });

  hojas.push({ nombre: 'Links', anchos: [24, 60],
    filas: [['Etiqueta', 'Link'], ...(c.links || []).map((l) => [l.label || '', l.url || ''])] });

  const ts = st.tareas.filter((t) => t.cid === c.id)
    .sort((a, b) => (a.fecha || 'zzz').localeCompare(b.fecha || 'zzz'));
  hojas.push({ nombre: 'Tareas', anchos: [16, 13, 13, 46, 14, 14, 12, 8, 12, 9, 26, 46], filas: [
    ['Mes', 'Publicación', 'Fecha límite', 'Descripción', 'Rol', 'Formato', 'Estado', 'Nivel', 'Monto', 'Pagada', 'Asignados', 'Notas'],
    ...ts.map((t) => [t.fecha ? mesDe(t.fecha) : 'Sin fecha', t.fecha || '', t.fechaLimite || '', t.desc || '',
      t.rol || '', t.formato || '', t.estado || '', t.nivel || '', t.monto ?? '', t.pagado ? 'Sí' : 'No',
      (t.asig || []).join(', '), t.notas || '']),
  ] });

  hojas.push({ nombre: 'Pauta', anchos: [16, 8, 14, 14, 14, 14, 10, 40], filas: [
    ['Mes', 'N°', 'Pauta', 'Capacitación', 'Fee Click', 'Total', 'Pagado', 'Nota'],
    ...st.pautas.filter((p) => p.clienteId === c.id).sort((a, b) => a.periodo.localeCompare(b.periodo))
      .map((p) => [mesDe(p.periodo), p.mes, p.pauta, p.capacitacion, p.feeClick, p.total, p.pagado ? 'Sí' : 'No', p.nota || '']),
  ] });

  hojas.push({ nombre: 'Planificación', anchos: [34, 13, 13, 7, 12, 46], filas: [
    ['Etapa', 'Desde', 'Hasta', 'Días', 'Color', 'Nota'],
    ...st.etapas.filter((e) => e.clienteId === c.id).map((e) => [e.titulo, e.desde, e.hasta,
      Math.round((new Date(e.hasta) - new Date(e.desde)) / 86400000) + 1, COLORES[e.color]?.n || e.color, e.nota || '']),
  ] });

  const filasF = [['Mes', 'Fecha', 'Qué es']];
  Object.keys(st.fechasEspeciales).sort().forEach((k) => {
    const m = /^fe-(\d+)-(\d{4}-\d{2})$/.exec(k);
    if (!m || Number(m[1]) !== c.id) return;
    st.fechasEspeciales[k].forEach((f) => { if (f.fecha || f.label) filasF.push([mesDe(m[2]), f.fecha || '', f.label || '']); });
  });
  hojas.push({ nombre: 'Fechas especiales', anchos: [16, 13, 50], filas: filasF });

  const filasI = [['Mes', 'Tipo', 'Detalle', 'Link']];
  Object.keys(st.ideas).sort().forEach((k) => {
    const m = /^(\d+)-(\d{4}-\d{2})$/.exec(k);
    if (!m || Number(m[1]) !== c.id) return;
    (st.ideas[k].ideas || []).forEach((i) => { if (i) filasI.push([mesDe(m[2]), 'Idea', i, '']); });
    (st.ideas[k].inspo || []).forEach((l) => { if (l?.url) filasI.push([mesDe(m[2]), 'Inspiración', l.label || '', l.url]); });
  });
  hojas.push({ nombre: 'Brainstorming', anchos: [16, 14, 50, 46], filas: filasI });

  bajarArchivo(armarXlsx(hojas), `Cliente-${sinAcentos(c.nombre)}.xlsx`);
}
