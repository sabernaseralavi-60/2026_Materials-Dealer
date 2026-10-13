import { sql, guard, body, canSubmit, isAdmin } from './_lib.js';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default (req, res) => {
  if (req.method === 'POST') {
    return guard(async (rq, rs) => {
      const { id, visit_id, kind, data } = body(rq);
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(data || '');
      if (!id || !visit_id || !m) throw Object.assign(new Error('bad request'), { status: 400 });
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 3_000_000) throw Object.assign(new Error('too large'), { status: 413 });
      await sql`INSERT INTO photos (id, visit_id, kind, mime, bytes, data)
                VALUES (${String(id).slice(0, 64)}, ${String(visit_id).slice(0, 64)}, ${String(kind || '').slice(0, 40)}, ${m[1]}, ${buf.length}, ${buf})
                ON CONFLICT (id) DO NOTHING`;
      rs.json({ ok: true });
    }, canSubmit)(req, res);
  }
  if (req.method === 'GET') {
    // نمایش عکس فقط برای مدیر (کلید در هدر یا پارامتر k برای تگ img)
    req.headers['x-api-key'] = req.headers['x-api-key'] || req.query.k || '';
    return guard(async (rq, rs) => {
      const [p] = await sql`SELECT mime, data FROM photos WHERE id = ${String(rq.query.id)}`;
      if (!p) return rs.status(404).end();
      rs.setHeader('Content-Type', p.mime); rs.setHeader('Cache-Control', 'private, max-age=3600');
      rs.send(Buffer.from(p.data));
    }, isAdmin)(req, res);
  }
  res.status(405).end();
};
