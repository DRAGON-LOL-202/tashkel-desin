-- أدوار المبيعات الإلكترونية (مراجع مرتجعات / منفّذ أوردرات / مشرف مبيعات).
-- هذا الملف وحده: PostgreSQL لا يسمح باستعمال قيمة enum جديدة داخل نفس المعاملة قبل الـ commit.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SALES_FLAGGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SALES_EDITOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SALES_SUPERVISOR';
