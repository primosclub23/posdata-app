// Posdata · app real (versión 1): entrar, crear buzón, escribir, sellar, leer.
import { createClient } from './vendor/supabase.mjs';
import { CONFIG } from './config.js';
import { creaPdf, entregaPdf } from './pdf.js';
import { qrcode } from './vendor/qrgen.mjs';
import { conMaquina, sonidoActivo, fijaSonido, maquinaActiva, fijaMaquina, aplicaMaquina, suena, TIPOS, tipoSonido, fijaTipo, volumen, fijaVolumen, hayMuestras, precarga } from './sonido.js';
import { reducirFoto, haySoporteDeVoz, empezarGrabacion, mmss, reproductorHtml, activaReproductores } from './media.js';

const $app = document.getElementById('app');
const $top = document.getElementById('top');
const $aviso = document.getElementById('aviso');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dentro = (html) => { $app.innerHTML = `<div class="cuerpo-app"><section class="vista">${html}</section></div>`; window.scrollTo(0, 0); };
const miniSobre = '<span class="mini-sobre"><i></i></span>';
const inicial = (t) => esc((t || '?').trim().charAt(0).toUpperCase());
const fechaLarga = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

const ERRORES = {
  sin_permiso: 'No tienes permiso para hacer eso.', texto_vacio: 'Escribe algo antes de enviar.',
  fecha_no_valida: 'La fecha de apertura tiene que ser posterior a hoy.', momento_vacio: 'Pon un nombre al momento («Cuando estés triste»).',
  llave_no_valida: 'Ese código no abre ningún buzón.', demasiados_intentos: 'Demasiados intentos. Espera unos minutos.',
  invitacion_no_valida: 'La invitación no es válida o ha caducado.', ya_eres_miembro: 'Ya tienes acceso a este buzón.',
  no_pendiente: 'Esa carta ya no está pendiente.', papel_premium: 'Los papeles y las tintas distintos son de Posdata completa.', papel_no_valido: 'Ese papel no existe.', borrador_no_valido: 'Ese borrador ya no existe.', demasiados_borradores: 'Ya tienes 30 borradores en este buzón: borra alguno.', cinta_sin_titulo: 'Ponle un nombre a la cinta.', cancion_sin_titulo: 'Escribe el título de la canción.', cara_llena: 'Esa cara ya tiene 6 canciones. Pasa alguna a la otra cara.', demasiadas_cintas: 'Ya tienes muchas cintas.', 'violates check constraint': 'Revisa los datos: el enlace tiene que empezar por https://', carta_no_editable: 'Esa carta ya no se puede editar: quien la recibe ya puede leerla.', usa_editar: 'Esa carta aún se puede editar directamente.', parte_no_valida: 'Ese texto ya no existe.', texto_largo: 'El texto es demasiado largo.', tema_repetido: 'Ya hay un tema con ese nombre.', tema_vacio: 'Escribe el nombre del tema.', demasiados_temas: 'Ya hay demasiados temas.', tema_no_valido: 'Ese tema ya no existe.',
  demasiados_adjuntos: 'Demasiadas fotos o audios en una carta.', adjunto_no_subido: 'No se ha podido subir un archivo. Inténtalo otra vez.', 'row-level security': 'No puedes subir archivos a este buzón.', 'maximum allowed size': 'Ese archivo pesa demasiado.', 'mime type': 'Ese tipo de archivo no está permitido.', correo_no_valido: 'Ese correo no parece válido.', no_autenticado: 'Entra primero.',
  'Invalid login credentials': 'Correo o contraseña incorrectos.', 'User already registered': 'Ya hay una cuenta con ese correo.',
  'Email not confirmed': 'Confirma tu correo antes de entrar (mira tu bandeja).',
};
const msgError = (e) => { const t = e?.message || String(e); const k = Object.keys(ERRORES).find((k) => t.includes(k)); return k ? ERRORES[k] : 'Algo ha fallado: ' + t; };
let tAviso;
function avisa(t, mal = false) { $aviso.textContent = t; $aviso.className = 'aviso' + (mal ? ' mal' : ''); $aviso.hidden = false; clearTimeout(tAviso); tAviso = setTimeout(() => ($aviso.hidden = true), 4200); }

aplicaMaquina();
if (!CONFIG.url || !CONFIG.anonKey) {
  $app.innerHTML = `<div class="cuerpo-app"><section class="vista centro"><h1>Falta <em>conectar</em></h1><p class="muted">Abre <code>app/config.js</code> y pega la URL y la clave «anon public» de tu proyecto Supabase.</p></section></div>`;
  throw new Error('config vacía');
}
const sb = createClient(CONFIG.url, CONFIG.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
let user = null;

async function rpc(nombre, args = {}) { const { data, error } = await sb.rpc(nombre, args); if (error) throw error; return data; }
async function leer(q) { const { data, error } = await q; if (error) throw error; return data; }

// ---------- cabecera ----------
let nombrePerfil = null, planPerfil = 'prueba'; // null = aún sin cargar
const premium = () => planPerfil !== 'gratis';
const ESTILO0 = { papel: 'crema', textura: 'original', hoja: 'rayas', tinta: 'negra' };
const COLORES_PAPEL = [['crema', 'Crema', '#FBF8F1'], ['beis', 'Beis', '#EFE4CE'], ['gris', 'Gris', '#E6E5E1'], ['azul', 'Azul', '#DDE8EF'], ['salvia', 'Salvia', '#D8E2D2'], ['rosa', 'Rosa', '#F0D9D6'], ['kraft', 'Kraft', '#CDB48D'], ['pergamino', 'Pergamino', '#EBDDB5'], ['noche', 'Noche', '#1F1C18']];
const TEXTURAS = [['original', 'Original'], ['algodon', 'Algodón'], ['verjurado', 'Verjurado'], ['reciclado', 'Reciclado'], ['lisa', 'Lisa']];
const HOJAS = [['rayas', 'Rayada'], ['lisa', 'Lisa'], ['cuaderno', 'Cuaderno'], ['cuadricula', 'Cuadrícula'], ['aereo', 'Correo aéreo']];
const TINTAS = [['negra', 'Negra', '#1A1810'], ['sepia', 'Sepia', '#4A3320'], ['azul', 'Azul', '#1E3F8F'], ['medianoche', 'Medianoche', '#232C55'], ['bosque', 'Bosque', '#23412E'], ['burdeos', 'Burdeos', '#6B1F2B']];
const CAPAS = [['papel', 'Color', COLORES_PAPEL], ['textura', 'Tipo de papel', TEXTURAS], ['hoja', 'Hoja', HOJAS], ['tinta', 'Tinta', TINTAS]];
const normaliza = (o) => { const e = {}; for (const [k, , lista] of CAPAS) e[k] = lista.some((x) => x[0] === o?.[k]) ? o[k] : ESTILO0[k]; return e; };
const esDefecto = (e) => Object.keys(ESTILO0).every((k) => e[k] === ESTILO0[k]);
const poneAtributos = (el, e) => { for (const k of Object.keys(ESTILO0)) el.dataset[k] = e[k]; };
const atributos = (e) => Object.keys(ESTILO0).map((k) => `data-${k}="${e[k]}"`).join(' ');
const COLS_ESTILO = ', papel, textura, hoja, tinta';
let escrituraPerfil = null;                               // valores iniciales guardados en la cuenta
const estiloInicial = () => normaliza(escrituraPerfil || (() => { try { return JSON.parse(localStorage.getItem('posdata.escritura') || 'null'); } catch { return null; } })());
// el selector por capas (color, tipo de papel, hoja y tinta)
function selectorEstilo(e, id = '') {
  const muestra = (capa, k, n, dentro) => `<button type="button" class="muestra ${e[capa] === k ? 'on' : ''}" data-capa="${capa}" data-valor="${k}" aria-label="${n}" aria-pressed="${e[capa] === k}">${dentro}<span>${n}</span>${ESTILO0[capa] !== k && !premium() ? '<u class="candado-p" title="Posdata completa">🔒</u>' : ''}</button>`;
  return `<div class="selector-estilo" ${id ? `id="${id}"` : ''}>${CAPAS.map(([capa, titulo, lista]) => `<div class="capa"><p class="lbl">${titulo}</p><div class="muestras">${lista.map(([k, n, c]) => muestra(capa, k, n, capa === 'papel' || capa === 'tinta' ? `<i class="circulo" style="background:${c}"></i>` : capa === 'textura' ? `<i class="tex tex-${k}"></i>` : `<i class="hojam hojam-${k}"></i>`)).join('')}</div></div>`).join('')}</div>`;
}
function enlazaSelector(raiz, dame, pon) {
  raiz.querySelectorAll('[data-capa]').forEach((b) => (b.onclick = () => {
    const capa = b.dataset.capa, valor = b.dataset.valor;
    if (ESTILO0[capa] !== valor && !premium()) return avisa('Los papeles y las tintas distintos son de Posdata completa.', true);
    pon({ ...dame(), [capa]: valor });
    raiz.querySelectorAll(`[data-capa="${capa}"]`).forEach((x) => { const on = x.dataset.valor === valor; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
  }));
}
function pintaTop() {
  if (!user) { $top.innerHTML = ''; return; }
  const ini = user.is_anonymous ? '' : esc(((nombrePerfil || '').trim() || (user.email || '?').trim()).charAt(0).toUpperCase());
  $top.innerHTML = `<a href="#/" class="logo-enlace"><img class="logo-os" src="posdata-logotipo-oscuro.svg" alt="Posdata"><img class="logo-cl" src="posdata-logotipo-claro.svg" alt="" aria-hidden="true"></a><nav><a class="avatar-btn" href="#/perfil" aria-label="Mi perfil" title="Mi perfil">${ini || ICONO.persona}</a></nav>`;
}

// ---------- rutas ----------
async function ruta() {
  document.title = 'Posdata'; document.body.classList.remove('lampara');
  if (user && !user.is_anonymous && nombrePerfil === null) {
    nombrePerfil = '';
    for (const cols of ['nombre, plan, escritura', 'nombre, plan', 'nombre']) {
      try { const [f] = await leer(sb.from('profiles').select(cols).eq('id', user.id)); if (f) { nombrePerfil = f.nombre || ''; planPerfil = f.plan || 'prueba'; escrituraPerfil = f.escritura && Object.keys(f.escritura).length ? f.escritura : null; break; } } catch { /* esa columna aún no existe */ }
    }
  }
  pintaTop();
  const h = location.hash || '#/';
  try {
    if (h.startsWith('#invitar/')) return vistaInvitacion(decodeURIComponent(h.slice(9)));
    if (h.startsWith('#/qr/') && !user) return vistaEntrada('entrar', false, false, 'qr');
    if (!user) return h === '#/codigo' ? vistaCodigo() : vistaEntrada('inicio');
    if (h === '#/codigo') return vistaCodigo();
    if (h === '#/perfil') return vistaPerfil();
    if (h.startsWith('#/qr/')) return vistaAprobarQr(h.slice(5).toUpperCase());
    if (h.startsWith('#/b/')) { const [bid, extra] = h.slice(4).split('/'); return extra === 'memoria' ? vistaMemoria(bid) : vistaBuzon(bid); }
    return vistaInicio();
  } catch (e) { avisa(msgError(e), true); console.error(e); }
}
addEventListener('hashchange', ruta);

// ---------- entrada ----------
const marca = (titulo, sub) => `<section class="marca">
  <div class="flot" aria-hidden="true">
    <div class="fl fl-sobre" data-d="26"><div class="sobre"><i></i></div></div>
    <div class="fl fl-pola" data-d="40"><figure class="pola"><div class="pola-foto"></div><figcaption>tu primer día de playa</figcaption></figure></div>
    <div class="fl fl-sobre2" data-d="14"><div class="sobre sobre-s"><i></i></div></div>
    <div class="fl fl-nota" data-d="20"><p class="mano">P. D.: te quiero.</p></div>
  </div>
  <img class="logo logo-os" src="posdata-logotipo-oscuro.svg" alt="Posdata" width="210" height="74"><img class="logo logo-cl" src="posdata-logotipo-claro.svg" alt="" aria-hidden="true" width="210" height="74">
  <div class="lema"><h1>${titulo}</h1><p class="mano">${sub}</p></div>
  <p class="etq pie">Un buzón para cada persona · privado</p></section>`;
const entrada = (titulo, sub, lado) => {
  const ex = $app.querySelector('.entrada');
  if (ex && ex.dataset.t === titulo) { ex.querySelector('.est').innerHTML = lado; return; }
  $app.innerHTML = `<div class="entrada" data-t="${esc(titulo)}">${marca(titulo, sub)}<section class="lado-form"><div class="est">${lado}</div></section></div>`; window.scrollTo(0, 0);
};
addEventListener('mousemove', (e) => { const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5; document.querySelectorAll('.fl').forEach((f) => { const d = +f.dataset.d || 20; f.style.setProperty('--mx', (x * d).toFixed(1)); f.style.setProperty('--my', (y * d).toFixed(1)); }); });

const LEMA = 'Escríbeles hoy lo que querrán leer <em>siempre</em>';
const SUB = 'Lo que piensas, lo que has aprendido y lo que no quieres que olviden. Lo tendrán siempre, también cuando tú no estés.';


// ---------- portada: el sobre que se abre ----------
const SIN_ANIMAR = matchMedia('(prefers-reduced-motion: reduce)').matches;
function vistaPortada() {
  entrada(LEMA, SUB, `
    <p class="etq">Posdata</p>
    <h2>Tu primer buzón empieza con <em>una carta</em></h2>
    <button class="cta" id="crear" aria-label="Crear mi cuenta">
      <span class="cta-sobre" aria-hidden="true">
        <span class="cta-dorso"></span>
        <span class="cta-carta"><b class="mano">Para ti,</b><i></i><i></i><i style="width:62%"></i><i></i><i style="width:40%"></i><em class="mano">P. D.: te quiero.</em></span>
        <span class="cta-frente"></span>
        <span class="cta-solapa"></span>
        <u class="cta-sello"></u>
      </span>
      <span class="cta-txt">Crear mi cuenta <span class="cta-flecha">→</span></span>
      <span class="cta-sub">Gratis para empezar · sin tarjeta</span>
    </button>
    <div class="pie-form fila entre"><button type="button" class="enlace" id="entrar">Ya tengo cuenta</button><a class="enlace" href="#/codigo">Tengo una tarjeta con código</a></div>
    ${enOrdenador() ? '<button type="button" class="enlace" id="ir-qr" style="justify-self:start">Entrar con el código QR del móvil</button>' : ''}`);
  document.getElementById('entrar').onclick = () => vistaEntrada('entrar');
  document.getElementById('ir-qr')?.addEventListener('click', () => vistaEntrada('qr'));
  const b = document.getElementById('crear');
  b.onclick = () => {
    if (SIN_ANIMAR) return vistaEntrada('crear');
    if (b.classList.contains('abre')) return;
    b.classList.add('abre');
    const est = b.closest('.est');
    setTimeout(() => est.classList.add('sale-fuera'), 1150);
    setTimeout(() => { est.classList.remove('sale-fuera'); vistaEntrada('crear', false, true); }, 1950);
  };
}

function vistaEntrada(modo = 'entrar', invitada = false, desdeSobre = false, contexto = '') {
  if (modo === 'inicio') return vistaPortada();
  if (modo === 'qr') return vistaQr();
  const nuevo = modo === 'crear';
  entrada(invitada ? 'Te han invitado a un <em>buzón</em>' : contexto === 'qr' ? 'Entra para dejar entrar a tu <em>ordenador</em>' : LEMA, SUB, `
    <p class="etq">${invitada ? 'Invitación' : nuevo ? 'Crear tu cuenta' : 'Entrar'}</p>
    <h2>${invitada ? 'Crea tu cuenta y <em>entra</em>' : nuevo ? 'Empieza tu <em>primer buzón</em>' : 'Qué bien <em>verte</em>'}</h2>
    <form id="f" class="${desdeSobre ? 'sale' : ''}">
      <label><span>Correo</span><input type="email" name="correo" required autocomplete="email" placeholder="tu@correo.com"></label>
      <label><span>Contraseña${nuevo ? ' · mínimo 8' : ''}</span><input type="password" name="clave" required minlength="${nuevo ? 8 : 1}" autocomplete="${nuevo ? 'new-password' : 'current-password'}"></label>
      <button class="btn ancho">${nuevo ? 'Crear cuenta' : 'Entrar'}</button>
    </form>
    <div class="pie-form fila entre"><button type="button" class="enlace" id="cambia">${nuevo ? 'Ya tengo cuenta' : 'Crear una cuenta'}</button><a class="enlace" href="#/codigo">Tengo una tarjeta con código</a></div>
    ${enOrdenador() && !invitada && contexto !== 'qr' ? '<button type="button" class="enlace" id="ir-qr" style="justify-self:start">Entrar con el código QR del móvil</button>' : ''}`);
  document.getElementById('cambia').onclick = () => vistaEntrada(nuevo ? 'entrar' : 'crear', invitada);
  document.getElementById('ir-qr')?.addEventListener('click', () => vistaEntrada('qr'));
  document.getElementById('f').onsubmit = async (ev) => {
    ev.preventDefault(); const f = new FormData(ev.target); const b = ev.target.querySelector('.btn'); b.disabled = true;
    try {
      const cred = { email: f.get('correo').trim(), password: f.get('clave') };
      const r = nuevo ? await sb.auth.signUp(cred) : await sb.auth.signInWithPassword(cred);
      if (r.error) throw r.error;
      if (nuevo && !r.data.session) { avisa('Cuenta creada. Confirma el correo que te hemos enviado y entra.'); vistaEntrada('entrar', invitada); }
    } catch (e) { avisa(msgError(e), true); } finally { b.disabled = false; }
  };
}

// ---------- código de tarjeta (quien recibe) ----------
function vistaCodigo() {
  entrada('Tienes cartas <em>esperándote</em>', 'Escribe el código de tu tarjeta y se abrirá tu buzón.', `
    <p class="etq">Tu tarjeta</p><h2>Escribe el código de <em>tu tarjeta</em></h2>
    <form id="f"><label><span>Código</span><input name="c" placeholder="XXXX-XXXX" autocomplete="off" autocapitalize="characters" required style="text-align:center;font-family:var(--mono);font-style:normal;letter-spacing:.14em;font-size:20px"></label><button class="btn ancho">Abrir mi buzón</button></form>
    <div class="pie-form"><a class="enlace" href="#/">Volver</a></div>`);
  document.getElementById('f').onsubmit = async (ev) => {
    ev.preventDefault(); const b = ev.target.querySelector('.btn'); b.disabled = true;
    try {
      if (!user) { const { error } = await sb.auth.signInAnonymously(); if (error) throw error; await esperaUsuario(); }
      const id = await rpc('canjear_llave', { p_codigo: ev.target.c.value });
      if (!id) { avisa('Ese código no abre ningún buzón.', true); return; }
      location.hash = '#/b/' + id;
    } catch (e) { avisa(msgError(e), true); } finally { b.disabled = false; }
  };
}
const esperaUsuario = async () => { for (let i = 0; i < 20 && !user; i++) await new Promise((r) => setTimeout(r, 100)); };

// ---------- invitación ----------
async function vistaInvitacion(token) {
  if (!user) return vistaEntrada('crear', true);
  entrada('Te han invitado a un <em>buzón</em>', 'Para que sepan de quién son tus cartas, ponles tu firma.', `
    <p class="etq">Invitación</p><h2>¿Cómo quieres <em>firmar</em>?</h2>
    <form id="f"><label><span>Tu firma</span><input name="firma" maxlength="40" placeholder="Tu abuela Tere" required></label>
    <p class="ayuda">Así aparecerá al final de cada carta que escribas: «Tu abuela Tere», «Tu mejor amiga»…</p><button class="btn ancho">Aceptar la invitación</button></form>`);
  document.getElementById('f').onsubmit = async (ev) => {
    ev.preventDefault();
    try { const id = await rpc('aceptar_invitacion', { p_token: token, p_firma: ev.target.firma.value }); location.hash = '#/b/' + id; } catch (e) { avisa(msgError(e), true); }
  };
}

// ---------- inicio: mis buzones ----------
async function vistaInicio() {
  const filas = await leer(sb.from('miembros').select('id, rol, firma, buzones(id, nombre)').eq('user_id', user.id).eq('estado', 'activa'));
  const ROL = { dueno: 'Tuyo', escribe: 'Escribes', lee: 'Lees', receptor: 'Para ti', confianza: 'De confianza' };
  dentro(`<div><p class="etq">Tus buzones</p><h1>¿A cuál quieres <em>entrar</em>?</h1></div>
    <div class="lista">${filas.map((f) => `<button class="papel buzon-fila" data-id="${f.buzones.id}">${miniSobre}<span class="txt"><h3>El buzón de ${esc(f.buzones.nombre)}</h3></span><span class="sello">${ROL[f.rol] || f.rol}</span></button>`).join('') || '<div class="papel vacio"><span class="mini-sobre"><i></i></span><h3>Todavía no tienes ningún buzón</h3><p class="muted">Crea el primero aquí abajo.</p></div>'}</div>
    ${user.is_anonymous ? '' : `<form class="papel" id="f"><div><p class="etq">Un buzón nuevo</p><h2 style="margin-top:6px">¿Para quién es este <em>buzón</em>?</h2></div>
      <div class="placa"><p class="etq">Se llamará</p><p class="placa-nom" id="pn">El buzón de …</p></div>
      <label><span>Su nombre</span><input name="nombre" maxlength="40" placeholder="Su nombre" required autocomplete="off"></label>
      <label><span>Su cumpleaños · opcional</span><input type="date" name="cumple"></label>
      <p class="ayuda" style="margin-top:-8px">Sirve para las cartas «para cuando cumplas…».</p>
      <label><span>Cómo firmas tú</span><input name="firma" maxlength="40" placeholder="Mamá"></label>
      <button class="btn ancho">Crear el buzón</button></form>
      <p class="muted">¿Tienes una tarjeta con código? <a class="enlace" href="#/codigo">Úsala aquí</a>.</p>`}`);
  $app.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => (location.hash = '#/b/' + b.dataset.id)));
  const f = document.getElementById('f');
  if (f) {
    f.nombre.oninput = () => (document.getElementById('pn').textContent = 'El buzón de ' + (f.nombre.value.trim() || '…'));
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      try { const id = await rpc('crear_buzon', { p_nombre: f.nombre.value, p_cumpleanos: f.cumple.value || null, p_firma: f.firma.value }); location.hash = '#/b/' + id; } catch (e) { avisa(msgError(e), true); }
    };
  }
}

