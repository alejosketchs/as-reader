// AS READER — envío de prueba desde Ajustes: manda una notificación al instante
// a los dispositivos del perfil, sin importar si ya leyó hoy.

import { runSlot } from '../lib/push-core.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'método no permitido' });
    return;
  }

  const profileId = (req.body?.profile_id || '').toString().trim().slice(0, 60);
  if (!profileId) {
    res.status(400).json({ ok: false, error: 'falta profile_id' });
    return;
  }

  try {
    const out = await runSlot('test', { force: true, onlyProfile: profileId });
    const sent = (out.profiles || []).reduce((acc, p) => acc + (p.sent || 0), 0);
    res.status(200).json({ ok: true, sent, ...out });
  } catch (err) {
    console.log('push-test falló:', err?.message || String(err));
    res.status(500).json({ ok: false, error: err?.message || 'error' });
  }
}
