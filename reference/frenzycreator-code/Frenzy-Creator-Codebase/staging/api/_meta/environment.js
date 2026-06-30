/**
 * GET /api/_meta/environment
 *
 * Lightweight, public, read-only endpoint that returns metadata about the
 * currently-running deployment. The env-banner client script calls this
 * to decorate the staging banner with the actual git ref + commit SHA so
 * developers can verify exactly which build their browser is hitting.
 *
 * The response contains ONLY non-sensitive Vercel system env vars and an
 * inferred environment label. It does NOT echo any secrets, Supabase
 * keys, partner tokens, etc. — safe to leave fully public.
 *
 * On localhost (no Vercel env), it returns env: 'local' with empty refs.
 *
 * Cached for 60s so the banner doesn't hammer the function on every page
 * load when devs are clicking around.
 */
module.exports = function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Vercel system env vars — see https://vercel.com/docs/projects/environment-variables/system-environment-variables
  const env       = (process.env.VERCEL_ENV || 'local').toLowerCase(); // production | preview | development | local
  const gitRef    = process.env.VERCEL_GIT_COMMIT_REF || '';
  const gitSha    = process.env.VERCEL_GIT_COMMIT_SHA || '';
  const region    = process.env.VERCEL_REGION || '';
  const url       = process.env.VERCEL_URL || '';
  // STAGING_MODE is an opt-in override. If you want the banner to also
  // call a Vercel "production"-typed deployment "STAGING" (e.g. you give
  // staging its own production env), set STAGING_MODE=1 on that project.
  const stagingMode = String(process.env.STAGING_MODE || '').trim() === '1';

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  return res.status(200).json({
    ok: true,
    env: stagingMode && env === 'production' ? 'staging' : env,
    gitRef,
    gitSha,
    region,
    deploymentUrl: url
  });
};