// ---------- tu letra: la fuente de cada persona que escribe ----------
const letras = new Map(); // id de persona → nombre de la fuente cargada (o null)
const letraTtf = new Map(); // id de persona → URL firmada de su .ttf (para el PDF)
const estiloLetra = (uid, extra = '') => { const f = letras.get(uid); return f && usaLetra() ? `font-family:'${f}', var(--hand), cursive;font-size:1.32em;line-height:1.5;${extra}` : ''; };
const usaLetra = () => localStorage.getItem('posdata.conletra') !== '0';
async function cargaLetras(ids) {
  const faltan = [...new Set(ids)].filter((i) => i && !letras.has(i));
  if (faltan.length) {
    try {
      const filas = await leer(sb.from('fuentes').select('user_id, ruta').in('user_id', faltan));
      const { data } = filas.length ? await sb.storage.from('fuentes').createSignedUrls(filas.map((f) => f.ruta), 3600) : { data: [] };
      const url = Object.fromEntries((data || []).map((x) => [x.path, x.signedUrl]));
      await Promise.all(filas.map(async (f) => {
        try { if (/\.ttf$/i.test(f.ruta)) letraTtf.set(f.user_id, url[f.ruta]); const fam = 'L' + f.ruta.split('/')[1].slice(0, 8); const ff = new FontFace(fam, `url(${url[f.ruta]})`); await ff.load(); document.fonts.add(ff); letras.set(f.user_id, fam); }
        catch { letras.set(f.user_id, null); }
      }));
    } catch (e) { console.warn('letras no disponibles', e); }
    faltan.forEach((i) => { if (!letras.has(i)) letras.set(i, null); });
  }
  return letras;
}

// ---------- la lamparita: escribir de noche, con una luz cálida y nada más ----------
const num = (k, d) => { const v = parseFloat(localStorage.getItem(k)); return isFinite(v) ? v : d; };
const luz = { brillo: () => num('posdata.luz.brillo', 70), calidez: () => num('posdata.luz.calidez', 55), haz: () => localStorage.getItem('posdata.luz.haz') || 'medio' };
const HACES = [['amplio', 'Amplio'], ['medio', 'Medio'], ['estrecho', 'Estrecho'], ['foco', 'Foco'], ['difuso', 'Difuso']];
function aplicaLuz() {
  const b = luz.brillo() / 100, w = luz.calidez() / 100, mezcla = (a, z) => Math.round(a + (z - a) * w);
  const r = document.documentElement.style;
  r.setProperty('--luz-rgb', `255,${mezcla(246, 168)},${mezcla(230, 78)}`);          // de blanco neutro a ámbar cálido
  r.setProperty('--luz-a1', (.14 + .58 * b).toFixed(2)); r.setProperty('--luz-a2', (.07 + .3 * b).toFixed(2)); r.setProperty('--luz-a3', (.02 + .12 * b).toFixed(2));
  r.setProperty('--hoja-brillo', (.8 + .2 * b).toFixed(2)); r.setProperty('--hoja-sepia', (.02 + .16 * w).toFixed(2));
  document.querySelectorAll('[data-haz]').forEach((e) => e.setAttribute('data-haz', luz.haz()));
}
aplicaLuz();
const lamparaModo = () => localStorage.getItem('posdata.lampara') || 'no';           // no | si | auto
const esDeNoche = () => { const h = new Date().getHours(); return h >= 21 || h < 7; };
const lamparaOn = () => premium() && lamparaModo() === 'si' || (premium() && lamparaModo() === 'auto' && esDeNoche());
const LAMPARAS = [['esmeralda', 'Esmeralda'], ['laton', 'Campana de latón'], ['opalina', 'Globo de opalina'], ['roja', 'Esmaltada roja'], ['tulipa', 'Tulipa de cristal']];
const lamparaEstilo = () => { const k = localStorage.getItem('posdata.luz.lampara'); return LAMPARAS.some((x) => x[0] === k) ? k : 'esmeralda'; };
const LAMPARA_PANTALLA = {
  esmeralda: (i) => `<defs><linearGradient id="lp-a${i}" x1="0" x2="1"><stop offset="0" stop-color="#1F2B25"/><stop offset=".45" stop-color="#3C5046"/><stop offset="1" stop-color="#17211C"/></linearGradient></defs>
    <path d="M70 90 Q110 80 150 90 L208 196 Q110 222 12 196 Z" fill="url(#lp-a${i})"/><path d="M84 98 Q96 96 100 100 L58 190" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="110" cy="198" rx="98" ry="15" fill="url(#lp-lat${i})"/><ellipse cx="110" cy="199" rx="90" ry="10" fill="#2A1D0C"/>`,
  laton: (i) => `<path d="M62 98 Q110 56 158 98 Q168 150 196 196 Q110 218 24 196 Q52 150 62 98Z" fill="url(#lp-lat${i})"/><path d="M76 100 Q86 80 104 70" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="5" stroke-linecap="round"/>
    <path d="M40 168 Q110 188 180 168" fill="none" stroke="#6B4F22" stroke-opacity=".5" stroke-width="2"/><ellipse cx="110" cy="198" rx="86" ry="12" fill="#7A5B27"/><ellipse cx="110" cy="199" rx="78" ry="8" fill="#2A1D0C"/>`,
  opalina: (i) => `<defs><radialGradient id="lp-b${i}" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#FFFDF4"/><stop offset=".6" stop-color="#F3E9CF"/><stop offset="1" stop-color="rgb(var(--luz-rgb))" stop-opacity=".9"/></radialGradient></defs>
    <rect x="92" y="84" width="36" height="22" rx="5" fill="#8A8A82"/><path d="M70 108 H150 L156 120 H64Z" fill="#B9B6A8"/>
    <circle cx="110" cy="168" r="56" fill="url(#lp-b${i})"/><ellipse cx="90" cy="148" rx="14" ry="22" fill="#fff" fill-opacity=".45" transform="rotate(25 90 148)"/>`,
  roja: (i) => `<defs><linearGradient id="lp-c${i}" x1="0" x2="1"><stop offset="0" stop-color="#7A1F18"/><stop offset=".4" stop-color="#C2392A"/><stop offset="1" stop-color="#6A1912"/></linearGradient></defs>
    <path d="M90 90 H130 L200 196 Q110 214 20 196 Z" fill="url(#lp-c${i})"/><path d="M96 98 L52 186" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="110" cy="197" rx="90" ry="12" fill="#F2EBDD"/><ellipse cx="110" cy="198" rx="82" ry="8" fill="#2A1D0C"/>`,
  tulipa: (i) => `<defs><linearGradient id="lp-d${i}" x1="0" x2="1"><stop offset="0" stop-color="#E9DDBE"/><stop offset=".5" stop-color="#FBF3DC"/><stop offset="1" stop-color="#DCCFA9"/></linearGradient></defs>
    <path d="M84 96 Q110 86 136 96 Q150 142 188 190 Q110 214 32 190 Q70 142 84 96Z" fill="url(#lp-d${i})" stroke="#BFA96E" stroke-width="1.5"/>
    <path d="M110 92 V204 M98 94 Q80 150 54 192 M122 94 Q140 150 166 192" fill="none" stroke="#BFA96E" stroke-opacity=".55" stroke-width="1.5"/>
    <ellipse cx="110" cy="196" rx="80" ry="11" fill="#CDB77C"/><ellipse cx="110" cy="198" rx="72" ry="7" fill="#2A1D0C"/>`,
};
const LAMPARA_SVG = (id, estilo = lamparaEstilo()) => `<svg viewBox="0 0 220 300" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lp-lat${id}" x1="0" x2="1"><stop offset="0" stop-color="#8A6A32"/><stop offset=".5" stop-color="#E2C27A"/><stop offset="1" stop-color="#7A5B27"/></linearGradient>
      <radialGradient id="lp-luz${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF6DC"/><stop offset=".45" stop-color="rgb(var(--luz-rgb))"/><stop offset="1" stop-color="rgb(var(--luz-rgb))" stop-opacity="0"/></radialGradient>
    </defs>
    <line x1="110" y1="-40" x2="110" y2="${estilo === 'opalina' ? 86 : 62}" stroke="#15110D" stroke-width="3.5"/>
    ${estilo === 'opalina' ? '' : `<rect x="98" y="58" width="24" height="26" rx="5" fill="url(#lp-lat${id})"/><rect x="95" y="80" width="30" height="7" rx="3" fill="#6B4F22"/>`}
    ${LAMPARA_PANTALLA[estilo](id)}
    <g class="bulbo"><ellipse cx="110" cy="${estilo === 'opalina' ? 214 : 206}" rx="70" ry="24" fill="url(#lp-luz${id})"/><circle cx="110" cy="${estilo === 'opalina' ? 168 : 203}" r="${estilo === 'opalina' ? 26 : 17}" fill="#FFF3D0" ${estilo === 'opalina' ? 'opacity=".7"' : ''}/><circle cx="110" cy="${estilo === 'opalina' ? 214 : 203}" r="26" fill="url(#lp-luz${id})" opacity=".8"/></g>
    ${id ? '' : `<g class="cordon" id="cordon" role="button" tabindex="0" aria-label="Apagar la lamparita"><line x1="196" y1="194" x2="196" y2="262" stroke="#3A2E1E" stroke-width="2"/><rect x="170" y="190" width="52" height="96" fill="transparent"/><circle cx="196" cy="270" r="9" fill="url(#lp-lat${id})" stroke="#5A431B" stroke-width="1"/></g>`}
  </svg>`;
function montaLampara() {
  if (document.getElementById('noche')) return;
  const n = document.createElement('div'); n.id = 'noche'; n.setAttribute('aria-hidden', 'true'); n.setAttribute('data-haz', luz.haz());
  n.innerHTML = `<div class="cono"></div>`;
  document.body.prepend(n);
  const f = document.createElement('div'); f.id = 'lampara-frente'; f.setAttribute('data-haz', luz.haz());
  f.innerHTML = `<div class="lampara">${LAMPARA_SVG('')}</div><p class="lampara-pista">Tira del cordón (o pulsa Esc) para apagar la luz y volver</p>`;
  document.body.append(f);
  const apaga = () => { fijaLampara(false); };
  f.querySelector('#cordon').addEventListener('click', apaga);
  f.querySelector('#cordon').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apaga(); } });
}
function cambiaLampara() { const l = document.querySelector('#lampara-frente .lampara'); if (l) l.innerHTML = LAMPARA_SVG('').replace('</svg>', '</svg>'); const c = document.getElementById('cordon'); if (c) { c.addEventListener('click', () => fijaLampara(false)); c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fijaLampara(false); } }); } }
function aplicaLampara(sonar = false) {
  const on = lamparaOn(); montaLampara();
  const n = document.getElementById('noche');
  if (on && !document.body.classList.contains('lampara')) { const fr = document.getElementById('lampara-frente'); for (const x of [n, fr]) x.classList.remove('enciende'); void n.offsetWidth; for (const x of [n, fr]) x.classList.add('enciende'); if (sonar) suena('interruptor'); }
  else if (!on && sonar && document.body.classList.contains('lampara')) suena('interruptor');
  document.body.classList.toggle('lampara', on);
  const b = document.getElementById('b-lampara'); if (b) { b.setAttribute('aria-pressed', on); b.title = on ? 'Apagar la lamparita' : 'Encender la lamparita'; b.setAttribute('aria-label', b.title); }
  if (on) window.scrollTo({ top: 0 });
}
function fijaLampara(si) { localStorage.setItem('posdata.lampara', si ? 'si' : 'no'); aplicaLampara(true); }
addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('lampara')) fijaLampara(false); });

// ---------- un buzón ----------
let pestana = 'escribir';
const TITULOS = {
  escribir: (rol, n) => rol === 'dueno' ? [`Escríbele a <em>${esc(n)}</em>`, 'Hoy, mañana, cuando te acuerdes. Se queda guardado.'] : [`Una carta para <em>${esc(n)}</em>`, 'Llegará de una vez, con tu firma.'],
  cartas: (rol, n) => rol === 'receptor' ? ['Tus <em>cartas</em>', 'Las que ya te esperan.'] : rol === 'dueno' ? [`Lo que le has <em>escrito</em>`, 'Todo lo que hay en el buzón de ' + n + '.'] : rol === 'escribe' ? ['Tus <em>cartas</em>', 'Las que has escrito para ' + n + '.'] : ['Las <em>cartas</em>', 'Lo que ya está sellado.'],
  cintas: (rol, n) => rol === 'dueno' ? [`Las canciones de su <em>vida</em>`, 'Una cinta por cada etapa, con tu frase en cada canción.'] : [`Las canciones de <em>tu vida</em>`, 'Cada una con la frase de por qué es tuya.'],
  temas: () => ['Los <em>temas</em>', 'Para ordenar las cartas y que sea fácil encontrarlas.'],
  familia: () => ['Quién tiene la <em>llave</em>', 'Tu familia, la tarjeta de quien recibe y la persona de confianza.'],
};
const TEMAS_SUGERIDOS = ['Reflexiones', 'Frases', 'Consejos', 'Recuerdos', 'Lo que he aprendido', 'Cuando estés mal', 'Anécdotas'];
const ICONO = {
  lampara: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 3.5h7l3.5 8.5H5z"/><path d="M12 12v6.5M8 21h8"/><path d="M10 15.2h4" opacity=".5"/></svg>',
  sonido: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  silencio: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  persona: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20c.9-3.6 3.9-5.6 7.5-5.6s6.6 2 7.5 5.6"/></svg>',
  libro: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7.5h6"/></svg>',
  foto: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.4"/><path d="M8 5l1.2-2h5.6L16 5"/></svg>',
  voz: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
};

