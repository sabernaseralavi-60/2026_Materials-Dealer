/* وب‌اپ ثبت میدانی مصالح‌فروشی‌ها — ذخیرهٔ آفلاین در IndexedDB و همگام‌سازی با سرور */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
const latin = s => String(s ?? '').replace(/[۰-۹]/g, d => FA.indexOf(d)).replace(/[٠-٩]/g, d => AR.indexOf(d));
const fa = n => String(n).replace(/\d/g, d => FA[d]);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const jalali = iso => { if (!iso) return ''; try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long' }).format(new Date(iso + 'T12:00:00')); } catch { return iso; } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const newCode = () => 'KR-' + Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const FIELDS = SECTIONS.flatMap(s => s.fields);

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const add = (w, ...k) => w.append(...k.filter(Boolean));
let toastT;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' err' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.className = '', 2600);
}

/* ---------- تنظیمات ---------- */
const cfg = {
  get(k, d = '') { try { return localStorage.getItem('md_' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('md_' + k, v); } catch { } },
};

/* ---------- IndexedDB ---------- */
const DB = (() => {
  let db;
  const open = () => db ? Promise.resolve(db) : new Promise((res, rej) => {
    const r = indexedDB.open('materials-dealer', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('visits', { keyPath: 'id' });
    r.onsuccess = () => res(db = r.result); r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction('visits', mode); const o = fn(t.objectStore('visits')); t.oncomplete = () => res(o?.result); t.onerror = () => rej(t.error); }); };
  return {
    all: () => tx('readonly', s => s.getAll()).then(a => (a || []).sort((x, y) => y._updated - x._updated)),
    put: r => tx('readwrite', s => s.put(r)),
    del: id => tx('readwrite', s => s.delete(id)),
  };
})();

/* ---------- وضعیت ---------- */
let cur = null;           // رکورد در حال ویرایش
let step = 0;
let records = [];
let tab = 'form';
let filter = 'all', query = '';

const blank = () => ({
  id: uid(), unit_code: newCode(), visit_date: today(), surveyor: cfg.get('surveyor'), visit_type: 'مراجعه اول',
  _created: Date.now(), _updated: Date.now(), _final: false, _synced: false,
});
const lead = r => LEAD_MAP[r.join_intent] || '';

let saveT;
function touch() {
  cur._updated = Date.now(); cur._synced = false;
  if (cur.surveyor) cfg.set('surveyor', cur.surveyor);
  clearTimeout(saveT); saveT = setTimeout(persist, 350);
}
async function persist() {
  if (!cur) return;
  cur.lead = lead(cur);
  await DB.put(cur); records = await DB.all(); refreshChrome();
}

/* ---------- ساخت فیلدها ---------- */
function fieldEl(f) {
  const val = cur[f.k];
  const wrap = h('div', { class: 'field', 'data-k': f.k });
  const lab = h('div', { class: 'lbl' }, f.n ? h('span', { class: 'num' }, fa(f.n)) : null,
    h('span', {}, f.label, f.req ? h('b', { class: 'req' }, ' *') : null), f.hint ? h('span', { class: 'hint' }, f.hint) : null);
  const set = (k, v) => { cur[k] = v; touch(); };

  if (f.t === 'text' || f.t === 'tel' || f.t === 'date') {
    const inp = h('input', { type: f.t === 'tel' ? 'tel' : f.t === 'date' ? 'date' : 'text', value: val ?? '', placeholder: f.ph || '',
      inputmode: f.t === 'tel' ? 'tel' : null, dir: f.t === 'tel' ? 'ltr' : f.dir, list: f.list, autocomplete: 'off', id: 'f_' + f.k });
    inp.addEventListener('input', () => { set(f.k, f.t === 'tel' ? latin(inp.value) : inp.value); if (f.t === 'date') note.textContent = jalali(inp.value); wrap.classList.remove('bad'); err.textContent = ''; });
    if (f.t === 'tel') inp.addEventListener('blur', () => { inp.value = latin(inp.value).replace(/[^\d+]/g, ''); set(f.k, inp.value); check(f, inp.value, err); });
    const note = h('div', { class: 'note' }, f.t === 'date' ? jalali(val) : '');
    const err = h('div', { class: 'err' });
    lab.setAttribute('for', 'f_' + f.k);
    add(wrap, h('label', { for: 'f_' + f.k }, ...lab.childNodes), inp, f.t === 'date' ? note : null, err);
    return wrap;
  }
  if (f.t === 'area') {
    const ta = h('textarea', { placeholder: f.ph || '', rows: 3 }, val ?? '');
    ta.addEventListener('input', () => set(f.k, ta.value));
    add(wrap, lab, ta); return wrap;
  }
  if (f.t === 'radio' || f.t === 'check') {
    const multi = f.t === 'check';
    const sel = new Set(multi ? (val || []) : val ? [val] : []);
    const box = h('div', { class: 'chips' });
    const otherInp = h('input', { type: 'text', placeholder: 'توضیح «سایر»…', value: cur[f.k + '_other'] || '' });
    const otherWrap = h('div', { class: 'other', hidden: !sel.has('سایر') }, otherInp);
    otherInp.addEventListener('input', () => set(f.k + '_other', otherInp.value));
    const opts = [...f.o, ...(f.other ? ['سایر'] : [])];
    const inputs = [];
    const sync = () => {
      if (multi && f.max) inputs.forEach(i => i.disabled = !i.checked && sel.size >= f.max);
      otherWrap.hidden = !sel.has('سایر');
    };
    opts.forEach(o => {
      const i = h('input', { type: multi ? 'checkbox' : 'radio', name: f.k, checked: sel.has(o) });
      i.addEventListener('click', () => {
        if (multi) {
          if (i.checked) { if (f.excl?.includes(o)) sel.clear(); else f.excl?.forEach(x => sel.delete(x)); sel.add(o); } else sel.delete(o);
          inputs.forEach((x, n) => x.checked = sel.has(opts[n]));
          cur[f.k] = [...sel];
        } else {
          if (sel.has(o)) { sel.clear(); i.checked = false; cur[f.k] = ''; } else { sel.clear(); sel.add(o); cur[f.k] = o; } // لمس دوباره = لغو انتخاب
        }
        sync(); touch(); if (f.k === 'categories') updateTop3List();
      });
      inputs.push(i); box.append(h('label', { class: 'chip' }, i, h('span', {}, o)));
    });
    sync(); add(wrap, lab, box, f.other ? otherWrap : null); return wrap;
  }
  if (f.t === 'top3') {
    const box = h('div', { class: 'top3' });
    ['الف', 'ب', 'ج'].forEach((l, n) => {
      const i = h('input', { type: 'text', list: 'cats', value: cur['top' + (n + 1)] || '', placeholder: 'گروه کالایی' });
      i.addEventListener('input', () => set('top' + (n + 1), i.value));
      box.append(h('div', {}, h('b', {}, l + ')'), i));
    });
    add(wrap, lab, box, h('datalist', { id: 'cats' })); queueMicrotask(updateTop3List); return wrap;
  }
  if (f.t === 'loc') {
    const out = h('div', { class: 'coords', hidden: cur.loc_lat == null });
    const show = () => { out.hidden = cur.loc_lat == null; out.textContent = cur.loc_lat == null ? '' : `${(+cur.loc_lat).toFixed(6)} , ${(+cur.loc_lng).toFixed(6)}  (دقت ≈ ${Math.round(cur.loc_acc || 0)} متر)`; map.hidden = cur.loc_lat == null; map.href = `https://www.google.com/maps?q=${cur.loc_lat},${cur.loc_lng}`; };
    const map = h('a', { class: 'btn sm', target: '_blank', rel: 'noopener' }, '🗺️ باز کردن روی نقشه');
    const btn = h('button', { type: 'button', class: 'btn primary' }, '📍 ثبت موقعیت فعلی (GPS)');
    btn.addEventListener('click', () => {
      if (!navigator.geolocation) return toast('این مرورگر GPS را پشتیبانی نمی‌کند', true);
      btn.disabled = true; btn.textContent = 'در حال دریافت موقعیت…';
      navigator.geolocation.getCurrentPosition(p => {
        Object.assign(cur, { loc_lat: p.coords.latitude, loc_lng: p.coords.longitude, loc_acc: p.coords.accuracy }); touch(); show();
        btn.disabled = false; btn.textContent = '📍 ثبت دوبارهٔ موقعیت'; toast('موقعیت ثبت شد ✓');
      }, e => {
        btn.disabled = false; btn.textContent = '📍 ثبت موقعیت فعلی (GPS)';
        toast(location.protocol === 'http:' && location.hostname !== 'localhost' ? 'GPS فقط روی HTTPS کار می‌کند؛ لینک نقشه را وارد کنید' : 'دریافت موقعیت ممکن نشد: ' + e.message, true);
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
    const link = h('input', { type: 'text', dir: 'ltr', placeholder: 'یا لینک نقشه (نشان / گوگل‌مپ) را بچسبانید', value: cur.loc_link || '' });
    link.addEventListener('input', () => set('loc_link', link.value));
    add(wrap, lab, h('div', { class: 'loc-box' }, btn, out, map, link)); show(); return wrap;
  }
  if (f.t === 'photo') {
    cur.photos = cur.photos || [];
    let kind = 'سردر';
    const grid = h('div', { class: 'pgrid' });
    const cnt = h('span', { class: 'note' });
    const draw = () => {
      grid.replaceChildren(...cur.photos.map(p => h('div', { class: 'ph' }, h('img', { src: p.data, alt: p.kind }), h('span', {}, p.kind),
        h('button', { type: 'button', 'aria-label': 'حذف عکس', onclick: () => { cur.photos = cur.photos.filter(x => x.id !== p.id); touch(); draw(); } }, '✕'))));
      cnt.textContent = cur.photos.length ? `${fa(cur.photos.length)} عکس` : '';
    };
    const kinds = h('div', { class: 'chips' }, ['سردر', 'فضای داخلی', 'انبار', 'سایر'].map((k, i) => {
      const r = h('input', { type: 'radio', name: 'pkind', checked: i === 0 }); r.addEventListener('change', () => kind = k);
      return h('label', { class: 'chip' }, r, h('span', {}, k));
    }));
    const onFiles = async e => {
      for (const fl of e.target.files) {
        if (cur.photos.length >= 10) { toast('حداکثر ۱۰ عکس برای هر فروشگاه', true); break; }
        cur.photos.push({ id: uid(), kind, data: await shrink(fl, 1280, .7), synced: false });
      }
      e.target.value = ''; touch(); draw(); toast('عکس ذخیره شد ✓');
    };
    const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', id: 'camIn' });
    const gal = h('input', { type: 'file', accept: 'image/*', multiple: true, id: 'galIn' });
    cam.addEventListener('change', onFiles); gal.addEventListener('change', onFiles);
    add(wrap, lab, kinds, h('div', { class: 'tools', style: 'margin-top:10px' }, h('label', { class: 'btn primary', for: 'camIn' }, '📷 دوربین'),
      h('label', { class: 'btn', for: 'galIn' }, '🖼️ گالری'), cnt), cam, gal, grid); draw(); return wrap;
  }
}
function shrink(file, max, q) {
  return new Promise(res => {
    const img = new Image(); img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', q));
    }; img.src = URL.createObjectURL(file);
  });
}
function updateTop3List() {
  const dl = $('#cats'); if (!dl) return;
  dl.innerHTML = ''; (cur.categories || []).filter(c => c !== 'سایر').forEach(c => dl.append(h('option', { value: c })));
  if ((cur.categories || []).includes('سایر') && cur.categories_other) dl.append(h('option', { value: cur.categories_other }));
}
function check(f, v, errEl) {
  errEl.textContent = '';
  if (!v) return true;
  if (f.mobile && !/^09\d{9}$/.test(v)) { errEl.textContent = 'شمارهٔ همراه باید ۱۱ رقم و با ۰۹ شروع شود'; return false; }
  return true;
}

/* ---------- صفحهٔ فرم ---------- */
function renderForm() {
  const s = SECTIONS[step];
  view.replaceChildren(
    h('div', { class: 'steps' }, SECTIONS.map((x, i) => h('button', { class: 'step' + (i === step ? ' on' : i < step ? ' done' : ''), type: 'button',
      onclick: () => { step = i; renderForm(); window.scrollTo(0, 0); } }, x.icon + ' ', x.title))),
    h('div', { class: 'bar' }, h('b', { style: `width:${((step + 1) / SECTIONS.length) * 100}%` })),
    h('div', { class: 'sec-title' }, h('span', {}, s.icon), h('b', {}, s.title), h('small', { class: 'note' }, `  ${fa(step + 1)} از ${fa(SECTIONS.length)}`)),
    s.intro ? h('div', { class: 'intro' }, s.intro) : null,
    ...s.fields.map(fieldEl),
    h('div', { class: 'actions' },
      step > 0 ? h('button', { class: 'btn', type: 'button', onclick: () => go(step - 1) }, '→ قبلی') : null,
      step < SECTIONS.length - 1
        ? h('button', { class: 'btn primary', type: 'button', onclick: () => go(step + 1) }, 'ذخیره و بعدی ←')
        : h('button', { class: 'btn primary', type: 'button', onclick: finish }, '✔ ثبت نهایی')),
  );
  $('.steps .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
async function go(n) { await persist(); step = n; renderForm(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

async function finish() {
  const bad = [];
  if (!cur.name?.trim()) bad.push(['name', 0, 'نام تجاری الزامی است']);
  if (!cur.phone_main && !cur.phone_mobile && !cur.phone_landline && !cur.contact_phone) bad.push(['phone_mobile', 0, 'حداقل یک شمارهٔ تماس لازم است']);
  if (cur.phone_mobile && !/^09\d{9}$/.test(cur.phone_mobile)) bad.push(['phone_mobile', 0, 'شمارهٔ همراه معتبر نیست']);
  if (bad.length) {
    step = 0; renderForm();
    bad.forEach(([k, , m]) => { const w = $(`[data-k="${k}"]`); w?.classList.add('bad'); w?.querySelector('.err')?.append(m); });
    toast(bad[0][2], true); $('.field.bad')?.scrollIntoView({ block: 'center' }); return;
  }
  const dup = records.find(r => r.id !== cur.id && r._final && ((cur.phone_mobile && r.phone_mobile === cur.phone_mobile) || (cur.name.trim() && r.name?.trim() === cur.name.trim() && r.neighborhood === cur.neighborhood)));
  if (dup && !confirm(`«${dup.name}» با مشخصات مشابه قبلاً ثبت شده است. باز هم ثبت شود؟`)) return;
  cur._final = true; await persist(); toast('ثبت شد ✓ — فرم بعدی آماده است'); sync(true);
  cur = blank(); step = 0; renderForm(); window.scrollTo(0, 0);
}

/* ---------- لیست ---------- */
function renderList() {
  const done = records.filter(r => r._final), pend = records.filter(r => !r._synced);
  const fl = (id, t) => h('button', { class: filter === id ? 'on' : '', onclick: () => { filter = id; renderList(); } }, t);
  view.replaceChildren(
    h('div', { class: 'stats' }, h('div', {}, h('b', {}, fa(done.length)), h('small', {}, 'ثبت نهایی')),
      h('div', {}, h('b', {}, fa(records.filter(r => r._final && r.visit_date === today()).length)), h('small', {}, 'امروز')),
      h('div', {}, h('b', {}, fa(pend.length)), h('small', {}, 'همگام‌نشده'))),
    h('div', { class: 'tools' },
      h('button', { class: 'btn primary sm', onclick: () => sync(false) }, '🔄 همگام‌سازی'),
    ),
    h('input', { type: 'search', placeholder: 'جست‌وجو: نام، مالک، تلفن، محله…', value: query, oninput: e => { query = e.target.value; renderListBody(); } }),
    h('div', { class: 'filters' }, fl('all', 'همه'), fl('draft', 'پیش‌نویس'), fl('final', 'نهایی'), fl('unsynced', 'همگام‌نشده')),
    h('div', { id: 'rows' }),
  );
  renderListBody();
}
function renderListBody() {
  const q = latin(query).trim();
  const rows = records.filter(r => (filter === 'all' || (filter === 'draft' && !r._final) || (filter === 'final' && r._final) || (filter === 'unsynced' && !r._synced) || false)
    && (!q || [r.name, r.neighborhood, r.unit_code].some(v => String(v || '').includes(q))));
  const box = $('#rows'); box.replaceChildren();
  if (!rows.length) return box.append(h('div', { class: 'empty' }, 'موردی پیدا نشد'));
  rows.forEach(r => box.append(h('div', { class: 'item' },
    h('h3', {}, r.name || '(بدون نام)'),
    h('p', {}, r.neighborhood || '—'),
    h('div', { class: 'badges' }, h('span', { class: 'b' }, r.unit_code), h('span', { class: 'b' }, jalali(r.visit_date)),
      r._final ? null : h('span', { class: 'b draft' }, 'پیش‌نویس'),
      r._synced ? h('span', { class: 'b sync' }, 'ارسال شد ✓') : h('span', { class: 'b draft' }, 'در انتظار ارسال')),
    h('div', { class: 'btns' },
      r._stripped ? null : h('button', { class: 'btn sm', onclick: () => { cur = structuredClone(r); step = 0; setTab('form'); } }, r._final ? '✏️ ویرایش' : '▶️ ادامه'),
      r._synced ? null : h('button', { class: 'btn sm danger', onclick: async () => { if (confirm('این مورد حذف شود؟')) { await DB.del(r.id); records = await DB.all(); refreshChrome(); renderListBody(); } } }, '🗑️')))));
}

/* ---------- تنظیمات ---------- */
function renderSettings() {
  const mk = (k, label, ph, dir) => { const i = h('input', { type: 'text', value: cfg.get(k), placeholder: ph, dir, id: 's_' + k }); i.addEventListener('input', () => cfg.set(k, i.value.trim())); return h('div', { class: 'field' }, h('label', { for: 's_' + k, class: 'lbl' }, label), i); };
  const theme = cfg.get('theme', 'auto');
  const tb = (v, t) => h('button', { class: 'btn sm' + (theme === v ? ' primary' : ''), onclick: () => { cfg.set('theme', v); applyTheme(); renderSettings(); } }, t);
  view.replaceChildren(
    h('div', { class: 'sec-title' }, h('span', {}, '⚙️'), h('b', {}, 'تنظیمات')),
    mk('surveyor', 'نام پرسشگر (برای همهٔ فرم‌های جدید)', 'مثلاً: علی رضایی'),
    mk('apikey', 'کد دسترسی', 'کدی که استاد داده است', 'ltr'),
    h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'پوسته'), h('div', { class: 'tools' }, tb('auto', 'خودکار'), tb('light', 'روشن'), tb('dark', 'تیره'))),
    h('button', { class: 'btn primary', onclick: async () => { await sync(false); } }, '🔄 آزمایش و همگام‌سازی'),
    h('p', { class: 'note' }, 'داده‌ها ابتدا روی همین دستگاه ذخیره می‌شوند و بدون اینترنت هم کار می‌کنند؛ با دسترسی به سرور خودکار ارسال می‌شوند.'));
}
function applyTheme() { const t = cfg.get('theme', 'auto'); if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; }

/* ---------- همگام‌سازی ---------- */
const base = () => '';
let syncing = false;
const post = async (url, body) => {
  const res = await fetch(base() + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': cfg.get('apikey') }, body: JSON.stringify(body) });
  if (res.status === 401) throw new Error('کد دسترسی نادرست است');
  if (!res.ok) throw new Error('خطای سرور ' + res.status);
};
async function sync(silent) {
  if (syncing) return; syncing = true; setChip('pend', 'در حال ارسال…');
  try {
    const todo = records.filter(r => !r._synced && !r._stripped && (r._final || r.name));
    const sent = new Set();
    for (const r of todo) {
      const snap = r._updated, photos = r.photos || [];
      for (const p of photos) if (!p.synced) { await post('/api/photo', { id: p.id, visit_id: r.id, kind: p.kind, data: p.data }); sent.add(p.id); }
      const { photos: _p, ...meta } = r; meta._photo_ids = photos.map(p => p.id);
      await post('/api/visits', { records: [meta] });
      const latest = (await DB.all()).find(x => x.id === r.id); if (!latest) continue;
      (latest.photos || []).forEach(p => { if (sent.has(p.id) || p.synced) p.synced = true; });
      const same = latest._updated === snap && (latest.photos || []).every(p => p.synced);
      if (same) latest._synced = true;
      if (same && latest._final) {   // پس از ارسال، دادهٔ کامل از گوشی پاک می‌شود؛ فقط خلاصه می‌ماند
        const k = ['id', 'name', 'unit_code', 'visit_date', 'neighborhood', '_final', '_synced', '_updated', '_created'];
        const slim = Object.fromEntries(k.map(x => [x, latest[x]])); slim._stripped = true; await DB.put(slim);
      } else await DB.put(latest);
      if (cur?.id === r.id && same) cur._synced = true;
    }
    if (!todo.length) { const p = await fetch(base() + '/api/ping', { headers: { 'X-Api-Key': cfg.get('apikey') } }); if (p.status === 401) throw new Error('کد دسترسی نادرست است'); if (!p.ok) throw new Error('سرور پاسخ نداد'); }
    records = await DB.all(); refreshChrome(); if (tab === 'list') renderList();
    if (!silent) toast(todo.length ? `${fa(todo.length)} مورد ارسال شد ✓` : 'همه‌چیز همگام است ✓');
  } catch (e) {
    setChip('off', 'آفلاین'); if (!silent) toast('ارسال نشد: ' + (e.message === 'Failed to fetch' ? 'اتصال برقرار نیست' : e.message), true);
  } finally { syncing = false; refreshChrome(); }
}
function setChip(c, t) { const b = $('#syncChip'); b.className = 'chip-status ' + c; b.lastChild.textContent = t; }
function refreshChrome() {
  $('#cnt').textContent = fa(records.length);
  if (syncing) return;
  const n = records.filter(r => !r._synced).length;
  if (!navigator.onLine) setChip('off', n ? `آفلاین · ${fa(n)} در انتظار` : 'آفلاین'); else n ? setChip('pend', `${fa(n)} در انتظار ارسال`) : setChip('ok', 'همگام');
}

/* ---------- ناوبری ---------- */
function setTab(t) {
  tab = t; document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === t));
  if (t === 'form') renderForm(); else if (t === 'list') renderList(); else renderSettings(); window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', async () => { if (tab === 'form') await persist(); setTab(b.dataset.go); }));
$('#syncChip').addEventListener('click', () => sync(false));
window.addEventListener('online', () => { refreshChrome(); sync(true); });
window.addEventListener('offline', refreshChrome);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
window.addEventListener('pagehide', persist);

(async function init() {
  applyTheme();
  const kp = new URLSearchParams(location.search).get('k');
  if (kp) { cfg.set('apikey', kp); history.replaceState(null, '', location.pathname); }
  records = await DB.all();
  // ادامهٔ آخرین پیش‌نویس اگر وجود دارد، وگرنه فرم تازه
  const draft = records.find(r => !r._final && r.name);
  cur = draft && Date.now() - draft._updated < 12 * 36e5 ? structuredClone(draft) : blank();
  const dl = $('#hoods'); [...new Set(records.map(r => r.neighborhood).filter(Boolean))].forEach(n => dl.append(h('option', { value: n })));
  refreshChrome(); setTab('form');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  if (navigator.onLine) sync(true);
})();
