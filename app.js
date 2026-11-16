// Posdata · app real (versión 1): entrar, crear buzón, escribir, sellar, leer.
import { createClient } from './vendor/supabase.mjs';
import { CONFIG } from './config.js';
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
  no_pendiente: 'Esa carta ya no está pendiente.', tema_repetido: 'Ya hay un tema con ese nombre.', tema_vacio: 'Escribe el nombre del tema.', demasiados_temas: 'Ya hay demasiados temas.', tema_no_valido: 'Ese tema ya no existe.',
  demasiados_adjuntos: 'Demasiadas fotos o audios en una carta.', adjunto_no_subido: 'No se ha podido subir un archivo. Inténtalo otra vez.', 'row-level security': 'No puedes subir archivos a este buzón.', 'maximum allowed size': 'Ese archivo pesa demasiado.', 'mime type': 'Ese tipo de archivo no está permitido.', correo_no_valido: 'Ese correo no parece válido.', no_autenticado: 'Entra primero.',
  'Invalid login credentials': 'Correo o contraseña incorrectos.', 'User already registered': 'Ya hay una cuenta con ese correo.',
  'Email not confirmed': 'Confirma tu correo antes de entrar (mira tu bandeja).',
};
const msgError = (e) => { const t = e?.message || String(e); const k = Object.keys(ERRORES).find((k) => t.includes(k)); return k ? ERRORES[k] : 'Algo ha fallado: ' + t; };
let tAviso;
function avisa(t, mal = false) { $aviso.textContent = t; $aviso.className = 'aviso' + (mal ? ' mal' : ''); $aviso.hidden = false; clearTimeout(tAviso); tAviso = setTimeout(() => ($aviso.hidden = true), 4200); }

