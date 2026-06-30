/**
 * GET /api/admin/affiliate-diagnose?email=foo@bar.com
 *
 * Ground-truth dump for one affiliate. Built so we can debug the
 * "Jerry shows X but admin shows Y" class of bugs without guessing.
 *
 * Returns everything that would feed into ANY view of this affiliate:
 *   - users row (campaigns jsonb, status, rev share)
 *   - CoinFrenzy's view (GET /user/:username) — what CF actually has
 *   - reconciliation: which CF codes we have on file, which we don't
 *   - players attributed to them, broken down by HOW they're attributed
 *     (strict email match vs slug-fallback vs orphaned)
 *   - ngr_data rows: count + sample, with attribution buckets
 *   - canonical ledger via api/_lib/ledger
 *
 * If `email` doesn't resolve to a known users row but the caller
 * passed `username`, we'll still hit CF for that username so admin
 * can see whether CF knows about a code we've never seen.
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('../_lib/adminAuth');
const { setCors } = require('../_lib/cors');
const { normalizeSlug } = require('../_lib/slugLookup');
const { fetchCfUserCodes } = require('../_lib/campaignSync');
const { getDeposit, getWithdrawal, getNgr, getGgr } = require('../_lib/ngrSchema');
const { computeLedgerForEmail, norm } = require('../_lib/ledger');

const SAMPLE_LIMIT = 50;
const PAGE_SIZE = 1000;
// Hard cap on rows pulled per affiliate. At 10k+ scale a single affiliate
// is unlikely to exceed this; if they do, we surface a "truncated" flag
// so admin knows the counts are conservative.
const MAX_ROWS = 20000;

async function fetchAllRows(buildQueryFn) {
  const out = [];
  let offset = 0;
  while (offset < MAX_ROWS) {
    const q = buildQueryFn(offset, offset + PAGE_SIZE - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return { rows: out, truncated: offset >= MAX_ROWS };
}

module.exports = async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const admin = requireAdminAuth(req, res);
  if (!admin) return;

  const emailRaw = (req.query && req.query.email) || '';
  const email = String(emailRaw).trim().toLowerCase();
  const usernameQuery = (req.query && req.query.username) || '';

  if (!email && !usernameQuery) {
    return res.status(400).json({ error: 'email or username query param required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // ---- 1) users row ----
    let userRow = null;
    if (email) {
      const r = await supabase
        .from('users')
        .select('email, fullname, status, casino_referral_code, rev_share_l1, rev_share_l2, l2_enabled, campaigns, created_at')
        .ilike('email', email)
        .maybeSingle();
      if (r.error) {
        console.warn('[diagnose] users lookup error:', r.error.message);
      }
      userRow = r.data || null;
    }

    let campaigns = [];
    if (userRow) {
      let camps = userRow.campaigns;
      if (typeof camps === 'string') {
        try { camps = JSON.parse(camps); } catch { camps = []; }
      }
      if (Array.isArray(camps)) campaigns = camps;
    }
    const ourSlugs = campaigns
      .map(c => normalizeSlug(c && c.slug))
      .filter(Boolean);

    // ---- 2) CoinFrenzy user codes (truth from CF) ----
    const username = String(
      usernameQuery ||
      (userRow && userRow.casino_referral_code) ||
      ''
    ).trim();

    let cfLookup = null;
    if (username) {
      cfLookup = await fetchCfUserCodes(username);
    }

    const cfReachable = !!(cfLookup && cfLookup.ok && Array.isArray(cfLookup.codes));
    const cfSlugs = cfReachable
      ? cfLookup.codes.map(c => normalizeSlug(c.slug)).filter(Boolean)
      : [];

    // ---- 3) Reconciliation summary ----
    // Only meaningful if CF actually responded with a code list. The
    // GET /user/:username endpoint is CF's "verify casino username"
    // endpoint and may NOT enumerate the affiliate's promo codes — in
    // that case the diff is unknowable, so we don't claim our slugs
    // are stale just because the CF response was empty/errored.
    const ourSet = new Set(ourSlugs);
    const cfSet = new Set(cfSlugs);
    const reconciliation = cfReachable
      ? {
          status: 'ok',
          inBoth: [...ourSet].filter(s => cfSet.has(s)),
          onlyInOurDb: [...ourSet].filter(s => !cfSet.has(s)),
          onlyOnCf: [...cfSet].filter(s => !ourSet.has(s))
        }
      : {
          status: 'cf_unreachable',
          reason: cfLookup ? (cfLookup.error || ('CF returned ' + cfLookup.status)) : 'no username available',
          inBoth: [],
          onlyInOurDb: [],
          onlyOnCf: []
        };

    // ---- 4) Players attributed via either rule ----
    let players = [];
    let playersTruncated = false;
    if (email || ourSlugs.length > 0) {
      try {
        const { rows, truncated } = await fetchAllRows((lo, hi) => {
          let q = supabase
            .from('players')
            .select('id, player_id, player_name, player_email, signup_date, created_at, affiliate_email, promo_code_used, total_ngr')
            .range(lo, hi);
          if (email && ourSlugs.length > 0) {
            q = q.or('affiliate_email.eq.' + email + ',promo_code_used.in.(' + ourSlugs.join(',') + ')');
          } else if (email) {
            q = q.eq('affiliate_email', email);
          } else {
            q = q.in('promo_code_used', ourSlugs);
          }
          return q;
        });
        players = rows;
        playersTruncated = truncated;
      } catch (perr) {
        console.warn('[diagnose] players lookup error:', perr.message);
      }
    }

    const promoSet = Object.create(null);
    ourSlugs.forEach(s => { promoSet[s] = true; });

    const playerBuckets = {
      strictMatch: 0,           // affiliate_email == email
      slugFallback: 0,          // affiliate_email empty, promo matches our slug
      mismatchedAttribution: 0, // affiliate_email is some OTHER affiliate but slug is ours
      noAttribution: 0          // affiliate_email empty AND slug doesn't match (only here because admin search broadened)
    };
    const playerSamples = [];
    players.forEach(p => {
      const ae = norm(p.affiliate_email);
      const promo = norm(p.promo_code_used);
      let bucket = 'noAttribution';
      if (ae === email) bucket = 'strictMatch';
      else if (!ae && promoSet[promo]) bucket = 'slugFallback';
      else if (ae && ae !== email && promoSet[promo]) bucket = 'mismatchedAttribution';
      playerBuckets[bucket] += 1;
      if (playerSamples.length < SAMPLE_LIMIT) {
        playerSamples.push({
          id: p.id,
          player_email: p.player_email,
          promo_code_used: p.promo_code_used,
          affiliate_email: p.affiliate_email,
          signup_date: p.signup_date || p.created_at,
          attribution: bucket
        });
      }
    });

    // ---- 5) NGR rows attributed to this affiliate ----
    let ngrRows = [];
    let ngrTruncated = false;
    if (email) {
      try {
        const { rows, truncated } = await fetchAllRows((lo, hi) => supabase
          .from('ngr_data')
          .select('*')
          .eq('affiliate_email', email)
          .range(lo, hi));
        ngrRows = rows;
        ngrTruncated = truncated;
      } catch (nerr) {
        console.warn('[diagnose] ngr lookup error:', nerr.message);
      }
    }

    // Also: NGR rows whose player_email matches one of our players but
    // whose affiliate_email is NULL or wrong. These are the "orphan NGR"
    // rows that fall out of admin aggregations.
    const myPlayerEmails = players
      .map(p => (p.player_email || '').toLowerCase())
      .filter(Boolean);
    let orphanNgr = [];
    let orphanTruncated = false;
    if (myPlayerEmails.length > 0) {
      // Chunk the IN clause to keep PostgREST URL length sane at scale.
      const CHUNK = 200;
      for (let i = 0; i < myPlayerEmails.length; i += CHUNK) {
        const batch = myPlayerEmails.slice(i, i + CHUNK);
        try {
          const { rows, truncated } = await fetchAllRows((lo, hi) => supabase
            .from('ngr_data')
            .select('*')
            .in('player_email', batch)
            .range(lo, hi));
          rows.forEach(n => {
            const ae = (n.affiliate_email || '').toLowerCase();
            if (!ae || ae !== email) orphanNgr.push(n);
          });
          if (truncated) orphanTruncated = true;
        } catch (oerr) {
          console.warn('[diagnose] orphan ngr chunk error:', oerr.message);
        }
      }
    }

    // Use the tolerant accessors so we don't depend on specific column
    // names. CF / dev can rename `purchase_amount` to `deposit_amount` and
    // this still produces the right numbers.
    const sumWith = (rows, accessor) => rows.reduce((s, n) => s + accessor(n), 0);
    const ngrSummary = {
      attributedRows: ngrRows.length,
      attributedDepositsTotal:    sumWith(ngrRows, getDeposit),
      attributedWithdrawalsTotal: sumWith(ngrRows, getWithdrawal),
      attributedGgrTotal:         sumWith(ngrRows, getGgr),
      attributedNgrTotal:         sumWith(ngrRows, getNgr),
      orphanRows: orphanNgr.length,
      orphanDepositsTotal:    sumWith(orphanNgr, getDeposit),
      orphanWithdrawalsTotal: sumWith(orphanNgr, getWithdrawal),
      orphanGgrTotal:         sumWith(orphanNgr, getGgr),
      orphanNgrTotal:         sumWith(orphanNgr, getNgr)
    };

    // ---- 6) Canonical ledger ----
    let ledger = null;
    let ledgerError = null;
    if (email && userRow) {
      try {
        ledger = await computeLedgerForEmail(supabase, email);
      } catch (lerr) {
        ledgerError = lerr.message || 'ledger compute failed';
      }
    }

    return res.status(200).json({
      ok: true,
      query: { email: email || null, username: username || null },
      user: userRow,
      campaigns: {
        count: campaigns.length,
        slugs: ourSlugs,
        records: campaigns
      },
      coinfrenzy: cfLookup
        ? {
            ok: cfLookup.ok,
            error: cfLookup.error || null,
            status: cfLookup.status || null,
            slugs: cfSlugs,
            codes: cfLookup.codes || [],
            raw: cfLookup.raw
          }
        : { ok: false, error: 'no username available; cannot query CoinFrenzy' },
      reconciliation,
      players: {
        total: players.length,
        truncated: playersTruncated,
        buckets: playerBuckets,
        sample: playerSamples
      },
      ngr: {
        ...ngrSummary,
        truncated: ngrTruncated || orphanTruncated,
        attributedSample: ngrRows.slice(0, SAMPLE_LIMIT),
        orphanSample: orphanNgr.slice(0, SAMPLE_LIMIT)
      },
      ledger,
      ledgerError
    });
  } catch (err) {
    console.error('[affiliate-diagnose] failed:', err);
    return res.status(500).json({ error: err.message || 'diagnose failed' });
  }
};
