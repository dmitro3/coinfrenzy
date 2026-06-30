const { getCronBaseUrl, getCronApiKey } = require('../_lib/coinfrenzyCron');
const { setCors } = require('../_lib/cors');

function setHealthCors(res) {
  setCors(res, 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Frenzy-Cron-Debug');
}

/**
 * Operator diagnostics. Disabled unless COINFRENZY_CRON_DEBUG_SECRET is set on the server.
 * After redeploy: GET /api/coinfrenzy/health?secret=YOUR_SECRET
 * Or: X-Frenzy-Cron-Debug: YOUR_SECRET
 * Never returns the API key; only confirms it is non-empty and shows resolved cron base URL.
 */
module.exports = async function handler(req, res) {
  setHealthCors(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = (process.env.COINFRENZY_CRON_DEBUG_SECRET || '').trim();
  if (!expected) {
    return res.status(404).end();
  }

  const rawQ = req.query && req.query.secret;
  const fromQuery = Array.isArray(rawQ) ? rawQ[0] : rawQ;
  const fromHeader = req.headers['x-frenzy-cron-debug'];
  const provided =
    (typeof fromQuery === 'string' ? fromQuery : '').trim() ||
    (typeof fromHeader === 'string' ? fromHeader.trim() : '');

  if (provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.status(200).json({
    ok: true,
    cronBaseUrl: getCronBaseUrl(),
    apiKeyConfigured: Boolean(getCronApiKey()),
    vercelEnv: process.env.VERCEL_ENV || null,
    nodeEnv: process.env.NODE_ENV || null
  });
};
