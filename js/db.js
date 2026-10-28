// AS READER — capa de datos (Supabase + caché local)
import { sb } from './supabase.js';

export { sb };

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

/* ---------- PERFILES (compartidos con AS HUB, ya no se usan desde Reader) ---------- */
export const Profiles = {
  async list() {
    return unwrap(await sb.from('profiles').select('*').order('sort_order'));
  },
};

/* ---------- USUARIOS PROPIOS DE READER ---------- */
export const ReaderUsers = {
  async list() {
    return unwrap(await sb.from('reader_users').select('*').order('sort_order'));
  },
  async create(user) {
    return unwrap(await sb.from('reader_users').insert(user).select().single());
  },
  async update(id, patch) {
    return unwrap(await sb.from('reader_users').update(patch).eq('id', id).select().single());
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
  async listAll() {
    return unwrap(await sb.from('reader_books').select('*'));
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

/* ---------- GLOSARIO ---------- */
export const Glossary = {
  async listByProfile(profileId) {
    return unwrap(await sb.from('reader_glossary').select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false }));
  },
  async listAll() {
    return unwrap(await sb.from('reader_glossary').select('*'));
  },
  /** Inserta una palabra nueva. Si ya existe (unique profile_id+word_normalized),
   *  lanza un error con `.duplicate = true` en vez del error crudo de Postgres. */
  async create(entry) {
    const { data, error } = await sb.from('reader_glossary').insert(entry).select().single();
    if (error) {
      if (error.code === '23505') {
        const dup = new Error('La palabra ya existe en el glosario');
        dup.duplicate = true;
        throw dup;
      }
      throw error;
    }
    return data;
  },
  async update(id, patch) {
    return unwrap(await sb.from('reader_glossary').update(patch).eq('id', id).select().single());
  },
  async remove(id) {
    return unwrap(await sb.from('reader_glossary').delete().eq('id', id));
  },
};

/* ---------- CITAS Y FRASES ---------- */
export const Quotes = {
  async listByProfile(profileId) {
    return unwrap(await sb.from('reader_quotes').select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false }));
  },
  async create(entry) {
    return unwrap(await sb.from('reader_quotes').insert(entry).select().single());
  },
  async update(id, patch) {
    return unwrap(await sb.from('reader_quotes').update(patch).eq('id', id).select().single());
  },
  async remove(id) {
    return unwrap(await sb.from('reader_quotes').delete().eq('id', id));
  },
};

/* ---------- SUSCRIPCIONES DE NOTIFICACIONES (Web Push) ---------- */
export const PushSubs = {
  async find(endpoint) {
    const rows = unwrap(await sb.from('reader_push_subs').select('*').eq('endpoint', endpoint).limit(1));
    return rows?.[0] || null;
  },
  async save(row) {
    return unwrap(await sb.from('reader_push_subs')
      .upsert(row, { onConflict: 'endpoint' })
      .select().single());
  },
  async update(endpoint, patch) {
    return unwrap(await sb.from('reader_push_subs').update(patch).eq('endpoint', endpoint).select().single());
  },
  async remove(endpoint) {
    return unwrap(await sb.from('reader_push_subs').delete().eq('endpoint', endpoint));
  },
};
