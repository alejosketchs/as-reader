// AS READER — sesión con PIN, compartida con todo el Suite
// Mismo esquema que AS HUB: perfil + PIN (hash SHA-256), token en `sessions`.
// Si se llega desde otra app del Suite con #as=<token>, se adopta esa sesión.

import { Session, Profiles } from './db.js';
import { SESSION_KEY, SESSION_DAYS, PIN_SALT } from './config.js';
import { $, $$, html, raw, esc, toast } from './ui.js';

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
          <small>${esc(p.account_label || 'Perfil del Suite')}</small>
        </button>`).join(''))}
    </div>`;
}

function pintarPin(box, perfil) {
  box.innerHTML = html`
    <p class="gateStep">Paso 2 de 2</p>
    <h2 class="gateTitle">Hola, ${perfil.name}</h2>
    <p class="gateHint" id="gateMsg">Escribe tu PIN de 4 dígitos</p>
    <div class="gateDots" id="gateDots"><i></i><i></i><i></i><i></i></div>
    <div class="gateKeys" id="gateKeys">
      ${raw([1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" data-k="${d}">${d}</button>`).join(''))}
      <button type="button" data-k="back" class="gateKeySoft">Volver</button>
      <button type="button" data-k="0">0</button>
      <button type="button" data-k="del" class="gateKeySoft">⌫</button>
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

    const terminar = (token, profile) => {
      actual = { token, profile };
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

    const validar = async () => {
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

    const teclear = (k) => {
      if (k === 'back') { elegido = null; buffer = ''; return pintarPerfiles(box, perfiles); }
      if (k === 'del') { buffer = buffer.slice(0, -1); return pintarPuntos(); }
      if (!/^\d$/.test(k) || buffer.length >= 4) return;
      buffer += k;
      pintarPuntos();
      if (buffer.length === 4) setTimeout(validar, 110);
    };

    box.addEventListener('click', (e) => {
      const perfil = e.target.closest('[data-pid]');
      if (perfil) {
        elegido = perfiles.find((p) => p.id === perfil.dataset.pid);
        buffer = '';
        return pintarPin(box, elegido);
      }
      const tecla = e.target.closest('[data-k]');
      if (tecla) teclear(tecla.dataset.k);
    });

    document.addEventListener('keydown', (e) => {
      if (gate.classList.contains('hide') || !elegido) return;
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
        const cache = (() => { try { return JSON.parse(localStorage.getItem('assuite:perfil') || 'null'); } catch { return null; } })();
        if (token && cache) return terminar(token, cache);
        box.innerHTML = html`<p class="gateHint">Sin conexión. Conéctate una vez para entrar.</p>`;
        return;
      }

      try { perfiles = await Profiles.list(); }
      catch { perfiles = []; }

      if (sesionValida) {
        const p = perfiles.find((x) => x.id === sesionValida.profile_id);
        if (p) {
          try { localStorage.setItem('assuite:perfil', JSON.stringify(p)); } catch { /* noop */ }
          Session.touch(token);
          return terminar(token, p);
        }
      }

      if (!perfiles.length) {
        box.innerHTML = html`<p class="gateHint">No se pudieron cargar los perfiles. Recarga la página.</p>`;
        return;
      }
      pintarPerfiles(box, perfiles);
    })();
  });
}
