import type { InventoryCategory } from "../../types";
import { groupCategories } from "./groupCategories";

/** خيارات تصنيفات مجمّعة تحت المجموعة الرئيسية (`<optgroup>`) لقوائم الاختيار والفلاتر. */
export function CategoryOptions({ categories }: { categories: InventoryCategory[] }) {
  return (
    <>
      {groupCategories(categories).map((g) => (
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
