# TASHKEEL.CNC — تطبيق قسم التصميم (Full Stack)

واجهة عربية RTL (React 19 + Vite + Tailwind) + API (Express + Prisma 7 + PostgreSQL).

## البنية
- `frontend/` — الواجهة (HashRouter). تتصل بالـ API عبر `VITE_API_URL`.
- `backend/` — الـ API: `src/{routes,validators,middleware,utils}`، `prisma/` (schema, migrations, seed)، `tests/` (vitest على PGlite).

## الإعداد المحلي
```bash
# Backend
cd backend
cp .env.example .env        # املأ القيم (لا ترفع .env أبداً)
npm install
npx prisma generate
npx prisma migrate deploy   # على قاعدة PostgreSQL فارغة/موجودة (ليس migrate reset)
npm run seed                # يحتاج ADMIN_PASSWORD (8 أحرف على الأقل)؛ آمن للتكرار
npm run dev                 # المنفذ من PORT

# Frontend
cd ../frontend
cp .env.example .env        # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev
```

## متغيرات البيئة (backend)
`DATABASE_URL`, `JWT_SECRET`, `PORT`, `FRONTEND_URL` (لضبط CORS), `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`؛ اختيارية: `NODE_ENV`, `DB_POOL_MAX`, `DATABASE_CA_CERT` (شهادة CA بصيغة PEM لقاعدة البيانات؛ مطلوبة عادةً مع Aiven — تُقبل `\n` نصّية).
مرفقات الصور على Cloudflare R2 (اختيارية — اضبط الأربعة معاً أو لا شيء، وإلا تبقى base64 في قاعدة البيانات): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`؛ اختياري `R2_MAX_FILE_MB` (الافتراضي 10). يلزم ضبط CORS للـ bucket (انظر `HANDOFF.md` القسم 17).
متغير الواجهة: `VITE_API_URL` (عام، لا أسرار).

## الأوامر
| الأمر | الوظيفة |
|---|---|
| `backend: npm run typecheck` | فحص الأنواع |
| `backend: npm test` | 97 اختباراً على PGlite (لا يحتاج PostgreSQL) |
| `backend: npm run build` / `npm start` | بناء وتشغيل الإنتاج |
| `frontend: npm run build` | `tsc -b && vite build` |

## اختبار التكامل (اختياري، على قاعدة اختبار فقط)
بعد `migrate deploy` + `seed` وتشغيل الخادم: شغّل `backend/scripts/http-smoke.mjs` ثم `frontend/scripts/services-smoke.mjs` (من مجلد frontend) مع متغيري البيئة `ADMIN_PASSWORD` و`SMOKE_USER_PASSWORD` (ينشئ مستخدماً تجريبياً `des1`).

## الأدوار والصلاحيات
- **ADMIN / MANAGER:** المستخدمون، المهام (لكل الفريق)، الملاحظات، الأهداف، التقويم السنوي. إسناد دور ADMIN لـ ADMIN فقط.
- **DESIGNER:** مهامه وملاحظاته وملفه الشخصي فقط؛ لا يعدّل/يحذف مهمة (يسمح له Start/Stop/End + التقدّم + التعليق)؛ ينشئ ملاحظات ولا يعدّلها.
- مستخدمو النظام (`isSystemUser`) لا يُحذفون ولا يُعطَّلون ولا يتغير دورهم.
- الحماية الحقيقية في الـ backend (JWT في `Authorization: Bearer`)؛ حراسة المسارات في الواجهة لتجربة المستخدم فقط.

## نظرة على الـ API (`/api`)
`health` · `auth/{login,me,logout}` · `users` (+`/:id`, `/:id/status`, `/me`) · `tasks` (+`/:id`, `/:id/{progress,start,stop,end,comments,move}`, `/reorder`, `/move-unfinished`) · `feedback` (+`/:id`, `/bulk-delete`) · `goals` (+`/:id`) · `calendar-events` (+`/:id`)

## الأمان
bcrypt لكلمات المرور، zod للتحقق، helmet، CORS على `FRONTEND_URL`، rate limit على تسجيل الدخول، ولا يُرجَع `passwordHash` في أي response. غيّر كلمة مرور المدير بعد أول دخول.

## النشر (لم يُنفَّذ بعد)
Aiven (PostgreSQL؛ شهادة CA في `DATABASE_CA_CERT`) ← GitHub (Private) ← Render (backend، Root `backend`) ← Cloudflare Pages (frontend، Root `frontend`، مع `_redirects` لـ SPA). التفاصيل في `HANDOFF.md` القسم 3.
