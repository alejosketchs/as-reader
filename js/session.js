// AS READER — entrada a la app
//
//  1. Sesión real: correo + contraseña con Supabase Auth (js/supabase.js), la
//     misma cuenta de AS HUB. Sin ella la base no deja leer ni escribir nada.
//  2. Bloqueo rápido: eliges lector (usuarios ilimitados en `reader_users`) y
//     escribes su PIN de 4 dígitos. Solo decide qué lector ves en este
//     dispositivo; no es la seguridad de la base.

import { ReaderUsers } from './db.js';
import {
  getAuthSession, signIn, signOut, sendPasswordReset, setNewPassword, cameFromRecovery,
} from './supabase.js';
import { readLock, isUnlocked, unlock, lock } from './pin-lock.js';
import { PIN_DAYS, PIN_SALT } from './config.js';
import { $, $$, html, raw, esc, toast } from './ui.js';
import { applyPalette } from './theme.js';

const PERFIL_CACHE = 'asreader:perfil';

let actual = null; // { user, profile }

export async function hashPin(profileId, pin) {
  const texto = `${PIN_SALT}:${profileId}:${pin}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const leerPerfilCache = () => {
  try { return JSON.parse(localStorage.getItem(PERFIL_CACHE) || 'null'); } catch { return null; }
};
const guardarPerfilCache = (p) => {
  try { localStorage.setItem(PERFIL_CACHE, JSON.stringify(p)); } catch { /* noop */ }
};

export const sesion = () => actual;
export const perfilActivo = () => actual?.profile || null;

/** Refleja cambios de perfil (nombre/emoji/paleta) en la sesión activa y en el caché local.
 *  Muta el objeto en sitio para que las vistas que ya lo tienen referenciado se actualicen solas. */
export function actualizarPerfilActivo(patch) {
  if (!actual) return;
  Object.assign(actual.profile, patch);
  guardarPerfilCache(actual.profile);
}

/** Cierra la sesión de la cuenta en este dispositivo. */
export async function cerrarSesion() {
  lock(localStorage);
  try { localStorage.removeItem(PERFIL_CACHE); } catch { /* noop */ }
  try { await signOut('local'); } catch { /* sin red: se borra igual en local */ }
  actual = null;
}

/* ---------------- pantalla de entrada ---------------- */
const DIAS_TXT = `${PIN_DAYS} días`;

function pintarLogin(box, msg = '') {
  box.innerHTML = html`
    <p class="gateStep">Entrar</p>
    <h2 class="gateTitle">Inicia sesión</h2>
    <p class="gateHint" id="gateMsg">${msg || 'Con la misma cuenta de AS HUB. Queda recordado en este dispositivo.'}</p>
    <form id="gateLogin" class="gateForm" novalidate>
      <div class="field"><label for="gateEmail">Correo</label>
        <input class="input" id="gateEmail" type="email" autocomplete="username" required></div>
      <div class="field"><label for="gatePass">Contraseña</label>
        <input class="input" id="gatePass" type="password" autocomplete="current-password" required></div>
      <button class="btn btn--primary btn--block" type="submit">Entrar</button>
      <button class="btn btn--block gateNewUser" type="button" data-act="reset">Olvidé mi contraseña</button>
    </form>`;
}

function pintarNuevaClave(box) {
  box.innerHTML = html`
    <p class="gateStep">Recuperar acceso</p>
    <h2 class="gateTitle">Nueva contraseña</h2>
    <p class="gateHint" id="gateMsg">Mínimo 10 caracteres. Que no la uses en otro sitio.</p>
    <form id="gateNewPass" class="gateForm" novalidate>
      <div class="field"><label for="gateNew">Contraseña nueva</label>
        <input class="input" id="gateNew" type="password" autocomplete="new-password" minlength="10" required></div>
      <button class="btn btn--primary btn--block" type="submit">Guardar</button>
    </form>`;
}

function pintarPerfiles(box, perfiles) {
  box.innerHTML = html`
    <p class="gateStep">Paso 1 de 2</p>
    <h2 class="gateTitle">¿Quién está leyendo?</h2>
    <p class="gateHint">El PIN queda recordado ${DIAS_TXT} en este dispositivo.</p>
    <div class="gateProfiles">
      ${raw(perfiles.map((p) => `
        <button class="gateProfile" type="button" data-pid="${esc(p.id)}">
          <i>${esc(p.emoji || '👤')}</i>
          <b>${esc(p.name)}</b>
          <small>Lector de AS Reader</small>
        </button>`).join(''))}
    </div>
    <button class="btn btn--block gateNewUser" type="button" id="gateAddUser">+ Crear usuario nuevo</button>
    <button class="btn btn--block gateNewUser" type="button" data-act="logout">Cerrar sesión de la cuenta</button>`;
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

const mensaje = (texto) => { const m = $('#gateMsg'); if (m) m.textContent = texto; };

export function requireSession() {
  return new Promise((resolve) => {
    const gate = $('#gate');
    const box = $('#gateBox');
    let user = null;
    let perfiles = [];
    let elegido = null;
    let buffer = '';

    // estado del alta de usuario nuevo
    let nuevo = null; // { name, emoji }
    let nuevoPin = '';
    let modo = 'cuenta'; // 'cuenta' | 'login' | 'nueva-ficha' | 'nuevo-pin' | 'nuevo-pin-confirm'

    const terminar = (profile) => {
      actual = { user, profile };
      guardarPerfilCache(profile);
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
      mensaje(msg);
    };

    const volverAPerfiles = () => {
      modo = 'login'; elegido = null; buffer = ''; nuevo = null; nuevoPin = '';
      pintarPerfiles(box, perfiles);
    };

    const validarLogin = async () => {
      const pin = buffer;
      buffer = ''; pintarPuntos();
      if (await hashPin(elegido.id, pin) !== elegido.pin_hash) return fallar('PIN incorrecto, intenta otra vez');
      unlock(localStorage, elegido.id, PIN_DAYS);
      terminar(elegido);
    };

    const crearUsuario = async (pin) => {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
      const pin_hash = await hashPin(id, pin);
      try {
        const creado = await ReaderUsers.create({
          id, name: nuevo.name, emoji: nuevo.emoji || '👤', pin_hash, sort_order: perfiles.length,
        });
        perfiles = [...perfiles, creado];
        unlock(localStorage, id, PIN_DAYS);
        terminar(creado);
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

    /* Ya con cuenta: cargar lectores y pedir PIN si hace falta. */
    const trasCuenta = async () => {
      modo = 'login';
      const candado = readLock(localStorage);
      try { perfiles = await ReaderUsers.list(); }
      catch {
        // Sin conexión: se deja pasar con el lector que este dispositivo ya desbloqueó.
        const cache = leerPerfilCache();
        if (cache && isUnlocked(candado) && candado.profileId === cache.id) return terminar(cache);
        box.innerHTML = html`<p class="gateHint">No se pudieron cargar los usuarios. Revisa tu conexión y recarga.</p>`;
        return;
      }
      if (isUnlocked(candado)) {
        const p = perfiles.find((x) => x.id === candado.profileId);
        if (p) return terminar(p);
      }
      pintarPerfiles(box, perfiles);
    };

    box.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'logout') { await cerrarSesion(); modo = 'cuenta'; return pintarLogin(box); }
      if (act === 'reset') {
        const email = $('#gateEmail')?.value || '';
        if (!email.includes('@')) return mensaje('Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".');
        try { await sendPasswordReset(email); mensaje('Si el correo es correcto, te llegó un enlace para crear una contraseña nueva.'); }
        catch { mensaje('No se pudo enviar el correo. Intenta en unos minutos.'); }
        return;
      }
      const perfil = e.target.closest('[data-pid]');
      if (perfil) {
        elegido = perfiles.find((p) => p.id === perfil.dataset.pid);
        buffer = ''; modo = 'login';
        if (!elegido.pin_hash) { unlock(localStorage, elegido.id, PIN_DAYS); return terminar(elegido); }
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

    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        if (e.target.id === 'gateLogin') {
          const s = await signIn($('#gateEmail').value, $('#gatePass').value);
          user = s.user;
          box.innerHTML = '<p class="gateHint">Entrando…</p>';
          await trasCuenta();
        } else if (e.target.id === 'gateNewPass') {
          const nueva = $('#gateNew').value;
          if (nueva.length < 10) { mensaje('Usa al menos 10 caracteres.'); return; }
          await setNewPassword(nueva);
          toast('Contraseña actualizada');
          await trasCuenta();
        }
      } catch (err) {
        mensaje(/invalid login/i.test(err?.message || '')
          ? 'Correo o contraseña incorrectos.'
          : /pwned|leaked|weak/i.test(err?.message || '')
            ? 'Esa contraseña aparece en filtraciones públicas. Usa otra.'
            : 'No se pudo completar. Revisa tu conexión e intenta otra vez.');
      } finally {
        btn.disabled = false;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (gate.classList.contains('hide') || !$('#gateKeys')) return;
      if (modo === 'login' && !elegido) return;
      if (/^\d$/.test(e.key)) teclear(e.key);
      else if (e.key === 'Backspace') teclear('del');
    });

    (async () => {
      gate.classList.remove('hide');
      box.innerHTML = '<p class="gateHint">Conectando…</p>';

      const cuenta = await getAuthSession();
      if (!cuenta) {
        if (!navigator.onLine) {
          box.innerHTML = html`<p class="gateHint">Sin conexión. Conéctate una vez para entrar.</p>`;
          return;
        }
        return pintarLogin(box);
      }
      user = cuenta.user;
      if (cameFromRecovery) return pintarNuevaClave(box);
      await trasCuenta();
    })();
  });
}
