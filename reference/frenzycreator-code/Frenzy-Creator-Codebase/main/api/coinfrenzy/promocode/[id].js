const { forwardToCoinfrenzy } = require('../../_lib/coinfrenzyCron');
const { setCors } = require('../../_lib/cors');
const { verifyToken: verifyAdmin } = require('../../_lib/adminAuth');
const { verifyPartnerToken } = require('../../_lib/partnerAuth');

function requireAnyAuth(req, res) {
  const adminToken = String(req.headers['x-admin-token'] || '').trim();
  const partnerToken = String(req.headers['x-partner-token'] || '').trim();
  if (adminToken && verifyAdmin(adminToken)) return true;
  if (partnerToken && verifyPartnerToken(partnerToken)) return true;
  res.status(401).json({ error: 'Unauthorized — valid session required' });
  return false;
}

module.exports = async function handler(req, res) {
  setCors(res, 'PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!requireAnyAuth(req, res)) return;

  const raw = req.query && req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing id' });
  }

  const path = `/promocode/${encodeURIComponent(id.trim())}`;

  try {
    if (req.method === 'PUT') {
      const { status, body } = await forwardToCoinfrenzy(path, {
        method: 'PUT',
        body: JSON.stringify(req.body || {})
      });
      return res.status(status).json(body != null ? body : {});
    }
    if (req.method === 'DELETE') {
      const { status, body } = await forwardToCoinfrenzy(path, {
        method: 'DELETE'
      });
      if (body == null || status === 204) {
        return res.status(status).end();
      }
      return res.status(status).json(body);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const code = err.statusCode || 500;
    console.error('[coinfrenzy/promocode/:id]', err);
    return res.status(code).json({ error: 'CoinFrenzy proxy error' });
  }
};
