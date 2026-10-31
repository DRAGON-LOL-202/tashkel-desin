/** رقم بحد أقصى ثلاث خانات عشرية بدون أصفار زائدة */
export const fmtQty = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(n);

export const MOVEMENT_LABEL = { IN: "إدخال", OUT: "إخراج", ADJUST: "جرد" } as const;
