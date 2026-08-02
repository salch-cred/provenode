/**
 * GET /api/metrics  — Prometheus text format for Grafana
 */
import { getDB } from './lib/kv.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.setHeader('Cache-Control', 'no-store');

  const db = getDB();
  const [mRes, dRes, devRes, objRes] = await Promise.all([
    db.list({ prefix: 'model:' }),
    db.list({ prefix: 'deployment:' }),
    db.list({ prefix: 'device:' }),
    db.list({ prefix: 'model:' }),
  ]);

  const deployments = (await Promise.all(dRes.keys.map(async ({ name }) => {
    const d = await db.get(name); return d ? JSON.parse(d) : null;
  }))).filter(Boolean);

  const devices = (await Promise.all(devRes.keys.map(async ({ name }) => {
    const d = await db.get(name); return d ? JSON.parse(d) : null;
  }))).filter(Boolean);

  const verified = deployments.filter(d => d.status === 'verified').length;
  const deploying = deployments.filter(d => d.status === 'deploying').length;
  const rolledBack = deployments.filter(d => d.status === 'rolled_back').length;
  const online = devices.filter(d => d.status === 'online').length;

  const lines = [
    '# HELP provenode_models_total Total number of registered models',
    '# TYPE provenode_models_total gauge',
    `provenode_models_total ${mRes.keys.length}`,
    '',
    '# HELP provenode_deployments_total Total deployments by status',
    '# TYPE provenode_deployments_total gauge',
    `provenode_deployments_total{status="verified"} ${verified}`,
    `provenode_deployments_total{status="deploying"} ${deploying}`,
    `provenode_deployments_total{status="rolled_back"} ${rolledBack}`,
    `provenode_deployments_total{status="total"} ${deployments.length}`,
    '',
    '# HELP provenode_devices_total Fleet device counts',
    '# TYPE provenode_devices_total gauge',
    `provenode_devices_total{status="online"} ${online}`,
    `provenode_devices_total{status="total"} ${devices.length}`,
    '',
    '# HELP provenode_fleet_health_ratio Fraction of fleet that is online',
    '# TYPE provenode_fleet_health_ratio gauge',
    `provenode_fleet_health_ratio ${devices.length ? (online / devices.length).toFixed(4) : 1}`,
    '',
    '# HELP provenode_info Build and environment info',
    '# TYPE provenode_info gauge',
    `provenode_info{version="${process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,8)||'local'}",env="${process.env.VERCEL_ENV||'dev'}"} 1`,
    '',
  ];

  return res.status(200).send(lines.join('\n'));
}
