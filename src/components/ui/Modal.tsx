import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-xl",
};

export function Modal({ open, onClose, title, description, children, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="absolute inset-0 bg-[#0d1512]/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative w-full ${sizeMap[size]} bg-surface rounded-card shadow-pop border border-border p-6 animate-scale-in max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 id="modal-title" className="text-lg font-semibold text-text">
              {title}
            </h2>
            {description && <p className="text-sm text-muted mt-1">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="text-muted hover:text-text hover:bg-border/50 rounded-full p-1.5 transition-colors -m-1"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
