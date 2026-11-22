-- إبطال جلسات JWT عند تسجيل الخروج أو تغيير/إعادة تعيين كلمة المرور
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
