/** العملة الظاهرة بجوار الأسعار (ثابت واحد للتعديل) */
export const CURRENCY_LABEL = "ج";

export function formatPrice(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(2)} ${CURRENCY_LABEL}`;
}