async function vistaBuzon(id) {
  document.body.classList.remove('lampara');
  const [buzon] = await leer(sb.from('buzones').select('id, nombre').eq('id', id));
  const [yo] = await leer(sb.from('miembros').select('id, rol, firma, revisa').eq('buzon_id', id).eq('user_id', user.id));
  if (!buzon || !yo) { avisa('No tienes acceso a ese buzón.', true); location.hash = '#/'; return; }
  const rol = yo.rol;
  const pest = rol === 'dueno' ? [['escribir', 'Escribir'], ['cartas', 'Cartas'], ['cintas', 'Cintas'], ['temas', 'Temas'], ['familia', 'Familia']] : rol === 'escribe' ? [['escribir', 'Escribir'], ['cartas', 'Mis cartas'], ['cintas', 'Cintas']] : [['cartas', 'Cartas'], ['cintas', 'Cintas']];
  if (!pest.some((p) => p[0] === pestana)) pestana = pest[0][0];
  const volver = `<div class="cab"><a class="volver" href="#/" aria-label="Volver">←</a><span class="pildora">El buzón de ${esc(buzon.nombre)}</span></div>`;
  if (rol === 'confianza') { dentro(`${volver}<div class="centro vista"><p class="etq">Persona de confianza</p><h1>El buzón de <em>${esc(buzon.nombre)}</em></h1><p class="muted">Eres quien entrega las cartas si hace falta. No puedes leer ninguna: solo cuidar de que lleguen.</p></div>`); return; }
  const temas = await leer(sb.from('temas').select('id, nombre').eq('buzon_id', id).order('nombre'));
  const [h1, sub] = TITULOS[pestana](rol, buzon.nombre);
  dentro(`${volver}<div><p class="etq">${rol === 'receptor' || rol === 'dueno' ? 'Tu buzón' : 'Buzón'}</p><h1>${h1}</h1><p class="mano" style="margin-top:10px">${sub}</p></div>
    ${pest.length > 1 ? `<div class="pestanas">${pest.map((p) => `<button class="chip ${p[0] === pestana ? 'on' : ''}" data-p="${p[0]}">${p[1]}</button>`).join('')}</div>` : ''}<div id="panel" class="lista"></div>`);
  $app.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { pestana = b.dataset.p; vistaBuzon(id); }));
  const panel = document.getElementById('panel');
  if (pestana === 'escribir') pintaEscribir(panel, id, rol, buzon, yo, temas);
  else if (pestana === 'cartas') await pintaCartas(panel, id, rol, buzon, temas, yo);
  else if (pestana === 'cintas') await pintaCintas(panel, id, rol, buzon);
  else if (pestana === 'temas') await pintaTemas(panel, id, temas);
  else await pintaFamilia(panel, id);
}

// ---------- escribir (con polaroids, voz y temas) ----------
const GIROS = [-6, 5, -3, 7, -8, 4, -5, 6, -2, 8, -7, 3];
function pintaEscribir(panel, buzon, rol, b, yo, temas, edit = null) {
  const dueña = rol === 'dueno';
  const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let fotos = [], voz = null, grabando = null, temaSel = edit ? edit.carta.tema_id : null, cand = edit ? edit.carta.candado : 'ninguno';
  let borradorId = null, limpiaBorrador = async () => {};
  const estiloOriginal = edit ? normaliza(edit.carta) : null;
  let estilo = edit ? normaliza(edit.carta) : estiloInicial();
  const exFotos = edit ? edit.adjuntos.filter((a) => a.tipo === 'foto').map((a) => ({ ...a })) : [];
  let exVoz = edit ? edit.adjuntos.find((a) => a.tipo === 'audio') || null : null;
  const quitar = [];
  panel.innerHTML = `${edit ? '' : '<div id="b-lista"></div>'}<div class="mesa"><div class="pols" id="pols" aria-label="Fotos de la carta"></div>
    <form class="hoja" ${atributos(estilo)} id="f">
      <p class="etq fecha">${edit ? 'Editar esta carta · ' + esc(fechaLarga(edit.carta.dia)) : esc(hoy)}${edit ? '' : '<span class="b-estado" id="b-estado" aria-live="polite"></span>'}</p>
      <p class="mano para">Para ${esc(b.nombre)},</p>
      <input class="titulo" name="titulo" maxlength="80" placeholder="Un título (opcional)" value="${edit ? esc(edit.carta.titulo) : ''}">
      ${edit ? edit.partes.map((p, i) => `<label class="parte-ed"><span>${edit.partes.length > 1 ? 'Parte ' + (i + 1) : 'Tu carta'}</span><textarea data-parte="${p.id}" required>${esc(p.texto)}</textarea></label>`).join('') : `<textarea name="texto" required placeholder="${dueña ? 'Lo que querrías que supiera…' : 'Escribe aquí tu carta…'}"></textarea>`}
      ${yo.firma ? `<p class="mano firma-linea">${esc(yo.firma)}</p>` : ''}
      <div class="pie">
        <details class="papel-det"><summary><span>Papel y tinta</span><em class="muted" id="resumen-estilo"></em></summary>${selectorEstilo(estilo)}<button type="button" class="enlace" id="estilo-defecto" style="margin-top:12px">Usar este papel en mis cartas nuevas</button></details>
        <div><p class="lbl" style="margin-bottom:8px">Tema</p><div class="chips" id="temas"></div></div>
        <div><p class="lbl" style="margin-bottom:8px">Añadir a la carta</p>
          <div class="fila"><button type="button" class="herr" id="b-foto">${ICONO.foto} Foto</button>${haySoporteDeVoz() ? `<button type="button" class="herr" id="b-voz">${ICONO.voz} Grabar voz</button>` : ''}</div>
          <input type="file" id="i-foto" accept="image/*" multiple hidden>
          <div id="voz-zona"></div></div>
        ${edit ? `${edit.carta.candado === 'fecha' ? `<label><span>Se abre el</span><input type="date" name="abre" value="${esc(edit.carta.abre_el)}"></label>` : ''}${edit.carta.candado === 'momento' ? `<label><span>Para cuando…</span><input name="momento" maxlength="60" value="${esc(edit.carta.momento)}"></label>` : ''}<p class="ayuda">Quien recibe aún no puede leerla, así que puedes cambiarla hasta entonces. Cuando pueda, quedará fija y solo podrás añadirle una P. D.</p>` : dueña ? `<div><p class="lbl" style="margin-bottom:8px">Candado</p><div class="chips" id="cands">
          <button type="button" class="chip on" data-c="ninguno">Sin candado</button><button type="button" class="chip" data-c="fecha">Se abre en una fecha</button><button type="button" class="chip" data-c="momento">Se abre en un momento</button></div>
          <p class="ayuda" id="ay" style="margin-top:8px">Sin candado: es la carta de hoy. Puedes seguir añadiendo y se sella sola a medianoche.</p></div>
          <label id="l-fecha" hidden><span>Se abre el</span><input type="date" name="abre"></label>
          <label id="l-momento" hidden><span>Para cuando…</span><input name="momento" maxlength="60" placeholder="Cuando estés triste"></label>` : `<p class="ayuda">${yo.revisa ? 'Tu carta pasará por revisión antes de sellarse.' : 'Tu carta se sellará al enviarla.'}</p>`}
        <div class="fila"><button class="btn" id="enviar">${edit ? 'Guardar los cambios' : dueña ? 'Guardar en el buzón' : 'Enviar la carta'}</button>${edit ? '<button type="button" class="enlace" id="cancelar">Cancelar</button>' : '<button type="button" class="btn sec" id="b-guardar">Guardar borrador</button>'}</div></div></form></div>`;
  document.getElementById('cancelar')?.addEventListener('click', () => vistaBuzon(buzon));
  const f = document.getElementById('f');
  const nombreDe = (lista, k) => (lista.find((x) => x[0] === k) || [])[1] || k;
  const resumenEstilo = (e) => `${nombreDe(COLORES_PAPEL, e.papel)} · ${nombreDe(TEXTURAS, e.textura).toLowerCase()} · ${nombreDe(HOJAS, e.hoja).toLowerCase()} · tinta ${nombreDe(TINTAS, e.tinta).toLowerCase()}`;
  const ponEstilo = (e) => { estilo = normaliza(e); poneAtributos(f, estilo); panel.querySelectorAll('.selector-estilo [data-capa]').forEach((x) => { const on = estilo[x.dataset.capa] === x.dataset.valor; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); const r = document.getElementById('resumen-estilo'); if (r) r.textContent = resumenEstilo(estilo); };
  enlazaSelector(panel, () => estilo, ponEstilo); ponEstilo(estilo);
  document.getElementById('estilo-defecto').onclick = async () => {
    try { await rpc('guardar_escritura', { p_papel: estilo.papel, p_textura: estilo.textura, p_hoja: estilo.hoja, p_tinta: estilo.tinta }); escrituraPerfil = { ...estilo }; }
    catch (e) { if (!(e?.code === 'PGRST202' || /guardar_escritura|schema cache/i.test(e?.message || ''))) return avisa(msgError(e), true); }   // sin la migración: solo en este dispositivo
    localStorage.setItem('posdata.escritura', JSON.stringify(estilo)); avisa('Listo: tus cartas nuevas empezarán con este papel y esta tinta.');
  };
  // la máquina de escribir: suena al teclear (y se puede apagar aquí mismo)
  precarga();
  f.querySelectorAll('textarea, input.titulo').forEach((el) => conMaquina(el, { margen: el.tagName === 'TEXTAREA' ? 58 : 0 }));
  f.insertAdjacentHTML('afterbegin', `<button type="button" class="sonido-btn" id="b-sonido"></button><button type="button" class="lampara-btn" id="b-lampara" aria-pressed="false">${ICONO.lampara}</button>`);
  document.getElementById('b-lampara').onclick = () => !premium() ? avisa('La lamparita es de Posdata completa.', true) : fijaLampara(!document.body.classList.contains('lampara'));
  aplicaLampara();
  const btS = document.getElementById('b-sonido');
  const pintaS = () => { const on = sonidoActivo(); btS.innerHTML = on ? ICONO.sonido : ICONO.silencio; btS.setAttribute('aria-pressed', on); btS.setAttribute('aria-label', on ? 'Silenciar la máquina de escribir' : 'Activar el sonido de la máquina de escribir'); btS.title = on ? 'Sonido de la máquina: sí' : 'Sonido de la máquina: no'; };
  pintaS(); btS.onclick = () => { fijaSonido(!sonidoActivo()); pintaS(); suena('retorno'); };

  // temas
  const pintaTemasChips = () => {
    const z = document.getElementById('temas');
    z.innerHTML = `<button type="button" class="chip ${temaSel ? '' : 'on'}" data-t="">Sin tema</button>${temas.map((t) => `<button type="button" class="chip ${temaSel === t.id ? 'on' : ''}" data-t="${t.id}">${esc(t.nombre)}</button>`).join('')}${dueña ? '<button type="button" class="chip nuevo" id="t-nuevo">+ Nuevo tema</button>' : ''}`;
    z.querySelectorAll('[data-t]').forEach((c) => (c.onclick = () => { temaSel = c.dataset.t || null; pintaTemasChips(); }));
    document.getElementById('t-nuevo')?.addEventListener('click', () => {
      const i = document.createElement('input'); i.className = 'tema-in'; i.maxLength = 40; i.placeholder = 'Nombre del tema'; document.getElementById('t-nuevo').replaceWith(i); i.focus();
      const crear = async () => { const n = i.value.trim(); if (!n) return pintaTemasChips(); try { const id = await rpc('crear_tema', { p_buzon: buzon, p_nombre: n }); temas.push({ id, nombre: n }); temas.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')); temaSel = id; } catch (e) { avisa(msgError(e), true); } pintaTemasChips(); };
      i.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); crear(); } if (e.key === 'Escape') pintaTemasChips(); };
      i.onblur = crear;
    });
  };
  pintaTemasChips();

  // polaroids (las que ya tenía la carta y las nuevas)
  const pintaPols = () => {
    const z = document.getElementById('pols');
    const todos = [...exFotos.map((p, i) => ({ ...p, k: 'e' + i })), ...fotos.map((p, i) => ({ ...p, k: 'n' + i }))];
    z.innerHTML = todos.map((p, i) => `<figure class="pol ${i % 2 ? 'der' : 'izq'}" style="--fila:${Math.floor(i / 2)};--r:${GIROS[i % GIROS.length]}deg" data-k="${p.k}"><button type="button" class="pol-x" aria-label="Quitar esta foto">×</button><img src="${p.url}" alt="Foto ${i + 1}"><figcaption>${p.k[0] === 'e' ? `<span class="mano">${esc(p.pie)}</span>` : `<input class="pol-pie" maxlength="80" placeholder="Un pie de foto…" value="${esc(p.pie)}" aria-label="Pie de la foto ${i + 1}">`}</figcaption></figure>`).join('');
    z.classList.toggle('hay', todos.length > 0);
    z.querySelectorAll('.pol').forEach((el) => {
      const k = el.dataset.k, i = +k.slice(1);
      el.querySelector('.pol-x').onclick = () => { if (k[0] === 'e') { quitar.push(exFotos[i].id); exFotos.splice(i, 1); } else { URL.revokeObjectURL(fotos[i].url); fotos.splice(i, 1); } pintaPols(); };
      const inp = el.querySelector('.pol-pie'); if (inp) inp.oninput = (e) => (fotos[i].pie = e.target.value);
    });
  };
  const iFoto = document.getElementById('i-foto');
  document.getElementById('b-foto').onclick = () => iFoto.click();
  iFoto.onchange = async () => {
    const nuevas = [...iFoto.files]; iFoto.value = '';
    for (const file of nuevas) {
      if (exFotos.length + fotos.length >= 12) { avisa('Máximo 12 fotos por carta.', true); break; }
      try { const r = await reducirFoto(file); fotos.push({ ...r, url: URL.createObjectURL(r.blob), pie: '' }); pintaPols(); } catch (e) { avisa(msgError(e), true); }
    }
  };

  // voz
  const zonaVoz = document.getElementById('voz-zona'), bVoz = document.getElementById('b-voz');
  const pintaVoz = () => {
    if (exVoz) { zonaVoz.innerHTML = `<div class="voz-fila">${reproductorHtml(exVoz.url, exVoz.duracion, 'Nota de voz')}<button type="button" class="enlace" id="v-quita">Quitar</button></div>`; activaReproductores(zonaVoz); document.getElementById('v-quita').onclick = () => { quitar.push(exVoz.id); exVoz = null; pintaVoz(); }; if (bVoz) bVoz.disabled = true; return; }
    if (voz) { zonaVoz.innerHTML = `<div class="voz-fila">${reproductorHtml(voz.url, voz.duracion, 'Tu nota de voz')}<button type="button" class="enlace" id="v-quita">Quitar</button></div>`; activaReproductores(zonaVoz); document.getElementById('v-quita').onclick = () => { URL.revokeObjectURL(voz.url); voz = null; pintaVoz(); }; if (bVoz) bVoz.disabled = true; }
    else { zonaVoz.innerHTML = ''; if (bVoz) bVoz.disabled = false; }
  };
  if (bVoz) bVoz.onclick = async () => {
    if (grabando) return;
    try {
      bVoz.disabled = true;
      zonaVoz.innerHTML = `<div class="grabando"><span class="punto"></span><b id="g-t">0:00</b><span class="muted">Grabando… habla con calma</span><button type="button" class="btn peq" id="g-para">Parar</button></div>`;
      grabando = await empezarGrabacion((s) => { const e = document.getElementById('g-t'); if (e) e.textContent = mmss(s); });
      document.getElementById('g-para').onclick = () => grabando.parar();
      const r = await grabando.terminado; grabando = null;
      if (r.duracion < 1 || !r.blob.size) { zonaVoz.innerHTML = ''; bVoz.disabled = false; return; }
      voz = { ...r, url: URL.createObjectURL(r.blob) }; pintaVoz();
    } catch (e) { grabando = null; zonaVoz.innerHTML = ''; bVoz.disabled = false; avisa(e?.name === 'NotAllowedError' ? 'Permite el micrófono en el navegador para grabar.' : msgError(e), true); }
  };

  if (edit) { pintaPols(); pintaVoz(); }
  cargaLetras([user.id]).then((m) => { const fam = m.get(user.id); if (fam && usaLetra()) f.querySelectorAll('textarea').forEach((t) => { t.style.fontFamily = `'${fam}', var(--serif)`; t.style.fontSize = '24px'; }); });

  // candado
  const AY = { ninguno: 'Sin candado: es la carta de hoy. Puedes seguir añadiendo y se sella sola a medianoche.', fecha: 'Se sella ya y se abrirá solo el día que elijas.', momento: 'Se sella ya. Quien recibe la abrirá cuando llegue ese momento.' };
  if (dueña) panel.querySelectorAll('[data-c]').forEach((c) => (c.onclick = () => { cand = c.dataset.c; panel.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === c)); document.getElementById('l-fecha').hidden = cand !== 'fecha'; document.getElementById('l-momento').hidden = cand !== 'momento'; document.getElementById('ay').textContent = AY[cand]; }));

  // enviar: primero se suben los archivos, luego se guarda la carta con todo junto
  f.onsubmit = async (ev) => {
    ev.preventDefault(); const bt = document.getElementById('enviar'); const txt = bt.textContent; bt.disabled = true;
    const subidos = [];
    try {
      const adjuntos = [];
      const sube = async (blob, mime, ext, extra) => {
        const ruta = `${buzon}/${user.id}/${crypto.randomUUID()}.${ext}`; subidos.push(ruta);
        bt.textContent = 'Subiendo archivos…';
        const { error } = await sb.storage.from('adjuntos').upload(ruta, blob, { contentType: mime, cacheControl: '3600', upsert: false });
        if (error) throw error; adjuntos.push({ ruta, mime, bytes: blob.size, ...extra });
      };
      for (const p of fotos) await sube(p.blob, p.mime, p.ext, { tipo: 'foto', pie: p.pie });
      if (voz) await sube(voz.blob, voz.mime, voz.ext, { tipo: 'audio', duracion: voz.duracion });
      bt.textContent = 'Guardando…';
      if (edit) {
        await rpc('editar_carta', { p_carta: edit.carta.id, p_titulo: f.titulo.value, p_textos: [...f.querySelectorAll('[data-parte]')].map((t) => ({ id: t.dataset.parte, texto: t.value })), p_abre_el: edit.carta.candado === 'fecha' ? f.abre.value || null : null, p_momento: edit.carta.candado === 'momento' ? f.momento.value : null, p_quitar: quitar, p_adjuntos: adjuntos, p_tema_id: temaSel, p_cambiar_tema: true });
        if (JSON.stringify(estilo) !== JSON.stringify(estiloOriginal)) await rpc('poner_papel', { p_carta: edit.carta.id, p_papel: estilo.papel, p_textura: estilo.textura, p_hoja: estilo.hoja, p_tinta: estilo.tinta });
        const rutas = edit.adjuntos.filter((a) => quitar.includes(a.id)).map((a) => a.ruta); if (rutas.length) sb.storage.from('adjuntos').remove(rutas).catch(() => {});
        avisa('Cambios guardados.'); pestana = 'cartas'; vistaBuzon(buzon); return;
      }
      const nuevaId = await rpc('escribir', { p_buzon: buzon, p_texto: f.texto.value, p_titulo: f.titulo.value, p_candado: cand, p_abre_el: cand === 'fecha' ? f.abre.value || null : null, p_momento: cand === 'momento' ? f.momento.value : null, p_adjuntos: adjuntos, p_tema_id: temaSel });
      if (!esDefecto(estilo)) { try { await rpc('poner_papel', { p_carta: nuevaId, p_papel: estilo.papel, p_textura: estilo.textura, p_hoja: estilo.hoja, p_tinta: estilo.tinta }); } catch (e) { avisa('La carta se ha guardado, pero no se ha podido poner el papel: ' + msgError(e), true); } }
      fotos.forEach((p) => URL.revokeObjectURL(p.url)); if (voz) URL.revokeObjectURL(voz.url);
      if (!edit) await limpiaBorrador();
      avisa(dueña ? 'Guardado en el buzón.' : 'Enviada.'); pestana = 'cartas'; vistaBuzon(buzon);
    } catch (e) {
      if (subidos.length) sb.storage.from('adjuntos').remove(subidos).catch(() => {});
      avisa(msgError(e), true); bt.disabled = false; bt.textContent = txt;
    }
  };
  // ---------- borradores: se guarda solo mientras escribes ----------
  if (!edit) {
  const clave = `posdata.borrador.${user.id}.${buzon}`;
  let tLocal, tServ, ultimoGuardado = '';
  const campos = () => ({ titulo: f.titulo.value, texto: f.texto.value, tema: temaSel, estilo: { ...estilo }, cand, abre: f.abre?.value || null, momento: f.momento?.value || '' });
  const hayAlgo = () => !!(f.titulo.value.trim() || f.texto.value.trim());
  const dice = (t) => { const e = document.getElementById('b-estado'); if (e) e.textContent = t ? '· ' + t : ''; };
  const hace = (ts) => { const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000); return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
  function guardaLocal() { if (hayAlgo()) localStorage.setItem(clave, JSON.stringify({ ...campos(), id: borradorId, ts: Date.now() })); else localStorage.removeItem(clave); }
  async function guardaServidor(explicito = false) {
    if (!hayAlgo()) return null;
    const c = campos(), firma = JSON.stringify(c);
    if (!explicito && firma === ultimoGuardado) return borradorId;
    try {
      const args = { p_buzon: buzon, p_id: borradorId, p_titulo: c.titulo, p_texto: c.texto, p_tema_id: c.tema, p_candado: c.cand, p_abre_el: c.cand === 'fecha' ? c.abre : null, p_momento: c.cand === 'momento' ? c.momento : null };
      try { borradorId = await rpc('guardar_borrador', { ...args, p_papel: c.estilo.papel, p_textura: c.estilo.textura, p_hoja: c.estilo.hoja, p_tinta: c.estilo.tinta }); } catch (e) { if (!/p_papel|p_textura|PGRST202|schema cache/i.test(e?.message || '') && e?.code !== 'PGRST202') throw e; borradorId = await rpc('guardar_borrador', args); }   // por si aún no está la migración del papel
      ultimoGuardado = firma; guardaLocal(); dice('borrador guardado'); return borradorId;
    } catch (e) { if (explicito) throw e; dice('guardado en este dispositivo'); return null; }
  }
  limpiaBorrador = async () => {
    clearTimeout(tLocal); clearTimeout(tServ); localStorage.removeItem(clave);
    if (borradorId) { try { await rpc('borrar_borrador', { p_id: borradorId }); } catch { /* ya no está */ } borradorId = null; }
  };
  function rellena(d) {
    f.titulo.value = d.titulo || ''; f.texto.value = d.texto || ''; temaSel = d.tema ?? d.tema_id ?? null; pintaTemasChips(); ponEstilo(d.estilo || d);
    cand = d.cand || d.candado || 'ninguno';
    if (dueña) { panel.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x.dataset.c === cand)); document.getElementById('l-fecha').hidden = cand !== 'fecha'; document.getElementById('l-momento').hidden = cand !== 'momento'; document.getElementById('ay').textContent = AY[cand]; f.abre.value = d.abre || d.abre_el || ''; f.momento.value = d.momento || ''; }
    ultimoGuardado = JSON.stringify(campos());
  }
  const alEscribir = () => { dice('sin guardar'); clearTimeout(tLocal); tLocal = setTimeout(() => { guardaLocal(); dice(borradorId ? 'sin guardar' : 'guardado en este dispositivo'); }, 300); clearTimeout(tServ); tServ = setTimeout(() => guardaServidor(), 2500); };
  ['input', 'change'].forEach((ev) => f.addEventListener(ev, alEscribir));
  panel.addEventListener('click', (e) => { if (e.target.closest('[data-c], [data-t], [data-capa], .pol-x')) alEscribir(); });
  const alSalir = () => { if (document.hidden) { guardaLocal(); if (hayAlgo()) guardaServidor(); } };
  document.addEventListener('visibilitychange', alSalir); addEventListener('pagehide', guardaLocal);

  // al abrir: retomar lo que había (este dispositivo) y listar los demás borradores
  const lista = document.getElementById('b-lista');
  const local = (() => { try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch { return null; } })();
  const pintaLista = async () => {
    let ds = []; const qb = (cols) => leer(sb.from('borradores').select(cols).eq('buzon_id', buzon).order('actualizado', { ascending: false }));
    try { ds = await qb('id, titulo, texto, tema_id, candado, abre_el, momento, actualizado' + COLS_ESTILO); } catch { try { ds = await qb('id, titulo, texto, tema_id, candado, abre_el, momento, actualizado'); } catch { /* sin borradores en el servidor */ } }
    ds = ds.filter((d) => d.id !== borradorId);
    lista.innerHTML = ds.length ? `<div class="papel b-lista"><p class="etq">Borradores · ${ds.length}</p>${ds.map((d) => `<div class="b-fila" data-bid="${d.id}"><div class="txt"><b>${esc(d.titulo || d.texto.trim().slice(0, 48) || 'Sin título')}</b><span class="muted">${esc(d.titulo ? d.texto.trim().slice(0, 60) : '')} ${hace(d.actualizado)}</span></div><button type="button" class="btn peq sec" data-seguir="${d.id}">Seguir</button><button type="button" class="enlace" data-borra-b="${d.id}">Borrar</button></div>`).join('')}</div>` : '';
    lista.querySelectorAll('[data-seguir]').forEach((x) => (x.onclick = async () => {
      const d = ds.find((k) => k.id === x.dataset.seguir);
      if (hayAlgo()) { try { await guardaServidor(true); } catch { /* queda en este dispositivo */ } }   // lo que había se guarda antes de cambiar
      borradorId = d.id; rellena(d); guardaLocal(); dice('borrador retomado'); window.scrollTo({ top: f.getBoundingClientRect().top + scrollY - 90, behavior: 'smooth' }); f.texto.focus(); pintaLista();
    }));
    lista.querySelectorAll('[data-borra-b]').forEach((x) => (x.onclick = async () => { if (!confirm('¿Borrar este borrador?')) return; try { await rpc('borrar_borrador', { p_id: x.dataset.borraB }); pintaLista(); } catch (e) { avisa(msgError(e), true); } }));
  };
  if (local && (local.titulo?.trim() || local.texto?.trim())) {
    borradorId = local.id || null; rellena(local);
    lista.insertAdjacentHTML('beforebegin', `<div class="papel b-banner" id="b-banner"><span>Has retomado tu borrador (${hace(local.ts)}).</span><button type="button" class="enlace" id="b-nueva">Empezar una carta nueva</button></div>`);
    document.getElementById('b-nueva').onclick = async () => { if (hayAlgo()) { try { await guardaServidor(true); } catch { /* sigue en este dispositivo */ } } borradorId = null; localStorage.removeItem(clave); rellena({}); document.getElementById('b-banner')?.remove(); dice(''); ultimoGuardado = ''; pintaLista(); };
  }
  pintaLista();
  document.getElementById('b-guardar').onclick = async (ev) => {
    const b = ev.currentTarget;
    if (!hayAlgo()) return avisa('Escribe algo y lo guardo como borrador.', true);
    b.disabled = true;
    try { await guardaServidor(true); const extra = (fotos.length || voz) ? ' Las fotos y la voz no se guardan en el borrador.' : ''; avisa('Borrador guardado. Sigue cuando quieras desde Escribir.' + extra); pintaLista(); }
    catch (e) { guardaLocal(); avisa('No se ha podido guardar en el servidor; queda en este dispositivo.', true); }
    b.disabled = false;
  };
  }

}

