import { MoreVertical } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface TaskMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

interface TaskActionsMenuProps {
  items: TaskMenuItem[];
  /** صنف CSS لزر الثلاث نقاط (افتراضيًا نفس أزرار أيقونات بطاقة المهمة) */
  buttonClassName?: string;
  label?: string;
}

const MENU_WIDTH = 192;
const GAP = 6;
const EDGE = 8;

/**
 * قائمة الإجراءات الثانوية للمهمة (ثلاث نقاط). تُرسم داخل portal بموضع ثابت حتى لا تقصّها
 * حاويات التمرير أو overflow في أعمدة الفريق، وتُغلق بالنقر خارجها أو Escape أو التمرير.
 */
export function TaskActionsMenu({ items, buttonClassName = "tc-ico", label = "المزيد من الإجراءات" }: TaskActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    setPos(null);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // الموضع: أسفل الزر ومحاذٍ لحافته اليسرى (كما في التصميم المرجعي)، مع الانقلاب للأعلى/اليمين عند ضيق المساحة
  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;
    const b = buttonRef.current.getBoundingClientRect();
    const h = menuRef.current.offsetHeight;
    const w = menuRef.current.offsetWidth || MENU_WIDTH;
    let left = b.left;
    if (left + w > window.innerWidth - EDGE) left = b.right - w;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE));
    let top = b.bottom + GAP;
    if (top + h > window.innerHeight - EDGE) top = Math.max(EDGE, b.top - h - GAP);
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        if (nodes.length === 0) return;
        e.preventDefault();
        const i = nodes.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "ArrowDown" ? (i + 1) % nodes.length : (i - 1 + nodes.length) % nodes.length;
        nodes[next].focus();
      }
    };
    const onScrollOrResize = () => close();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, close]);

  // التركيز على أول عنصر عند الفتح (لوحة المفاتيح)
  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [open, pos]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonClassName}
      >
        <MoreVertical size={17} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            dir="rtl"
            style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, width: MENU_WIDTH, visibility: pos ? "visible" : "hidden" }}
            className="z-[70] rounded-xl border border-border bg-surface p-1.5 shadow-2xl"
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none " +
                  (item.danger
                    ? "text-problem hover:bg-problem/10 focus-visible:bg-problem/10"
                    : "text-text hover:bg-primary/10 focus-visible:bg-primary/10")
                }
              >
                <span>{item.label}</span>
                <span className="shrink-0" aria-hidden>{item.icon}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
