// Posdata · la máquina de escribir: tipografía y sonido.
// El sonido se sintetiza (sin archivos de audio) imitando la mecánica de una máquina de escribir:
// el martillo golpea el rodillo (chasquido + resonancias del metal + golpe seco) y rebota (un «tic» detrás);
// la barra espaciadora es más grave; el carro es un trinquete que corre y topa al final; y el timbre suena al llegar al margen.
const LS = { sonido: 'posdata.sonido', maquina: 'posdata.maquina', tipo: 'posdata.sonidoTipo', volumen: 'posdata.volumen' };
export const sonidoActivo = () => localStorage.getItem(LS.sonido) !== '0';
export const maquinaActiva = () => localStorage.getItem(LS.maquina) !== '0';
export function fijaSonido(si) { localStorage.setItem(LS.sonido, si ? '1' : '0'); }
export function fijaMaquina(si) { localStorage.setItem(LS.maquina, si ? '1' : '0'); aplicaMaquina(); }
export function aplicaMaquina() { document.body.classList.toggle('sin-maquina', !maquinaActiva()); }

// Tres estilos. modos = resonancias del metal [frecuencia Hz, fuerza, duración s]
export const TIPOS = {
  clasica: { nombre: 'Clásica', modos: [[880, 1, .07], [1930, .7, .05], [3250, .5, .035], [5300, .3, .025]], brillo: 1, cuerpo: 1, golpe: 1, timbre: true },
  oficina: { nombre: 'Oficina', modos: [[1150, 1, .08], [2450, .85, .06], [4100, .65, .045], [6500, .45, .03]], brillo: 1.45, cuerpo: .55, golpe: .7, timbre: false },
  suave: { nombre: 'Suave', modos: [[640, 1, .045], [1350, .5, .035], [2500, .25, .025]], brillo: .55, cuerpo: 1.3, golpe: 1.15, timbre: true },
};
// Si hay grabaciones reales en sonidos/ (con su sonidos.json), se ofrecen como «Máquina real» y son el sonido por defecto.
export const MUESTRAS = { listas: false, buffers: null };
export const hayMuestras = fetch('sonidos/sonidos.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((m) => { if (m && Object.values(m).some((l) => l && l.length)) { MUESTRAS.listas = m; TIPOS_REAL(); } return !!MUESTRAS.listas; }).catch(() => false);
function TIPOS_REAL() { if (!TIPOS.real) { const resto = { ...TIPOS }; for (const k of Object.keys(TIPOS)) delete TIPOS[k]; TIPOS.real = { nombre: 'Máquina real', real: true }; Object.assign(TIPOS, resto); } }
export const tipoSonido = () => { const t = localStorage.getItem(LS.tipo); if (TIPOS[t]) return t; return TIPOS.real ? 'real' : 'clasica'; };
export function fijaTipo(t) { if (TIPOS[t]) localStorage.setItem(LS.tipo, t); }
export const volumen = () => { const v = parseFloat(localStorage.getItem(LS.volumen)); return isFinite(v) ? Math.min(1, Math.max(.1, v)) : .7; };
export function fijaVolumen(v) { localStorage.setItem(LS.volumen, String(Math.min(1, Math.max(.1, v)))); if (sal) sal.gain.value = 1.25 * volumen(); }

const rnd = (a, b) => a + Math.random() * (b - a);
const ruidos = new WeakMap();
function bufRuido(c) { let b = ruidos.get(c); if (!b) { b = c.createBuffer(1, Math.ceil(c.sampleRate * .6), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; ruidos.set(c, b); } return b; }

// --- piezas básicas (reciben el contexto y el nodo de salida, para poder renderizar sin conexión) ---
function ruido(c, o, t, dur, tipo, f, q, vol, hasta) {
  const s = c.createBufferSource(); s.buffer = bufRuido(c);
  const fl = c.createBiquadFilter(); fl.type = tipo; fl.frequency.setValueAtTime(f, t); if (hasta) fl.frequency.exponentialRampToValueAtTime(hasta, t + dur); fl.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(o); s.start(t, rnd(0, .3), dur + .01);
}
function modo(c, o, t, f, vol, dec, f1) { // una resonancia que se apaga sola
  const x = c.createOscillator(); x.type = 'sine'; x.frequency.setValueAtTime(f, t); if (f1) x.frequency.exponentialRampToValueAtTime(f1, t + dec);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + .0012); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  x.connect(g); g.connect(o); x.start(t); x.stop(t + dec + .02);
}
const metal = (c, o, t, P, k, r) => P.modos.forEach(([f, a, d]) => modo(c, o, t, f * r * rnd(.985, 1.015), .16 * a * k * P.brillo, d));

// --- los sonidos ---
const SON = {
  // r = pequeña variación según la letra (cada tecla suena un poco distinta)
  tecla(c, o, t, P, r = 1) {
    const k = rnd(.85, 1.1);
    ruido(c, o, t, .004, 'highpass', 2800, .7, .75 * k * P.brillo);                 // el chasquido del contacto
    metal(c, o, t, P, k, r);                                                         // el martillo de metal resonando
    ruido(c, o, t + .001, .04, 'bandpass', 340 * r, 1.6, .55 * k * P.cuerpo);       // el cuerpo de la máquina
    modo(c, o, t, rnd(120, 150) * r, .34 * k * P.golpe, .06, 62);                    // el golpe contra el rodillo
    const t2 = t + rnd(.05, .075);                                                   // y el martillo, al volver a su sitio
    ruido(c, o, t2, .006, 'highpass', 3200, .8, .28 * k * P.brillo); modo(c, o, t2, 2150 * r, .05 * k * P.brillo, .03);
  },
  espacio(c, o, t, P) {
    ruido(c, o, t, .006, 'highpass', 2000, .7, .6 * P.brillo);
    ruido(c, o, t, .08, 'bandpass', 620, 1, .75 * P.cuerpo);
    modo(c, o, t, 92, .46 * P.golpe, .11, 52);
    modo(c, o, t, 520, .09 * P.brillo, .09); modo(c, o, t, 1180, .06 * P.brillo, .06);
    ruido(c, o, t + .065, .006, 'highpass', 2600, .8, .22 * P.brillo);               // la barra, al reposar
  },
  borra(c, o, t, P) {
    ruido(c, o, t, .004, 'highpass', 3000, .8, .4 * P.brillo);
    modo(c, o, t, 1900, .06 * P.brillo, .035); modo(c, o, t, 130, .12 * P.golpe, .05, 80);
  },
  retorno(c, o, t, P) { // el carro: trinquete que corre, deslizamiento y golpe al llegar
    let x = t, paso = .028; const n = 15;
    for (let i = 0; i < n; i++) { ruido(c, o, x, .005, 'highpass', 3000, .8, .3 * P.brillo); modo(c, o, x, 1500 * rnd(.97, 1.03), .05 * P.brillo, .016); x += paso; paso = Math.max(.014, paso - .001); }
    ruido(c, o, t, x - t, 'bandpass', 380, .8, .11 * P.cuerpo, 1900);               // el carro rodando
    const tf = x + .01;
    ruido(c, o, tf, .09, 'lowpass', 520, 1, .8 * P.cuerpo); modo(c, o, tf, 72, .55 * P.golpe, .14, 45); metal(c, o, tf, P, .8, .8); // topa
    if (P.timbre) timbre(c, o, tf + .12, .09);
  },
  aviso(c, o, t, P) { timbre(c, o, t, .2); },
  interruptor(c, o, t) { // el «clic» de un interruptor antiguo: pulsa, y rebota
    ruido(c, o, t, .005, 'highpass', 2200, .8, .9); modo(c, o, t, 3400, .1, .02); modo(c, o, t, 190, .35, .06, 110);
    ruido(c, o, t + .055, .004, 'highpass', 3000, .8, .45); modo(c, o, t + .055, 2600, .05, .015);
  },
};
function timbre(c, o, t, v) { // el timbre: campana de latón, parciales poco armónicos
  modo(c, o, t, 2093, v * .55, 1.3); modo(c, o, t, 4231, v * .3, .9); modo(c, o, t, 6350, v * .14, .55); modo(c, o, t, 2210, v * .15, .9);
  ruido(c, o, t, .006, 'highpass', 4000, .8, v * .6);
}
const variacion = (ch) => (ch ? 1 + (((ch.charCodeAt(0) * 37) % 11) - 5) * .014 : 1);

// --- salida real ---
let ctx = null, sal = null;
function audio() {
  if (!ctx) {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
    ctx = new A(); sal = ctx.createGain(); sal.gain.value = 1.25 * volumen();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; sal.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// --- grabaciones reales ---
let cargandoMuestras = null, ultimo = {};
async function cargaMuestras(c) {
  if (MUESTRAS.buffers || !MUESTRAS.listas) return MUESTRAS.buffers;
  if (!cargandoMuestras) cargandoMuestras = (async () => {
    const b = {};
    for (const [tipo, lista] of Object.entries(MUESTRAS.listas)) {
      b[tipo] = [];
      for (const f of lista) { try { b[tipo].push(await c.decodeAudioData(await (await fetch('sonidos/' + f)).arrayBuffer())); } catch { /* esa muestra no vale */ } }
    }
    MUESTRAS.buffers = b; return b;
  })();
  return cargandoMuestras;
}
const ALTERNATIVA = { aviso: 'timbre', borra: 'tecla' };
function tocaMuestra(nombre, vol = 1) {
  const b = MUESTRAS.buffers; if (!b) return false;
  let lista = b[ALTERNATIVA[nombre] && !(b[nombre] && b[nombre].length) ? ALTERNATIVA[nombre] : (nombre === 'aviso' ? 'timbre' : nombre)];
  if (!lista || !lista.length) lista = nombre === 'espacio' ? b.tecla : null; if (!lista || !lista.length) return false;
  let i = Math.floor(Math.random() * lista.length); if (lista.length > 1 && i === ultimo[nombre]) i = (i + 1) % lista.length; ultimo[nombre] = i;
  const s = ctx.createBufferSource(); s.buffer = lista[i]; s.playbackRate.value = rnd(.97, 1.03) * (nombre === 'borra' ? 1.12 : 1);
  const g = ctx.createGain(); g.gain.value = vol * rnd(.82, 1) * (nombre === 'borra' ? .6 : 1); s.connect(g); g.connect(sal); s.start(); return true;
}
export function suena(nombre, letra) {
  if (!sonidoActivo() || !audio()) return;
  try {
    const tipo = tipoSonido();
    if (TIPOS[tipo] && TIPOS[tipo].real) { if (!MUESTRAS.buffers) { cargaMuestras(ctx); } else if (tocaMuestra(nombre)) return; }
    const P = TIPOS[tipo] && !TIPOS[tipo].real ? TIPOS[tipo] : TIPOS.clasica;
    SON[nombre](ctx, sal, ctx.currentTime + .005, P, nombre === 'tecla' ? variacion(letra) : 1);
  } catch { /* sin sonido */ }
}
// Para comprobar la forma del sonido sin altavoces: devuelve las muestras.
export async function renderiza(nombre, tipo = 'clasica', letra = 'a', seg = 1.6) {
  const o = new OfflineAudioContext(1, 44100 * seg, 44100), g = o.createGain(); g.gain.value = 1.25 * .7; g.connect(o.destination);
  SON[nombre](o, g, .02, TIPOS[tipo], nombre === 'tecla' ? variacion(letra) : 1);
  return Array.from((await o.startRendering()).getChannelData(0));
}

export async function precarga() { await hayMuestras; if (MUESTRAS.listas && audio()) cargaMuestras(ctx); }

// Engancha un campo de texto: cada letra suena como una tecla; Enter, como el carro; y un timbre al llegar al margen.
export function conMaquina(el, { margen = 0 } = {}) {
  if (!el || el.dataset.maquina) return; el.dataset.maquina = '1';
  let avisado = -1;
  el.addEventListener('input', (e) => {
    const t = e.inputType || '';
    if (t.startsWith('deleteContent')) return suena('borra');
    if (t === 'insertLineBreak' || t === 'insertParagraph') { avisado = -1; return suena('retorno'); }
    if (e.data === ' ') return suena('espacio');
    suena('tecla', e.data || '');
    if (margen && el.selectionStart != null) {
      const antes = el.value.slice(0, el.selectionStart), col = antes.length - antes.lastIndexOf('\n') - 1;
      if (col === margen && avisado !== antes.length) { avisado = antes.length; setTimeout(() => suena('aviso'), 70); }
    }
  });
}