// ---------- cartas: lista con buscador y temas ----------
const SELLO = { abierta: ['Abierta hoy', ''], pendiente: ['Pendiente', 'pend'], sellada: ['Sellada', 'ok'], rechazada: ['Rechazada', 'pend'] };
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
async function pintaCartas(panel, buzon, rol, b, temas, yo) {
  const COLS = (conPapel) => `id, autor_id, firma, titulo, dia, estado, candado, abre_el, momento, abierta_en, tema_id,${conPapel ? ' papel, textura, hoja, tinta,' : ''} partes(id, orden, texto, posdata, creada_en), adjuntos(id, tipo)`;
  const consulta = (conPapel) => { let q = sb.from('cartas').select(COLS(conPapel)).eq('buzon_id', buzon).order('dia', { ascending: false }).order('creada_en', { ascending: false }); if (rol === 'escribe') q = q.eq('autor_id', user.id); return q; };
  let cartas; try { cartas = await leer(consulta(true)); } catch { cartas = await leer(consulta(false)); }   // sin la migración del papel, como antes
  await cargaLetras(cartas.map((c) => c.autor_id));
  const vistaCompacta = () => localStorage.getItem('posdata.vistaCartas') !== 'detallada';
  if (!cartas.length) { panel.innerHTML = `<div class="papel vacio"><span class="mini-sobre"><i></i></span><h3>${rol === 'receptor' ? 'Aún no hay cartas para ti' : 'Todavía no hay cartas'}</h3><p class="muted">${rol === 'receptor' ? 'Cuando se sellen, aparecerán aquí.' : 'La primera siempre es la más difícil. Empieza por una sola línea.'}</p></div>`; return; }
  const nTema = Object.fromEntries(temas.map((t) => [t.id, t.nombre]));
  const usados = temas.filter((t) => cartas.some((c) => c.tema_id === t.id));
  let q_ = '', tema_ = null;
  panel.innerHTML = `<div class="filtros"><label class="busca"><span class="sr">Buscar</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="buscar" type="search" placeholder="Buscar en las cartas…" autocomplete="off"></label>
    ${[...letras.values()].some(Boolean) ? `<div class="chips"><button class="chip ${usaLetra() ? 'on' : ''}" id="t-letra" aria-pressed="${usaLetra()}">Con la letra de quien escribe</button></div>` : ''}
    <div class="chips" id="f-vista"><button class="chip ${vistaCompacta() ? 'on' : ''}" data-vista="compacta">Compacta</button><button class="chip ${vistaCompacta() ? '' : 'on'}" data-vista="detallada">Detallada</button></div>
    ${usados.length ? `<div class="chips" id="f-temas"><button class="chip on" data-ft="">Todas</button>${usados.map((t) => `<button class="chip" data-ft="${t.id}">${esc(t.nombre)}</button>`).join('')}</div>` : ''}</div><div id="lista-c" class="lista"></div>`;
  const lista = panel.querySelector('#lista-c');
  const accionesCarta = (c, rol) => {
    const mia = c.autor_id === user.id && (rol === 'dueno' || rol === 'escribe');
    if (!mia) return '';
    const editable = c.estado === 'abierta' || c.estado === 'pendiente' || (c.estado === 'sellada' && ((c.candado === 'fecha' && c.abre_el > hoyLocal()) || (c.candado === 'momento' && !c.abierta_en)));
    if (editable) return `<div class="acciones"><button class="btn peq sec" data-editar="${c.id}">Editar esta carta</button><span class="cand">${c.estado === 'abierta' ? 'Es la carta de hoy: puedes cambiarla hasta que se selle.' : 'Quien la recibe aún no puede leerla.'}</span></div>`;
    if (rol === 'dueno' && c.estado === 'sellada') return `<div class="acciones" data-zona-pd="${c.id}"><button class="btn peq sec" data-pd="${c.id}">Añadir una P. D.</button><span class="cand">Ya se puede leer, así que queda fija. Una P. D. se añade debajo, con su fecha.</span></div>`;
    return '';
  };
  const expandidas = new Set(); let mesesAbiertos = null;
  const nombreMes = (k) => { const t = new Date(k + '-15T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const fechaMini = (dia) => { const d = new Date(dia + 'T12:00:00'); return `<span class="fecha-mini"><b>${d.getDate()}</b><span>${d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</span></span>`; };
  const tarjeta = (c) => {
    const partes = (c.partes || []).sort((x, y) => x.orden - y.orden);
    const cerrada = !partes.length, [etqLarga, cls] = SELLO[c.estado], compacta = vistaCompacta(), abierta = expandidas.has(c.id);
    // en la vista compacta solo se muestra el estado cuando es una excepción (las selladas son lo normal)
    const etq = compacta ? ({ abierta: 'Hoy', pendiente: 'Pendiente', rechazada: 'Rechazada' }[c.estado] || '') : etqLarga;
    const sello = etq ? `<span class="sello ${cls}">${etq}</span>` : '';
    const cand = c.candado === 'fecha' ? `Se abre el ${fechaLarga(c.abre_el)}` : c.candado === 'momento' ? `Para cuando… ${esc(c.momento)}` : '';
    const titulo = esc(c.titulo || (cerrada ? 'Una carta cerrada' : 'Sin título'));
    const nf = (c.adjuntos || []).filter((a) => a.tipo === 'foto').length, hayVoz = (c.adjuntos || []).some((a) => a.tipo === 'audio');
    const marcas = `${c.tema_id && nTema[c.tema_id] ? `<span class="tema-sello">${esc(nTema[c.tema_id])}</span>` : ''}${nf ? `<span class="marca-adj" title="${nf} foto${nf > 1 ? 's' : ''}">${ICONO.foto}${nf}</span>` : ''}${hayVoz ? `<span class="marca-adj" title="Nota de voz">${ICONO.voz}</span>` : ''}`;
    const icono = compacta ? fechaMini(c.dia) : miniSobre, fecha = compacta ? '' : `<span class="etq">${fechaLarga(c.dia)}</span>`;
    const cabeza = (cerr) => `${icono}<${cerr ? 'div' : 'span'} class="txt">${fecha}<h3>${titulo}</h3>${cerr ? `<p class="cand">🔒 ${cand || 'Cerrada'}</p>` : (cand ? `<p class="cand">${cand}</p>` : '')}<span class="marcas">${marcas}</span></${cerr ? 'div' : 'span'}>${sello}`;
    return `<article class="papel carta ${compacta ? 'compacta' : ''} ${cerrada ? 'cerrada' : ''} ${abierta && !cerrada ? 'abierta' : ''}" data-c="${c.id}">
      ${cerrada ? `<div class="carta-cab">${cabeza(true)}</div>
        ${c.candado === 'momento' && rol === 'receptor' ? `<div class="acciones"><button class="btn peq" data-abrir="${c.id}">Romper el sello</button></div>` : ''}`
      : `<button class="carta-cab" data-abre="${c.id}" aria-expanded="${abierta}">${cabeza(false)}<span class="flecha">›</span></button>
        <div class="lee"><div>
          <div class="lectura" ${esDefecto(normaliza(c)) ? '' : atributos(normaliza(c))}><div class="adj" data-adj="${c.id}"></div><div class="texto" style="${estiloLetra(c.autor_id)}">${partes.map((p) => `<div class="parte ${p.posdata ? 'pd' : ''}">${p.posdata ? `<span class="mano pd-et">P. D. · ${fechaCorta(p.creada_en)}</span>` : ''}${esc(p.texto)}</div>`).join('')}${c.firma ? `<p class="mano firma" style="${estiloLetra(c.autor_id)}">${esc(c.firma)}</p>` : ''}</div><div class="adj-fotos" data-fotos="${c.id}"></div></div>
          ${accionesCarta(c, rol)}
          ${rol === 'dueno' ? `<label class="etiqueta"><span>Tema</span><select data-tema="${c.id}"><option value="">Sin tema</option>${temas.map((t) => `<option value="${t.id}" ${t.id === c.tema_id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></label>` : ''}
        </div></div>`}
      ${rol === 'dueno' && c.estado === 'pendiente' ? `<div class="acciones"><span class="cand" style="align-self:center">De ${esc(c.firma || 'alguien')}:</span><button class="btn peq" data-ok="${c.id}">Aprobar</button><button class="btn peq sec" data-no="${c.id}">Rechazar</button></div>` : ''}
    </article>`;
  };
  const coincide = (c) => {
    if (tema_ && c.tema_id !== tema_) return false;
    if (!q_) return true;
    const heno = sinTildes([c.titulo, c.firma, nTema[c.tema_id], c.momento, fechaLarga(c.dia), ...(c.partes || []).map((p) => p.texto)].join(' '));
    return q_.split(/\s+/).every((w) => heno.includes(w));
  };
  const rec = () => vistaBuzon(buzon);
  const pinta = () => {
    const vis = cartas.filter(coincide), filtrando = !!(q_ || tema_);
    const meses = [], porMes = new Map();
    vis.forEach((c) => { const k = c.dia.slice(0, 7); if (!porMes.has(k)) { porMes.set(k, []); meses.push(k); } porMes.get(k).push(c); });
    if (!mesesAbiertos) mesesAbiertos = new Set(meses.slice(0, 1));   // al empezar, solo el mes más reciente
    lista.innerHTML = vis.length ? meses.map((k) => { const l = porMes.get(k), abierto = filtrando || mesesAbiertos.has(k);
      return `<section class="mes ${abierto ? 'abierto' : ''}"><button type="button" class="mes-cab" data-mes="${k}" aria-expanded="${abierto}"><span>${nombreMes(k)}</span><b>${l.length}</b><span class="flecha">›</span></button>${abierto ? `<div class="mes-lista">${l.map(tarjeta).join('')}</div>` : ''}</section>`; }).join('')
      : `<div class="papel vacio"><h3>No hay cartas así</h3><p class="muted">Prueba con otra palabra o con otro tema.</p></div>`;
    lista.querySelectorAll('[data-mes]').forEach((h) => (h.onclick = () => { const k = h.dataset.mes; if (mesesAbiertos.has(k)) mesesAbiertos.delete(k); else mesesAbiertos.add(k); pinta(); }));
    lista.querySelectorAll('[data-abre]').forEach((h) => (h.onclick = () => { const a = h.closest('.carta'); const on = a.classList.toggle('abierta'); h.setAttribute('aria-expanded', on); if (on) { expandidas.add(a.dataset.c); cargaAdjuntos(a); } else expandidas.delete(a.dataset.c); }));
    lista.querySelectorAll('.carta.abierta').forEach(cargaAdjuntos);
    const quiere = (sel, fn) => lista.querySelectorAll(sel).forEach((x) => (x.onclick = async () => { try { await fn(x); rec(); } catch (e) { avisa(msgError(e), true); } }));
    lista.querySelectorAll('[data-editar]').forEach((x) => (x.onclick = async () => {
      x.disabled = true;
      try {
        const c = cartas.find((k) => k.id === x.dataset.editar);
        const adjuntos = await adjuntosConUrl(c.id);
        window.scrollTo(0, 0);
        pintaEscribir(panel, buzon, rol, b, yo, temas, { carta: c, partes: (c.partes || []).slice().sort((p, q) => p.orden - q.orden), adjuntos });
      } catch (e) { x.disabled = false; avisa(msgError(e), true); }
    }));
    lista.querySelectorAll('[data-pd]').forEach((x) => (x.onclick = () => {
      const zona = lista.querySelector(`[data-zona-pd="${x.dataset.pd}"]`);
      zona.outerHTML = `<form class="pd-form" data-pd-form="${x.dataset.pd}"><label><span>Tu P. D.</span><textarea name="t" required placeholder="P. D.: se me olvidaba decirte que…"></textarea></label><div class="fila"><button class="btn peq">Añadir la P. D.</button><button type="button" class="enlace" data-pd-no>Cancelar</button></div></form>`;
      const fo = lista.querySelector(`[data-pd-form="${x.dataset.pd}"]`); conMaquina(fo.querySelector('textarea'), { margen: 58 }); fo.querySelector('textarea').focus();
      fo.querySelector('[data-pd-no]').onclick = rec;
      fo.onsubmit = async (ev) => { ev.preventDefault(); try { await rpc('anadir_posdata', { p_carta: x.dataset.pd, p_texto: fo.t.value }); avisa('P. D. añadida.'); rec(); } catch (e) { avisa(msgError(e), true); } };
    }));
    quiere('[data-abrir]', (x) => rpc('abrir_momento', { p_carta: x.dataset.abrir }));
    quiere('[data-ok]', async (x) => { await rpc('resolver_carta', { p_carta: x.dataset.ok, p_aprobar: true }); avisa('Aprobada.'); });
    quiere('[data-no]', async (x) => { await rpc('resolver_carta', { p_carta: x.dataset.no, p_aprobar: false }); avisa('Rechazada.'); });
    lista.querySelectorAll('[data-tema]').forEach((s) => (s.onchange = async () => { try { await rpc('etiquetar_carta', { p_carta: s.dataset.tema, p_tema: s.value || null }); const c = cartas.find((x) => x.id === s.dataset.tema); c.tema_id = s.value || null; avisa('Tema guardado.'); } catch (e) { avisa(msgError(e), true); } }));
  };
  pinta();
  panel.querySelectorAll('[data-vista]').forEach((c) => (c.onclick = () => { localStorage.setItem('posdata.vistaCartas', c.dataset.vista); panel.querySelectorAll('[data-vista]').forEach((x) => x.classList.toggle('on', x === c)); pinta(); }));
  panel.querySelector('#t-letra')?.addEventListener('click', (e) => { localStorage.setItem('posdata.conletra', usaLetra() ? '0' : '1'); e.currentTarget.classList.toggle('on', usaLetra()); e.currentTarget.setAttribute('aria-pressed', usaLetra()); pinta(); });
  panel.querySelector('#buscar').oninput = (e) => { q_ = sinTildes(e.target.value).trim(); pinta(); };
  panel.querySelectorAll('[data-ft]').forEach((c) => (c.onclick = () => { tema_ = c.dataset.ft || null; panel.querySelectorAll('[data-ft]').forEach((x) => x.classList.toggle('on', x === c)); pinta(); }));
}

const fechaCorta = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
const hoyLocal = () => new Date().toLocaleDateString('sv-SE');
async function adjuntosConUrl(cartaId) {
  const filas = await leer(sb.from('adjuntos').select('id, tipo, ruta, pie, duracion, orden').eq('carta_id', cartaId).order('orden'));
  if (!filas.length) return [];
  const { data, error } = await sb.storage.from('adjuntos').createSignedUrls(filas.map((f) => f.ruta), 3600);
  if (error) throw error;
  const u = Object.fromEntries(data.map((x) => [x.path, x.signedUrl]));
  return filas.map((f) => ({ ...f, url: u[f.ruta] }));
}

// Fotos y voz de una carta abierta: se piden al desplegarla.
async function cargaAdjuntos(art) {
  const z = art.querySelector('[data-adj]'), zf = art.querySelector('[data-fotos]'); if (!z || z.dataset.listo) return; z.dataset.listo = '1';
  try {
    const filas = await leer(sb.from('adjuntos').select('id, tipo, ruta, pie, duracion, orden').eq('carta_id', art.dataset.c).order('orden'));
    if (!filas.length) { z.remove(); zf?.remove(); return; }
    const { data: firmadas, error } = await sb.storage.from('adjuntos').createSignedUrls(filas.map((f) => f.ruta), 3600);
    if (error) throw error;
    const url = Object.fromEntries(firmadas.map((s) => [s.path, s.signedUrl]));
    const fotos = filas.filter((f) => f.tipo === 'foto'), voz = filas.find((f) => f.tipo === 'audio');
    art.classList.toggle('con-fotos', fotos.length > 0);
    // la voz arriba (para escucharla antes de leer); las fotos debajo del texto
    if (voz) { z.innerHTML = reproductorHtml(url[voz.ruta], voz.duracion, 'Nota de voz'); activaReproductores(z); } else z.remove();
    if (zf) {
      if (fotos.length) {
        zf.innerHTML = `<div class="pols-lee">${fotos.map((f, i) => `<figure class="pol" style="--r:${GIROS[i % GIROS.length]}deg"><img loading="lazy" src="${url[f.ruta]}" alt="${esc(f.pie || 'Foto de la carta')}">${f.pie ? `<figcaption class="mano">${esc(f.pie)}</figcaption>` : ''}</figure>`).join('')}</div>`;
        zf.querySelectorAll('.pols-lee .pol').forEach((p) => (p.onclick = () => ampliar(p.querySelector('img').src, p.querySelector('figcaption')?.textContent || '')));
      } else zf.remove();
    }
  } catch (e) { z.innerHTML = '<p class="muted">No se han podido cargar las fotos y la voz.</p>'; console.error(e); }
}
function ampliar(src, pie) {
  const o = document.createElement('div'); o.className = 'visor'; o.innerHTML = `<figure class="pol grande"><img src="${src}" alt="${esc(pie || 'Foto')}">${pie ? `<figcaption class="mano">${esc(pie)}</figcaption>` : ''}</figure>`;
  const cierra = () => { o.remove(); removeEventListener('keydown', tecla); }; const tecla = (e) => e.key === 'Escape' && cierra();
  o.onclick = cierra; addEventListener('keydown', tecla); document.body.append(o);
}

// ---------- la memoria: todo el buzón en un PDF ----------
async function vistaMemoria(id) {
  const [buzon] = await leer(sb.from('buzones').select('id, nombre').eq('id', id));
  const [yo] = await leer(sb.from('miembros').select('rol').eq('buzon_id', id).eq('user_id', user.id));
  if (!buzon || !yo || yo.rol === 'confianza') { avisa('No tienes acceso a ese buzón.', true); location.hash = '#/'; return; }
  const esDueña = yo.rol === 'dueno', esReceptor = yo.rol === 'receptor';
  dentro(`<div class="cab"><a class="volver" href="#/b/${id}" aria-label="Volver">←</a><span class="pildora">El buzón de ${esc(buzon.nombre)}</span></div><div class="centro vista"><p class="etq">Memoria</p><h1>Preparando <em>tu memoria</em></h1><p class="muted">Reuniendo las cartas y las fotos…</p></div>`);
  try {
    const [temas, todas] = await Promise.all([
      leer(sb.from('temas').select('id, nombre').eq('buzon_id', id)),
      (async () => { const q = (p) => sb.from('cartas').select(`id, firma, titulo, dia, estado, candado, abre_el, momento, tema_id, creada_en, autor_id,${p ? ' papel, textura, hoja, tinta,' : ''} partes(orden, texto, posdata, creada_en), adjuntos(id, tipo, ruta, pie, duracion, orden)`).eq('buzon_id', id).order('dia', { ascending: true }).order('creada_en', { ascending: true }); try { return await leer(q(true)); } catch { return await leer(q(false)); } })(),
    ]);
    await cargaLetras(todas.map((c) => c.autor_id));
    const nTema = Object.fromEntries(temas.map((t) => [t.id, t.nombre]));
    const cartas = todas.filter((c) => c.estado !== 'rechazada' && (c.partes || []).length);
    const cerradas = todas.filter((c) => c.estado !== 'rechazada' && !(c.partes || []).length).length;
    const rutas = cartas.flatMap((c) => (c.adjuntos || []).filter((a) => a.tipo === 'foto').map((a) => a.ruta));
    const url = {};
    for (let i = 0; i < rutas.length; i += 80) {
      const { data, error } = await sb.storage.from('adjuntos').createSignedUrls(rutas.slice(i, i + 80), 3600);
      if (error) throw error; data.forEach((x) => (url[x.path] = x.signedUrl));
    }
    const nombre = esc(buzon.nombre);
    const largo = (d) => fechaLarga(d);
    const rango = cartas.length ? `${largo(cartas[0].dia)}${cartas.length > 1 ? ' — ' + largo(cartas[cartas.length - 1].dia) : ''}` : '';
    const hoyTxt = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    const art = (c) => {
      const partes = (c.partes || []).slice().sort((x, y) => x.orden - y.orden);
      const fotos = (c.adjuntos || []).filter((a) => a.tipo === 'foto').sort((x, y) => x.orden - y.orden);
      const voz = (c.adjuntos || []).find((a) => a.tipo === 'audio');
      const aviso = c.estado === 'pendiente' ? 'Pendiente de aprobar' : (esDueña && c.candado === 'fecha' && c.abre_el > hoyLocal()) ? `Se abrirá el ${largo(c.abre_el)}` : (esDueña && c.candado === 'momento' && !c.abierta_en) ? `Para cuando… ${c.momento}` : '';
      return `<article class="mem-carta" ${esDefecto(normaliza(c)) ? '' : atributos(normaliza(c))}><p class="etq">${esc(largo(c.dia))}${c.tema_id && nTema[c.tema_id] ? ' · ' + esc(nTema[c.tema_id]) : ''}${aviso ? ' · ' + esc(aviso) : ''}</p>
        <h2>${esc(c.titulo || 'Sin título')}</h2>
        <div class="mem-texto" style="${estiloLetra(c.autor_id)}">${partes.map((p) => `<div class="mem-parte ${p.posdata ? 'pd' : ''}">${p.posdata ? `<span class="mano pd-et">P. D. · ${esc(fechaCorta(p.creada_en))}</span>` : ''}${esc(p.texto)}</div>`).join('')}</div>
        ${c.firma ? `<p class="mano mem-firma" style="${estiloLetra(c.autor_id)}">${esc(c.firma)}</p>` : ''}
        ${fotos.length ? `<div class="mem-fotos">${fotos.map((f, i) => `<figure class="pol" style="--r:${GIROS[i % GIROS.length] / 2}deg"><img src="${url[f.ruta]}" alt="${esc(f.pie || 'Foto de la carta')}">${f.pie ? `<figcaption class="mano">${esc(f.pie)}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}
        ${voz ? `<p class="mem-voz">${ICONO.voz} Nota de voz de ${mmss(voz.duracion || 0)} · se escucha en la app</p>` : ''}</article>`;
    };
    document.title = `Posdata · El buzón de ${buzon.nombre}`;
    dentro(`<div class="memoria">
      <div class="mem-barra no-print"><a class="volver" href="#/b/${id}" aria-label="Volver">←</a>
        <div class="mem-barra-txt"><b>Tu memoria está lista</b><span class="muted">${cartas.length} carta${cartas.length === 1 ? '' : 's'}${cerradas ? ` · ${cerradas} aún cerrada${cerradas === 1 ? '' : 's'}, no se incluye${cerradas === 1 ? '' : 'n'}` : ''}. Descárgala como PDF o imprímela.</span></div>
        <button class="btn" id="m-pdf" disabled>Preparando el PDF…</button><button class="enlace" id="m-imp" type="button">Imprimir</button></div>
      <section class="mem-portada"><img class="mem-logo logo-os" src="posdata-logotipo-oscuro.svg" alt="Posdata"><img class="mem-logo logo-cl" src="posdata-logotipo-claro.svg" alt="" aria-hidden="true"><div><p class="etq">Una memoria de Posdata</p><h1>El buzón de <em>${nombre}</em></h1>
        <p class="mano">${esReceptor ? 'Todo lo que se escribió para ti.' : esDueña ? `Todo lo que has escrito para ${nombre}.` : 'Las cartas de este buzón.'}</p></div>
        <p class="etq">${cartas.length} carta${cartas.length === 1 ? '' : 's'}${rango ? ' · ' + esc(rango) : ''}<br>Preparada el ${esc(hoyTxt)}</p></section>
      ${cartas.length ? cartas.map(art).join('') : '<article class="mem-carta"><h2>Todavía no hay cartas que mostrar</h2></article>'}
    </div>`);
    const imgs = [...$app.querySelectorAll('.memoria img')];
    await Promise.all(imgs.map((i) => (i.complete ? 0 : new Promise((ok) => { i.onload = i.onerror = ok; }))));
    document.getElementById('m-imp').onclick = () => window.print();
    // El PDF de verdad se prepara de antemano, para que al pulsar se descargue (o se comparta) al instante.
    const b = document.getElementById('m-pdf');
    try {
      const cuadrada = async (u) => { const bm = await createImageBitmap(await (await fetch(u)).blob()); const L = Math.min(640, Math.min(bm.width, bm.height)), k = Math.max(L / bm.width, L / bm.height); const c = document.createElement('canvas'); c.width = c.height = L; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, L, L); x.drawImage(bm, (L - bm.width * k) / 2, (L - bm.height * k) / 2, bm.width * k, bm.height * k); return c.toDataURL('image/jpeg', 0.85); };
      const fuentesAutor = new Map();
      if (usaLetra()) for (const [uid, u] of letraTtf) if (cartas.some((c) => c.autor_id === uid)) { try { fuentesAutor.set(uid, await (await fetch(u)).arrayBuffer()); } catch {} }
      const datos = {
        nombre: buzon.nombre, esDueña, esReceptor, rango, hoyTxt, fuentesAutor, usaLetra: usaLetra(), usaMaquina: maquinaActiva(),
        cartas: await Promise.all(cartas.map(async (c) => {
          const partes = (c.partes || []).slice().sort((x, y) => x.orden - y.orden);
          const fotos = (c.adjuntos || []).filter((a) => a.tipo === 'foto').sort((x, y) => x.orden - y.orden);
          const voz = (c.adjuntos || []).find((a) => a.tipo === 'audio');
          const aviso = c.estado === 'pendiente' ? 'Pendiente de aprobar' : (esDueña && c.candado === 'fecha' && c.abre_el > hoyLocal()) ? `Se abrirá el ${largo(c.abre_el)}` : (esDueña && c.candado === 'momento' && !c.abierta_en) ? `Para cuando… ${c.momento}` : '';
          return { titulo: c.titulo, firma: c.firma, autorId: c.autor_id, estilo: normaliza(c), etiqueta: [largo(c.dia), c.tema_id && nTema[c.tema_id], aviso].filter(Boolean).join(' · '),
            partes: partes.map((p) => ({ texto: p.texto, posdata: p.posdata, cuando: fechaCorta(p.creada_en) })),
            fotos: await Promise.all(fotos.map(async (f) => ({ data: await cuadrada(url[f.ruta]), pie: f.pie }))), voz: voz ? mmss(voz.duracion || 0) : '' };
        })),
      };
      const blob = await creaPdf(datos);
      const archivo = `Posdata - El buzón de ${buzon.nombre}.pdf`.replace(/[\/:*?"<>|]/g, '');
      b.disabled = false; b.textContent = 'Descargar PDF';
      b.onclick = async () => { b.disabled = true; try { await entregaPdf(blob, archivo); } catch (e) { avisa('No se ha podido guardar el PDF.', true); console.error(e); } b.disabled = false; };
    } catch (e) { console.error(e); b.textContent = 'No se ha podido preparar'; avisa('No se ha podido preparar el PDF. Puedes usar «Imprimir».', true); }
  } catch (e) { avisa(msgError(e), true); console.error(e); location.hash = '#/b/' + id; }
}

// ---------- entrar en el ordenador con el móvil (código QR) ----------
const enOrdenador = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
const sha256hex = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const aleatorio = (n) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/[+/=]/g, '').slice(0, n * 1.3 | 0);
function etiquetaDispositivo() {
  const u = navigator.userAgent;
  const nav = /Edg\//.test(u) ? 'Edge' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'un navegador';
  const so = /Windows/.test(u) ? 'Windows' : /Mac OS X|Macintosh/.test(u) ? 'Mac' : /Android/.test(u) ? 'Android' : /Linux/.test(u) ? 'Linux' : 'un ordenador';
  return `${nav} en ${so}`;
}
// El QR: módulos redondeados, los tres cuadros de las esquinas en teja y el icono en el centro.
function qrSvg(texto) {
  const q = qrcode(0, 'Q'); q.addData(texto); q.make(); const n = q.getModuleCount(), m = 2, T = n + m * 2;
  const buscador = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const centro = Math.floor(n * .2), c0 = Math.floor((n - centro) / 2);
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!q.isDark(y, x) || buscador(x, y) || (x >= c0 && x < c0 + centro && y >= c0 && y < c0 + centro)) continue;
    d += `<rect x="${x + m + .06}" y="${y + m + .06}" width=".88" height=".88" rx=".3"/>`;
  }
  const marca = (x, y) => `<rect x="${x + m + .5}" y="${y + m + .5}" width="6" height="6" rx="1.6" fill="none" stroke="#C9512E" stroke-width="1"/><rect x="${x + m + 2}" y="${y + m + 2}" width="3" height="3" rx=".9" fill="#C9512E"/>`;
  const ic = centro * .92, p = m + c0 + (centro - ic) / 2;
  return `<svg viewBox="0 0 ${T} ${T}" role="img" aria-label="Código QR para entrar" xmlns="http://www.w3.org/2000/svg"><g fill="#1A1810">${d}</g>${marca(0, 0)}${marca(n - 7, 0)}${marca(0, n - 7)}<image href="icon-192.png" x="${p}" y="${p}" width="${ic}" height="${ic}"/></svg>`;
}

let qrVivo = 0;
async function vistaQr() {
  const mio = ++qrVivo;
  entrada(LEMA, SUB, `<p class="etq">Entrar en este ordenador</p><h2>Escanea el código con <em>tu móvil</em></h2>
    <div class="qr-zona"><div class="qr" id="qr"><div class="qr-svg" id="qr-svg"></div></div>
      <ol class="qr-pasos"><li>Abre Posdata en tu móvil.</li><li>Toca el círculo de arriba a la derecha y luego <b>«Entrar en un ordenador»</b>.</li><li>Apunta la cámara a este código.</li></ol></div>
    <div class="qr-barra"><i id="qr-barra"></i></div><p class="etq" id="qr-estado">Preparando el código…</p>
    <div class="pie-form fila entre"><button type="button" class="enlace" id="qr-correo">Entrar con correo y contraseña</button><a class="enlace" href="#/codigo">Tengo una tarjeta con código</a></div>`);
  document.getElementById('qr-correo').onclick = () => { qrVivo++; vistaEntrada('entrar'); };
  const vivo = () => mio === qrVivo && document.getElementById('qr-svg');
  while (vivo()) {
    const secreto = aleatorio(32); let codigo;
    try { codigo = await rpc('qr_crear', { p_secreto_hash: await sha256hex(secreto), p_dispositivo: etiquetaDispositivo() }); }
    catch (e) { if (vivo()) document.getElementById('qr-estado').textContent = 'El acceso por código QR aún no está activado. Entra con correo y contraseña.'; return; }
    if (!vivo()) return;
    document.getElementById('qr-svg').innerHTML = qrSvg(`${location.origin}${location.pathname}#/qr/${codigo}`);
    const t0 = Date.now(), TOTAL = 110000, barra = document.getElementById('qr-barra');
    barra.style.transition = 'none'; barra.style.transform = 'scaleX(1)'; void barra.offsetWidth; barra.style.transition = `transform ${TOTAL}ms linear`; barra.style.transform = 'scaleX(0)';
    let aprobado = null;
    while (vivo() && Date.now() - t0 < TOTAL && !aprobado) {
      const resto = Math.max(0, Math.ceil((TOTAL - (Date.now() - t0)) / 1000));
      document.getElementById('qr-estado').innerHTML = `El código se renueva en <b>${Math.floor(resto / 60)}:${String(resto % 60).padStart(2, '0')}</b> · ${codigo}`;
      try { const r = await rpc('qr_estado', { p_codigo: codigo, p_secreto: secreto }); if (r.estado === 'aprobada') aprobado = r.token_hash; if (r.estado === 'caducada') break; } catch { /* se reintenta */ }
      if (!aprobado) await new Promise((ok) => setTimeout(ok, 2000));
    }
    if (aprobado && vivo()) {
      document.getElementById('qr-estado').textContent = 'Aprobado desde el móvil. Entrando…';
      let { error } = await sb.auth.verifyOtp({ token_hash: aprobado, type: 'email' });
      if (error) ({ error } = await sb.auth.verifyOtp({ token_hash: aprobado, type: 'magiclink' }));
      if (error) { avisa('No se ha podido entrar. Inténtalo de nuevo o usa tu correo.', true); document.getElementById('qr-estado').textContent = 'No se ha podido entrar.'; return; }
      return;
    }
  }
}

// En el móvil: confirmar que se deja entrar a un ordenador.
async function vistaAprobarQr(codigo) {
  if (user.is_anonymous) { dentro(`<div class="centro vista"><p class="etq">Código QR</p><h1>Solo con <em>cuenta</em></h1><p class="muted">Dejar entrar a un ordenador es para cuentas con correo. Con la tarjeta no hace falta: se escribe el código en el ordenador.</p><a class="btn" href="#/">Volver</a></div>`); return; }
  dentro(`<div class="centro vista"><p class="etq">Código QR</p><h1>Un <em>momento</em></h1></div>`);
  let info;
  try { info = await rpc('qr_info', { p_codigo: codigo }); }
  catch (e) { dentro(`<div class="centro vista"><p class="etq">Código QR</p><h1>Este código ya <em>no vale</em></h1><p class="muted">Habrá caducado (duran dos minutos) o ya se usó. Mira el ordenador: se renueva solo.</p><a class="btn" href="#/perfil">Volver a mi perfil</a></div>`); return; }
  dentro(`<div class="centro vista"><p class="etq">Entrar en el ordenador</p><h1>¿Dejas entrar a <em>este ordenador</em>?</h1>
    <div class="papel" style="width:100%;max-width:420px;text-align:left"><p class="etq">Pide entrar</p><h3 style="margin:4px 0 8px">${esc(info.dispositivo || 'Un ordenador')}</h3><p class="muted">Con tu cuenta, ${esc(user.email)}.</p></div>
    <p class="muted"><b>Solo aprueba si lo estás pidiendo tú ahora mismo</b>, mirando ese ordenador. Si no, pulsa «No».</p>
    <div class="fila" style="justify-content:center"><button class="btn" id="q-si">Sí, es mi ordenador</button><button class="btn sec" id="q-no">No</button></div></div>`);
  document.getElementById('q-no').onclick = () => (location.hash = '#/perfil');
  document.getElementById('q-si').onclick = async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    try {
      const { error } = await sb.functions.invoke('qr-aprobar', { body: { codigo } });
      if (error) { let c = ''; try { c = (await error.context.json()).error; } catch {} const pasos = { qr_no_valido: 'Ese código ya no vale. Mira el ordenador: se renueva solo.', sin_cuenta: 'Para esto necesitas una cuenta con correo.' }; throw new Error(pasos[c] || (error.name === 'FunctionsFetchError' || /404|not found/i.test(error.message) ? 'El acceso por código QR aún no está activado en el servidor.' : 'No se ha podido aprobar. Inténtalo otra vez.')); }
      dentro(`<div class="centro vista"><p class="etq">Listo</p><h1>Ya puedes <em>mirar el ordenador</em></h1><p class="muted">Entrará en unos segundos. Puedes cerrar esto.</p><a class="btn" href="#/">Ir a mis buzones</a></div>`);
    } catch (e) { b.disabled = false; avisa(e.message, true); }
  };
}

// Escáner de cámara (móvil): lee el QR del ordenador.
async function abreEscaner() {
  const o = document.createElement('div'); o.className = 'escaner';
  o.innerHTML = `<div class="esc-cuerpo"><p class="etq" style="color:#fff">Apunta al código del ordenador</p><div class="esc-video"><video playsinline muted></video><i class="esc-marco"></i></div><p class="esc-msg" id="esc-msg"></p><button class="btn sec" id="esc-cerrar" style="color:#fff;border-color:#fff">Cancelar</button></div>`;
  document.body.append(o);
  const video = o.querySelector('video'), msg = o.querySelector('#esc-msg'); let flujo, vivo = true;
  const cierra = () => { vivo = false; flujo?.getTracks().forEach((t) => t.stop()); o.remove(); };
  o.querySelector('#esc-cerrar').onclick = cierra;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }); video.srcObject = flujo; await video.play();
    const { jsQR } = await import('./vendor/qrleer.mjs'); const lienzo = document.createElement('canvas'), x = lienzo.getContext('2d', { willReadFrequently: true });
    const mira = () => {
      if (!vivo) return;
      if (video.videoWidth) { lienzo.width = video.videoWidth; lienzo.height = video.videoHeight; x.drawImage(video, 0, 0); const r = jsQR(x.getImageData(0, 0, lienzo.width, lienzo.height).data, lienzo.width, lienzo.height);
        const m = r && (r.data.match(/#\/qr\/([A-Za-z0-9]{10})/) || r.data.match(/^([A-Za-z0-9]{10})$/));
        if (m) { cierra(); location.hash = '#/qr/' + m[1].toUpperCase(); return; } }
      requestAnimationFrame(mira);
    };
    mira();
  } catch (e) { msg.textContent = e?.name === 'NotAllowedError' ? 'Permite la cámara en el navegador para escanear. También puedes escribir el código a mano.' : 'No se ha podido abrir la cámara. Puedes escribir el código a mano.'; }
}

