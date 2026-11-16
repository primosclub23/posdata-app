// Posdata · fotos y voz en el navegador: reducir fotos, grabar audio, reproductor.

// ---------- fotos ----------
// Reduce la foto (máx. 1600 px por el lado largo) y la guarda como JPEG: pesa 10 veces menos y se ve igual.
export async function reducirFoto(file, max = 1600, calidad = 0.82) {
  let fuente, ancho, alto;
  try {
    fuente = await createImageBitmap(file, { imageOrientation: 'from-image' });
    ancho = fuente.width; alto = fuente.height;
  } catch {
    fuente = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No se ha podido leer esa foto.')); i.src = URL.createObjectURL(file); });
    ancho = fuente.naturalWidth; alto = fuente.naturalHeight;
  }
  const k = Math.min(1, max / Math.max(ancho, alto));
  const c = document.createElement('canvas'); c.width = Math.round(ancho * k); c.height = Math.round(alto * k);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(fuente, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', calidad));
  if (!blob) throw new Error('No se ha podido preparar la foto.');
  return { blob, mime: 'image/jpeg', ext: 'jpg' };
}

// ---------- voz ----------
const MAX_SEGUNDOS = 600;
export const haySoporteDeVoz = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

export async function empezarGrabacion(alCambiar) {
  const flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  const tipo = tipos.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(flujo, tipo ? { mimeType: tipo } : {});
  const trozos = []; const t0 = Date.now(); let reloj;
  rec.ondataavailable = (e) => e.data.size && trozos.push(e.data);
  const terminado = new Promise((ok) => {
    rec.onstop = () => {
      clearInterval(reloj); flujo.getTracks().forEach((t) => t.stop());
      const mime = (rec.mimeType || tipo || 'audio/webm').split(';')[0];
      const blob = new Blob(trozos, { type: mime });
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      ok({ blob, mime, ext, duracion: Math.max(1, Math.round((Date.now() - t0) / 1000)) });
    };
  });
  rec.start(500);
  reloj = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); alCambiar?.(s); if (s >= MAX_SEGUNDOS) rec.stop(); }, 250);
  return { parar: () => rec.state !== 'inactive' && rec.stop(), terminado };
}

export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- reproductor ----------
// Devuelve el HTML; después hay que llamar a activaReproductores(contenedor).
export function reproductorHtml(url, duracion = 0, etiqueta = 'Nota de voz') {
  const barras = Array.from({ length: 28 }, (_, i) => `<i style="--h:${22 + Math.round(Math.abs(Math.sin(i * 1.7) * 62 + Math.cos(i * .6) * 16))}%"></i>`).join('');
  return `<div class="voz-rep" data-src="${url}" data-dur="${duracion || 0}">
    <button type="button" class="voz-play" aria-label="Reproducir"><svg viewBox="0 0 24 24" width="20" height="20" class="ic-play"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg><svg viewBox="0 0 24 24" width="20" height="20" class="ic-pausa"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg></button>
    <div class="voz-medio"><span class="etq">${etiqueta}</span><div class="voz-barras" role="progressbar" aria-label="Progreso">${barras}</div></div>
    <span class="voz-t mono">${mmss(duracion || 0)}</span></div>`;
}
export function activaReproductores(raiz) {
  raiz.querySelectorAll('.voz-rep:not([data-listo])').forEach((r) => {
    r.dataset.listo = '1';
    const audio = new Audio(); audio.preload = 'metadata'; audio.src = r.dataset.src;
    const barras = [...r.querySelectorAll('.voz-barras i')], t = r.querySelector('.voz-t'); const total = +r.dataset.dur || 0;
    const pinta = () => { const d = isFinite(audio.duration) && audio.duration ? audio.duration : total; const p = d ? audio.currentTime / d : 0; barras.forEach((b, i) => b.classList.toggle('on', i / barras.length < p)); t.textContent = mmss(audio.paused && !audio.currentTime ? d : audio.currentTime); };
    r.querySelector('.voz-play').onclick = () => { if (audio.paused) { document.querySelectorAll('.voz-rep.suena').forEach((o) => o !== r && o.querySelector('.voz-play').click()); audio.play(); } else audio.pause(); };
    audio.onplay = () => r.classList.add('suena'); audio.onpause = () => r.classList.remove('suena'); audio.onended = () => { r.classList.remove('suena'); audio.currentTime = 0; pinta(); };
    audio.ontimeupdate = pinta; audio.onloadedmetadata = pinta;
    r.querySelector('.voz-barras').onclick = (e) => { const b = e.currentTarget.getBoundingClientRect(); const d = isFinite(audio.duration) ? audio.duration : total; if (d) audio.currentTime = ((e.clientX - b.left) / b.width) * d; };
  });
}
