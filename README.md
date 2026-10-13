# ثبت میدانی مصالح‌فروشی‌های کرمان

وب‌اپ موبایل (PWA، آفلاین‌محور) برای پرسشگر + داشبورد مدیر. بک‌اند: Vercel Functions، دیتابیس: Neon Postgres.

- **پرسشگر:** `https://materials-dealer-kerman.vercel.app/?k=<SUBMIT_KEY>` — فقط می‌تواند ثبت کند؛ بعد از ارسال، داده از گوشی پاک می‌شود و راهی برای دیدن یا خروجی گرفتن ندارد.
- **مدیر:** `/admin/` با `ADMIN_PASSWORD` — آمار، جدول با فیلتر، نقشه، عکس‌ها، کنسول SQL فقط‌خواندنی، خروجی CSV.
- **تنظیمات (Vercel → Environment Variables):** `DATABASE_URL` (از Neon)، `SUBMIT_KEY`، `ADMIN_PASSWORD`. جدول‌ها خودکار ساخته می‌شوند.
- **ساختار فرم:** `public/fields.js`. جدول‌ها: `visits`، `visit_items`، `photos` و نمای `v_stores` (در `api/_lib.js`).
- دسترسی مستقیم SQL: کنسول Neon (Vercel → Storage).
