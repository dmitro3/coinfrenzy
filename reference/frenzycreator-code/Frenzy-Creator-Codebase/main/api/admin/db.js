const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('../_lib/adminAuth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const admin = requireAdminAuth(req, res);
  if (!admin) return;

  const { table, method, select, filters, data, limit, order, single, upsertOptions } = req.body;
  if (!table) return res.status(400).json({ error: 'table required' });

  const supabase = createClient(
    process.env.SUPABASE_URL || 'https://mziyopzamtlcncvriave.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    let query;
    const m = method || 'select';

    if (m === 'select') {
      query = supabase.from(table).select(select || '*');
    } else if (m === 'insert') {
      query = supabase.from(table).insert(data);
      if (select) query = query.select(select);
    } else if (m === 'update') {
      query = supabase.from(table).update(data);
      if (select) query = query.select(select);
    } else if (m === 'upsert') {
      query = supabase.from(table).upsert(data, upsertOptions || {});
      if (select) query = query.select(select);
    } else if (m === 'delete') {
      query = supabase.from(table).delete();
    } else {
      return res.status(400).json({ error: 'Invalid method: ' + m });
    }

    if (filters && Array.isArray(filters)) {
      for (const f of filters) {
        switch (f.type) {
          case 'eq':    query = query.eq(f.field, f.value); break;
          case 'neq':   query = query.neq(f.field, f.value); break;
          case 'in':    query = query.in(f.field, f.values || f.value); break;
          case 'gt':    query = query.gt(f.field, f.value); break;
          case 'lt':    query = query.lt(f.field, f.value); break;
          case 'gte':   query = query.gte(f.field, f.value); break;
          case 'lte':   query = query.lte(f.field, f.value); break;
          case 'like':  query = query.like(f.field, f.value); break;
          case 'ilike': query = query.ilike(f.field, f.value); break;
          case 'is':    query = query.is(f.field, f.value); break;
          case 'range': query = query.range(f.from, f.to); break;
        }
      }
    }

    if (order) {
      const orders = Array.isArray(order) ? order : [order];
      for (const o of orders) {
        query = query.order(o.field, { ascending: o.ascending !== false });
      }
    }
    if (typeof limit === 'number') query = query.limit(limit);
    if (single) query = query.single();

    const result = await query;
    return res.status(200).json({
      data: result.data,
      error: result.error ? result.error.message : null
    });
  } catch (err) {
    return res.status(500).json({ data: null, error: err.message });
  }
};