if (!CONFIG.url || !CONFIG.anonKey) {
  $app.innerHTML = `<div class="cuerpo-app"><section class="vista centro"><h1>Falta <em>conectar</em></h1><p class="muted">Abre <code>app/config.js</code> y pega la URL y la clave «anon public» de tu proyecto Supabase.</p></section></div>`;
  throw new Error('config vacía');
}
const sb = createClient(CONFIG.url, CONFIG.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
let user = null;

async function rpc(nombre, args = {}) { const { data, error } = await sb.rpc(nombre, args); if (error) throw error; return data; }
async function leer(q) { const { data, error } = await q; if (error) throw error; return data; }

// ---------- cabecera ----------
function pintaTop() {
  if (!user) { $top.innerHTML = ''; return; }
  const entro = !user.is_anonymous;
  $top.innerHTML = `<a href="#/"><img src="posdata-logotipo-oscuro.svg" alt="Posdata"></a><nav><span class="muted">${esc(entro ? user.email : 'Entraste con tu tarjeta')}</span><button class="enlace" id="salir">Salir</button></nav>`;
  document.getElementById('salir').addEventListener('click', async () => { await sb.auth.signOut(); location.hash = '#/'; });
}

// ---------- rutas ----------
async function ruta() {
  pintaTop();
  const h = location.hash || '#/';
  try {
    if (h.startsWith('#invitar/')) return vistaInvitacion(decodeURIComponent(h.slice(9)));
    if (!user) return h === '#/codigo' ? vistaCodigo() : vistaEntrada('inicio');
    if (h === '#/codigo') return vistaCodigo();
    if (h.startsWith('#/b/')) return vistaBuzon(h.slice(4));
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
  <img class="logo" src="posdata-logotipo-oscuro.svg" alt="Posdata" width="210" height="74">
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
  else if (pestana === 'cartas') await pintaCartas(panel, id, rol, buzon, temas);
  else if (pestana === 'temas') await pintaTemas(panel, id, temas);
  else await pintaFamilia(panel, id);
}

// ---------- escribir (con polaroids, voz y temas) ----------
const GIROS = [-6, 5, -3, 7, -8, 4, -5, 6, -2, 8, -7, 3];
function pintaEscribir(panel, buzon, rol, b, yo, temas) {
  const dueña = rol === 'dueno';
  const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let fotos = [], voz = null, grabando = null, temaSel = null, cand = 'ninguno';
  panel.innerHTML = `<div class="mesa"><div class="pols" id="pols" aria-label="Fotos de la carta"></div>
    <form class="hoja" id="f">
      <p class="etq fecha">${esc(hoy)}</p>
      <p class="mano para">Para ${esc(b.nombre)},</p>
      <input class="titulo" name="titulo" maxlength="80" placeholder="Un título (opcional)">
      <textarea name="texto" required placeholder="${dueña ? 'Lo que querrías que supiera…' : 'Escribe aquí tu carta…'}"></textarea>
      ${yo.firma ? `<p class="mano firma-linea">${esc(yo.firma)}</p>` : ''}
      <div class="pie">
        <div><p class="lbl" style="margin-bottom:8px">Tema</p><div class="chips" id="temas"></div></div>
        <div><p class="lbl" style="margin-bottom:8px">Añadir a la carta</p>
          <div class="fila"><button type="button" class="herr" id="b-foto">${ICONO.foto} Foto</button>${haySoporteDeVoz() ? `<button type="button" class="herr" id="b-voz">${ICONO.voz} Grabar voz</button>` : ''}</div>
          <input type="file" id="i-foto" accept="image/*" multiple hidden>
          <div id="voz-zona"></div></div>
        ${dueña ? `<div><p class="lbl" style="margin-bottom:8px">Candado</p><div class="chips" id="cands">
          <button type="button" class="chip on" data-c="ninguno">Sin candado</button><button type="button" class="chip" data-c="fecha">Se abre en una fecha</button><button type="button" class="chip" data-c="momento">Se abre en un momento</button></div>
          <p class="ayuda" id="ay" style="margin-top:8px">Sin candado: es la carta de hoy. Puedes seguir añadiendo y se sella sola a medianoche.</p></div>
          <label id="l-fecha" hidden><span>Se abre el</span><input type="date" name="abre"></label>
          <label id="l-momento" hidden><span>Para cuando…</span><input name="momento" maxlength="60" placeholder="Cuando estés triste"></label>` : `<p class="ayuda">${yo.revisa ? 'Tu carta pasará por revisión antes de sellarse.' : 'Tu carta se sellará al enviarla.'}</p>`}
        <button class="btn" id="enviar">${dueña ? 'Guardar en el buzón' : 'Enviar la carta'}</button></div></form></div>`;
  const f = document.getElementById('f');

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

  // polaroids
  const pintaPols = () => {
    const z = document.getElementById('pols');
    z.innerHTML = fotos.map((p, i) => `<figure class="pol ${i % 2 ? 'der' : 'izq'}" style="--fila:${Math.floor(i / 2)};--r:${GIROS[i % GIROS.length]}deg" data-i="${i}"><button type="button" class="pol-x" aria-label="Quitar esta foto">×</button><img src="${p.url}" alt="Foto ${i + 1}"><figcaption><input class="pol-pie" maxlength="80" placeholder="Un pie de foto…" value="${esc(p.pie)}" aria-label="Pie de la foto ${i + 1}"></figcaption></figure>`).join('');
    z.classList.toggle('hay', fotos.length > 0);
    z.querySelectorAll('.pol').forEach((el) => {
      const i = +el.dataset.i;
      el.querySelector('.pol-x').onclick = () => { URL.revokeObjectURL(fotos[i].url); fotos.splice(i, 1); pintaPols(); };
      el.querySelector('.pol-pie').oninput = (e) => (fotos[i].pie = e.target.value);
    });
  };
  const iFoto = document.getElementById('i-foto');
  document.getElementById('b-foto').onclick = () => iFoto.click();
  iFoto.onchange = async () => {
    const nuevas = [...iFoto.files]; iFoto.value = '';
    for (const file of nuevas) {
      if (fotos.length >= 12) { avisa('Máximo 12 fotos por carta.', true); break; }
      try { const r = await reducirFoto(file); fotos.push({ ...r, url: URL.createObjectURL(r.blob), pie: '' }); pintaPols(); } catch (e) { avisa(msgError(e), true); }
    }
  };

  // voz
  const zonaVoz = document.getElementById('voz-zona'), bVoz = document.getElementById('b-voz');
  const pintaVoz = () => {
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
async function pintaCartas(panel, buzon, rol, b, temas) {
  let q = sb.from('cartas').select('id, autor_id, firma, titulo, dia, estado, candado, abre_el, momento, abierta_en, tema_id, partes(orden, texto), adjuntos(id, tipo)').eq('buzon_id', buzon).order('dia', { ascending: false }).order('creada_en', { ascending: false });
  if (rol === 'escribe') q = q.eq('autor_id', user.id);
  const cartas = await leer(q);
  if (!cartas.length) { panel.innerHTML = `<div class="papel vacio"><span class="mini-sobre"><i></i></span><h3>${rol === 'receptor' ? 'Aún no hay cartas para ti' : 'Todavía no hay cartas'}</h3><p class="muted">${rol === 'receptor' ? 'Cuando se sellen, aparecerán aquí.' : 'La primera siempre es la más difícil. Empieza por una sola línea.'}</p></div>`; return; }
  const nTema = Object.fromEntries(temas.map((t) => [t.id, t.nombre]));
  const usados = temas.filter((t) => cartas.some((c) => c.tema_id === t.id));
  let q_ = '', tema_ = null;
  panel.innerHTML = `<div class="filtros"><label class="busca"><span class="sr">Buscar</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="buscar" type="search" placeholder="Buscar en las cartas…" autocomplete="off"></label>
    ${usados.length ? `<div class="chips" id="f-temas"><button class="chip on" data-ft="">Todas</button>${usados.map((t) => `<button class="chip" data-ft="${t.id}">${esc(t.nombre)}</button>`).join('')}</div>` : ''}</div><div id="lista-c" class="lista"></div>`;
  const lista = panel.querySelector('#lista-c');
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
        <div class="lee"><div><div class="lectura"><div class="adj" data-adj="${c.id}"></div><div class="texto">${partes.map((p) => `<div class="parte">${esc(p.texto)}</div>`).join('')}${c.firma ? `<p class="mano firma">${esc(c.firma)}</p>` : ''}</div></div>
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
    quiere('[data-abrir]', (x) => rpc('abrir_momento', { p_carta: x.dataset.abrir }));
    quiere('[data-ok]', async (x) => { await rpc('resolver_carta', { p_carta: x.dataset.ok, p_aprobar: true }); avisa('Aprobada.'); });
    quiere('[data-no]', async (x) => { await rpc('resolver_carta', { p_carta: x.dataset.no, p_aprobar: false }); avisa('Rechazada.'); });
    lista.querySelectorAll('[data-tema]').forEach((s) => (s.onchange = async () => { try { await rpc('etiquetar_carta', { p_carta: s.dataset.tema, p_tema: s.value || null }); const c = cartas.find((x) => x.id === s.dataset.tema); c.tema_id = s.value || null; avisa('Tema guardado.'); } catch (e) { avisa(msgError(e), true); } }));
  };
  pinta();
  panel.querySelector('#buscar').oninput = (e) => { q_ = sinTildes(e.target.value).trim(); pinta(); };
  panel.querySelectorAll('[data-ft]').forEach((c) => (c.onclick = () => { tema_ = c.dataset.ft || null; panel.querySelectorAll('[data-ft]').forEach((x) => x.classList.toggle('on', x === c)); pinta(); }));
}

// Fotos y voz de una carta abierta: se piden al desplegarla.
async function cargaAdjuntos(art) {
  const z = art.querySelector('[data-adj]'); if (!z || z.dataset.listo) return; z.dataset.listo = '1';
  try {
    const filas = await leer(sb.from('adjuntos').select('id, tipo, ruta, pie, duracion, orden').eq('carta_id', art.dataset.c).order('orden'));
    if (!filas.length) { z.remove(); return; }
    const { data: firmadas, error } = await sb.storage.from('adjuntos').createSignedUrls(filas.map((f) => f.ruta), 3600);
    if (error) throw error;
    const url = Object.fromEntries(firmadas.map((s) => [s.path, s.signedUrl]));
    const fotos = filas.filter((f) => f.tipo === 'foto'), voz = filas.find((f) => f.tipo === 'audio');
    art.classList.toggle('con-fotos', fotos.length > 0);
    z.innerHTML = `${voz ? reproductorHtml(url[voz.ruta], voz.duracion, 'Nota de voz') : ''}${fotos.length ? `<div class="pols-lee">${fotos.map((f, i) => `<figure class="pol" style="--r:${GIROS[i % GIROS.length]}deg"><img loading="lazy" src="${url[f.ruta]}" alt="${esc(f.pie || 'Foto de la carta')}">${f.pie ? `<figcaption class="mano">${esc(f.pie)}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}`;
    activaReproductores(z);
    z.querySelectorAll('.pols-lee .pol').forEach((p) => (p.onclick = () => ampliar(p.querySelector('img').src, p.querySelector('figcaption')?.textContent || '')));
  } catch (e) { z.innerHTML = '<p class="muted">No se han podido cargar las fotos y la voz.</p>'; console.error(e); }
}
function ampliar(src, pie) {
  const o = document.createElement('div'); o.className = 'visor'; o.innerHTML = `<figure class="pol grande"><img src="${src}" alt="${esc(pie || 'Foto')}">${pie ? `<figcaption class="mano">${esc(pie)}</figcaption>` : ''}</figure>`;
  const cierra = () => { o.remove(); removeEventListener('keydown', tecla); }; const tecla = (e) => e.key === 'Escape' && cierra();
  o.onclick = cierra; addEventListener('keydown', tecla); document.body.append(o);
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
sb.auth.onAuthStateChange((ev, s) => { if (ev === 'INITIAL_SESSION') return; const antes = user?.id; user = s?.user ?? null; if (antes !== user?.id) ruta(); });
const { data } = await sb.auth.getSession();
user = data.session?.user ?? null;
ruta();
