-- CreateEnum
CREATE TYPE "TimerStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'EXPIRED');

-- CreateTable
CREATE TABLE "TaskTimer" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "plannedMs" INTEGER NOT NULL,
    "remainingMs" INTEGER NOT NULL,
    "status" "TimerStatus" NOT NULL DEFAULT 'PENDING',
    "runningSince" TIMESTAMP(3),
    "warned10" BOOLEAN NOT NULL DEFAULT false,
    "warned1" BOOLEAN NOT NULL DEFAULT false,
    "expiredNotified" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskTimer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskTimer_taskId_key" ON "TaskTimer"("taskId");
CREATE INDEX "TaskTimer_status_idx" ON "TaskTimer"("status");

-- AddForeignKey
ALTER TABLE "TaskTimer" ADD CONSTRAINT "TaskTimer_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
