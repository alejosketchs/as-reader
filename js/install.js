// AS READER — botón de instalación (PWA).
// Escritorio y Android: usan beforeinstallprompt (instalación con un clic).
// iOS/Safari no dispara ese evento — se muestra el paso manual.
import { sheet, html } from './ui.js';

let deferredPrompt = null;
let btn = null;

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function show() { btn?.classList.remove('hide'); }
function hide() { btn?.classList.add('hide'); }

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  show();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  hide();
});

export function initInstall(buttonEl) {
  btn = buttonEl;
  if (isStandalone()) return hide();
  if (deferredPrompt || isIOS()) show();
}

export async function handleInstallClick() {
  if (deferredPrompt) {
    const dp = deferredPrompt;
    deferredPrompt = null;
    hide();
    dp.prompt();
    await dp.userChoice;
    return;
  }

  if (isIOS()) {
    sheet({
      title: 'Instalar AS READER',
      body: html`<p class="sheetText">En iPhone/iPad: toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba) y elige <b>«Agregar a pantalla de inicio»</b>.</p>`,
      actions: [{ label: 'Entendido', onClick: ({ close }) => close() }],
    });
    return;
  }

  sheet({
    title: 'Instalar AS READER',
    body: html`<p class="sheetText">Tu navegador no ofreció instalación automática. Busca «Instalar app» o «Agregar a pantalla de inicio» en el menú del navegador (⋮ o Compartir).</p>`,
    actions: [{ label: 'Entendido', onClick: ({ close }) => close() }],
  });
}
