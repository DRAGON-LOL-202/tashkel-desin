import { describe, expect, it } from "vitest";
import { commissionCents, generalAccounts, summarize, waybillNumber, waybillUpperBound, type AccountingRow } from "../src/utils/agentMath.ts";

const row = (o: Partial<AccountingRow>): AccountingRow => ({ agentStatus: "EXPORTED", salesStatus: "DELIVERED", returnFlagged: false, sellCents: 10000, shippingCents: 0, ...o });

describe("agentMath", () => {
  it("رقم البوليصة = Prefix × 100 + التسلسل", () => {
    expect(waybillNumber(500, 1)).toBe(50001);
    expect(waybillNumber(500, 71)).toBe(50071);
    expect(waybillNumber(500, 100)).toBe(50100);
    expect(waybillNumber(600, 1)).toBe(60001);
    expect(waybillUpperBound(500, 600)).toBe(59999);
    expect(waybillUpperBound(500, null)).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("مثال المواصفات: 100 أوردر مسلَّم بإجمالي 30,000 ← 700 + 900 = 1,600", () => {
    const rows = Array.from({ length: 100 }, () => row({ sellCents: 30000 }));
    const s = summarize(rows);
    expect(s.deliveredCount).toBe(100);
    expect(s.deliveredSales).toBe(30000);
    expect(s.fixedFee).toBe(700);
    expect(s.commission).toBe(900);
    expect(s.totalDue).toBe(1600);
  });
  it("العمولة تُقرَّب لأقرب قرش (النصف لأعلى) على المجموع", () => {
    expect(commissionCents(60050)).toBe(1802); // 600.50 × 3% = 18.015 ← 18.02
    expect(commissionCents(0)).toBe(0);
    expect(commissionCents(3333)).toBe(100); // 99.99 ← 1.00
  });
  it("المشحون والمرتجع والملغي والمسودة لا تدخل الحساب", () => {
    const rows = [
      row({}),
      row({ salesStatus: "SHIPPED" }),
      row({ salesStatus: "EXECUTED" }),
      row({ salesStatus: "RETURNED" }),
      row({ returnFlagged: true }),
      row({ agentStatus: "CANCELLED" }),
      row({ agentStatus: "DRAFT", salesStatus: null }),
    ];
    const s = summarize(rows);
    expect(s.deliveredCount).toBe(1);
    expect(s.shipped).toBe(1);
    expect(s.returned).toBe(2);
    expect(s.cancelled).toBe(1);
    expect(s.unexported).toBe(1);
    expect(s.total).toBe(7);
  });
  it("الحسابات العامة: النسب من نفس المجموعة، والصفر يعطي نسباً صفرية، والشحن لا يُحتسب لملغي/مرتجع", () => {
    expect(generalAccounts([])).toMatchObject({ grandTotal: 0, salesPercent: 0, shippingPercent: 0 });
    const g = generalAccounts([
      row({ sellCents: 90000, shippingCents: 10000 }),
      row({ salesStatus: "RETURNED", sellCents: 50000, shippingCents: 5000 }),
      row({ agentStatus: "CANCELLED", sellCents: 50000, shippingCents: 5000 }),
    ]);
    expect(g.deliveredSales).toBe(900);
    expect(g.totalShipping).toBe(100);
    expect(g.grandTotal).toBe(1000);
    expect(g.salesPercent).toBe(90);
    expect(g.shippingPercent).toBe(10);
  });
});
