/**
 * Slack Bot — slash command handler + action dispatcher
 * POST /api/slack  — receives Slack slash commands
 * Slash commands: /provenode status | deploy <id> | fleet | rollback <id>
 */
import { getDB } from './lib/kv.js';
import { createHmac } from 'node:crypto';

function verifySlackSignature(req, body) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return true; // Skip in dev
  const ts = req.headers['x-slack-request-timestamp'];
  const sig = req.headers['x-slack-signature'];
  if (!ts || !sig) return false;
  if (Math.abs(Date.now()/1000 - parseInt(ts)) > 300) return false;
  const expected = 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex');
  return sig === expected;
}

function slackBlock(text, type = 'mrkdwn') {
  return { type: 'section', text: { type, text } };
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Read raw body for signature verification
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString();

  if (!verifySlackSignature(req, rawBody)) {
    return res.status(401).json({ error: 'Invalid Slack signature.' });
  }

  const params = new URLSearchParams(rawBody);
  const command = params.get('command') || '';
  const text = (params.get('text') || '').trim();
  const [subCmd, arg] = text.split(' ');

  const db = getDB();

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';

  try {
    // /provenode status
    if (!subCmd || subCmd === 'status') {
      const [mRes, dRes, devRes] = await Promise.all([
        db.list({ prefix: 'model:' }),
        db.list({ prefix: 'deployment:' }),
        db.list({ prefix: 'device:' }),
      ]);
      const deps = (await Promise.all(dRes.keys.slice(0,20).map(async({name})=>{const d=await db.get(name);return d?JSON.parse(d):null;}))).filter(Boolean);
      const verified = deps.filter(d=>d.status==='verified').length;
      const deploying = deps.filter(d=>d.status==='deploying').length;
      const devices = dRes.keys.length;

      return res.json({
        response_type: 'in_channel',
        blocks: [
          slackBlock('*Provenode Status* 🚀'),
          slackBlock(`📦 *Models:* ${mRes.keys.length}  |  🚀 *Deployments:* ${deps.length}  |  ✅ *Verified:* ${verified}  |  🔄 *In-flight:* ${deploying}`),
          slackBlock(`🖥️ *Devices:* ${devRes.keys.length}  |  View: ${baseUrl}/app.html`),
        ],
      });
    }

    // /provenode fleet
    if (subCmd === 'fleet') {
      const { keys } = await db.list({ prefix: 'device:' });
      const devices = (await Promise.all(keys.map(async({name})=>{const d=await db.get(name);return d?JSON.parse(d):null;}))).filter(Boolean);
      const online = devices.filter(d=>d.status==='online').length;
      return res.json({
        response_type: 'in_channel',
        blocks: [
          slackBlock(`*Fleet Health* 🖥️`),
          slackBlock(`Total: ${devices.length} | Online: ${online} | Health: ${devices.length?(online/devices.length*100).toFixed(1):100}%`),
        ],
      });
    }

    // /provenode deploy <modelId>
    if (subCmd === 'deploy' && arg) {
      return res.json({
        response_type: 'ephemeral',
        text: `⚠️ To deploy model \`${arg}\`, use the console: ${baseUrl}/app.html\n(Slack deploys require 2FA confirmation for safety)`,
      });
    }

    // /provenode rollback <deploymentId>
    if (subCmd === 'rollback' && arg) {
      const raw = await db.get(`deployment:${arg}`);
      if (!raw) return res.json({ text: `❌ Deployment \`${arg}\` not found.` });
      const m = JSON.parse(raw);
      m.status = 'rolled_back'; m.rolledBackAt = new Date().toISOString();
      await db.put(`deployment:${arg}`, JSON.stringify(m));
      return res.json({
        response_type: 'in_channel',
        blocks: [
          slackBlock(`🔁 *Rollback initiated*`),
          slackBlock(`Deployment \`${arg.slice(0,8)}\` (${m.model}) has been rolled back by Slack command.`),
        ],
      });
    }

    return res.json({
      text: `*Provenode Slack Bot* — available commands:\n• \`/provenode status\` — overview\n• \`/provenode fleet\` — fleet health\n• \`/provenode rollback <deploymentId>\` — emergency rollback\n• \`/provenode deploy <modelId>\` — link to deploy`,
    });

  } catch (err) {
    return res.json({ text: `❌ Error: ${err.message}` });
  }
}
