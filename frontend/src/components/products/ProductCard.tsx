import { useEffect, useRef, useState } from "react";
import { ImageOff, MoreVertical, Pencil, Tag, Trash2 } from "lucide-react";
import type { Product } from "../../types";
import { AttachmentImage } from "../ui/ImageAttachments";
import { formatPrice } from "./format";

interface ProductCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}

function PriceBox({ label, cost, price, showLabel }: { label: string; cost: number; price: number; showLabel: boolean }) {
  return (
    <div className="pp-box px-3 py-2.5">
      {showLabel && <p className="mb-1.5 truncate text-center text-[11px] font-semibold text-primary-deep">{label || "بدون اسم"}</p>}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-right">
          <p className="text-[11px] text-muted">سعر التكلفة</p>
          <p className="pp-price mt-0.5 text-[13px] font-semibold text-text">{formatPrice(cost)}</p>
        </div>
        <div className="min-w-0 text-left">
          <p className="text-[11px] text-muted">سعر البيع</p>
          <p className="pp-price mt-0.5 text-[13px] font-semibold text-text">{formatPrice(price)}</p>
        </div>
      </div>
    </div>
  );
}

export function ProductCard({ product, onEdit, onDelete }: ProductCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const image = product.attachments[0];
  const multiple = product.variants.length > 1;

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <article className="pp-card flex flex-col items-center gap-3 p-4">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-control border border-border bg-background">
        {image ? (
          <AttachmentImage attachment={image} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted" aria-label="بدون صورة">
            <ImageOff size={22} />
          </div>
        )}
      </div>

      <span className="pp-chip" title={product.categoryName}>
        <Tag size={12} className="shrink-0" />
        <span className="truncate">{product.categoryName}</span>
      </span>

      <h3 className="w-full truncate text-center text-sm font-semibold text-text" title={product.name}>
        {product.name}
      </h3>

      <div className="flex w-full flex-col gap-2">
        {product.variants.map((variant, index) => (
          <PriceBox key={variant.id ?? index} label={variant.label} cost={variant.cost} price={variant.price} showLabel={multiple || !!variant.label} />
        ))}
      </div>

      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={`خيارات ${product.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors pp-hover-row hover:text-text"
        >
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <div role="menu" className="pp-menu absolute bottom-full left-1/2 z-10 mb-1 w-32 -translate-x-1/2 overflow-hidden p-1">
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onEdit(product);
              }}
              className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-sm text-text pp-hover-row"
            >
              <Pencil size={14} /> تعديل
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onDelete(product);
              }}
              className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-sm text-text pp-hover-danger"
            >
              <Trash2 size={14} /> حذف
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
