import { describe, expect, it } from "vitest";
import { computeDailyTime, taskElapsedMs } from "../src/utils/timeStats.ts";

const at = (h: number, m = 0) => new Date(Date.UTC(2027, 2, 5, h, m));
const NOW = Date.UTC(2027, 2, 5, 12, 0);

describe("timeStats: دوال التجميع الصرفة", () => {
  it("مجموع السجلات المُغلقة فقط لمهمة غير جارية", () => {
    const ms = taskElapsedMs({ status: "PAUSED", timeLogs: [{ startTime: at(10), stopTime: at(10, 30) }, { startTime: at(11), stopTime: at(11, 15) }] }, NOW);
    expect(ms).toBe(45 * 60_000);
  });
  it("المهمة الجارية تضيف (الآن - startTime) للسجل المفتوح", () => {
    const ms = taskElapsedMs({ status: "RUNNING", timeLogs: [{ startTime: at(10), stopTime: at(10, 30) }, { startTime: at(11), stopTime: null }] }, NOW);
    expect(ms).toBe(30 * 60_000 + 60 * 60_000);
  });
  it("سجل مفتوح لمهمة ليست RUNNING لا يُحسب (كما في الواجهة)", () => {
    expect(taskElapsedMs({ status: "COMPLETED", timeLogs: [{ startTime: at(11), stopTime: null }] }, NOW)).toBe(0);
  });
  it("سجل مقلوب (stop قبل start) لا يعطي مدة سالبة", () => {
    expect(taskElapsedMs({ status: "PAUSED", timeLogs: [{ startTime: at(11), stopTime: at(10) }] }, NOW)).toBe(0);
  });
  it("التجميع بمفتاح (يوم، موظف) مع تضمين الفرعيات وتجاهل الصفر وترتيب ثابت", () => {
    const rows = computeDailyTime(
      [
        { date: "2027-03-06", assignedToId: "b", status: "PAUSED", timeLogs: [{ startTime: at(9), stopTime: at(9, 10) }] },
        { date: "2027-03-05", assignedToId: "a", status: "PAUSED", timeLogs: [{ startTime: at(9), stopTime: at(9, 30) }] },
        { date: "2027-03-05", assignedToId: "a", status: "PAUSED", timeLogs: [{ startTime: at(10), stopTime: at(11) }] }, // فرعية
        { date: "2027-03-05", assignedToId: "b", status: "NOT_STARTED", timeLogs: [] },
      ],
      NOW
    );
    expect(rows).toEqual([
      { date: "2027-03-05", assigneeId: "a", durationMs: 90 * 60_000 },
      { date: "2027-03-06", assigneeId: "b", durationMs: 10 * 60_000 },
    ]);
  });
});
