// Posdata · app real (versión 1): entrar, crear buzón, escribir, sellar, leer.
import { createClient } from './vendor/supabase.mjs';
import { CONFIG } from './config.js';
import { creaPdf, entregaPdf } from './pdf.js';
import { conMaquina, sonidoActivo, fijaSonido, maquinaActiva, fijaMaquina, aplicaMaquina, suena } from './sonido.js';
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
  no_pendiente: 'Esa carta ya no está pendiente.', carta_no_editable: 'Esa carta ya no se puede editar: quien la recibe ya puede leerla.', usa_editar: 'Esa carta aún se puede editar directamente.', parte_no_valida: 'Ese texto ya no existe.', texto_largo: 'El texto es demasiado largo.', tema_repetido: 'Ya hay un tema con ese nombre.', tema_vacio: 'Escribe el nombre del tema.', demasiados_temas: 'Ya hay demasiados temas.', tema_no_valido: 'Ese tema ya no existe.',
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
let nombrePerfil = null; // null = aún sin cargar
function pintaTop() {
  if (!user) { $top.innerHTML = ''; return; }
  const ini = user.is_anonymous ? '' : esc(((nombrePerfil || '').trim() || (user.email || '?').trim()).charAt(0).toUpperCase());
  $top.innerHTML = `<a href="#/" class="logo-enlace"><img class="logo-os" src="posdata-logotipo-oscuro.svg" alt="Posdata"><img class="logo-cl" src="posdata-logotipo-claro.svg" alt="" aria-hidden="true"></a><nav><a class="avatar-btn" href="#/perfil" aria-label="Mi perfil" title="Mi perfil">${ini || ICONO.persona}</a></nav>`;
}

