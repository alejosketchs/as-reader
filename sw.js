/* AS READER — service worker
   El "shell" se guarda en caché para abrir sin conexión;
   las peticiones a Supabase nunca se cachean (siempre datos frescos).
   También recibe los recordatorios de lectura (Web Push). */
const VERSION = 'asreader-v1.6.0';
const SHELL = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/config.js',
  '/js/supabase.js',
  '/js/pin-lock.js',
  '/js/db.js',
  '/js/ui.js',
  '/js/session.js',
  '/js/theme.js',
  '/js/install.js',
  '/js/push.js',
  '/manifest.webmanifest',
  '/icons/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.all(SHELL.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.hostname.endsWith('supabase.co')) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && (url.origin === self.location.origin || res.type === 'cors' || res.type === 'basic')) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* ---------- recordatorios de lectura (Web Push) ---------- */

const FALLBACK = {
  title: 'AS READER',
  body: 'Tu libro sigue exactamente donde lo dejaste. Qué casualidad.',
};

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

  const title = data.title || FALLBACK.title;
  const body = data.body || FALLBACK.body;

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'asreader-recordatorio',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || '/#inicio' },
    actions: [{ action: 'abrir', title: 'Leer ahora' }],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/#inicio';

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => c.url.includes(self.location.origin));
    if (open) {
      await open.focus();
      if ('navigate' in open) await open.navigate(target).catch(() => {});
      return;
    }
    await self.clients.openWindow(target);
  })());
});
