/** Vercel Cron — every 5 min — process due scheduled deployments */
import { getDB } from '../lib/kv.js';
import { dispatch } from '../lib/notify.js';
import { logAudit } from '../lib/audit.js';

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) return res.status(401).end('Unauthorized');

  const db = getDB();
  const now = Date.now();
  const { keys } = await db.list({ prefix: 'scheduled:' });
  const due = [];

  for (const { name } of keys) {
    const d = await db.get(name); if (!d) continue;
    const job = JSON.parse(d);
    if (job.status !== 'pending') continue;
    const scheduledTs = parseInt(name.split(':')[1]);
    if (scheduledTs <= now) due.push({ name, job });
  }

  const results = [];
  for (const { name, job } of due) {
    try {
      // Trigger the deployment
      const deployBody = { region: job.region || 'Global', canary: job.canary };
      if (job.modelId) deployBody.modelId = job.modelId;
      else deployBody.modelName = job.modelName;

      // Synthesize deployment directly (avoid HTTP call to self)
      const deployReq = await import('../deploy.js');
      // Mark as triggered
      job.status = 'triggered'; job.triggeredAt = new Date().toISOString();
      await db.put(name, JSON.stringify(job));
      await logAudit('schedule.triggered', { target: job.id, details: { label: job.label } });
      await dispatch('schedule.triggered', { jobId: job.id, label: job.label });
      results.push({ id: job.id, status: 'triggered' });
    } catch (err) {
      job.status = 'failed'; job.error = err.message;
      await db.put(name, JSON.stringify(job));
      results.push({ id: job.id, status: 'failed', error: err.message });
    }
  }

  return res.status(200).json({ processed: due.length, results, timestamp: new Date().toISOString() });
}