// ---------- rutas ----------
async function ruta() {
  document.title = 'Posdata';
  if (user && !user.is_anonymous && nombrePerfil === null) { try { const [f] = await leer(sb.from('profiles').select('nombre').eq('id', user.id)); nombrePerfil = (f && f.nombre) || ''; } catch { nombrePerfil = ''; } }
  pintaTop();
  const h = location.hash || '#/';
  try {
    if (h.startsWith('#invitar/')) return vistaInvitacion(decodeURIComponent(h.slice(9)));
    if (!user) return h === '#/codigo' ? vistaCodigo() : vistaEntrada('inicio');
    if (h === '#/codigo') return vistaCodigo();
    if (h === '#/perfil') return vistaPerfil();
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
    <div class="pie-form fila entre"><button type="button" class="enlace" id="entrar">Ya tengo cuenta</button><a class="enlace" href="#/codigo">Tengo una tarjeta con código</a></div>`);
  document.getElementById('entrar').onclick = () => vistaEntrada('entrar');
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

function vistaEntrada(modo = 'entrar', invitada = false, desdeSobre = false) {
  if (modo === 'inicio') return vistaPortada();
  const nuevo = modo === 'crear';
  entrada(invitada ? 'Te han invitado a un <em>buzón</em>' : LEMA, SUB, `
    <p class="etq">${invitada ? 'Invitación' : nuevo ? 'Crear tu cuenta' : 'Entrar'}</p>
    <h2>${invitada ? 'Crea tu cuenta y <em>entra</em>' : nuevo ? 'Empieza tu <em>primer buzón</em>' : 'Qué bien <em>verte</em>'}</h2>
    <form id="f" class="${desdeSobre ? 'sale' : ''}">
      <label><span>Correo</span><input type="email" name="correo" required autocomplete="email" placeholder="tu@correo.com"></label>
      <label><span>Contraseña${nuevo ? ' · mínimo 8' : ''}</span><input type="password" name="clave" required minlength="${nuevo ? 8 : 1}" autocomplete="${nuevo ? 'new-password' : 'current-password'}"></label>
      <button class="btn ancho">${nuevo ? 'Crear cuenta' : 'Entrar'}</button>
    </form>
    <div class="pie-form fila entre"><button type="button" class="enlace" id="cambia">${nuevo ? 'Ya tengo cuenta' : 'Crear una cuenta'}</button><a class="enlace" href="#/codigo">Tengo una tarjeta con código</a></div>`);
  document.getElementById('cambia').onclick = () => vistaEntrada(nuevo ? 'entrar' : 'crear', invitada);
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

// ---------- un buzón ----------
let pestana = 'escribir';
const TITULOS = {
  escribir: (rol, n) => rol === 'dueno' ? [`Escríbele a <em>${esc(n)}</em>`, 'Hoy, mañana, cuando te acuerdes. Se queda guardado.'] : [`Una carta para <em>${esc(n)}</em>`, 'Llegará de una vez, con tu firma.'],
  cartas: (rol, n) => rol === 'receptor' ? ['Tus <em>cartas</em>', 'Las que ya te esperan.'] : rol === 'dueno' ? [`Lo que le has <em>escrito</em>`, 'Todo lo que hay en el buzón de ' + n + '.'] : rol === 'escribe' ? ['Tus <em>cartas</em>', 'Las que has escrito para ' + n + '.'] : ['Las <em>cartas</em>', 'Lo que ya está sellado.'],
  temas: () => ['Los <em>temas</em>', 'Para ordenar las cartas y que sea fácil encontrarlas.'],
  familia: () => ['Quién tiene la <em>llave</em>', 'Tu familia, la tarjeta de quien recibe y la persona de confianza.'],
};
const TEMAS_SUGERIDOS = ['Reflexiones', 'Frases', 'Consejos', 'Recuerdos', 'Lo que he aprendido', 'Cuando estés mal', 'Anécdotas'];
const ICONO = {
  sonido: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  silencio: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  persona: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20c.9-3.6 3.9-5.6 7.5-5.6s6.6 2 7.5 5.6"/></svg>',
  libro: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7.5h6"/></svg>',
  foto: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.4"/><path d="M8 5l1.2-2h5.6L16 5"/></svg>',
  voz: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
};

async function vistaBuzon(id) {
  const [buzon] = await leer(sb.from('buzones').select('id, nombre').eq('id', id));
  const [yo] = await leer(sb.from('miembros').select('id, rol, firma, revisa').eq('buzon_id', id).eq('user_id', user.id));
  if (!buzon || !yo) { avisa('No tienes acceso a ese buzón.', true); location.hash = '#/'; return; }
  const rol = yo.rol;
  const pest = rol === 'dueno' ? [['escribir', 'Escribir'], ['cartas', 'Cartas'], ['temas', 'Temas'], ['familia', 'Familia y llave']] : rol === 'escribe' ? [['escribir', 'Escribir'], ['cartas', 'Mis cartas']] : [['cartas', 'Cartas']];
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
  else if (pestana === 'temas') await pintaTemas(panel, id, temas);
  else await pintaFamilia(panel, id);
}

// ---------- escribir (con polaroids, voz y temas) ----------
const GIROS = [-6, 5, -3, 7, -8, 4, -5, 6, -2, 8, -7, 3];
function pintaEscribir(panel, buzon, rol, b, yo, temas, edit = null) {
  const dueña = rol === 'dueno';
  const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let fotos = [], voz = null, grabando = null, temaSel = edit ? edit.carta.tema_id : null, cand = edit ? edit.carta.candado : 'ninguno';
  const exFotos = edit ? edit.adjuntos.filter((a) => a.tipo === 'foto').map((a) => ({ ...a })) : [];
  let exVoz = edit ? edit.adjuntos.find((a) => a.tipo === 'audio') || null : null;
  const quitar = [];
  panel.innerHTML = `<div class="mesa"><div class="pols" id="pols" aria-label="Fotos de la carta"></div>
    <form class="hoja" id="f">
      <p class="etq fecha">${edit ? 'Editar esta carta · ' + esc(fechaLarga(edit.carta.dia)) : esc(hoy)}</p>
      <p class="mano para">Para ${esc(b.nombre)},</p>
      <input class="titulo" name="titulo" maxlength="80" placeholder="Un título (opcional)" value="${edit ? esc(edit.carta.titulo) : ''}">
      ${edit ? edit.partes.map((p, i) => `<label class="parte-ed"><span>${edit.partes.length > 1 ? 'Parte ' + (i + 1) : 'Tu carta'}</span><textarea data-parte="${p.id}" required>${esc(p.texto)}</textarea></label>`).join('') : `<textarea name="texto" required placeholder="${dueña ? 'Lo que querrías que supiera…' : 'Escribe aquí tu carta…'}"></textarea>`}
      ${yo.firma ? `<p class="mano firma-linea">${esc(yo.firma)}</p>` : ''}
      <div class="pie">
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
        <div class="fila"><button class="btn" id="enviar">${edit ? 'Guardar los cambios' : dueña ? 'Guardar en el buzón' : 'Enviar la carta'}</button>${edit ? '<button type="button" class="enlace" id="cancelar">Cancelar</button>' : ''}</div></div></form></div>`;
  document.getElementById('cancelar')?.addEventListener('click', () => vistaBuzon(buzon));
  const f = document.getElementById('f');
  // la máquina de escribir: suena al teclear (y se puede apagar aquí mismo)
  f.querySelectorAll('textarea, input.titulo').forEach((el) => conMaquina(el, { margen: el.tagName === 'TEXTAREA' ? 58 : 0 }));
  f.insertAdjacentHTML('afterbegin', `<button type="button" class="sonido-btn" id="b-sonido"></button>`);
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
        const rutas = edit.adjuntos.filter((a) => quitar.includes(a.id)).map((a) => a.ruta); if (rutas.length) sb.storage.from('adjuntos').remove(rutas).catch(() => {});
        avisa('Cambios guardados.'); pestana = 'cartas'; vistaBuzon(buzon); return;
      }
      await rpc('escribir', { p_buzon: buzon, p_texto: f.texto.value, p_titulo: f.titulo.value, p_candado: cand, p_abre_el: cand === 'fecha' ? f.abre.value || null : null, p_momento: cand === 'momento' ? f.momento.value : null, p_adjuntos: adjuntos, p_tema_id: temaSel });
      fotos.forEach((p) => URL.revokeObjectURL(p.url)); if (voz) URL.revokeObjectURL(voz.url);
      avisa(dueña ? 'Guardado en el buzón.' : 'Enviada.'); pestana = 'cartas'; vistaBuzon(buzon);
    } catch (e) {
      if (subidos.length) sb.storage.from('adjuntos').remove(subidos).catch(() => {});
      avisa(msgError(e), true); bt.disabled = false; bt.textContent = txt;
    }
  };
}

// ---------- cartas: lista con buscador y temas ----------
const SELLO = { abierta: ['Abierta hoy', ''], pendiente: ['Pendiente', 'pend'], sellada: ['Sellada', 'ok'], rechazada: ['Rechazada', 'pend'] };
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
async function pintaCartas(panel, buzon, rol, b, temas, yo) {
  let q = sb.from('cartas').select('id, autor_id, firma, titulo, dia, estado, candado, abre_el, momento, abierta_en, tema_id, partes(id, orden, texto, posdata, creada_en), adjuntos(id, tipo)').eq('buzon_id', buzon).order('dia', { ascending: false }).order('creada_en', { ascending: false });
  if (rol === 'escribe') q = q.eq('autor_id', user.id);
  const cartas = await leer(q);
  await cargaLetras(cartas.map((c) => c.autor_id));
  if (!cartas.length) { panel.innerHTML = `<div class="papel vacio"><span class="mini-sobre"><i></i></span><h3>${rol === 'receptor' ? 'Aún no hay cartas para ti' : 'Todavía no hay cartas'}</h3><p class="muted">${rol === 'receptor' ? 'Cuando se sellen, aparecerán aquí.' : 'La primera siempre es la más difícil. Empieza por una sola línea.'}</p></div>`; return; }
  const nTema = Object.fromEntries(temas.map((t) => [t.id, t.nombre]));
  const usados = temas.filter((t) => cartas.some((c) => c.tema_id === t.id));
  let q_ = '', tema_ = null;
  panel.innerHTML = `<div class="filtros"><label class="busca"><span class="sr">Buscar</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="buscar" type="search" placeholder="Buscar en las cartas…" autocomplete="off"></label>
    ${[...letras.values()].some(Boolean) ? `<div class="chips"><button class="chip ${usaLetra() ? 'on' : ''}" id="t-letra" aria-pressed="${usaLetra()}">Con la letra de quien escribe</button></div>` : ''}
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
  const tarjeta = (c) => {
    const partes = (c.partes || []).sort((x, y) => x.orden - y.orden);
    const cerrada = !partes.length, [etq, cls] = SELLO[c.estado];
    const cand = c.candado === 'fecha' ? `Se abre el ${fechaLarga(c.abre_el)}` : c.candado === 'momento' ? `Para cuando… ${esc(c.momento)}` : '';
    const titulo = esc(c.titulo || (cerrada ? 'Una carta cerrada' : 'Sin título'));
    const nf = (c.adjuntos || []).filter((a) => a.tipo === 'foto').length, hayVoz = (c.adjuntos || []).some((a) => a.tipo === 'audio');
    const marcas = `${c.tema_id && nTema[c.tema_id] ? `<span class="tema-sello">${esc(nTema[c.tema_id])}</span>` : ''}${nf ? `<span class="marca-adj" title="${nf} foto${nf > 1 ? 's' : ''}">${ICONO.foto}${nf}</span>` : ''}${hayVoz ? `<span class="marca-adj" title="Nota de voz">${ICONO.voz}</span>` : ''}`;
    return `<article class="papel carta ${cerrada ? 'cerrada' : ''}" data-c="${c.id}">
      ${cerrada ? `<div class="carta-cab">${miniSobre}<div class="txt"><span class="etq">${fechaLarga(c.dia)}</span><h3>${titulo}</h3>${cand ? `<p class="cand">🔒 ${cand}</p>` : '<p class="cand">🔒 Cerrada</p>'}<div class="marcas">${marcas}</div></div><span class="sello ${cls}">${etq}</span></div>
        ${c.candado === 'momento' && rol === 'receptor' ? `<div class="acciones"><button class="btn peq" data-abrir="${c.id}">Romper el sello</button></div>` : ''}`
      : `<button class="carta-cab" data-abre="${c.id}" aria-expanded="false">${miniSobre}<span class="txt"><span class="etq">${fechaLarga(c.dia)}</span><h3>${titulo}</h3>${cand ? `<p class="cand">${cand}</p>` : ''}<span class="marcas">${marcas}</span></span><span class="sello ${cls}">${etq}</span><span class="flecha">›</span></button>
        <div class="lee"><div><div class="lectura"><div class="adj" data-adj="${c.id}"></div><div class="texto" style="${estiloLetra(c.autor_id)}">${partes.map((p) => `<div class="parte ${p.posdata ? 'pd' : ''}">${p.posdata ? `<span class="mano pd-et">P. D. · ${fechaCorta(p.creada_en)}</span>` : ''}${esc(p.texto)}</div>`).join('')}${c.firma ? `<p class="mano firma" style="${estiloLetra(c.autor_id)}">${esc(c.firma)}</p>` : ''}</div><div class="adj-fotos" data-fotos="${c.id}"></div></div></div>
          ${accionesCarta(c, rol)}
          ${rol === 'dueno' ? `<label class="etiqueta"><span>Tema</span><select data-tema="${c.id}"><option value="">Sin tema</option>${temas.map((t) => `<option value="${t.id}" ${t.id === c.tema_id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></label>` : ''}</div></div>`}
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
    const vis = cartas.filter(coincide);
    lista.innerHTML = vis.length ? vis.map(tarjeta).join('') : `<div class="papel vacio"><h3>No hay cartas así</h3><p class="muted">Prueba con otra palabra o con otro tema.</p></div>`;
    lista.querySelectorAll('[data-abre]').forEach((h) => (h.onclick = () => { const a = h.closest('.carta'); const on = a.classList.toggle('abierta'); h.setAttribute('aria-expanded', on); if (on) cargaAdjuntos(a); }));
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
      leer(sb.from('cartas').select('id, firma, titulo, dia, estado, candado, abre_el, momento, tema_id, creada_en, autor_id, partes(orden, texto, posdata, creada_en), adjuntos(id, tipo, ruta, pie, duracion, orden)').eq('buzon_id', id).order('dia', { ascending: true }).order('creada_en', { ascending: true })),
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
      return `<article class="mem-carta"><p class="etq">${esc(largo(c.dia))}${c.tema_id && nTema[c.tema_id] ? ' · ' + esc(nTema[c.tema_id]) : ''}${aviso ? ' · ' + esc(aviso) : ''}</p>
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
          return { titulo: c.titulo, firma: c.firma, autorId: c.autor_id, etiqueta: [largo(c.dia), c.tema_id && nTema[c.tema_id], aviso].filter(Boolean).join(' · '),
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
      <p class="maquina-prueba" id="m-prueba" tabindex="0">Pulsa aquí y prueba el sonido.</p></div>
    <div class="papel" id="avisos"><div><p class="etq">Avisos</p><h3 style="margin-top:4px">Qué te avisa</h3></div><p class="muted">Tú eliges qué llega y por dónde.</p>
      <div class="av-cab"><span></span><span class="etq">Móvil</span><span class="etq">Correo</span></div>
      ${AVISOS.map(([id, t, d, m, c, fijo]) => { const a = (p.avisos || {})[id] || {}; return `<div class="av-fila"><div><b>${t}</b><span class="etq">${d}${fijo ? ' · no se puede quitar' : ''}</span></div>${[['movil', m, 'en el móvil'], ['correo', c, 'por correo']].map(([k, def, txt]) => `<label class="tick"><input type="checkbox" data-av="${id}:${k}" ${(a[k] ?? !!def) || fijo ? 'checked' : ''} ${fijo ? 'disabled' : ''} aria-label="${t} ${txt}"></label>`).join('')}</div>`; }).join('')}
      <p class="muted nota-av">Por ahora solo guardamos tus preferencias: los avisos empezarán a enviarse más adelante. Los que no se pueden quitar es porque, si no te enteras, una carta se queda esperando.</p></div>`}
    <div class="papel"><p class="etq">Tus buzones</p>${filas.length ? filas.map((f) => `<div class="persona"><span class="avatar">${inicial(f.buzones.nombre)}</span><div class="txt"><b>El buzón de ${esc(f.buzones.nombre)}</b><br><span class="muted">${ROL[f.rol] || f.rol}</span></div>${f.rol !== 'confianza' ? `<a class="enlace" href="#/b/${f.buzones.id}/memoria">Descargar memoria</a>` : ''}<a class="enlace" href="#/b/${f.buzones.id}">Abrir</a></div>`).join('') : '<p class="muted" style="margin-top:8px">Todavía no tienes ningún buzón.</p>'}</div>
    ${anon ? '' : `<form class="papel" id="f-clave"><div><p class="etq">Seguridad</p><h3 style="margin-top:4px">Cambiar la contraseña</h3></div><label><span>Nueva contraseña · mínimo 8</span><input type="password" name="c" minlength="8" required autocomplete="new-password"></label><div><button class="btn peq">Cambiar</button></div></form>
    <div class="papel proximamente"><p class="etq">Próximamente</p><ul><li>Copia automática en Google Drive</li><li>La memoria por correo</li><li>Libro impreso</li><li>Cintas de canciones</li></ul></div>`}
    <div class="fila"><button class="btn sec" id="p-salir">Cerrar sesión</button></div>`);
  document.getElementById('p-salir').onclick = async () => { await sb.auth.signOut(); location.hash = '#/'; };
  if (anon) return;
  document.getElementById('f-nombre').onsubmit = async (ev) => { ev.preventDefault(); const { error } = await sb.from('profiles').update({ nombre: ev.target.n.value.trim().slice(0, 60) }).eq('id', user.id); if (error) return avisa(msgError(error), true); nombrePerfil = ev.target.n.value.trim().slice(0, 60); pintaTop(); avisa('Guardado.'); vistaPerfil(); };
  document.getElementById('f-clave').onsubmit = async (ev) => { ev.preventDefault(); const { error } = await sb.auth.updateUser({ password: ev.target.c.value }); if (error) return avisa(msgError(error), true); ev.target.reset(); avisa('Contraseña cambiada.'); };
  // máquina de escribir y avisos
  document.getElementById('sw-maquina').onchange = (e) => { fijaMaquina(e.target.checked); };
  document.getElementById('sw-sonido').onchange = (e) => { fijaSonido(e.target.checked); if (e.target.checked) suena('retorno'); };
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