// ---------- perfil: cuenta, plan, tu letra, buzones y seguridad ----------
const MB = 1024 * 1024;
const AVISOS = [
  ['sellada', 'La carta del día se ha sellado', 'A las 23:59', 1, 0, false],
  ['cumple', 'Recordatorio de cumpleaños', 'Una semana antes, para escribirle', 1, 0, false],
  ['mes', 'Resumen del mes', 'Cuántas cartas has escrito', 0, 0, false],
  ['aprobar', 'Una carta espera tu visto bueno', 'De quien invitaste', 1, 1, true],
  ['acepta', 'Alguien acepta tu invitación', 'Y ya puede escribirle', 1, 0, false],
  ['entrega', 'Se entrega una carta programada', 'Para saber que llegó', 1, 1, false],
  ['abre', 'Quien recibe abre una carta tuya', 'Solo si tú quieres saberlo', 0, 0, false],
  ['nov', 'Novedades de Posdata', 'Pocas y con cuidado', 0, 0, false],
];

async function vistaPerfil() {
  const anon = !!user.is_anonymous;
  await hayMuestras;
  let p = { nombre: '', plan: 'prueba', plan_hasta: null, avisos: {} };
  for (const cols of ['nombre, plan, plan_hasta, avisos', 'nombre, plan, plan_hasta', 'nombre']) { try { const [fila] = await leer(sb.from('profiles').select(cols).eq('id', user.id)); if (fila) { p = { ...p, ...fila }; break; } } catch { /* esa columna aún no existe */ } }
  const filas = await leer(sb.from('miembros').select('rol, buzones(id, nombre)').eq('user_id', user.id).eq('estado', 'activa'));
  let tuFuente = null;
  if (!anon) { try { [tuFuente] = await leer(sb.from('fuentes').select('ruta, nombre').eq('user_id', user.id)); } catch {} }
  const ROL = { dueno: 'Tuyo', escribe: 'Escribes', lee: 'Lees', receptor: 'Para ti', confianza: 'De confianza' };
  const fecha = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const plan = anon ? null : p.plan === 'completa'
    ? { t: 'Posdata completa', pill: 'ok', l: [['Tipo', p.plan_hasta ? 'Con fecha de fin' : 'Pago único, sin suscripción'], ['Válido hasta', p.plan_hasta ? fecha(p.plan_hasta) : 'Para siempre']], d: 'Todos los buzones que quieras, tu voz en las cartas, fotos sin límite y canciones.' }
    : p.plan === 'gratis'
    ? { t: 'Gratis', pill: '', l: [['Tipo', 'Gratis'], ['Válido hasta', 'Sin caducidad']], d: 'Un buzón, cartas de texto y fotos limitadas. Leer y descargar todo es siempre gratis.' }
    : { t: 'Versión de prueba', pill: 'pend', l: [['Tipo', 'Prueba, todo incluido'], ['Válido hasta', 'Sin fecha todavía']], d: 'Mientras Posdata está en pruebas tienes todas las funciones. Los planes (gratis, y Posdata completa con pago único, sin suscripción) llegarán más adelante.' };
  dentro(`<div class="cab"><a class="volver" href="#/" aria-label="Volver">←</a><span class="pildora">Mi perfil</span></div>
    <div class="perfil-cab"><span class="avatar grande">${anon ? ICONO.persona : inicial(p.nombre || user.email)}</span>
      <div><p class="etq">${anon ? 'Entraste con tu tarjeta' : 'Tu cuenta'}</p><h1>${anon ? 'Tu <em>perfil</em>' : `Hola${p.nombre ? ', <em>' + esc(p.nombre) + '</em>' : ''}`}</h1>${anon ? '' : `<p class="muted">${esc(user.email)}</p>`}</div></div>
    ${anon ? '' : `<form class="papel" id="f-nombre"><div><p class="etq">Cuenta</p><h3 style="margin-top:4px">Cómo te llamamos</h3></div><label><span>Tu nombre</span><input name="n" maxlength="60" value="${esc(p.nombre)}" placeholder="Tu nombre" autocomplete="name"></label><div><button class="btn peq">Guardar</button></div></form>
    <div class="papel plan"><div class="fila entre"><div><p class="etq">Tu plan</p><h3 style="margin-top:4px">${plan.t}</h3></div><span class="sello ${plan.pill}">${p.plan === 'completa' ? 'Activo' : p.plan === 'gratis' ? 'Gratis' : 'En pruebas'}</span></div>
      <dl class="plan-datos">${plan.l.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl><p class="muted">${plan.d}</p>
      ${p.plan === 'completa' ? '' : '<div class="plan-comp"><div><b>Gratis</b><ul><li>Un buzón</li><li>Cartas de texto</li><li>Fotos limitadas</li><li>Leer y descargar todo, siempre</li></ul></div><div><b>Posdata completa</b><ul><li>Todos los buzones</li><li>Tu voz en las cartas</li><li>Fotos sin límite</li><li>Cintas de canciones</li></ul></div></div><button class="btn sec peq" disabled>Pasar a Posdata completa · pronto</button>'}</div>
    <div class="papel" id="letra"><div><p class="etq">Tu letra</p><h3 style="margin-top:4px">Escribe con tu propia letra</h3></div>
      <p class="muted">Cada carta que escribas se verá con tu letra de verdad, y también en la memoria en PDF. Quienes comparten el buzón la verán igual.</p>
      <p class="letra-muestra" id="l-muestra" hidden>Así se verá cada carta que escribas. Querida mía, hoy quería decirte algo.</p>
      <div class="fila"><label class="btn peq sec" for="l-archivo" id="l-sube">${tuFuente ? 'Cambiar mi letra' : 'Cargar mi letra'}</label><input type="file" id="l-archivo" accept=".ttf,.otf,.woff,.woff2" hidden>${tuFuente ? '<button class="enlace" id="l-quita">Quitar mi letra</button>' : ''}</div>
      <details class="como"><summary>¿Cómo consigo mi letra?</summary><ol><li>En <b>calligraphr.com</b> descarga la plantilla, imprímela y escribe a mano cada letra.</li><li>Escanea o haz una foto de la plantilla y súbela. Calligraphr crea tu fuente.</li><li>Descárgala como <b>.ttf</b> y cárgala aquí (hasta 3 MB).</li></ol></details></div>`}
    ${anon ? '' : `<div class="papel" id="escritura"><div><p class="etq">Escribir</p><h3 style="margin-top:4px">La máquina de escribir</h3></div>
      <p class="muted">Todo lo que escribes en una carta sale con la tipografía de una máquina de escribir antigua, y suena como ella.</p>
      <label class="interruptor"><span><b>Tipografía de máquina de escribir</b><em class="etq">Al escribir y al leer las cartas</em></span><input type="checkbox" id="sw-maquina" ${maquinaActiva() ? 'checked' : ''}></label>
      <label class="interruptor"><span><b>Sonido de las teclas</b><em class="etq">Teclas, espacio, timbre y retorno de carro</em></span><input type="checkbox" id="sw-sonido" ${sonidoActivo() ? 'checked' : ''}></label>
      <div><p class="lbl" style="margin-bottom:8px">Cómo suena</p><div class="chips" id="s-tipos">${Object.entries(TIPOS).map(([k, v]) => `<button type="button" class="chip ${tipoSonido() === k ? 'on' : ''}" data-tipo="${k}">${v.nombre}</button>`).join('')}</div></div>
      <label class="rango"><span>Volumen</span><input type="range" id="s-vol" min="10" max="100" step="5" value="${Math.round(volumen() * 100)}" aria-label="Volumen de la máquina de escribir"></label>
      <p class="maquina-prueba" id="m-prueba" tabindex="0">Pulsa aquí y prueba el sonido.</p></div>
    ${anon ? '' : `<div class="papel" id="papel-tinta"><div><p class="etq">Escribir</p><h3 style="margin-top:4px">Papel y tinta</h3></div>
      <p class="muted">Cómo se ven tus cartas. Elige el papel y la tinta con los que quieres empezar cada carta nueva; en la hoja siempre puedes cambiarlos.</p>
      <div class="chips" id="prev-modo"><button type="button" class="chip on" data-prev="dia">Vista previa: día</button><button type="button" class="chip" data-prev="noche">Vista previa: noche</button></div>
      <div class="prev-papel dia" id="prev-papel"><div class="hoja-muestra" id="hoja-muestra" ${atributos(estiloInicial())}><p>Querida lectora,<br>aquí la tinta es distinta.</p></div></div>
      <p class="etq" style="margin-top:0">Opciones iniciales para cartas nuevas</p>
      ${selectorEstilo(estiloInicial(), 'selector-perfil')}
      <p class="ayuda">El papel crema, el tipo original, la hoja rayada y la tinta negra son gratis. Lo demás viene con Posdata completa${premium() ? '' : ' (ahora aparece con candado)'}.</p></div>`}
    <div class="papel" id="luz-noche"><div><p class="etq">Escribir de noche</p><h3 style="margin-top:4px">Luz nocturna</h3></div>
      <p class="muted">Una lamparita retro para escribir con calma: cuelga delante de la hoja sin estorbar, baja la luz de la pantalla y esconde todo lo demás.${premium() ? '' : ' Es una función de Posdata completa.'}</p>
      <div><p class="lbl" style="margin-bottom:8px">Cuándo se enciende</p><div class="chips" id="l-modos">${[['no', 'Apagada'], ['si', 'Encendida'], ['auto', 'De noche (21:00 a 7:00)']].map(([k, n]) => `<button type="button" class="chip ${lamparaModo() === k ? 'on' : ''}" data-lmodo="${k}">${n}</button>`).join('')}</div><p class="ayuda" style="margin-top:6px">En la hoja de escribir, el botón de la lámpara también la enciende y apaga.</p></div>
      <div><p class="lbl" style="margin-bottom:8px">Tu lámpara</p><div class="muestras" id="l-lamparas">${LAMPARAS.map(([k, n]) => `<button type="button" class="muestra ${lamparaEstilo() === k ? 'on' : ''}" data-lamp="${k}" aria-pressed="${lamparaEstilo() === k}" aria-label="${n}"><span class="mini-lamp">${LAMPARA_SVG('m' + k, k)}</span><span>${n}</span>${k !== 'esmeralda' && !premium() ? '<u class="candado-p">🔒</u>' : ''}</button>`).join('')}</div></div>
      <div class="noche-prueba" id="noche-prueba" data-haz="${luz.haz()}" aria-hidden="true"><div class="cono"></div><div class="lampara">${LAMPARA_SVG('p')}</div><div class="hoja-prueba"><p>Una pequeña luz.<br>Una página tranquila.</p></div></div>
      <p class="etq" style="text-align:center">Vista previa</p>
      <div class="ajuste-luz"><div class="fila entre"><b>Brillo</b><span class="etq" id="v-brillo"></span></div><input type="range" id="luz-brillo" min="10" max="100" step="5" value="${luz.brillo()}" aria-label="Brillo de la luz"><div class="fila entre ayuda"><span>Tenue</span><span>Brillante</span></div></div>
      <div class="ajuste-luz"><div class="fila entre"><b>Calidez de la luz</b><span class="etq" id="v-calidez"></span></div><input type="range" id="luz-calidez" min="0" max="100" step="5" value="${luz.calidez()}" aria-label="Calidez de la luz"><div class="fila entre ayuda"><span>Neutra</span><span>Ámbar cálido</span></div></div>
      <div><p class="lbl" style="margin-bottom:8px">Forma del haz</p><div class="chips" id="l-haz">${HACES.map(([k, n]) => `<button type="button" class="chip ${luz.haz() === k ? 'on' : ''}" data-haz-op="${k}">${n}</button>`).join('')}</div></div></div>
    <div class="papel" id="avisos"><div><p class="etq">Avisos</p><h3 style="margin-top:4px">Qué te avisa</h3></div><p class="muted">Tú eliges qué llega y por dónde.</p>
      <div class="av-cab"><span></span><span class="etq">Móvil</span><span class="etq">Correo</span></div>
      ${AVISOS.map(([id, t, d, m, c, fijo]) => { const a = (p.avisos || {})[id] || {}; return `<div class="av-fila"><div><b>${t}</b><span class="etq">${d}${fijo ? ' · no se puede quitar' : ''}</span></div>${[['movil', m, 'en el móvil'], ['correo', c, 'por correo']].map(([k, def, txt]) => `<label class="tick"><input type="checkbox" data-av="${id}:${k}" ${(a[k] ?? !!def) || fijo ? 'checked' : ''} ${fijo ? 'disabled' : ''} aria-label="${t} ${txt}"></label>`).join('')}</div>`; }).join('')}
      <p class="muted nota-av">Por ahora solo guardamos tus preferencias: los avisos empezarán a enviarse más adelante. Los que no se pueden quitar es porque, si no te enteras, una carta se queda esperando.</p></div>`}
    ${anon ? '' : `<div class="papel" id="qr-perfil"><div><p class="etq">Ordenador</p><h3 style="margin-top:4px">Entrar en un ordenador</h3></div>
      <p class="muted">Abre Posdata en el ordenador, elige «Entrar con el código QR del móvil» y escanea aquí lo que veas. Entras sin escribir la contraseña.</p>
      <div class="fila"><button class="btn peq" id="qr-escanear">Escanear un código</button></div>
      <form class="fila" id="qr-manual"><input name="c" maxlength="10" placeholder="O escribe el código de 10 letras" autocomplete="off" autocapitalize="characters" style="flex:1;min-width:200px;font-family:var(--mono);font-style:normal;letter-spacing:.1em"><button class="btn peq sec">Usar</button></form></div>`}
    <div class="papel"><p class="etq">Tus buzones</p>${filas.length ? filas.map((f) => `<div class="persona"><span class="avatar">${inicial(f.buzones.nombre)}</span><div class="txt"><b>El buzón de ${esc(f.buzones.nombre)}</b><br><span class="muted">${ROL[f.rol] || f.rol}</span></div>${f.rol !== 'confianza' ? `<a class="enlace" href="#/b/${f.buzones.id}/memoria">Descargar memoria</a>` : ''}<a class="enlace" href="#/b/${f.buzones.id}">Abrir</a></div>`).join('') : '<p class="muted" style="margin-top:8px">Todavía no tienes ningún buzón.</p>'}</div>
    ${anon ? '' : `<form class="papel" id="f-clave"><div><p class="etq">Seguridad</p><h3 style="margin-top:4px">Cambiar la contraseña</h3></div><label><span>Nueva contraseña · mínimo 8</span><input type="password" name="c" minlength="8" required autocomplete="new-password"></label><div><button class="btn peq">Cambiar</button></div></form>
    <div class="papel proximamente"><p class="etq">Próximamente</p><ul><li>Copia automática en Google Drive</li><li>La memoria por correo</li><li>Libro impreso</li><li>Cintas de canciones</li></ul></div>`}
    <div class="fila"><button class="btn sec" id="p-salir">Cerrar sesión</button></div>`);
  document.getElementById('p-salir').onclick = async () => { await sb.auth.signOut(); location.hash = '#/'; };
  if (anon) return;
  document.getElementById('f-nombre').onsubmit = async (ev) => { ev.preventDefault(); const { error } = await sb.from('profiles').update({ nombre: ev.target.n.value.trim().slice(0, 60) }).eq('id', user.id); if (error) return avisa(msgError(error), true); nombrePerfil = ev.target.n.value.trim().slice(0, 60); pintaTop(); avisa('Guardado.'); vistaPerfil(); };
  document.getElementById('f-clave').onsubmit = async (ev) => { ev.preventDefault(); const { error } = await sb.auth.updateUser({ password: ev.target.c.value }); if (error) return avisa(msgError(error), true); ev.target.reset(); avisa('Contraseña cambiada.'); };
  { // papel y tinta: valores iniciales y vista previa de día y de noche
    let actual = estiloInicial(), tGuarda; const muestra = document.getElementById('hoja-muestra'), prev = document.getElementById('prev-papel');
    enlazaSelector(document.getElementById('selector-perfil'), () => actual, (e) => {
      actual = normaliza(e); poneAtributos(muestra, actual); clearTimeout(tGuarda);
      tGuarda = setTimeout(async () => {
        try { await rpc('guardar_escritura', { p_papel: actual.papel, p_textura: actual.textura, p_hoja: actual.hoja, p_tinta: actual.tinta }); escrituraPerfil = { ...actual }; }
        catch (er) { if (!(er?.code === 'PGRST202' || /guardar_escritura|schema cache/i.test(er?.message || ''))) return avisa(msgError(er), true); }
        localStorage.setItem('posdata.escritura', JSON.stringify(actual)); avisa('Guardado: tus cartas nuevas empezarán así.');
      }, 500);
    });
    document.getElementById('prev-modo').onclick = (ev) => { const b = ev.target.closest('[data-prev]'); if (!b) return; document.querySelectorAll('#prev-modo .chip').forEach((x) => x.classList.toggle('on', x === b)); prev.className = 'prev-papel ' + b.dataset.prev; };
  }
  document.getElementById('qr-escanear').onclick = abreEscaner;
  document.getElementById('qr-manual').onsubmit = (ev) => { ev.preventDefault(); const c = ev.target.c.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); if (c.length !== 10) return avisa('El código tiene 10 letras o números.', true); location.hash = '#/qr/' + c; };
  // máquina de escribir y avisos
  document.getElementById('sw-maquina').onchange = (e) => { fijaMaquina(e.target.checked); };
  document.getElementById('sw-sonido').onchange = (e) => { fijaSonido(e.target.checked); if (e.target.checked) suena('retorno'); };
  const toca = () => { suena('tecla', 'e'); setTimeout(() => suena('tecla', 'r'), 130); setTimeout(() => suena('espacio'), 250); setTimeout(() => suena('tecla', 'o'), 380); setTimeout(() => suena('retorno'), 560); };
  document.getElementById('s-tipos').onclick = (e) => { const t = e.target.closest('[data-tipo]'); if (!t) return; fijaTipo(t.dataset.tipo); document.querySelectorAll('#s-tipos .chip').forEach((x) => x.classList.toggle('on', x === t)); toca(); };
  document.getElementById('l-lamparas').onclick = (e) => {
    const b = e.target.closest('[data-lamp]'); if (!b) return;
    if (!premium()) return avisa('La lamparita y sus modelos son de Posdata completa.', true);
    localStorage.setItem('posdata.luz.lampara', b.dataset.lamp); document.querySelectorAll('#l-lamparas .muestra').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
    document.querySelector('#noche-prueba .lampara').innerHTML = LAMPARA_SVG('p'); cambiaLampara(); suena('interruptor');
  };
  document.getElementById('l-modos').onclick = (e) => { const b = e.target.closest('[data-lmodo]'); if (!b) return; if (!premium()) return avisa('La lamparita es de Posdata completa.', true); localStorage.setItem('posdata.lampara', b.dataset.lmodo); document.querySelectorAll('#l-modos .chip').forEach((x) => x.classList.toggle('on', x === b)); suena('interruptor'); };
  const rotulos = () => { const b = luz.brillo(), c = luz.calidez(); document.getElementById('v-brillo').textContent = b < 40 ? 'Tenue' : b < 75 ? 'Medio' : 'Intenso'; document.getElementById('v-calidez').textContent = c ? c + '% cálida' : 'Neutra'; };
  rotulos();
  document.getElementById('luz-brillo').oninput = (e) => { localStorage.setItem('posdata.luz.brillo', e.target.value); aplicaLuz(); rotulos(); };
  document.getElementById('luz-calidez').oninput = (e) => { localStorage.setItem('posdata.luz.calidez', e.target.value); aplicaLuz(); rotulos(); };
  document.getElementById('l-haz').onclick = (e) => { const h = e.target.closest('[data-haz-op]'); if (!h) return; localStorage.setItem('posdata.luz.haz', h.dataset.hazOp); document.querySelectorAll('#l-haz .chip').forEach((x) => x.classList.toggle('on', x === h)); aplicaLuz(); };
  let tVol; document.getElementById('s-vol').oninput = (e) => { fijaVolumen(e.target.value / 100); clearTimeout(tVol); tVol = setTimeout(() => suena('tecla', 'a'), 150); };
  const prueba = document.getElementById('m-prueba'); conMaquina(prueba); prueba.contentEditable = 'true'; prueba.spellcheck = false;
  let tAv; document.getElementById('avisos').addEventListener('change', (e) => {
    if (!e.target.dataset.av) return; clearTimeout(tAv);
    tAv = setTimeout(async () => {
      const o = {}; document.querySelectorAll('#avisos [data-av]').forEach((c) => { const [id, k] = c.dataset.av.split(':'); (o[id] ||= {})[k] = c.checked; });
      try { await rpc('guardar_avisos', { p_avisos: o }); avisa('Guardado.'); } catch (er) { avisa(msgError(er), true); }
    }, 350);
  });
  // la letra
  const muestra = document.getElementById('l-muestra');
  const enseña = async () => { const m = await cargaLetras([user.id]); const fam = m.get(user.id); if (fam) { muestra.hidden = false; muestra.style.fontFamily = `'${fam}', var(--hand)`; } };
  if (tuFuente) enseña();
  document.getElementById('l-archivo').onchange = async (ev) => {
    const file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
    const ext = (file.name.match(/\.(ttf|otf|woff2?)$/i) || [])[1]?.toLowerCase();
    const bt = document.getElementById('l-sube'), txt = bt.textContent; bt.textContent = 'Subiendo…';
    try {
      if (!ext) throw new Error('Esa letra no vale: usa un archivo .ttf, .otf, .woff o .woff2.');
      if (file.size > 3 * MB) throw new Error('Ese archivo pesa demasiado (máximo 3 MB).');
      const buf = await file.arrayBuffer();
      try { await new FontFace('Prueba', buf.slice(0)).load(); } catch { throw new Error('No se ha podido leer esa fuente. Prueba con el archivo .ttf.'); }
      const ruta = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from('fuentes').upload(ruta, new Blob([buf]), { contentType: 'font/' + (ext === 'ttf' ? 'ttf' : ext), upsert: false });
      if (error) throw error;
      const vieja = await rpc('guardar_fuente', { p_ruta: ruta, p_nombre: file.name.replace(/\.[^.]+$/, '').slice(0, 60), p_bytes: file.size });
      if (vieja) sb.storage.from('fuentes').remove([vieja]).catch(() => {});
      letras.delete(user.id); avisa('Listo: ya escribes con tu letra.'); vistaPerfil();
    } catch (e) { bt.textContent = txt; avisa(e.message && !/row-level|JWT|Failed/.test(e.message) && !e.statusCode ? e.message : msgError(e), true); }
  };
  document.getElementById('l-quita')?.addEventListener('click', async () => {
    if (!confirm('¿Quitar tu letra? Las cartas volverán a verse con la tipografía normal.')) return;
    try { const vieja = await rpc('quitar_fuente'); if (vieja) sb.storage.from('fuentes').remove([vieja]).catch(() => {}); letras.delete(user.id); avisa('Letra quitada.'); vistaPerfil(); } catch (e) { avisa(msgError(e), true); }
  });
}

