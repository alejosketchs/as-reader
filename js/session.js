// AS READER — sesión con PIN, propia de Reader (usuarios ilimitados en `reader_users`)
// El token de sesión sigue viviendo en la tabla `sessions` compartida con el Suite,
// así el link #as=<token> desde AS HUB entra directo si el visitante ya tiene sesión abierta.

import { Session, ReaderUsers } from './db.js';
import { SESSION_KEY, SESSION_DAYS, PIN_SALT } from './config.js';
import { $, $$, html, raw, esc, toast } from './ui.js';
import { applyPalette } from './theme.js';

let actual = null; // { token, profile }

export async function hashPin(profileId, pin) {
  const texto = `${PIN_SALT}:${profileId}:${pin}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const leerToken = () => {
  try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
};
const guardarToken = (t) => {
  try { localStorage.setItem(SESSION_KEY, t); } catch { /* modo privado */ }
};

function adoptarTokenDeLaUrl() {
  const m = (location.hash || '').match(/[#&]as=([A-Za-z0-9-]{8,})/);
  if (!m) return;
  guardarToken(m[1]);
  const limpio = location.hash.replace(/[#&]as=[A-Za-z0-9-]+/, '');
  history.replaceState(null, '', location.pathname + location.search + (limpio || ''));
}

export function linkConSesion(url) {
  const t = leerToken();
  if (!url || !t) return url;
  return url + (url.includes('#') ? '&' : '#') + 'as=' + encodeURIComponent(t);
}

export const sesion = () => actual;
export const perfilActivo = () => actual?.profile || null;

/** Refleja cambios de perfil (nombre/emoji/paleta) en la sesión activa y en el caché local.
 *  Muta el objeto en sitio para que las vistas que ya lo tienen referenciado se actualicen solas. */
export function actualizarPerfilActivo(patch) {
  if (!actual) return;
  Object.assign(actual.profile, patch);
  try { localStorage.setItem('asreader:perfil', JSON.stringify(actual.profile)); } catch { /* noop */ }
}

export async function cerrarSesion() {
  const t = leerToken();
  await Session.close(t);
  try { localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
  actual = null;
}

/* ---------------- pantalla de entrada ---------------- */
const DIAS_TXT = `${SESSION_DAYS} días`;

function pintarPerfiles(box, perfiles) {
  box.innerHTML = html`
    <p class="gateStep">Paso 1 de 2</p>
    <h2 class="gateTitle">¿Quién está leyendo?</h2>
    <p class="gateHint">Tu sesión queda recordada ${DIAS_TXT} en este dispositivo.</p>
    <div class="gateProfiles">
      ${raw(perfiles.map((p) => `
        <button class="gateProfile" type="button" data-pid="${esc(p.id)}">
          <i>${esc(p.emoji || '👤')}</i>
          <b>${esc(p.name)}</b>
          <small>Lector de AS Reader</small>
        </button>`).join(''))}
    </div>
    <button class="btn btn--block gateNewUser" type="button" id="gateAddUser">+ Crear usuario nuevo</button>`;
}

/** Teclado numérico de 4 dígitos reusable: login, alta de PIN y confirmación. */
function pintarTeclado(box, { step, title, hint }) {
  box.innerHTML = html`
    <p class="gateStep">${step}</p>
    <h2 class="gateTitle">${raw(title)}</h2>
    <p class="gateHint" id="gateMsg">${hint}</p>
    <div class="gateDots" id="gateDots"><i></i><i></i><i></i><i></i></div>
    <div class="gateKeys" id="gateKeys">
      ${raw([1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" data-k="${d}">${d}</button>`).join(''))}
      <button type="button" data-k="back" class="gateKeySoft">Volver</button>
      <button type="button" data-k="0">0</button>
      <button type="button" data-k="del" class="gateKeySoft">⌫</button>
    </div>`;
}

function pintarNuevoUsuario(box) {
  box.innerHTML = html`
    <p class="gateStep">Nuevo usuario</p>
    <h2 class="gateTitle">¿Cómo te llamas?</h2>
    <p class="gateHint">Elige un nombre y, si quieres, un emoji para tu perfil.</p>
    <div class="field"><label>Nombre</label>
      <input class="input" id="nuName" placeholder="Tu nombre" maxlength="30"></div>
    <div class="field"><label>Emoji (opcional)</label>
      <input class="input" id="nuEmoji" placeholder="👤" maxlength="4"></div>
    <div class="row" style="margin-top:4px">
      <button class="btn" type="button" id="nuBack">Volver</button>
      <button class="btn btn--primary btn--block" type="button" id="nuNext">Siguiente →</button>
    </div>`;
}

export function requireSession() {
  adoptarTokenDeLaUrl();

  return new Promise((resolve) => {
    const gate = $('#gate');
    const box = $('#gateBox');
    let perfiles = [];
    let elegido = null;
    let buffer = '';

    // estado del alta de usuario nuevo
    let nuevo = null; // { name, emoji }
    let nuevoPin = '';
    let modo = 'login'; // 'login' | 'nuevo-pin' | 'nuevo-pin-confirm'

    const terminar = (token, profile) => {
      actual = { token, profile };
      applyPalette(profile.palette);
      gate.classList.add('hide');
      resolve(actual);
    };

    const pintarPuntos = () => {
      $$('#gateDots i').forEach((d, i) => d.classList.toggle('on', i < buffer.length));
    };

    const fallar = (msg) => {
      buffer = ''; pintarPuntos();
      gate.classList.add('is-wrong');
      setTimeout(() => gate.classList.remove('is-wrong'), 420);
      const m = $('#gateMsg');
      if (m) m.textContent = msg;
    };

    const volverAPerfiles = () => {
      modo = 'login'; elegido = null; buffer = ''; nuevo = null; nuevoPin = '';
      pintarPerfiles(box, perfiles);
    };

    const validarLogin = async () => {
      const pin = buffer;
      buffer = ''; pintarPuntos();
      const hash = await hashPin(elegido.id, pin);
      if (hash !== elegido.pin_hash) return fallar('PIN incorrecto, intenta otra vez');
      try {
        const s = await Session.open(elegido.id, SESSION_DAYS, navigator.userAgent.slice(0, 120));
        guardarToken(s.token);
        terminar(s.token, elegido);
      } catch {
        fallar('No se pudo abrir la sesión. Revisa tu conexión.');
      }
    };

    const crearUsuario = async (pin) => {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
      const pin_hash = await hashPin(id, pin);
      try {
        const creado = await ReaderUsers.create({
          id, name: nuevo.name, emoji: nuevo.emoji || '👤', pin_hash, sort_order: perfiles.length,
        });
        perfiles = [...perfiles, creado];
        const s = await Session.open(id, SESSION_DAYS, navigator.userAgent.slice(0, 120));
        guardarToken(s.token);
        terminar(s.token, creado);
      } catch {
        fallar('No se pudo crear el usuario. Revisa tu conexión.');
      }
    };

    const teclear = (k) => {
      if (k === 'back') {
        if (modo === 'nuevo-pin-confirm') { modo = 'nuevo-pin'; buffer = ''; nuevoPin = ''; return pintarTeclado(box, { step: 'Nuevo usuario', title: 'Elige tu PIN', hint: 'Escribe 4 dígitos que uses siempre para entrar.' }); }
        if (modo === 'nuevo-pin') { modo = 'nueva-ficha'; buffer = ''; return pintarNuevoUsuario(box); }
        return volverAPerfiles();
      }
      if (k === 'del') { buffer = buffer.slice(0, -1); return pintarPuntos(); }
      if (!/^\d$/.test(k) || buffer.length >= 4) return;
      buffer += k;
      pintarPuntos();
      if (buffer.length === 4) setTimeout(procesar4Digitos, 110);
    };

    const procesar4Digitos = () => {
      if (modo === 'login') return validarLogin();
      if (modo === 'nuevo-pin') {
        nuevoPin = buffer; buffer = ''; pintarPuntos();
        modo = 'nuevo-pin-confirm';
        return pintarTeclado(box, { step: 'Nuevo usuario', title: 'Confirma tu PIN', hint: 'Escríbelo otra vez.' });
      }
      if (modo === 'nuevo-pin-confirm') {
        const confirm = buffer; buffer = ''; pintarPuntos();
        if (confirm !== nuevoPin) {
          nuevoPin = ''; modo = 'nuevo-pin';
          fallar('Los PIN no coinciden, intenta otra vez');
          return pintarTeclado(box, { step: 'Nuevo usuario', title: 'Elige tu PIN', hint: 'Escribe 4 dígitos que uses siempre para entrar.' });
        }
        return crearUsuario(confirm);
      }
    };

    box.addEventListener('click', (e) => {
      const perfil = e.target.closest('[data-pid]');
      if (perfil) {
        elegido = perfiles.find((p) => p.id === perfil.dataset.pid);
        buffer = ''; modo = 'login';
        return pintarTeclado(box, { step: 'Paso 2 de 2', title: `Hola, ${esc(elegido.name)}`, hint: 'Escribe tu PIN de 4 dígitos' });
      }
      if (e.target.id === 'gateAddUser') {
        modo = 'nueva-ficha';
        return pintarNuevoUsuario(box);
      }
      if (e.target.id === 'nuBack') return volverAPerfiles();
      if (e.target.id === 'nuNext') {
        const name = $('#nuName', box)?.value.trim();
        const emoji = $('#nuEmoji', box)?.value.trim();
        if (!name) { toast('Escribe un nombre', 'err'); return; }
        nuevo = { name, emoji };
        modo = 'nuevo-pin'; buffer = '';
        return pintarTeclado(box, { step: 'Nuevo usuario', title: 'Elige tu PIN', hint: 'Escribe 4 dígitos que uses siempre para entrar.' });
      }
      const tecla = e.target.closest('[data-k]');
      if (tecla) teclear(tecla.dataset.k);
    });

    document.addEventListener('keydown', (e) => {
      if (gate.classList.contains('hide')) return;
      if (modo === 'nueva-ficha' || modo === 'login' && !elegido) return;
      if (/^\d$/.test(e.key)) teclear(e.key);
      else if (e.key === 'Backspace') teclear('del');
    });

    (async () => {
      gate.classList.remove('hide');
      box.innerHTML = '<p class="gateHint">Conectando…</p>';

      const token = leerToken();
      let sesionValida = null;
      try { sesionValida = await Session.check(token); }
      catch {
        const cache = (() => { try { return JSON.parse(localStorage.getItem('asreader:perfil') || 'null'); } catch { return null; } })();
        if (token && cache) return terminar(token, cache);
        box.innerHTML = html`<p class="gateHint">Sin conexión. Conéctate una vez para entrar.</p>`;
        return;
      }

      try { perfiles = await ReaderUsers.list(); }
      catch { perfiles = []; }

      if (sesionValida) {
        const p = perfiles.find((x) => x.id === sesionValida.profile_id);
        if (p) {
          try { localStorage.setItem('asreader:perfil', JSON.stringify(p)); } catch { /* noop */ }
          Session.touch(token);
          return terminar(token, p);
        }
      }

      if (!perfiles.length) {
        box.innerHTML = html`<p class="gateHint">No se pudieron cargar los usuarios. Recarga la página.</p>`;
        return;
      }
      pintarPerfiles(box, perfiles);
    })();
  });
}
