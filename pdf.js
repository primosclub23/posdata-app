// Posdata · la memoria como archivo PDF de verdad (texto seleccionable, fotos y tu letra).
// Se carga solo al pedir la memoria: la librería pesa ~400 KB.

const A4 = { w: 210, h: 297 }, M = { l: 22, r: 22, t: 24, b: 22 };
const PAPEL = { crema: null, kraft: [214, 191, 152], pergamino: [238, 224, 188], cuaderno: [251, 251, 246], cuadricula: [251, 250, 243], aereo: [238, 241, 245], carbon: [31, 28, 24] };
const COL = { texto: [26, 24, 16], suave: [155, 140, 120], teja: [201, 81, 46], tinta: [38, 50, 79], acento: [155, 94, 58], fondo: [237, 231, 218], papel: [251, 248, 241], cinta: [232, 211, 160] };

const aBase64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
async function registra(doc, archivo, familia, estilo, buf) {
  doc.addFileToVFS(archivo, aBase64(buf)); doc.addFont(archivo, familia, estilo);
}
async function traeFuente(doc, ruta, familia, estilo) {
  const r = await fetch(ruta); if (!r.ok) throw new Error('Falta la tipografía ' + ruta);
  await registra(doc, ruta.split('/').pop(), familia, estilo, await r.arrayBuffer());
}
const mm = (pt) => pt * 0.3528;

