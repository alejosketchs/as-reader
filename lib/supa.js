// AS READER — acceso a Supabase desde las funciones serverless.
// Usa la misma llave publicable del cliente: las tablas reader_* tienen RLS
// `using(true)` y el PIN es la puerta real, así que no hace falta service_role.

const URL_BASE = 'https://derzetuipyugmrjaxcyu.supabase.co/rest/v1';
const KEY = 'sb_publishable_XC5v-_UBfrsnbTLIJPqe6w_xXz3tCA6';

const headers = (extra = {}) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  ...extra,
});

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
