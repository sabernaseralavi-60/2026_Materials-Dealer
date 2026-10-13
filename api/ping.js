import { canSubmit } from './_lib.js';

export default (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!canSubmit(req)) return res.status(401).json({ error: 'unauthorized' });
  res.json({ ok: true });
};
