// AS READER — acceso a Supabase desde las funciones serverless.
// Usa la llave secreta (service role) desde la variable de entorno de Vercel
// SUPABASE_SERVICE_ROLE_KEY: la base ya no deja nada a la llave pública
// (RLS solo para el dueño, ver AS-HUB docs/seguridad.md). Nunca va al cliente.

const URL_BASE = 'https://derzetuipyugmrjaxcyu.supabase.co/rest/v1';

function serviceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor');
  return key;
}

// Las llaves nuevas (sb_secret_...) van solo en `apikey`; las antiguas (JWT)
// también en Authorization.
const headers = (extra = {}) => {
  const key = serviceKey();
  return {
    apikey: key,
    ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }),
    'Content-Type': 'application/json',
    ...extra,
  };
};

export async function select(table, query = '') {
  const res = await fetch(`${URL_BASE}/${table}?${query}`, { headers: headers() });
  if (!res.ok) throw new Error(`select ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function insert(table, rows, { ignoreDuplicates = false } = {}) {
  const res = await fetch(`${URL_BASE}/${table}`, {
    method: 'POST',
    headers: headers(ignoreDuplicates
      ? { Prefer: 'resolution=ignore-duplicates,return=representation' }
      : { Prefer: 'return=representation' }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`insert ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function patch(table, query, values) {
  const res = await fetch(`${URL_BASE}/${table}?${query}`, {
    method: 'PATCH', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(values),
  });
  if (!res.ok) throw new Error(`patch ${table}: ${res.status} ${await res.text()}`);
}

export async function remove(table, query) {
  const res = await fetch(`${URL_BASE}/${table}?${query}`, {
    method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }),
  });
  if (!res.ok) throw new Error(`delete ${table}: ${res.status} ${await res.text()}`);
}
