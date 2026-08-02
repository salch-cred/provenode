/**
 * GET /api/config
 *
 * Returns **only** the public configuration values the frontend needs.
 * NEVER returns SHELBY_API_KEY or any secret.
 */

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  res.setHeader('Cache-Control', 'public, max-age=300');

  return res.status(200).json({
    mode: process.env.SHELBY_API_KEY ? 'shelby' : 'demo',
    network: process.env.SHELBY_NETWORK || 'testnet',
    maxUploadBytes: 100 * 1024 * 1024,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'local',
  });
}