// ---------- cintas: «las canciones de su vida» ----------
const COLORES_CINTA = ['#E8D9B5', '#D9A27C', '#B7C2A6', '#A9B8C8', '#D8B4B0', '#C9B8D4'];
const SUG_CINTA = ['Los veranos', 'Para dormir', 'Su primer año', 'Las fiestas', 'Para los días malos', 'Cuando eras bebé'];
let cintaAbierta = null, caraAbierta = 'A';
const casete = (titulo, color, lado = 'A') => `<div class="tape" style="--tc:${esc(color)}"><i class="tape-screw s1"></i><i class="tape-screw s2"></i><i class="tape-screw s3"></i><i class="tape-screw s4"></i><div class="tape-label"><span class="tape-side">${lado}</span><span class="tape-title">${esc(titulo)}</span><div class="tape-win"><i class="reel reel-l"></i><i class="tape-band"></i><i class="reel reel-r"></i></div></div><i class="tape-foot"></i></div>`;
const idSpotify = (u) => { const m = String(u || '').match(/^https:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/); return m ? m[1] : null; };
const busquedaSpotify = (c) => 'https://open.spotify.com/search/' + encodeURIComponent((c.titulo + ' ' + (c.artista || '')).trim());
const ordenadas = (cin, cara) => (cin.canciones || []).filter((c) => c.cara === cara).sort((x, y) => x.orden - y.orden);

