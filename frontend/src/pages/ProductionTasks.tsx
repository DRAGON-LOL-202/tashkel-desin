import Dashboard from "./Dashboard";

/** مهام إنتاج: نفس لوحة المهام اليومية لكن لمهام فريق الإنتاج وكروته (showProductionCard). */
export default function ProductionTasksPage() {
  return <Dashboard board="production" />;
}