// datos: { nombre, esDueña, esReceptor, cartas:[{…, partes, fotos:[{data,w,h,pie}], voz, etiqueta, aviso}], fuentesAutor: Map(uid → ArrayBuffer ttf), rango, hoyTxt }
export async function creaPdf(datos) {
  const { jsPDF } = await import('./vendor/jspdf.mjs');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  await Promise.all([
    traeFuente(doc, 'fonts/PlayfairDisplay_400Regular.ttf', 'Playfair', 'normal'),
    traeFuente(doc, 'fonts/PlayfairDisplay_700Bold.ttf', 'Playfair', 'bold'),
    traeFuente(doc, 'fonts/PlayfairDisplay_400Regular_Italic.ttf', 'Playfair', 'italic'),
    traeFuente(doc, 'fonts/Caveat_400Regular.ttf', 'Caveat', 'normal'),
    datos.usaMaquina ? traeFuente(doc, 'fonts/SpecialElite_400Regular.ttf', 'Maquina', 'normal') : null,
  ]);
  // letra propia de cada autor (solo .ttf; si no se puede leer, se usa la tipografía normal)
  const letra = new Map();
  for (const [uid, buf] of datos.fuentesAutor || []) {
    try { const fam = 'Letra' + letra.size; await registra(doc, fam + '.ttf', fam, 'normal', buf); doc.setFont(fam, 'normal'); letra.set(uid, fam); } catch { /* sin letra propia */ }
  }
  const ancho = A4.w - M.l - M.r;
  let y = M.t;
  const color = (c) => doc.setTextColor(c[0], c[1], c[2]);
  let papelActual = 'crema', TT = COL.texto;
  const fondo = () => {
    const c = PAPEL[papelActual]; if (!c) return;
    doc.setFillColor(...c); doc.rect(0, 0, A4.w, A4.h, 'F');
    if (papelActual === 'aereo') { for (let x = -A4.h; x < A4.w; x += 9) { doc.setFillColor(...(Math.round((x + A4.h) / 9) % 2 ? [47, 93, 158] : [201, 67, 47])); doc.triangle(x, 0, x + 9, 0, x, 6, 'F'); doc.triangle(x, A4.h, x + 9, A4.h, x, A4.h - 6, 'F'); } }
  };
  const nueva = () => { doc.addPage(); fondo(); y = M.t; };
  const necesita = (h) => { if (y + h > A4.h - M.b) nueva(); };

  // ---------- portada ----------
  doc.setFillColor(...COL.fondo); doc.rect(0, 0, A4.w, A4.h, 'F');
  doc.setFillColor(...COL.papel); doc.circle(70, 120, 90, 'F');
  try { const lw = 62; doc.addImage('logo-pdf.png', 'PNG', M.l, 28, lw, lw * 400 / 1509); } catch { /* sin logo */ }
  doc.setFont('courier', 'normal'); doc.setFontSize(8.5); color(COL.suave); doc.text('UNA MEMORIA DE POSDATA', M.l, 118, { charSpace: 0.6 });
  doc.setFont('Playfair', 'bold'); doc.setFontSize(40); color(COL.texto);
  const t1 = 'El buzón de'; doc.text(t1, M.l, 138);
  doc.setFont('Playfair', 'italic'); color(COL.acento); doc.setFontSize(46);
  const nom = doc.splitTextToSize(datos.nombre, ancho); doc.text(nom, M.l, 154);
  const yNom = 154 + (nom.length - 1) * 17;
  doc.setFont('Caveat', 'normal'); doc.setFontSize(24); color(COL.tinta);
  doc.text(datos.esReceptor ? 'Todo lo que se escribió para ti.' : datos.esDueña ? `Todo lo que has escrito para ${datos.nombre}.` : 'Las cartas de este buzón.', M.l, yNom + 14);
  doc.setFont('courier', 'normal'); doc.setFontSize(8); color(COL.suave);
  const pie = `${datos.cartas.length} CARTA${datos.cartas.length === 1 ? '' : 'S'}${datos.rango ? ' · ' + datos.rango.toUpperCase() : ''}`;
  doc.text(doc.splitTextToSize(pie, ancho), M.l, A4.h - 36); doc.text(`PREPARADA EL ${datos.hoyTxt.toUpperCase()}`, M.l, A4.h - 30);

  // ---------- una carta por página ----------
  const texto = (txt, fam, estilo, pt, c, lh) => {
    doc.setFont(fam, estilo); doc.setFontSize(pt); color(c);
    for (const parr of String(txt).split('\n')) {
      const lineas = doc.splitTextToSize(parr || ' ', ancho);
      for (const l of lineas) { necesita(lh); doc.text(l, M.l, y); y += lh; }
    }
  };
  if (!datos.cartas.length) { nueva(); texto('Todavía no hay cartas que mostrar.', 'Playfair', 'bold', 20, COL.texto, 9); }
  for (const c of datos.cartas) {
    papelActual = PAPEL[c.papel] !== undefined ? c.papel : 'crema'; TT = papelActual === 'carbon' ? [239, 230, 211] : COL.texto;
    nueva();
    doc.setFont('courier', 'normal'); doc.setFontSize(8); color(COL.suave);
    doc.text(doc.splitTextToSize(c.etiqueta.toUpperCase(), ancho), M.l, y, { charSpace: 0.4 }); y += 8;
    doc.setFont('Playfair', 'bold'); doc.setFontSize(24); color(TT);
    const tit = doc.splitTextToSize(c.titulo || 'Sin título', ancho); doc.text(tit, M.l, y + 4); y += 4 + tit.length * 10 + 3;
    const propia = letra.get(c.autorId) && datos.usaLetra, fam = propia ? letra.get(c.autorId) : datos.usaMaquina ? 'Maquina' : 'Playfair';
    const pt = propia ? 17 : datos.usaMaquina ? 10.5 : 11.5, lh = mm(pt) * (propia ? 1.45 : datos.usaMaquina ? 1.85 : 1.7);
    c.partes.forEach((p, i) => {
      if (p.posdata) {
        necesita(26); y += 4; doc.setDrawColor(...COL.acento); doc.setLineDashPattern([1.2, 1.2], 0); doc.line(M.l, y, A4.w - M.r, y); doc.setLineDashPattern([], 0); y += 7;
        doc.setFont('Caveat', 'normal'); doc.setFontSize(17); color(COL.teja); doc.text(`P. D. · ${p.cuando}`, M.l, y); y += 6;
      } else if (i) y += 3;
      texto(p.texto, fam, 'normal', pt, TT, lh);
    });
    if (c.firma) { necesita(16); y += 4; doc.setFont(propia ? fam : 'Caveat', 'normal'); doc.setFontSize(20); color(papelActual === 'carbon' ? [190, 203, 235] : COL.tinta); doc.text(c.firma, A4.w - M.r, y + 6, { align: 'right' }); y += 14; }
    // polaroids debajo del texto
    if (c.fotos.length) {
      const pw = 50, marco = 3, foto = pw - marco * 2, pie = 11, ph = marco + foto + pie, hueco = (ancho - pw * 3) / 2;
      y += 6;
      c.fotos.forEach((f, i) => {
        const col = i % 3; if (col === 0) { necesita(ph + 8); if (i) y += ph + 9; }
        const x = M.l + col * (pw + hueco), yy = y;
        doc.setFillColor(225, 218, 205); doc.rect(x + .8, yy + .9, pw, ph, 'F');
        doc.setFillColor(...COL.papel); doc.setDrawColor(228, 221, 208); doc.setLineWidth(.2); doc.rect(x, yy, pw, ph, 'FD');
        try { doc.addImage(f.data, 'JPEG', x + marco, yy + marco, foto, foto); } catch { /* foto ilegible */ }
        doc.setFillColor(...COL.cinta); doc.rect(x + pw / 2 - 8, yy - 3, 16, 6, 'F');
        if (f.pie) { doc.setFont('Caveat', 'normal'); doc.setFontSize(11); color(COL.tinta); doc.text(doc.splitTextToSize(f.pie, pw - 4).slice(0, 2), x + pw / 2, yy + marco + foto + 4.6, { align: 'center' }); }
      });
      y += ph + 8;
    }
    if (c.voz) { necesita(10); y += 2; doc.setFont('courier', 'normal'); doc.setFontSize(8); color(COL.suave); doc.text(`NOTA DE VOZ DE ${c.voz} · SE ESCUCHA EN LA APP`, M.l, y); y += 6; }
  }

  // ---------- números de página ----------
  const n = doc.getNumberOfPages();
  for (let i = 2; i <= n; i++) { doc.setPage(i); doc.setFont('Playfair', 'italic'); doc.setFontSize(9); color(COL.suave); doc.text(`— ${i - 1} —`, A4.w / 2, A4.h - 12, { align: 'center' }); }
  doc.setProperties({ title: `Posdata · El buzón de ${datos.nombre}`, subject: 'Memoria del buzón', creator: 'Posdata' });
  return doc.output('blob');
}

// En el móvil se abre la hoja de compartir («Guardar en Archivos»); en el ordenador, se descarga.
export async function entregaPdf(blob, nombreArchivo) {
  const file = new File([blob], nombreArchivo, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nombreArchivo }); return 'compartido'; } catch (e) { if (e?.name === 'AbortError') return 'cancelado'; }
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = nombreArchivo; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return 'descargado';
}
