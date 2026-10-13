import { sql, guard, body, isAdmin } from './_lib.js';

/** همهٔ نقاط مدیریتی با ?a=... : stores | detail | stats | query | delete | csv */
export default guard(async (req, res) => {
  const a = req.query.a;

  if (a === 'stores') {
    const rows = await sql`SELECT * FROM v_stores ORDER BY received_at DESC LIMIT 5000`;
    return res.json({ rows });
  }

  if (a === 'all') {
    const rows = await sql`SELECT data FROM visits ORDER BY received_at DESC`;
    return res.json({ rows: rows.map(r => r.data) });
  }

  if (a === 'detail') {
    const [v] = await sql`SELECT data FROM visits WHERE id = ${String(req.query.id)}`;
    const photos = await sql`SELECT id, kind, bytes FROM photos WHERE visit_id = ${String(req.query.id)} ORDER BY created_at`;
    return res.json({ data: v?.data ?? null, photos });
  }

  if (a === 'stats') {
    const [tot] = await sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE is_final)::int AS final,
        count(*) FILTER (WHERE lead = 'hot')::int AS hot, count(*) FILTER (WHERE lead = 'warm')::int AS warm,
        count(*) FILTER (WHERE lead = 'cold')::int AS cold, count(*) FILTER (WHERE lat IS NOT NULL)::int AS geo,
        (SELECT count(*)::int FROM photos) AS photos FROM visits`;
    const byDay = await sql`SELECT visit_date AS k, count(*)::int AS n FROM visits WHERE visit_date IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 14`;
    const byHood = await sql`SELECT coalesce(neighborhood, '—') AS k, count(*)::int AS n FROM visits GROUP BY 1 ORDER BY 2 DESC LIMIT 12`;
    const byCat = await sql`SELECT value AS k, count(*)::int AS n FROM visit_items WHERE field = 'categories' GROUP BY 1 ORDER BY 2 DESC`;
    const bySrv = await sql`SELECT coalesce(surveyor, '—') AS k, count(*)::int AS n FROM visits GROUP BY 1 ORDER BY 2 DESC`;
    const byProb = await sql`SELECT value AS k, count(*)::int AS n FROM visit_items WHERE field = 'supply_problems' GROUP BY 1 ORDER BY 2 DESC`;
    return res.json({ tot, byDay, byHood, byCat, bySrv, byProb });
  }

  if (a === 'query' && req.method === 'POST') {
    const q = String(body(req).sql || '').trim().replace(/;+\s*$/, '');
    if (!/^(select|with|explain)\b/i.test(q)) throw Object.assign(new Error('فقط پرس‌وجوی SELECT مجاز است'), { status: 400 });
    if (/\bphotos\b/i.test(q) && /\bdata\b|select\s+\*|\.\*/i.test(q)) throw Object.assign(new Error('محتوای عکس‌ها در کوئری نمایش داده نمی‌شود؛ از ستون‌های id/kind/bytes استفاده کنید'), { status: 400 });
    if (q.includes(';')) throw Object.assign(new Error('فقط یک دستور در هر اجرا'), { status: 400 });
    try {
      const out = await sql.transaction(
        [sql`SET LOCAL statement_timeout = 8000`, sql.query(`SELECT * FROM (${q}) AS _q LIMIT 2000`)],
        { readOnly: true });
      const rows = out[1];
      return res.json({ rows, fields: rows[0] ? Object.keys(rows[0]) : [] });
    } catch (e) {
      return res.status(400).json({ error: String(e.message || e).slice(0, 400) });
    }
  }

  if (a === 'delete' && req.method === 'POST') {
    const id = String(body(req).id);
    await sql.transaction([sql`DELETE FROM photos WHERE visit_id = ${id}`, sql`DELETE FROM visits WHERE id = ${id}`]);
    return res.json({ ok: true });
  }

  res.status(404).json({ error: 'not found' });
}, isAdmin);
