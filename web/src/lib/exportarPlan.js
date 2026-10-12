// Exporta la planificación de un cliente como imagen PNG, para mandársela.
//
// Se dibuja en un canvas y no se saca una foto del HTML: así se controla la
// resolución (sale a 3x, se puede ampliar o imprimir sin que pixele) y no hace
// falta ninguna librería. Usa las mismas cuentas de posición que la pantalla
// (lib/grilla.js) y los mismos colores (lib/colores.js).
//
// La imagen sale siempre con la paleta clara, aunque la app esté en modo
// oscuro: es lo que va a ver el cliente, no una captura de la pantalla.
import { DIAS, nombreDelMes, rangoEnTexto } from './store';
import { color } from './colores';
import { filasDelMes, visiblesEn } from './grilla';
import { bajarArchivo, sinAcentos } from './archivos';
import logoUrl from '../logo.jpg';

function redondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function rayado(ctx, x, y, w, h, c) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = c; ctx.lineWidth = 1.2;
  for (let i = -h; i < w; i += 8) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
  ctx.restore();
}
function cortar(ctx, texto, ancho) {
  if (ctx.measureText(texto).width <= ancho) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(t + '…').width > ancho) t = t.slice(0, -1);
  return t + '…';
}
// El logo es un JPG con fondo propio: la banda se pinta de ese mismo color para
// que el logo se funda y no se vea el recorte.
function colorDeFondo(im) {
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  const d = x.getImageData(1, 1, 1, 1).data;
  return `rgb(${d[0]},${d[1]},${d[2]})`;
}
function cargarImagen(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);   // sin logo se exporta igual
    im.src = src;
  });
}

export async function planCanvas(cliente, etapas, periodo, nombreEstudio) {
  const mesLbl = nombreDelMes(periodo);
  const filas = filasDelMes(etapas, periodo);
  const visibles = visiblesEn(etapas, filas);

  // Las fuentes llegan por CSS y tardan: si se dibuja antes, sale otra tipografía.
  if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* sigue */ } }
  const logo = await cargarImagen(logoUrl);

  const PAD = 44, W = 1400, CW = W - PAD * 2;
  const CAB = 104, GAP = 26, DN = 32, PIE = 54;
  const altoDe = (f) => 30 + Math.max(f.carriles, 1) * 28 + 12;
  const altoSem = filas.reduce((a, f) => a + altoDe(f), 0);
  const altoLeyenda = visibles.length ? 22 + visibles.length * 26 : 0;
  const H = PAD + CAB + GAP + DN + altoSem + (altoLeyenda ? GAP + altoLeyenda : 0) + PIE + PAD;

  const ESC = 3;
  const cv = document.createElement('canvas');
  cv.width = W * ESC; cv.height = H * ESC;
  const ctx = cv.getContext('2d');
  ctx.scale(ESC, ESC);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#EDEAE5'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = logo ? colorDeFondo(logo) : '#9C8163';
  redondeado(ctx, PAD, PAD, CW, CAB, 16); ctx.fill();
  if (logo) {
    const alto = 44, ancho = logo.width * (alto / logo.height);
    ctx.drawImage(logo, PAD + 26, PAD + (CAB - alto) / 2, ancho, alto);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 25px Syne, sans-serif';
  ctx.fillText(cortar(ctx, cliente.nombre, CW - 220), PAD + CW - 30, PAD + 48);
  ctx.fillStyle = 'rgba(255,255,255,.78)';
  ctx.font = "400 15px 'DM Sans', sans-serif";
  ctx.fillText('Planificación · ' + mesLbl, PAD + CW - 30, PAD + 72);

  let y = PAD + CAB + GAP;
  const colW = CW / 7;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9A9288';
  ctx.font = "500 11px 'DM Sans', sans-serif";
  DIAS.forEach((d, i) => ctx.fillText(d.toUpperCase(), PAD + colW * i + colW / 2, y + 20));
  y += DN;

  const topGrilla = y;
  filas.forEach((fila) => {
    const alto = altoDe(fila);
    fila.dias.forEach((d, i) => {
      const x = PAD + colW * i;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, colW, alto);
      if (d.hoy) { ctx.fillStyle = '#E7DDCF'; ctx.fillRect(x, y, colW, alto); }
      if (d.fuera) rayado(ctx, x, y, colW, alto, '#E4E0D9');
      ctx.strokeStyle = '#DDD8D0'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, colW - 1, alto - 1);
      ctx.textAlign = 'right';
      ctx.fillStyle = d.hoy ? '#7A6045' : '#9A9288';
      ctx.font = (d.hoy ? '500 ' : '400 ') + "12px 'DM Sans', sans-serif";
      ctx.globalAlpha = d.fuera ? 0.45 : 1;
      ctx.fillText(String(d.d), x + colW - 9, y + 20);
      ctx.globalAlpha = 1;
    });
    fila.barras.forEach((b) => {
      const c = color(b.et.color);
      const x = PAD + colW * b.col + 4, w = colW * b.span - 8, alt = 22;
      const by = y + 28 + b.carril * 28;
      ctx.fillStyle = c.f; redondeado(ctx, x, by, w, alt, 4); ctx.fill();
      ctx.fillStyle = c.b; ctx.fillRect(x, by, 3, alt);
      ctx.textAlign = 'left';
      ctx.fillStyle = c.t;
      ctx.font = "500 12px 'DM Sans', sans-serif";
      ctx.fillText(cortar(ctx, b.et.titulo, w - 18), x + 10, by + 15);
    });
    y += alto;
  });
  ctx.strokeStyle = '#CEC7BD'; ctx.lineWidth = 1;
  ctx.strokeRect(PAD + 0.5, topGrilla + 0.5, CW - 1, y - topGrilla - 1);

  // La lista de etapas: en la grilla los títulos largos se cortan.
  if (visibles.length) {
    y += GAP;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9A9288';
    ctx.font = "500 11px 'DM Sans', sans-serif";
    ctx.fillText('ETAPAS DEL MES', PAD, y + 12);
    y += 22;
    visibles.forEach((e) => {
      const c = color(e.color);
      ctx.fillStyle = c.b; redondeado(ctx, PAD, y + 6, 11, 11, 3); ctx.fill();
      ctx.fillStyle = '#3F3A34';
      ctx.font = "500 13px 'DM Sans', sans-serif";
      ctx.fillText(e.titulo, PAD + 20, y + 16);
      const an = ctx.measureText(e.titulo).width;
      ctx.fillStyle = '#7B736A';
      ctx.font = "400 13px 'DM Sans', sans-serif";
      ctx.fillText(cortar(ctx, '· ' + rangoEnTexto(e) + (e.nota ? ' · ' + e.nota : ''), CW - an - 30), PAD + 28 + an, y + 16);
      y += 26;
    });
  }

  y = H - PAD - 24;
  ctx.strokeStyle = '#DDD8D0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y - 14); ctx.lineTo(PAD + CW, y - 14); ctx.stroke();
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9A9288';
  ctx.font = "400 12px 'DM Sans', sans-serif";
  ctx.fillText(`Generado por ${nombreEstudio || 'Click'} · ${mesLbl}`, PAD + CW, y + 10);

  return { cv, nombre: `Planificacion-${sinAcentos(cliente.nombre)}-${sinAcentos(mesLbl)}.png` };
}

export async function exportarPlan(cliente, etapas, periodo, nombreEstudio) {
  const { cv, nombre } = await planCanvas(cliente, etapas, periodo, nombreEstudio);
  return new Promise((res) => cv.toBlob((blob) => {
    if (blob) bajarArchivo(blob, nombre);
    res(!!blob);
  }, 'image/png'));
}

