import { sql, guard, body, canSubmit } from './_lib.js';

const g = (r, k) => (r[k] === undefined || r[k] === null || r[k] === '' ? null : String(r[k]).trim().slice(0, 500));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function upsert(r) {
  const id = String(r.id).slice(0, 64);
  const upd = Math.trunc(Number(r._updated) || 0);
  const photoIds = Array.isArray(r._photo_ids) ? r._photo_ids.map(String) : null;
  const { _photo_ids, photos, ...data } = r;
  const ops = [
    sql`INSERT INTO visits (id, unit_code, visit_date, surveyor, name, owner, phone_main, phone_mobile, phone_landline,
          neighborhood, lat, lng, join_intent, lead, is_final, created_at, updated_at, data)
        VALUES (${id}, ${g(r, 'unit_code')}, ${g(r, 'visit_date')}, ${g(r, 'surveyor')}, ${g(r, 'name')}, ${g(r, 'owner')},
          ${g(r, 'phone_main')}, ${g(r, 'phone_mobile')}, ${g(r, 'phone_landline')}, ${g(r, 'neighborhood')},
          ${num(r.loc_lat)}, ${num(r.loc_lng)}, ${g(r, 'join_intent')}, ${g(r, 'lead')}, ${!!r._final},
          ${Math.trunc(Number(r._created) || 0)}, ${upd}, ${JSON.stringify(data)}::jsonb)
        ON CONFLICT (id) DO UPDATE SET unit_code = EXCLUDED.unit_code, visit_date = EXCLUDED.visit_date,
          surveyor = EXCLUDED.surveyor, name = EXCLUDED.name, owner = EXCLUDED.owner, phone_main = EXCLUDED.phone_main,
          phone_mobile = EXCLUDED.phone_mobile, phone_landline = EXCLUDED.phone_landline, neighborhood = EXCLUDED.neighborhood,
          lat = EXCLUDED.lat, lng = EXCLUDED.lng, join_intent = EXCLUDED.join_intent, lead = EXCLUDED.lead,
          is_final = EXCLUDED.is_final, updated_at = EXCLUDED.updated_at, received_at = now(), data = EXCLUDED.data
        WHERE visits.updated_at <= EXCLUDED.updated_at`,
    sql`DELETE FROM visit_items WHERE visit_id = ${id} AND (SELECT updated_at FROM visits WHERE id = ${id}) = ${upd}`,
  ];
  const items = Object.entries(data).filter(([, v]) => Array.isArray(v)).flatMap(([k, v]) => v.map(x => [k, String(x)]));
  if (items.length) {
    ops.push(sql`INSERT INTO visit_items (visit_id, field, value)
      SELECT ${id}, f, v FROM unnest(${items.map(i => i[0])}::text[], ${items.map(i => i[1])}::text[]) AS t(f, v)
      WHERE (SELECT updated_at FROM visits WHERE id = ${id}) = ${upd}`);
  }
  if (photoIds) ops.push(sql`DELETE FROM photos WHERE visit_id = ${id} AND NOT (id = ANY(${photoIds}::text[]))
      AND (SELECT updated_at FROM visits WHERE id = ${id}) = ${upd}`);
  await sql.transaction(ops);
  return id;
}

export default async (req, res) => {
  if (req.method === 'POST') {
    return guard(async (rq, rs) => {
      const recs = body(rq).records;
      if (!Array.isArray(recs) || recs.length > 20) throw Object.assign(new Error('bad request'), { status: 400 });
      const saved = [];
      for (const r of recs) if (r && typeof r === 'object' && r.id) saved.push(await upsert(r));
      rs.json({ saved });
    }, canSubmit)(req, res);
  }
  res.status(405).json({ error: 'method not allowed' });
};
