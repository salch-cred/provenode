/**
 * GET  /api/identity        — org identity (public address only)
 * POST /api/identity/fund   — fund account with testnet APT+ShelbyUSD
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  if (req.method === 'GET') {
    const privKey = process.env.SHELBY_PRIVATE_KEY;
    if (!privKey) return res.status(200).json({ configured: false, message: 'Set SHELBY_PRIVATE_KEY to enable persistent org identity.' });
    try {
      const { Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');
      const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privKey) });
      return res.status(200).json({
        configured: true,
        address: account.accountAddress.toString(),
        publicKey: account.publicKey.toString(),
        network: process.env.SHELBY_NETWORK || 'testnet',
        explorerUrl: `https://explorer.aptoslabs.com/account/${account.accountAddress.toString()}?network=custom&customNetworkUrl=https://api.shelbynet.shelby.xyz/v1`,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  if (req.method === 'POST') {
    const privKey = process.env.SHELBY_PRIVATE_KEY;
    const apiKey = process.env.SHELBY_API_KEY;
    if (!privKey || !apiKey) return res.status(400).json({ error: 'SHELBY_PRIVATE_KEY and SHELBY_API_KEY required.' });
    try {
      const { Account, Ed25519PrivateKey, Network } = await import('@aptos-labs/ts-sdk');
      const { ShelbyClient } = await import('@shelby-protocol/sdk/browser');
      const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privKey) });
      const client = new ShelbyClient({ network: Network.SHELBYNET, apiKey });
      await client.fundAccountWithAPT({ address: account.accountAddress, amount: 100_00000000 });
      await client.fundAccountWithShelbyUSD({ address: account.accountAddress, amount: 10000_00000000 });
      return res.status(200).json({ success: true, address: account.accountAddress.toString(), funded: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}
