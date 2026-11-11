import type { InventoryCategory } from "../../types";
import { groupCategories, groupFilterValue } from "./groupCategories";

/**
 * خيارات التصنيفات لقوائم الاختيار والفلاتر.
 * - الوضع الافتراضي: مجمّعة تحت المجموعة الرئيسية (`<optgroup>`) — عنوان المجموعة غير قابل للاختيار (للنماذج التي تتطلب تصنيفاً فعلياً).
 * - `selectableGroups`: للفلاتر فقط — عنوان المجموعة نفسه خيار قابل للاختيار (قيمته `group:<id>`) ويليه تصنيفاتها بإزاحة.
 */
export function CategoryOptions({
  categories,
  selectableGroups = false,
}: {
  categories: InventoryCategory[];
  selectableGroups?: boolean;
}) {
  const groups = groupCategories(categories);

  if (selectableGroups) {
    return (
      <>
        {groups.map((g) => (
          <OptionGroup key={g.label} label={g.label} value={groupFilterValue(g.items[0]?.groupId)} items={g.items} />
        ))}
      </>
    );
  }

  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function OptionGroup({ label, value, items }: { label: string; value: string; items: InventoryCategory[] }) {
  return (
    <>
      <option value={value} style={{ fontWeight: 700 }}>
        {label}
      </option>
      {items.map((c) => (
        <option key={c.id} value={c.id}>
          {"\u00A0\u00A0\u00A0\u00A0"}
          {c.name}
        </option>
      ))}
    </>
  );
}
