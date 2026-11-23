import { describe, expect, it } from "vitest";
import { calcAdjustedBoxPriceCents, commissionCents, generalAccounts, summarize, waybillNumber, waybillUpperBound, type AccountingRow } from "../src/utils/agentMath.ts";

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
    expect(generalAccounts([])).toMatchObject({ grandTotal: 0, salesPercent: 0, shippingPercent: 0, deliveredExitPrice: 0, priceDiff: 0, priceDiffPercent: 0 });
    const g = generalAccounts([
      row({ sellCents: 90000, shippingCents: 10000 }),
      row({ salesStatus: "RETURNED", sellCents: 50000, shippingCents: 5000 }),
      row({ agentStatus: "CANCELLED", sellCents: 50000, shippingCents: 5000 }),
    ]);
    expect(g.deliveredSales).toBe(900);
    expect(g.deliveredExitPrice).toBe(900);
    expect(g.totalShipping).toBe(100);
    expect(g.grandTotal).toBe(1000);
    expect(g.salesPercent).toBe(90);
    expect(g.shippingPercent).toBe(10);
    expect(g.priceDiff).toBe(0);
    expect(g.priceDiffPercent).toBe(0);
  });
  it("سعر الخروج من الفتاة مختلف عن سعر الخروج من المخزون: الإجمالي الكلي = سعر الخروج + الشحن، وفرق الصرف كنسبة مئوية", () => {
    // سعر المخزون = 500، سعر الخروج = 650 (+30%)، شحن = 70 → الإجمالي الكلي = 720
    const gPos = generalAccounts([row({ sellCents: 50000, exitCents: 65000, shippingCents: 7000 })]);
    expect(gPos.deliveredSales).toBe(500);
    expect(gPos.deliveredExitPrice).toBe(650);
    expect(gPos.totalShipping).toBe(70);
    expect(gPos.grandTotal).toBe(720);
    expect(gPos.priceDiff).toBe(150);
    expect(gPos.priceDiffPercent).toBe(30);
    expect(gPos.salesPercent).toBe(Math.round((65000 / 72000) * 10000) / 100);
    expect(gPos.shippingPercent).toBe(Math.round((7000 / 72000) * 10000) / 100);

    // خصم تحت سعر المخزون: 450 مقابل 500 → فرق صرف -10%
    const gNeg = generalAccounts([row({ sellCents: 50000, exitCents: 45000, shippingCents: 5000 })]);
    expect(gNeg.deliveredSales).toBe(500);
    expect(gNeg.deliveredExitPrice).toBe(450);
    expect(gNeg.grandTotal).toBe(500);
    expect(gNeg.priceDiff).toBe(-50);
    expect(gNeg.priceDiffPercent).toBe(-10);
  });
  it("calcAdjustedBoxPriceCents: السعر الثابت + سعر الإضافة والحذف فقط (مستقل عن سعر المخزون ويُحصر عند ≥ 0)", () => {
    const prices = new Map([
      ["watch", { addPriceCents: 12000, removePriceCents: 9000 }],
      ["perfume", { addPriceCents: 8000, removePriceCents: 5000 }],
      ["rose", { addPriceCents: 2500, removePriceCents: 1500 }],
      ["mug", { addPriceCents: 6500, removePriceCents: 4500 }],
    ]);
    const defaults = [
      { itemId: "watch", quantity: 1 },
      { itemId: "perfume", quantity: 1 },
      { itemId: "rose", quantity: 2 },
    ];
    // 1. بدون تعديل = السعر الثابت تماماً
    expect(calcAdjustedBoxPriceCents(50000, defaults, defaults, prices)).toEqual({
      baseCents: 50000,
      deltaCents: 0,
      unitCents: 50000,
    });
    // 2. إضافة صنف جديد (مج × 2 = +130)، حذف عطر (-50)، إنقاص وردة (2 ← 1 = -15) => 500 + 65 = 565
    expect(
      calcAdjustedBoxPriceCents(
        50000,
        defaults,
        [
          { itemId: "watch", quantity: 1 },
          { itemId: "rose", quantity: 1 },
          { itemId: "mug", quantity: 2 },
        ],
        prices
      )
    ).toEqual({
      baseCents: 50000,
      deltaCents: 6500,
      unitCents: 56500,
    });
    // 3. زيادة مكوّن افتراضي بكمية كسرية (+0.5 × 25 = +12.50)
    expect(
      calcAdjustedBoxPriceCents(
        50000,
        defaults,
        [
          { itemId: "watch", quantity: 1 },
          { itemId: "perfume", quantity: 1 },
          { itemId: "rose", quantity: 2.5 },
        ],
        prices
      )
    ).toEqual({
      baseCents: 50000,
      deltaCents: 1250,
      unitCents: 51250,
    });
    // 4. إجمالي الخصومات يتجاوز السعر الثابت => يثبت عند صفر لا سالب
    expect(
      calcAdjustedBoxPriceCents(
        10000,
        defaults,
        [{ itemId: "rose", quantity: 1 }],
        prices
      )
    ).toEqual({
      baseCents: 10000,
      deltaCents: -15500,
      unitCents: 0,
    });
  });
});
