-- 1) SALES_FLAGGER («مراجع مرتجعات») ← SALES_ACCOUNTANT («محاسب مبيعات»): إعادة تسمية القيمة نفسها
--    فيبقى كل المستخدمين الحاليين بحساباتهم وبياناتهم دون أي UPDATE.
-- 2) SALES_AGENT («فتاة مبيعات»): دور جديد.
-- هذا الملف وحده: PostgreSQL لا يسمح باستعمال قيمة enum جديدة داخل نفس المعاملة قبل الـ commit.
ALTER TYPE "Role" RENAME VALUE 'SALES_FLAGGER' TO 'SALES_ACCOUNTANT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SALES_AGENT';