async function pintaCintas(panel, buzon, rol, b) {
  const dueña = rol === 'dueno';
  if (cintaAbierta && cintaAbierta.buzon !== buzon) cintaAbierta = null;
  let cintas;
  try { cintas = await leer(sb.from('cintas').select('id, titulo, color, publicada, orden, canciones(id, cara, orden, titulo, artista, enlace, frase)').eq('buzon_id', buzon).order('orden').order('creada_en')); }
  catch (e) { console.warn(e); panel.innerHTML = '<div class="papel vacio"><span class="mini-sobre"><i></i></span><h3>Las cintas aún no están activadas</h3><p class="muted">Falta un paso en la base de datos. En cuanto se haga, aparecerán aquí.</p></div>'; return; }
  const rec = () => pintaCintas(panel, buzon, rol, b);
  const abierta = cintaAbierta && cintas.find((c) => c.id === cintaAbierta.id);
  if (abierta) return vistaCinta(panel, buzon, rol, b, abierta, rec);
  cintaAbierta = null;
  const total = cintas.reduce((n, c) => n + (c.canciones || []).length, 0);
  panel.innerHTML = `${cintas.length ? `<p class="etq">${cintas.length} cinta${cintas.length === 1 ? '' : 's'} · ${total} canci${total === 1 ? 'ón' : 'ones'}</p>` : ''}
    <div class="estante">${cintas.map((c) => `<button class="cinta-item" data-cinta="${c.id}" aria-label="${esc(c.titulo)}">${casete(c.titulo, c.color)}<span class="etq">${(c.canciones || []).length} canci${(c.canciones || []).length === 1 ? 'ón' : 'ones'}${dueña ? (c.publicada ? ' · lista para ' + esc(b.nombre) : ' · borrador') : ''}</span></button>`).join('')}
      ${dueña ? `<button class="cinta-item nueva" id="c-nueva"><span class="hueco">+</span><span class="etq">Una cinta nueva</span></button>` : ''}</div>
    ${!cintas.length && !dueña ? `<div class="papel vacio"><span class="mini-sobre"><i></i></span><h3>Aún no hay cintas</h3><p class="muted">Cuando se prepare una, aparecerá aquí.</p></div>` : ''}
    ${!cintas.length && dueña ? `<p class="muted">Una cinta por cada etapa de su vida: «Cuando eras bebé», «Los veranos», «Para los días malos»… Con las canciones y la frase de por qué son suyas.</p>` : ''}`;
  panel.querySelectorAll('[data-cinta]').forEach((x) => (x.onclick = () => { cintaAbierta = { buzon, id: x.dataset.cinta }; caraAbierta = 'A'; rec(); }));
  document.getElementById('c-nueva')?.addEventListener('click', () => formCinta(panel, buzon, rol, b, rec));
}

