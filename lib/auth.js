// AS READER — ¿quien llama a /api es el dueño con sesión?
// Se manda el token de la sesión (Authorization: Bearer ...) y se le pregunta
// a la base con ese token: por RLS solo un dueño puede leer reader_users.

const URL_BASE = 'https://derzetuipyugmrjaxcyu.supabase.co/rest/v1';
const PUBLISHABLE_KEY = 'sb_publishable_XC5v-_UBfrsnbTLIJPqe6w_xXz3tCA6';

export async function isOwnerRequest(req, fetchImpl = fetch) {
  const auth = req.headers?.authorization || '';
  if (!/^Bearer \S+$/.test(auth)) return false;
  try {
    const res = await fetchImpl(`${URL_BASE}/reader_users?select=id&limit=1`, {
      headers: { apikey: PUBLISHABLE_KEY, Authorization: auth },
    });
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}
