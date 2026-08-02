/**
 * GET /api/stream?deploymentId=xxx  — Server-Sent Events live deployment stream
 * Streams real-time device verification events without polling.
 */
import { getDB } from './lib/kv.js';

export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  const { deploymentId } = req.query;
  if (!deploymentId) return res.status(400).json({ error: 'deploymentId required.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.flush?.();
  };

  const db = getDB();
  let lastVerified = -1;
  let ticks = 0;
  const MAX_TICKS = 180; // 3 minutes max stream

  const interval = setInterval(async () => {
    ticks++;
    if (ticks > MAX_TICKS) {
      send('timeout', { message: 'Stream closed after 3 minutes.' });
      clearInterval(interval);
      res.end();
      return;
    }

    try {
      const [md, dd] = await Promise.all([
        db.get(`deployment:${deploymentId}`),
        db.get(`devices:${deploymentId}`),
      ]);

      if (!md) {
        send('error', { message: 'Deployment not found.' });
        clearInterval(interval);
        res.end();
        return;
      }

      const manifest = JSON.parse(md);
      const devices = dd ? JSON.parse(dd) : { verified: 0, target: 248 };
      const progress = Math.min(100, Math.round((devices.verified / devices.target) * 100));

      // Only send update if something changed
      if (devices.verified !== lastVerified) {
        lastVerified = devices.verified;
        send('progress', {
          deploymentId,
          verified: devices.verified,
          target: devices.target,
          progress,
          status: manifest.status,
          model: manifest.model,
          version: manifest.version,
        });
      }

      if (manifest.status === 'verified' || manifest.status === 'rolled_back') {
        send('complete', { status: manifest.status, progress });
        clearInterval(interval);
        res.end();
      }
    } catch (err) {
      send('error', { message: err.message });
    }
  }, 1000);

  req.on('close', () => { clearInterval(interval); });
}
