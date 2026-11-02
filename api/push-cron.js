// AS READER — recordatorio diario de lectura (lo dispara Vercel Cron).
// Ranuras: ?slot=manana (8:00 Bogotá) y ?slot=noche (20:00 Bogotá).
// Solo notifica a quien NO ha registrado páginas ese día.

import { runSlot } from '../lib/push-core.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  // Sin CRON_SECRET configurado no se corre: la función usa la llave secreta.
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ ok: false, error: 'no autorizado' });
    return;
  }

  const slot = req.query?.slot === 'manana' ? 'manana' : 'noche';

  try {
    const out = await runSlot(slot);
    console.log('push-cron', JSON.stringify(out));
    res.status(200).json({ ok: true, ...out });
  } catch (err) {
    console.log('push-cron falló:', err?.message || String(err));
    res.status(500).json({ ok: false, error: err?.message || 'error' });
  }
}
