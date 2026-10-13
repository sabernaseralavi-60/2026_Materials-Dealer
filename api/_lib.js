import { neon } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
export const sql = url ? neon(url) : null;

let ready;
export function ensureSchema() {
  if (!sql) throw new Error('DATABASE_URL تنظیم نشده است');
  return (ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS visits (
      id text PRIMARY KEY, unit_code text, visit_date text, surveyor text, name text, owner text,
      phone_main text, phone_mobile text, phone_landline text, neighborhood text,
      lat double precision, lng double precision, join_intent text, lead text,
      is_final boolean NOT NULL DEFAULT false, created_at bigint, updated_at bigint,
      received_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS visit_items (
      visit_id text NOT NULL REFERENCES visits(id) ON DELETE CASCADE, field text NOT NULL, value text NOT NULL)`;
    await sql`CREATE INDEX IF NOT EXISTS ix_items ON visit_items(field, value)`;
    await sql`CREATE INDEX IF NOT EXISTS ix_items_visit ON visit_items(visit_id)`;
    await sql`CREATE TABLE IF NOT EXISTS photos (
      id text PRIMARY KEY, visit_id text NOT NULL, kind text, mime text, bytes integer,
      data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
    await sql`CREATE INDEX IF NOT EXISTS ix_photos_visit ON photos(visit_id)`;
    // نمای تخت و خوانا برای کوئری‌گرفتن راحت
    await sql`CREATE OR REPLACE VIEW v_stores AS
      SELECT v.id, v.unit_code, v.visit_date, v.surveyor, v.name, v.owner, v.phone_mobile, v.phone_main,
             v.neighborhood, v.lat, v.lng, v.lead, v.is_final, v.join_intent,
             v.data->>'availability' AS availability, v.data->>'delivery' AS delivery,
             v.data->>'business_model' AS business_model, v.data->>'bulk_discount' AS bulk_discount,
             (SELECT count(*) FROM photos p WHERE p.visit_id = v.id) AS photo_count,
             (SELECT string_agg(i.value, ' | ') FROM visit_items i WHERE i.visit_id = v.id AND i.field = 'categories') AS categories,
             v.received_at
      FROM visits v`;
  })().catch(e => { ready = undefined; throw e; }));
}

const same = (a, b) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
};
const hdr = req => req.headers['x-api-key'] || '';
/** کلید ارسال (دانشجو) — فقط اجازهٔ ثبت؛ مدیر هم می‌تواند */
export const canSubmit = req => (process.env.SUBMIT_KEY && same(hdr(req), process.env.SUBMIT_KEY)) || isAdmin(req);
/** رمز مدیر — اجازهٔ خواندن همه‌چیز */
export const isAdmin = req => !!process.env.ADMIN_PASSWORD && same(hdr(req), process.env.ADMIN_PASSWORD);

export const body = req => (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
export function guard(handler, check) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!check(req)) return res.status(401).json({ error: 'unauthorized' });
      await ensureSchema();
      await handler(req, res);
    } catch (e) {
      console.error(e);
      res.status(e.status || 500).json({ error: e.status ? e.message : 'server error' });
    }
  };
}
