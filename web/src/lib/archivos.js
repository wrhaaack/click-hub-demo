// Descargas: la imagen de la planificación y la planilla Excel del cliente.

export function bajarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  // Se libera después: si se revoca en el mismo tick, la descarga a veces se
  // cancela antes de arrancar.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function sinAcentos(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------- Un .xlsx armado a mano ----------
// Un .xlsx es un ZIP con varios XML adentro. Se arma acá en vez de traer una
// librería: el archivo es simple (texto, números y encabezados en negrita) y
// un .csv no tiene hojas. El ZIP va sin comprimir: pesa unos pocos KB.

const CRC_TABLA = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

function armarZip(archivos) {
  const enc = new TextEncoder();
  const partes = [];
  const central = [];
  let offset = 0;
  archivos.forEach((a) => {
    const nombre = enc.encode(a.nombre);
    const datos = enc.encode(a.texto);
    const crc = crc32(datos);
    // bit 11 de las banderas = nombres en UTF-8.
    const cab = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(datos.length), ...u32(datos.length), ...u16(nombre.length), ...u16(0)];
    partes.push(new Uint8Array(cab), nombre, datos);
    central.push({ nombre, crc, largo: datos.length, offset });
    offset += cab.length + nombre.length + datos.length;
  });
  const inicioCentral = offset;
  let largoCentral = 0;
  central.forEach((e) => {
    const cab = [...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(e.crc), ...u32(e.largo), ...u32(e.largo), ...u16(e.nombre.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(e.offset)];
    partes.push(new Uint8Array(cab), e.nombre);
    largoCentral += cab.length + e.nombre.length;
  });
  partes.push(new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
    ...u32(largoCentral), ...u32(inicioCentral), ...u16(0)]));
  return new Blob(partes, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function xEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // Los caracteres de control no son XML válido y Excel diría que está dañado.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}
function colLetra(i) {
  let s = '';
  i++;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - r - 1) / 26; }
  return s;
}

// Un número se escribe como número (para poder sumarlo en Excel) y el resto
// como texto. La primera fila va en negrita, congelada y con filtro.
function hojaXml(filas, anchos) {
  const cols = anchos?.length
    ? '<cols>' + anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join('') + '</cols>'
    : '';
  const cuerpo = filas.map((fila, f) => '<row r="' + (f + 1) + '">' + fila.map((v, c) => {
    const ref = colLetra(c) + (f + 1);
    const estilo = f === 0 ? ' s="1"' : '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${estilo}><v>${v}</v></c>`;
    if (v === null || v === undefined || v === '') return '';
    return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${xEsc(v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  const vista = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
  const filtro = filas.length > 1 ? `<autoFilter ref="A1:${colLetra(filas[0].length - 1)}${filas.length}"/>` : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + vista + cols + '<sheetData>' + cuerpo + '</sheetData>' + filtro + '</worksheet>';
}

// hojas = [{nombre, filas, anchos}]
export function armarXlsx(hojas) {
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const partes = [
    { nombre: '[Content_Types].xml', texto: X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + hojas.map((h, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>' },
    { nombre: '_rels/.rels', texto: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nombre: 'xl/workbook.xml', texto: X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      // Excel no acepta / \ ? * [ ] : en el nombre de una hoja, ni más de 31 caracteres.
      + hojas.map((h, i) => `<sheet name="${xEsc(String(h.nombre).replace(/[/\\?*[\]:]/g, '-').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
      + '</sheets></workbook>' },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nombre: 'xl/styles.xml', texto: X + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFEDEAE5"/><bgColor indexed="64"/></patternFill></fill></fills>'
      + '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>' },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, texto: hojaXml(h.filas, h.anchos) })),
  ];
  return armarZip(partes);
}
