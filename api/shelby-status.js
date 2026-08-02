export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const hasKey = Boolean(process.env.SHELBY_API_KEY);
  const hasIdentity = Boolean(process.env.SHELBY_PRIVATE_KEY);
  return res.status(200).json({ mode: hasKey ? 'production' : 'demo', network: process.env.SHELBY_NETWORK || 'shelbynet', connected: hasKey, persistentIdentity: hasIdentity, apiUrl: 'https://api.shelbynet.shelby.xyz/v1' });
}
