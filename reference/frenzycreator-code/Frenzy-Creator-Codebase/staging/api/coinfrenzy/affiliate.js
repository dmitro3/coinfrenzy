const { forwardToCoinfrenzy } = require('../_lib/coinfrenzyCron');
const { setCors } = require('../_lib/cors');
const { requireAdminAuth } = require('../_lib/adminAuth');

module.exports = async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdminAuth(req, res)) return;

  try {
    const { status, body } = await forwardToCoinfrenzy('/', {
      method: 'POST',
      body: JSON.stringify(req.body || {})
    });
    return res.status(status).json(body != null ? body : {});
  } catch (err) {
    const code = err.statusCode || 500;
    console.error('[coinfrenzy/affiliate POST]', err);
    return res.status(code).json({ error: 'CoinFrenzy proxy error' });
  }
};
