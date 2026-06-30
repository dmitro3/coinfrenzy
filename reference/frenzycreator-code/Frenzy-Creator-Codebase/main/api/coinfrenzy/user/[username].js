const { forwardToCoinfrenzy } = require('../../_lib/coinfrenzyCron');
const { setCors } = require('../../_lib/cors');

// This route is intentionally unauthenticated: it is called by partner.html
// during the registration flow to verify a CoinFrenzy username before the user
// has any session. It performs a read-only lookup and exposes no PII beyond
// whether a given username exists on the upstream platform.
module.exports = async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = req.query && req.query.username;
  const username = Array.isArray(raw) ? raw[0] : raw;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Missing username' });
  }

  try {
    const path = `/user/${encodeURIComponent(username.trim())}`;
    const { status, body } = await forwardToCoinfrenzy(path, { method: 'GET' });
    return res.status(status).json(body != null ? body : {});
  } catch (err) {
    const code = err.statusCode || 500;
    console.error('[coinfrenzy/user]', err);
    return res.status(code).json({ error: 'CoinFrenzy proxy error' });
  }
};
