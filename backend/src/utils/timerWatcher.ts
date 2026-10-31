// مراقب المؤقتات: ينبّه عند بقاء 10 دقائق ودقيقة وعند الانتهاء، دون تكرار.
// الحالة تُقرأ من قاعدة البيانات عند كل تشغيل (لا ذاكرة)، فلا يضيع شيء عند إعادة تشغيل الخدمة.
// منع التكرار: نقلب العلم بـ updateMany بشرط أنه ما زال false؛ من ينجح (count=1) هو وحده من يُرسل الإشعار.
import { prisma } from "../db.js";
import { MS_PER_MINUTE, remainingAt } from "./timerMath.js";
import { announceNotificationsChanged, notify } from "./notify.js";

export interface TickResult {
  checked: number;
  warned10: number;
  warned1: number;
  expired: number;
}

const WATCH_INTERVAL_MS = 30_000;
let running = false;

const minutesLabel = (ms: number) => {
  const m = Math.max(Math.ceil(ms / MS_PER_MINUTE), 1);
  return m === 1 ? "دقيقة واحدة" : m === 2 ? "دقيقتان" : m <= 10 ? `${m} دقائق` : `${m} دقيقة`;
};

export async function processTimers(now = Date.now()): Promise<TickResult> {
  const db = prisma();
  const result: TickResult = { checked: 0, warned10: 0, warned1: 0, expired: 0 };
  const timers = await db.taskTimer.findMany({
    where: { status: "RUNNING" },
    include: { task: { select: { id: true, title: true, parentId: true, assignedToId: true, createdById: true } } },
  });
  result.checked = timers.length;

  for (const t of timers) {
    const rem = remainingAt(t, now);
    const link = { taskId: t.task.parentId ?? t.task.id, subtaskId: t.task.parentId ? t.task.id : null };
    const recipients = [t.task.assignedToId, t.task.createdById];

    if (rem <= 0) {
      const r = await db.taskTimer.updateMany({
        where: { id: t.id, status: "RUNNING" },
        data: { status: "EXPIRED", remainingMs: 0, runningSince: null, expiredNotified: true, warned10: true, warned1: true },
      });
      if (r.count === 1) {
        result.expired++;
        await notify({ recipients, type: "TIMER_EXPIRED", title: "انتهى وقت المهمة", message: `انتهى الوقت المحدد للمهمة «${t.task.title}»`, ...link });
      }
      continue;
    }

    // دقيقة: يغطي أيضاً علم العشر دقائق (لا إشعاران متتاليان لو تأخر المراقب)
    if (rem <= MS_PER_MINUTE && !t.warned1) {
      const r = await db.taskTimer.updateMany({ where: { id: t.id, status: "RUNNING", warned1: false }, data: { warned1: true, warned10: true } });
      if (r.count === 1 && t.plannedMs > MS_PER_MINUTE) {
        result.warned1++;
        await notify({ recipients, type: "TIMER_WARNING_1", title: "باقي أقل من دقيقة", message: `يقترب انتهاء وقت المهمة «${t.task.title}»: أقل من دقيقة`, ...link });
      }
    } else if (rem <= 10 * MS_PER_MINUTE && !t.warned10) {
      const r = await db.taskTimer.updateMany({ where: { id: t.id, status: "RUNNING", warned10: false }, data: { warned10: true } });
      // مؤقت مدته ≤ 10 دقائق لا يستحق «باقي 10 دقائق»؛ نضع العلم فقط
      if (r.count === 1 && t.plannedMs > 10 * MS_PER_MINUTE) {
        result.warned10++;
        await notify({ recipients, type: "TIMER_WARNING_10", title: "اقترب انتهاء الوقت", message: `باقي ${minutesLabel(rem)} على انتهاء وقت المهمة «${t.task.title}»`, ...link });
      }
    }
  }

  if (result.warned10 + result.warned1 + result.expired > 0) announceNotificationsChanged();
  return result;
}

/** تشغيل دوري داخل العملية. يتخطى الدورة إن كانت السابقة لم تنتهِ، ولا يُسقط الخدمة عند الخطأ. */
export function startTimerWatcher(): NodeJS.Timeout {
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    processTimers()
      .catch((e) => console.error("timer watcher failed", e instanceof Error ? e.message : e))
      .finally(() => {
        running = false;
      });
  }, WATCH_INTERVAL_MS);
  timer.unref();
  return timer;
}
