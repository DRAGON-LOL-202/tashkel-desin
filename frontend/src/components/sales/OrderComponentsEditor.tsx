import { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import type { InventoryItem, SalesOrderLine } from "../../types";
import { fmtQty } from "../inventory/format";

interface OrderComponentsEditorProps {
  line: SalesOrderLine;
  /** أصناف المخزون المفعّلة لإضافة مكوّن */
  items: InventoryItem[];
  busy: boolean;
  /** shortItems: أصناف رصيدها لا يكفي لتنفيذ الأوردر */
  shortItems: Set<string>;
  onSetQty: (componentId: string, quantity: number) => Promise<void>;
  onRemove: (componentId: string) => Promise<void>;
  onAdd: (itemId: string) => Promise<void>;
}

// حقل كمية مكوّن: يُحفظ عند الخروج منه أو Enter، ويعود للقيمة القديمة إن كانت غير صالحة.
function QtyInput({ value, label, disabled, onCommit }: { value: number; label: string; disabled: boolean; onCommit: (q: number) => void }) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }
  const commit = () => {
    const q = Number(text);
    if (!Number.isFinite(q) || q <= 0 || q === value) {
      setText(String(value));
      return;
    }
    onCommit(q);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      dir="ltr"
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      aria-label={label}
      className="pp-input !h-8 w-20 px-2 text-center text-xs"
    />
  );
}

// تعديل محتويات بند داخل أوردر واحد: تغيير كمية أي مكوّن أو حذفه أو إضافة مكوّن من المخزون.
// التعديل يخص هذا الأوردر فقط؛ المنتج الثابت والأوردرات الأخرى لا تتغير.
export function OrderComponentsEditor({ line, items, busy, shortItems, onSetQty, onRemove, onAdd }: OrderComponentsEditorProps) {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const used = useMemo(() => new Set(line.components.map((c) => c.itemId)), [line.components]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => !used.has(i.id))
      .filter((i) => !q || `${i.name} ${i.sku ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [items, used, search]);

  const onlyOne = line.components.length <= 1;

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <ul className="flex flex-col gap-1.5">
        {line.components.map((c) => (
          <li key={c.id} className={`flex flex-wrap items-center gap-2 rounded-control border px-2.5 py-1.5 ${shortItems.has(c.itemId) ? "border-problem/50" : "border-border/60"}`}>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text" title={`المتاح في المخزون: ${fmtQty(c.available)} ${c.unit}`}>
              {c.itemName}
            </span>
            <span className="text-[11px] text-muted">للوحدة</span>
            <QtyInput value={c.quantity} label={`كمية ${c.itemName}`} disabled={busy} onCommit={(q) => void onSetQty(c.id, q)} />
            <span className="w-10 truncate text-[11px] text-muted">{c.unit}</span>
            <span dir="ltr" className="w-16 text-[11px] font-bold text-text">
              = {fmtQty(c.quantity * line.quantity)}
            </span>
            <button
              type="button"
              disabled={busy || onlyOne}
              onClick={() => void onRemove(c.id)}
              aria-label={`حذف ${c.itemName} من هذا الأوردر`}
              title={onlyOne ? "آخر مكوّن في المنتج" : "حذف من هذا الأوردر فقط"}
              className="task-icon-btn task-icon-btn--danger !h-7 !w-7 disabled:opacity-40"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="flex flex-col gap-1">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في المخزون لإضافة مكوّن لهذا الأوردر" aria-label="بحث في المخزون" autoFocus className="pp-input pp-input--icon !h-9 text-xs" />
          </div>
          {results.length > 0 ? (
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {results.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void onAdd(i.id);
                      setSearch("");
                      setAdding(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-control border border-border/50 px-2.5 py-1.5 text-right pp-hover-row"
                  >
                    <Plus size={13} className="shrink-0 text-primary-deep" />
                    <span className="min-w-0 flex-1 truncate text-xs text-text">{i.name}</span>
                    <span className="text-[11px] text-muted">
                      المتاح {fmtQty(i.quantity)} {i.unit}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">{search ? "لا توجد نتائج مطابقة." : "كل أصناف المخزون موجودة في هذا المنتج."}</p>
          )}
          <button type="button" onClick={() => { setAdding(false); setSearch(""); }} className="self-start text-xs text-muted hover:text-text">
            إلغاء
          </button>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => setAdding(true)} className="task-btn task-btn--secondary !px-2.5 !py-1 !text-xs self-start">
          <Plus size={12} /> إضافة مكوّن لهذا الأوردر
        </button>
      )}
    </div>
  );
}
