-- مجموعتان رئيسيتان للتصنيفات (خامات / اكسسوارات وهدايا) تحددان وصول تعبئة ومشغل. تستبدل UserInventoryCategory.

CREATE TABLE IF NOT EXISTS "InventoryGroup" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryGroup_key_key" ON "InventoryGroup"("key");

-- بذر المجموعتين بمعرّفات ثابتة (آمن عند الإعادة).
INSERT INTO "InventoryGroup" ("id", "key", "name", "sortOrder") VALUES
  ('invgrp_materials', 'MATERIALS', 'خامات', 1),
  ('invgrp_accessories_gifts', 'ACCESSORIES_GIFTS', 'اكسسوارات وهدايا', 2)
ON CONFLICT ("key") DO NOTHING;

-- التصنيفات الحالية تبقى بلا مجموعة (NULL) حتى يوزّعها المدير؛ غير المصنَّف محجوب عن تعبئة/مشغل.
ALTER TABLE "InventoryCategory" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
CREATE INDEX IF NOT EXISTS "InventoryCategory_groupId_idx" ON "InventoryCategory"("groupId");

DO $$ BEGIN
  ALTER TABLE "InventoryCategory" ADD CONSTRAINT "InventoryCategory_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "InventoryGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "UserInventoryGroup" (
  "userId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserInventoryGroup_pkey" PRIMARY KEY ("userId", "groupId")
);

CREATE INDEX IF NOT EXISTS "UserInventoryGroup_groupId_idx" ON "UserInventoryGroup"("groupId");

DO $$ BEGIN
  ALTER TABLE "UserInventoryGroup" ADD CONSTRAINT "UserInventoryGroup_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "UserInventoryGroup" ADD CONSTRAINT "UserInventoryGroup_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "InventoryGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- الأسلوب القديم (اختيار التصنيفات واحداً واحداً) يُلغى كلياً.
DROP TABLE IF EXISTS "UserInventoryCategory";
