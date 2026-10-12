// Arma las semanas de un mes con las barras ya ubicadas: en qué columna
// arrancan, cuántos días ocupan y en qué carril van para no pisarse.
//
// Es la única cuenta de posiciones que hay. La usan la pantalla y la imagen
// exportada, así que la imagen no puede quedar distinta de lo que se ve.
// Las semanas van de domingo a sábado, como en la imagen que se exporta.
import { isoDe } from './store';

export function filasDelMes(lista, periodo) {
  const [ano, m] = periodo.split('-').map(Number);
  const mes = m - 1;
  const pd = new Date(ano, mes, 1).getDay();
  const dm = new Date(ano, mes + 1, 0).getDate();
  const semanas = Math.ceil((pd + dm) / 7);
  const hoy = isoDe(new Date());
  const filas = [];

  for (let w = 0; w < semanas; w++) {
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const f = new Date(ano, mes, 1 - pd + w * 7 + i);
      const ds = isoDe(f);
      dias.push({ ds, d: f.getDate(), fuera: f.getMonth() !== mes, hoy: ds === hoy });
    }
    const desdeSem = dias[0].ds;
    const hastaSem = dias[6].ds;
    const barras = [];
    lista.forEach((et) => {
      const fin0 = et.hasta || et.desde;
      if (fin0 < desdeSem || et.desde > hastaSem) return;
      const ini = et.desde > desdeSem ? et.desde : desdeSem;
      const fin = fin0 < hastaSem ? fin0 : hastaSem;
      const col = dias.findIndex((x) => x.ds === ini);
      const col2 = dias.findIndex((x) => x.ds === fin);
      barras.push({ et, col, span: col2 - col + 1, sigueIzq: et.desde < desdeSem, sigueDer: fin0 > hastaSem, carril: 0 });
    });

    // Carriles: cada barra baja hasta el primero donde no pise a otra.
    barras.sort((a, b) => a.col - b.col || b.span - a.span);
    const ocupadoHasta = [];
    barras.forEach((b) => {
      let c = 0;
      while (ocupadoHasta[c] !== undefined && ocupadoHasta[c] > b.col) c++;
      b.carril = c;
      ocupadoHasta[c] = b.col + b.span;
    });

    filas.push({ dias, barras, carriles: barras.reduce((mx, b) => Math.max(mx, b.carril + 1), 0) });
  }
  return filas;
}

// Las etapas que se ven en la grilla (incluye días de los meses vecinos).
export function visiblesEn(lista, filas) {
  const desde = filas[0].dias[0].ds;
  const hasta = filas[filas.length - 1].dias[6].ds;
  return lista.filter((e) => (e.hasta || e.desde) >= desde && e.desde <= hasta);
}
