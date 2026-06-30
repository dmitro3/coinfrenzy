const { forwardToCoinfrenzy } = require('../../_lib/coinfrenzyCron');
const { setCors } = require('../../_lib/cors');
const { requireAdminAuth } = require('../../_lib/adminAuth');

module.exports = async function handler(req, res) {
  setCors(res, 'PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!requireAdminAuth(req, res)) return;

  const raw = req.query && req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing id' });
  }

  const path = `/${encodeURIComponent(id.trim())}`;

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
    console.error('[coinfrenzy/affiliate/:id]', err);
    return res.status(code).json({ error: 'CoinFrenzy proxy error' });
  }
};
