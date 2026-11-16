// Posdata · la máquina de escribir: tipografía y sonido (sintetizado, sin archivos de audio).
const LS = { sonido: 'posdata.sonido', maquina: 'posdata.maquina' };
export const sonidoActivo = () => localStorage.getItem(LS.sonido) !== '0';
export const maquinaActiva = () => localStorage.getItem(LS.maquina) !== '0';
export function fijaSonido(si) { localStorage.setItem(LS.sonido, si ? '1' : '0'); }
export function fijaMaquina(si) { localStorage.setItem(LS.maquina, si ? '1' : '0'); aplicaMaquina(); }
export function aplicaMaquina() { document.body.classList.toggle('sin-maquina', !maquinaActiva()); }

let ctx = null, sal = null, ruidoBuf = null;
function audio() {
  if (!ctx) {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
    ctx = new A(); sal = ctx.createGain(); sal.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor(); sal.connect(comp); comp.connect(ctx.destination);
    ruidoBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = ruidoBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function ruido(t, dur, freq, q, vol, hasta) {
  const s = ctx.createBufferSource(); s.buffer = ruidoBuf; s.playbackRate.value = rnd(.9, 1.1);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); if (hasta) f.frequency.exponentialRampToValueAtTime(hasta, t + dur); f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sal); s.start(t, rnd(0, .3), dur + .02);
}
function tono(t, tipo, f0, f1, dur, vol) {
  const o = ctx.createOscillator(); o.type = tipo; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sal); o.start(t); o.stop(t + dur + .02);
}
const SONIDOS = {
  tecla() { const t = ctx.currentTime; ruido(t, .05, rnd(1700, 3300), 1.1, rnd(.55, .8)); tono(t, 'sine', rnd(130, 170), 70, .07, rnd(.25, .38)); tono(t, 'triangle', rnd(3800, 4600), 0, .012, .07); },
  espacio() { const t = ctx.currentTime; ruido(t, .08, 900, .9, .7); tono(t, 'sine', 95, 55, .11, .5); },
  borra() { const t = ctx.currentTime; ruido(t, .04, 1400, 1.4, .35); tono(t, 'sine', 150, 90, .05, .16); },
  retorno() {
    const t = ctx.currentTime;
    tono(t, 'sine', 2093, 0, 1.1, .16); tono(t, 'sine', 3135, 0, .8, .09); tono(t, 'sine', 4186, 0, .5, .04); // el timbre
    ruido(t + .06, .26, 500, .7, .22, 2800); // el carro se desliza
    ruido(t + .33, .07, 900, .9, .6); tono(t + .33, 'sine', 80, 50, .12, .5); // y topa
  },
  aviso() { const t = ctx.currentTime; tono(t, 'sine', 2093, 0, .7, .1); tono(t, 'sine', 3135, 0, .5, .05); }, // pitido suave al llegar al margen
};
export function suena(nombre) {
  if (!sonidoActivo() || !audio()) return;
  try { SONIDOS[nombre](); } catch { /* sin sonido */ }
}

// Engancha un campo de texto: cada letra suena como una tecla; Enter, como el retorno de carro.
export function conMaquina(el, { margen = 0 } = {}) {
  if (!el || el.dataset.maquina) return; el.dataset.maquina = '1';
  let avisado = -1;
  el.addEventListener('input', (e) => {
    const t = e.inputType || '';
    if (t.startsWith('deleteContent')) return suena('borra');
    if (t === 'insertLineBreak' || t === 'insertParagraph') { avisado = -1; return suena('retorno'); }
    if (e.data === ' ') return suena('espacio');
    suena('tecla');
    if (margen && el.selectionStart != null) { // un pitido al acercarse al margen derecho, como en las de verdad
      const antes = el.value.slice(0, el.selectionStart), col = antes.length - antes.lastIndexOf('\n') - 1;
      if (col === margen && avisado !== antes.length) { avisado = antes.length; setTimeout(() => suena('aviso'), 70); }
    }
  });
}
