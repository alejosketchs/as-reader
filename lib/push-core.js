/* AS READER — motor de los recordatorios push.
   Lee la bitácora de cada perfil, decide si merece un empujón y lo manda. */

import webpush from 'web-push';
import { select, insert, patch, remove } from './supa.js';
import { buildMessage } from './phrases.js';

export const TZ = 'America/Bogota';

/** Fecha de hoy en Bogotá como 'YYYY-MM-DD' (no en UTC: el cron corre en otro huso). */
export function todayBogota() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const dayDiff = (fromISO, toISO) =>
  Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 864e5);

const shiftISO = (iso, days) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const prv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !prv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:as.dibujo@gmail.com', pub, prv);
  vapidReady = true;
  return true;
}

/** Páginas de hoy, días sin leer, racha viva y libro en curso de cada perfil. */
export function statsFor(profileId, logs, books, today) {
  const mine = logs.filter((l) => l.profile_id === profileId);
  const byDate = new Map();
  mine.forEach((l) => byDate.set(l.logged_date, (byDate.get(l.logged_date) || 0) + Number(l.pages_read || 0)));

  const pagesToday = byDate.get(today) || 0;
  const dates = [...byDate.keys()].sort();
  const last = dates[dates.length - 1] || null;

  // Racha: días consecutivos con lectura, contando hacia atrás desde hoy
  // (o desde ayer si hoy todavía está en blanco, para no romperla a media jornada).
  let streak = 0;
  let cursor = pagesToday > 0 ? today : shiftISO(today, -1);
  while (byDate.get(cursor)) { streak++; cursor = shiftISO(cursor, -1); }

  const reading = books
    .filter((b) => b.profile_id === profileId && b.status === 'reading')
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];

  return {
    pagesToday,
    pages: pagesToday,
    hasLogs: mine.length > 0,
    daysSince: last ? dayDiff(last, today) : 999,
    streak,
    book: reading?.title || '',
  };
}

/** Manda una notificación a todos los dispositivos de un perfil.
 *  Las suscripciones muertas (404/410) se borran solas. */
export async function pushToSubs(subs, payload) {
  if (!ensureVapid()) throw new Error('Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
  let sent = 0;
  const dead = [];

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 6 * 3600, urgency: 'normal' },
      );
      sent++;
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) dead.push(s.endpoint);
      else console.log('push error', code, String(err?.body || err?.message || err).slice(0, 200));
    }
  }));

  for (const endpoint of dead) {
    await remove('reader_push_subs', `endpoint=eq.${encodeURIComponent(endpoint)}`).catch(() => {});
  }
  if (sent) {
    const now = new Date().toISOString();
    const alive = subs.map((s) => s.endpoint).filter((e) => !dead.includes(e));
    await Promise.all(alive.map((endpoint) => patch(
      'reader_push_subs', `endpoint=eq.${encodeURIComponent(endpoint)}`, { last_sent_at: now },
    ).catch(() => {})));
  }
  return { sent, removed: dead.length };
}

/** Recorre los perfiles suscritos a una ranura y manda lo que corresponda.
 *  `force` ignora el filtro de "ya leyó hoy" y el candado anti-duplicado (para la prueba). */
export async function runSlot(slot, { force = false, onlyProfile = null } = {}) {
  const today = todayBogota();
  const slotColumn = slot === 'manana' ? 'morning' : 'night';

  let query = 'select=*&enabled=eq.true';
  if (!force) query += `&${slotColumn}=eq.true`;
  if (onlyProfile) query += `&profile_id=eq.${encodeURIComponent(onlyProfile)}`;
  const subs = await select('reader_push_subs', query);
  if (!subs.length) return { today, slot, profiles: [], note: 'sin suscripciones' };

  const ids = [...new Set(subs.map((s) => s.profile_id))];
  const inList = `(${ids.map((i) => `"${i}"`).join(',')})`;
  const since = shiftISO(today, -400);

  const [users, logs, books, alreadySent] = await Promise.all([
    select('reader_users', `select=id,name&id=in.${encodeURIComponent(inList)}`),
    select('reader_logs', `select=profile_id,pages_read,logged_date&profile_id=in.${encodeURIComponent(inList)}&logged_date=gte.${since}`),
    select('reader_books', `select=profile_id,title,status,updated_at&profile_id=in.${encodeURIComponent(inList)}`),
    force ? Promise.resolve([])
      : select('reader_push_sent', `select=profile_id&slot=eq.${slot}&sent_date=eq.${today}&profile_id=in.${encodeURIComponent(inList)}`),
  ]);

  const sentIds = new Set(alreadySent.map((r) => r.profile_id));
  const results = [];

  for (const id of ids) {
    if (sentIds.has(id)) { results.push({ id, skipped: 'ya se envió hoy' }); continue; }

    const stats = statsFor(id, logs, books, today);
    if (!force && stats.pagesToday > 0) { results.push({ id, skipped: 'ya leyó hoy' }); continue; }

    const name = users.find((u) => u.id === id)?.name || '';
    const message = buildMessage({ ...stats, slot, name });
    const mySubs = subs.filter((s) => s.profile_id === id);

    const out = await pushToSubs(mySubs, {
      title: message.title,
      body: message.body,
      tag: `asreader-${slot}-${today}`,
      url: '/#inicio',
    });

    if (out.sent) {
      await insert('reader_push_sent', [{
        profile_id: id, slot, sent_date: today, title: message.title, body: message.body,
      }], { ignoreDuplicates: true }).catch(() => {});
    }
    results.push({ id, ...out, title: message.title });
  }

  return { today, slot, profiles: results };
}