function formCinta(panel, buzon, rol, b, rec) {
  let color = COLORES_CINTA[0];
  panel.innerHTML = `<form class="papel" id="f-cinta"><div><p class="etq">Nueva</p><h3 style="margin-top:4px">Una cinta <em>nueva</em></h3></div>
    <div class="cinta-vista" id="cv">${casete('Mi cinta', color)}</div>
    <label><span>Cómo se llama</span><input name="t" maxlength="28" required placeholder="Los veranos en el pueblo" autocomplete="off"></label>
    <div class="chips">${SUG_CINTA.map((x) => `<button type="button" class="chip" data-sug="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div><p class="lbl" style="margin-bottom:8px">Color de la etiqueta</p><div class="colores">${COLORES_CINTA.map((c, i) => `<button type="button" style="--c:${c}" class="${i === 0 ? 'is-on' : ''}" data-col="${c}" aria-label="Color ${i + 1}"></button>`).join('')}</div></div>
    <div class="fila"><button class="btn">Crear la cinta</button><button type="button" class="enlace" id="c-cancel">Cancelar</button></div></form>`;
  const f = document.getElementById('f-cinta'), pinta = () => (document.getElementById('cv').innerHTML = casete(f.t.value.trim() || 'Mi cinta', color));
  f.t.oninput = pinta; f.t.focus();
  panel.querySelectorAll('[data-sug]').forEach((x) => (x.onclick = () => { f.t.value = x.dataset.sug; pinta(); }));
  panel.querySelectorAll('[data-col]').forEach((x) => (x.onclick = () => { color = x.dataset.col; panel.querySelectorAll('[data-col]').forEach((y) => y.classList.toggle('is-on', y === x)); pinta(); }));
  document.getElementById('c-cancel').onclick = rec;
  f.onsubmit = async (ev) => { ev.preventDefault(); try { const id = await rpc('crear_cinta', { p_buzon: buzon, p_titulo: f.t.value, p_color: color }); cintaAbierta = { buzon, id }; caraAbierta = 'A'; rec(); } catch (e) { avisa(msgError(e), true); } };
}

function vistaCinta(panel, buzon, rol, b, cin, rec) {
  const dueña = rol === 'dueno', hay = (cara) => ordenadas(cin, cara).length;
  const pinta = () => {
    const lista = ordenadas(cin, caraAbierta), otra = caraAbierta === 'A' ? 'B' : 'A';
    panel.innerHTML = `<button class="enlace" id="c-atras" style="justify-self:start">← Todas las cintas</button>
      <div class="deck"><p class="etq" style="text-align:center">Cinta · Cara ${caraAbierta}</p><div class="cinta-vista grande" id="cv">${casete(cin.titulo, cin.color, caraAbierta)}</div>
        <div class="deck-pie"><span class="etq">${hay('A') + hay('B')} de 12 canciones</span><button class="btn peq sec" id="c-flip">Dar la vuelta · Cara ${otra}</button></div></div>
      ${dueña ? `<form class="papel" id="f-nombre-c"><div class="fila entre"><div><p class="etq">La cinta</p><h3 style="margin-top:4px">Nombre y color</h3></div><button type="button" class="enlace" id="c-borra">Borrar la cinta</button></div>
        <label><span>Nombre</span><input name="t" maxlength="28" required value="${esc(cin.titulo)}"></label>
        <div class="colores">${COLORES_CINTA.map((c) => `<button type="button" style="--c:${c}" class="${c.toLowerCase() === cin.color.toLowerCase() ? 'is-on' : ''}" data-col="${c}" aria-label="Color"></button>`).join('')}</div>
        <label class="interruptor"><span><b>Lista para ${esc(b.nombre)}</b><em class="etq">${cin.publicada ? 'Ya puede escucharla' : 'Todavía es un borrador: solo la ves tú'}</em></span><input type="checkbox" id="c-publica" ${cin.publicada ? 'checked' : ''}></label>
        <div><button class="btn peq">Guardar el nombre</button></div></form>` : ''}
      <ol class="trks" id="trks">${lista.length ? lista.map((c, i) => `<li class="trk" data-id="${c.id}"><span class="n">${i + 1}</span><div class="m"><b>${esc(c.titulo)}</b>${c.artista ? `<span class="etq">${esc(c.artista)}</span>` : ''}${c.frase ? `<span class="mano">${esc(c.frase)}</span>` : ''}<div class="embed" hidden></div></div>
        <div class="acc"><button type="button" class="redondo" data-esc="${c.id}" aria-label="Escuchar ${esc(c.titulo)}" title="Escuchar">▶</button>${dueña ? `<button type="button" class="redondo peq" data-up="${c.id}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="redondo peq" data-dn="${c.id}" aria-label="Bajar" ${i === lista.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="redondo peq" data-sw="${c.id}" aria-label="Pasar a la cara ${otra}" title="Pasar a la cara ${otra}">⇄</button><button type="button" class="redondo peq" data-ed="${c.id}" aria-label="Editar" title="Editar">✎</button><button type="button" class="redondo peq" data-bo="${c.id}" aria-label="Quitar" title="Quitar">✕</button>` : ''}</div></li>`).join('') : `<li class="trk vacio-c"><span class="mano">${dueña ? `La cara ${caraAbierta} está vacía. Añade la primera canción.` : `La cara ${caraAbierta} está vacía.`}</span></li>`}</ol>
      ${dueña ? (lista.length < 6 ? `<div id="c-anadir"><button class="btn ancho" id="c-mas">Añadir una canción a la cara ${caraAbierta}</button></div>` : `<p class="muted" style="text-align:center">La cara ${caraAbierta} está llena (6 canciones).</p>`) : ''}
      <div class="papel"><p class="etq">Spotify</p><h3 style="margin-top:4px">Llevar esta cinta a <em>Spotify</em></h3>
        <p class="muted" style="margin:6px 0 12px">Copia las ${hay('A') + hay('B')} canciones en orden, cara A y luego cara B, y pégalas en una lista nueva de Spotify.</p>
        <button class="btn peq" id="sp-copiar" ${hay('A') + hay('B') ? '' : 'disabled'}>Copiar las canciones</button>
        <p class="ayuda" style="margin-top:10px">Crear la lista directamente en tu cuenta de Spotify llegará más adelante. Mientras tanto, cada canción tiene su botón ▶ para escucharla.</p></div>`;
    // navegación
    document.getElementById('c-atras').onclick = () => { cintaAbierta = null; rec(); };
    document.getElementById('c-flip').onclick = () => { const t = panel.querySelector('.tape'); t.classList.add('giro'); setTimeout(() => { caraAbierta = otra; pinta(); const n = panel.querySelector('.tape'); n.classList.add('giro'); requestAnimationFrame(() => requestAnimationFrame(() => n.classList.remove('giro'))); const l = document.getElementById('trks'); l?.classList.add('cambia'); }, 320); };
    // escuchar
    panel.querySelectorAll('[data-esc]').forEach((x) => (x.onclick = () => {
      const c = lista.find((k) => k.id === x.dataset.esc), li = x.closest('.trk'), em = li.querySelector('.embed'), sp = idSpotify(c.enlace);
      if (sp) { if (em.hidden) { em.innerHTML = `<iframe title="Spotify: ${esc(c.titulo)}" src="https://open.spotify.com/embed/track/${sp}?utm_source=generator" width="100%" height="80" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style="border-radius:12px"></iframe>`; em.hidden = false; x.textContent = '■'; } else { em.hidden = true; em.innerHTML = ''; x.textContent = '▶'; } }
      else window.open(c.enlace || busquedaSpotify(c), '_blank', 'noopener');
    }));
    document.getElementById('sp-copiar').onclick = async () => {
      const txt = [...ordenadas(cin, 'A'), ...ordenadas(cin, 'B')].map((c) => `${c.titulo}${c.artista ? ' - ' + c.artista : ''}`).join('\n');
      try { await navigator.clipboard.writeText(txt); avisa('Canciones copiadas. Pégalas en una lista nueva de Spotify.'); } catch { avisa('No se ha podido copiar.', true); }
    };
    if (!dueña) return;
    // nombre, color y publicar
    let color = cin.color;
    panel.querySelectorAll('[data-col]').forEach((x) => (x.onclick = () => { color = x.dataset.col; panel.querySelectorAll('.colores [data-col]').forEach((y) => y.classList.toggle('is-on', y === x)); document.getElementById('cv').innerHTML = casete(document.querySelector('#f-nombre-c [name=t]').value || cin.titulo, color, caraAbierta); }));
    document.getElementById('f-nombre-c').onsubmit = async (ev) => { ev.preventDefault(); try { await rpc('editar_cinta', { p_cinta: cin.id, p_titulo: ev.target.t.value, p_color: color }); avisa('Guardado.'); rec(); } catch (e) { avisa(msgError(e), true); } };
    document.getElementById('c-publica').onchange = async (e) => { try { await rpc('editar_cinta', { p_cinta: cin.id, p_publicada: e.target.checked }); avisa(e.target.checked ? `Ahora ${b.nombre} puede escucharla.` : 'Vuelve a ser un borrador.'); rec(); } catch (er) { e.target.checked = !e.target.checked; avisa(msgError(er), true); } };
    document.getElementById('c-borra').onclick = async () => { if (!confirm(`¿Borrar la cinta «${cin.titulo}» y sus canciones?`)) return; try { await rpc('borrar_cinta', { p_cinta: cin.id }); cintaAbierta = null; avisa('Cinta borrada.'); rec(); } catch (e) { avisa(msgError(e), true); } };
    // canciones
    const accion = (sel, fn) => panel.querySelectorAll(sel).forEach((x) => (x.onclick = async () => { try { await fn(x); rec(); } catch (e) { avisa(msgError(e), true); } }));
    accion('[data-up]', (x) => rpc('mover_cancion', { p_cancion: x.dataset.up, p_paso: -1 }));
    accion('[data-dn]', (x) => rpc('mover_cancion', { p_cancion: x.dataset.dn, p_paso: 1 }));
    accion('[data-sw]', (x) => rpc('cambiar_cara', { p_cancion: x.dataset.sw }));
    panel.querySelectorAll('[data-bo]').forEach((x) => (x.onclick = async () => { const c = lista.find((k) => k.id === x.dataset.bo); if (!confirm(`¿Quitar «${c.titulo}» de la cinta?`)) return; try { await rpc('borrar_cancion', { p_cancion: c.id }); rec(); } catch (e) { avisa(msgError(e), true); } }));
    const formCancion = (zona, c, alGuardar) => {
      zona.innerHTML = `<form class="papel f-cancion"><div><p class="etq">${c ? 'Editar' : 'Cara ' + caraAbierta}</p><h3 style="margin-top:4px">${c ? 'Cambiar la <em>canción</em>' : 'Añadir una <em>canción</em>'}</h3></div>
        <label><span>Canción</span><input name="t" maxlength="80" required value="${esc(c?.titulo || '')}" placeholder="Here Comes the Sun" autocomplete="off"></label>
        <label><span>Artista</span><input name="a" maxlength="80" value="${esc(c?.artista || '')}" placeholder="The Beatles" autocomplete="off"></label>
        <label><span>¿Por qué es suya?</span><input name="f" maxlength="120" value="${esc(c?.frase || '')}" placeholder="Sonaba el día que naciste" autocomplete="off"></label>
        <p class="ayuda" style="margin-top:-8px">Esta frase es lo que da valor a la canción: dentro de treinta años el enlace puede haber cambiado, tu frase no.</p>
        <label><span>Enlace de Spotify · opcional</span><input name="e" type="url" maxlength="300" value="${esc(c?.enlace || '')}" placeholder="https://open.spotify.com/track/…" autocomplete="off"></label>
        <p class="ayuda" style="margin-top:-8px">En Spotify: ••• → Compartir → Copiar enlace de la canción. Con él se escucha aquí mismo.</p>
        <div class="fila"><button class="btn">${c ? 'Guardar' : 'Grabar en la cinta'}</button><button type="button" class="enlace" data-no>Cancelar</button></div></form>`;
      const fo = zona.querySelector('form'); fo.t.focus(); fo.querySelector('[data-no]').onclick = pinta;
      fo.onsubmit = async (ev) => { ev.preventDefault(); try { await alGuardar(fo); rec(); } catch (e) { avisa(msgError(e), true); } };
    };
    document.getElementById('c-mas')?.addEventListener('click', () => { formCancion(document.getElementById('c-anadir'), null, (fo) => rpc('anadir_cancion', { p_cinta: cin.id, p_cara: caraAbierta, p_titulo: fo.t.value, p_artista: fo.a.value, p_enlace: fo.e.value || null, p_frase: fo.f.value })); });
    panel.querySelectorAll('[data-ed]').forEach((x) => (x.onclick = () => { const c = lista.find((k) => k.id === x.dataset.ed), li = x.closest('.trk'); li.classList.add('editando'); formCancion(li, c, (fo) => rpc('editar_cancion', { p_cancion: c.id, p_titulo: fo.t.value, p_artista: fo.a.value, p_enlace: fo.e.value, p_frase: fo.f.value, p_quitar_enlace: !fo.e.value.trim() })); }));
  };
  pinta();
}

// ---------- temas (la dueña los crea, renombra y borra) ----------
async function pintaTemas(panel, buzon, temas) {
  const cartas = await leer(sb.from('cartas').select('tema_id').eq('buzon_id', buzon));
  const cuenta = (id) => cartas.filter((c) => c.tema_id === id).length;
  const faltan = TEMAS_SUGERIDOS.filter((s) => !temas.some((t) => sinTildes(t.nombre) === sinTildes(s)));
  panel.innerHTML = `<form class="papel" id="nt"><div><p class="etq">Nuevo</p><h3 style="margin-top:4px">Crear un tema</h3></div>
      <div class="fila"><input name="n" maxlength="40" placeholder="Reflexiones, Frases, Consejos…" required style="flex:1;min-width:180px"><button class="btn">Añadir</button></div>
      ${faltan.length ? `<div><p class="lbl" style="margin-bottom:8px">O elige uno</p><div class="chips">${faltan.map((s) => `<button type="button" class="chip" data-sug="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div></div>` : ''}</form>
    <div class="papel"><p class="etq">Los de este buzón</p>${temas.length ? temas.map((t) => `<div class="persona" data-fila="${t.id}"><span class="avatar">${inicial(t.nombre)}</span><div class="txt"><b>${esc(t.nombre)}</b><br><span class="muted">${cuenta(t.id)} carta${cuenta(t.id) === 1 ? '' : 's'}</span></div><button class="enlace" data-ren="${t.id}">Renombrar</button><button class="enlace" data-bor="${t.id}">Borrar</button></div>`).join('') : '<p class="muted" style="margin-top:8px">Aún no hay ninguno. Crea el primero arriba.</p>'}</div>
    <p class="muted">Quien recibe las cartas podrá filtrarlas por estos temas y buscar entre ellas.</p>`;
  const rec = () => vistaBuzon(buzon);
  const crea = async (n) => { try { await rpc('crear_tema', { p_buzon: buzon, p_nombre: n }); rec(); } catch (e) { avisa(msgError(e), true); } };
  document.getElementById('nt').onsubmit = (ev) => { ev.preventDefault(); crea(ev.target.n.value); };
  panel.querySelectorAll('[data-sug]').forEach((c) => (c.onclick = () => crea(c.dataset.sug)));
  panel.querySelectorAll('[data-ren]').forEach((bt) => (bt.onclick = () => {
    const fila = panel.querySelector(`[data-fila="${bt.dataset.ren}"]`), t = temas.find((x) => x.id === bt.dataset.ren);
    fila.querySelector('.txt').innerHTML = `<input class="tema-in" maxlength="40" value="${esc(t.nombre)}" aria-label="Nuevo nombre">`; const i = fila.querySelector('input'); i.focus(); i.select();
    const guarda = async () => { const n = i.value.trim(); if (!n || n === t.nombre) return rec(); try { await rpc('renombrar_tema', { p_tema: t.id, p_nombre: n }); } catch (e) { avisa(msgError(e), true); } rec(); };
    i.onkeydown = (e) => { if (e.key === 'Enter') guarda(); if (e.key === 'Escape') rec(); }; i.onblur = guarda;
  }));
  panel.querySelectorAll('[data-bor]').forEach((bt) => (bt.onclick = async () => {
    const t = temas.find((x) => x.id === bt.dataset.bor); const n = cuenta(t.id);
    if (!confirm(`¿Borrar el tema «${t.nombre}»?${n ? `\n\nLas ${n} carta${n === 1 ? '' : 's'} que lo tienen no se borran: se quedan sin tema.` : ''}`)) return;
    try { await rpc('borrar_tema', { p_tema: t.id }); avisa('Tema borrado.'); rec(); } catch (e) { avisa(msgError(e), true); }
  }));
}

async function pintaFamilia(panel, buzon) {
  const miembros = await leer(sb.from('miembros').select('id, correo, rol, firma, revisa, estado, user_id').eq('buzon_id', buzon).order('created_at'));
  const ROL = { dueno: 'Tú', escribe: 'Escribe', lee: 'Lee', receptor: 'Recibe', confianza: 'De confianza' };
  panel.innerHTML = `<div class="papel"><p class="etq">La tarjeta de quien recibe</p><h3 style="margin:4px 0 6px">Su código de entrada</h3><p class="muted" style="margin-bottom:14px">Es el que se imprime en la tarjeta. Solo se muestra una vez: si generas otro, el anterior deja de funcionar.</p><div id="llave"></div><button class="btn peq" id="gl">Generar un código</button></div>
    <div class="papel"><p class="etq">Acceso</p><h3 style="margin:4px 0 8px">Quién puede entrar</h3>${miembros.map((m) => `<div class="persona"><span class="avatar">${inicial(m.firma || m.correo)}</span><div class="txt"><b>${esc(m.firma || m.correo || 'Sin firma')}</b><br><span class="muted">${esc(m.correo || '')}${m.rol === 'escribe' ? (m.correo ? ' · ' : '') + (m.revisa ? 'con revisión' : 'sin revisión') : ''}</span></div><span class="sello ${m.estado === 'invitada' ? 'pend' : ''}">${m.estado === 'invitada' ? 'Invitada' : ROL[m.rol]}</span>${m.rol !== 'dueno' ? `<button class="enlace" data-q="${m.id}">Quitar</button>` : ''}</div>`).join('')}</div>
    <form class="papel" id="inv"><div><p class="etq">Familia y amigos</p><h3 style="margin-top:4px">Invitar a alguien</h3></div>
      <label><span>Su correo</span><input type="email" name="correo" required placeholder="tere@correo.com"></label>
      <label><span>Qué puede hacer</span><select name="rol"><option value="escribe">Escribir cartas</option><option value="lee">Solo leer</option><option value="confianza">Persona de confianza (entrega, no lee)</option></select></label>
      <label><span>Cómo firmará</span><input name="firma" maxlength="40" placeholder="Tu abuela Tere"></label>
      <label class="check"><input type="checkbox" name="revisa" checked> Yo reviso sus cartas antes de que se sellen</label>
      <button class="btn">Crear la invitación</button><div id="enlace"></div></form>`;
  document.getElementById('gl').onclick = async () => { try { const c = await rpc('generar_llave', { p_buzon: buzon }); document.getElementById('llave').innerHTML = `<div class="ticket">${esc(c)}</div><p class="muted" style="margin:12px 0">Cópialo ahora; no se volverá a mostrar.</p>`; } catch (e) { avisa(msgError(e), true); } };
  panel.querySelectorAll('[data-q]').forEach((b) => (b.onclick = async () => {
    if (!confirm('¿Quitar el acceso a esta persona?\n\nSe borrarán también las cartas que haya escrito.')) return;
    try { await rpc('quitar_miembro', { p_miembro: b.dataset.q, p_borrar_cartas: true }); avisa('Acceso quitado.'); vistaBuzon(buzon); } catch (e) { avisa(msgError(e), true); }
  }));
  document.getElementById('inv').onsubmit = async (ev) => {
    ev.preventDefault(); const f = ev.target;
    try {
      const t = await rpc('invitar', { p_buzon: buzon, p_correo: f.correo.value, p_rol: f.rol.value, p_revisa: f.revisa.checked, p_firma: f.firma.value });
      const url = location.origin + location.pathname + '#invitar/' + t;
      document.getElementById('enlace').innerHTML = `<p class="muted" style="margin-top:6px">Manda este enlace a esa persona (caduca en 7 días):</p><div class="ticket enlace-url">${esc(url)}</div>`;
    } catch (e) { avisa(msgError(e), true); }
  };
}

// ---------- arranque ----------
sb.auth.onAuthStateChange((ev, s) => { if (ev === 'INITIAL_SESSION') return; const antes = user?.id; user = s?.user ?? null; if (antes !== user?.id) { nombrePerfil = null; ruta(); } });
const { data } = await sb.auth.getSession();
user = data.session?.user ?? null;
ruta();
