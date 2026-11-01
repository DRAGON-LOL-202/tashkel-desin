-- دورا «تعبئة» و«مشغل». هذا الملف وحده: Postgres لا يسمح باستعمال قيمة enum جديدة قبل الـ commit.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PACKER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OPERATOR';
