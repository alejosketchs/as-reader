// AS READER — recordatorios de lectura (Web Push).
// El navegador guarda una "suscripción" por dispositivo; la guardamos en Supabase
// y el cron de Vercel la usa para mandar el empujón diario.
// iOS solo permite esto si la app está instalada en la pantalla de inicio (iOS 16.4+).
import { VAPID_PUBLIC_KEY } from './config.js';
import { PushSubs } from './db.js';
import { authHeader } from './supabase.js';

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Motivo por el que las notificaciones no están disponibles, o '' si sí lo están. */
export function unavailableReason() {
  if (isIOS() && !isStandalone()) {
    return 'En iPhone/iPad hay que instalar la app en la pantalla de inicio antes de activar las notificaciones.';
  }
  if (!pushSupported()) return 'Este navegador no soporta notificaciones push.';
  if (Notification.permission === 'denied') {
    return 'Bloqueaste las notificaciones para este sitio. Habilítalas en los ajustes del navegador y vuelve a intentar.';
  }
  return '';
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iphone/i.test(ua)) return 'iPhone';
  if (/ipad/i.test(ua)) return 'iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/windows/i.test(ua)) return 'Windows';
  if (/mac/i.test(ua)) return 'Mac';
  return 'Dispositivo';
}

async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Estado para pintar Ajustes: si este dispositivo está suscrito y con qué horarios. */
export async function pushState() {
  const reason = unavailableReason();
  const base = { available: !reason, reason, subscribed: false, morning: true, night: true };
  if (reason) return base;
  try {
    const sub = await currentSubscription();
    if (!sub) return base;
    const row = await PushSubs.find(sub.endpoint);
    if (!row) return base;
    return {
      ...base,
      subscribed: !!row.enabled,
      morning: !!row.morning,
      night: !!row.night,
      endpoint: sub.endpoint,
    };
  } catch {
    return base;
  }
}

/** Pide permiso, suscribe este dispositivo y lo guarda. Devuelve el estado nuevo. */
export async function enablePush(profileId, { morning = true, night = true } = {}) {
  const reason = unavailableReason();
  if (reason) throw new Error(reason);

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('No diste permiso para las notificaciones.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  await PushSubs.save({
    profile_id: profileId,
    endpoint: sub.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    device: deviceLabel(),
    enabled: true,
    morning,
    night,
  });

  return { available: true, reason: '', subscribed: true, morning, night, endpoint: sub.endpoint };
}

/** Apaga las notificaciones en este dispositivo y borra su suscripción. */
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await PushSubs.remove(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Cambia horarios (mañana / noche) de este dispositivo. */
export async function setPushPrefs({ morning, night }) {
  const sub = await currentSubscription();
  if (!sub) return;
  await PushSubs.update(sub.endpoint, { morning, night });
}

/** Manda una notificación de prueba ya mismo. */
export async function sendTestPush(profileId) {
  const res = await fetch('/api/push-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ profile_id: profileId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo enviar la prueba');
  if (!data.sent) throw new Error('No hay dispositivos suscritos para este perfil');
  return data;
}
