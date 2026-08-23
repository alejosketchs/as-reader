// AS READER — capa de datos (Supabase + caché local)
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const CDNS = [
  'https://esm.sh/@supabase/supabase-js@2.45.4',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',
  'https://unpkg.com/@supabase/supabase-js@2.45.4/dist/module/index.js',
];

async function loadCreateClient() {
  let lastError;
  for (const url of CDNS) {
    try {
      const mod = await import(/* @vite-ignore */ url);
      if (mod?.createClient) return mod.createClient;
    } catch (err) { lastError = err; }
  }
  throw lastError || new Error('No se pudo cargar la librería de datos');
}

const createClient = await loadCreateClient();

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

/* ---------- caché local: la app abre al instante y sin conexión ---------- */
const CACHE_PREFIX = 'asreader:cache:';

export function readCache(key, fallback = null) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export function writeCache(key, value) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)); } catch { /* cuota llena */ }
}

export async function cached(key, loader, onFresh) {
  const local = readCache(key);
  if (local != null && onFresh) onFresh(local, true);
  try {
    const fresh = await loader();
    writeCache(key, fresh);
    if (onFresh) onFresh(fresh, false);
    return fresh;
  } catch (err) {
    if (local != null) return local;
    throw err;
  }
}

/* ---------- helpers ---------- */
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export const online = () => navigator.onLine;

/* ---------- PERFILES (compartidos con AS HUB) ---------- */
export const Profiles = {
  async list() {
    return unwrap(await sb.from('profiles').select('*').order('sort_order'));
  },
};

/* ---------- SESIÓN DEL SUITE ---------- */
export const Session = {
  async open(profileId, days, device) {
    const token = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
    const expires = new Date(Date.now() + days * 864e5).toISOString();
    await unwrap(await sb.from('sessions').insert({
      token, profile_id: profileId, expires_at: expires, device: device || '',
    }).select().single());
    return { token, expires_at: expires, profile_id: profileId };
  },
  async check(token) {
    if (!token) return null;
    const rows = unwrap(await sb.from('sessions').select('*')
      .eq('token', token).gt('expires_at', new Date().toISOString()).limit(1));
    return rows?.[0] || null;
  },
  async touch(token) {
    try { await sb.from('sessions').update({ last_seen: new Date().toISOString() }).eq('token', token); }
    catch { /* no es crítico */ }
  },
  async close(token) {
    if (!token) return;
    try { await sb.from('sessions').delete().eq('token', token); } catch { /* noop */ }
  },
};

/* ---------- LIBROS ---------- */
export const Books = {
  async list(profileId) {
    return unwrap(await sb.from('reader_books').select('*')
      .eq('profile_id', profileId)
      .order('status', { ascending: true })
      .order('created_at', { ascending: false }));
  },
  async create(book) {
    return unwrap(await sb.from('reader_books').insert(book).select().single());
  },
  async update(id, patch) {
    return unwrap(await sb.from('reader_books').update(patch).eq('id', id).select().single());
  },
  async remove(id) {
    return unwrap(await sb.from('reader_books').delete().eq('id', id));
  },
};

/* ---------- BITÁCORA DE LECTURA ---------- */
export const Logs = {
  async listByProfile(profileId) {
    return unwrap(await sb.from('reader_logs').select('*')
      .eq('profile_id', profileId)
      .order('logged_date', { ascending: false })
      .order('created_at', { ascending: false }));
  },
  async listAll() {
    return unwrap(await sb.from('reader_logs').select('*'));
  },
  async listByBook(bookId) {
    return unwrap(await sb.from('reader_logs').select('*')
      .eq('book_id', bookId)
      .order('logged_date', { ascending: false })
      .order('created_at', { ascending: false }));
  },
  async create(log) {
    return unwrap(await sb.from('reader_logs').insert(log).select().single());
  },
};

/* ---------- LOGROS DESBLOQUEADOS ---------- */
export const Unlocks = {
  async listAll() {
    return unwrap(await sb.from('reader_unlocks').select('*'));
  },
  async unlock(profileId, achievementKey) {
    return unwrap(await sb.from('reader_unlocks')
      .upsert({ profile_id: profileId, achievement_key: achievementKey }, { onConflict: 'profile_id,achievement_key' })
      .select().single());
  },
};
