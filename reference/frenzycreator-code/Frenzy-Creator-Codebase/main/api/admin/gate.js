const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body || {};
  const expected = (process.env.ADMIN_PASSWORD || '').trim();

  if (!expected) {
    console.error('ADMIN_PASSWORD env var is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!password || password !== expected) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const sessionSecret = (process.env.ADMIN_SESSION_SECRET || '').trim();
  if (!sessionSecret) {
    console.error('ADMIN_SESSION_SECRET env var is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  res.setHeader('Set-Cookie', [
    `__admin_gate=${encodeURIComponent(sessionSecret)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
  ]);

  return res.status(200).json({ ok: true });
};
