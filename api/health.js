/**
 * GET /api/health
 *
 * Liveness probe — safe to cache for 60 s.
 * Never returns secrets or internal details.
 */

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).json({
    status: 'ok',
    service: 'provenode',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'local',
    environment: process.env.VERCEL_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
}
