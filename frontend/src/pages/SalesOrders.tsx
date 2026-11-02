import { SalesView } from "./Sales";

// أوردرات مبيعات إلكترونية: نفس بيانات صفحة «مبيعات إلكترونية» (أي أوردر يُدخل في إحداهما يظهر في الأخرى)
// لكن بدون أي حسابات أو مبالغ.
export default function SalesOrdersPage() {
  return <SalesView ordersOnly />;
}
