/**
 * GET /api/shelby-status
 *
 * Reports Shelby integration status without exposing credentials.
 */

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const hasKey = Boolean(process.env.SHELBY_API_KEY);

  return res.status(200).json({
    mode: hasKey ? 'production' : 'demo',   // was inverted in original — fixed
    network: process.env.SHELBY_NETWORK || 'testnet',
    connected: hasKey,
  });
}
