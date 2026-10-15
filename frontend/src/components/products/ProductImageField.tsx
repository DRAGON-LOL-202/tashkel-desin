import { useRef, useState, type RefObject } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import type { ImageAttachment } from "../../types";
import { errorMessage } from "../../lib/api";
import { generateId } from "../../lib/id";
import { getFilesConfig, uploadImage, discardUpload } from "../../services/filesService";
import { AttachmentImage } from "../ui/ImageAttachments";

interface ProductImageFieldProps {
  value: ImageAttachment | null;
  onChange: (attachment: ImageAttachment | null) => void;
  /** مفاتيح R2 التي رُفعت في هذه الجلسة ولم تُحفظ بعد (تُحذف إن أُلغي النموذج) */
  sessionKeys: RefObject<Set<string>>;
}

const readAsDataUrl = (file: File) =>
  new Promise<ImageAttachment>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: generateId("attachment"), name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** صورة واحدة للمنتج: رفع من الجهاز أو لصق بـ Ctrl+V. الرفع إلى R2 إن كان مفعّلاً وإلا base64. */
export function ProductImageField({ value, onChange, sessionKeys }: ProductImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const dropCurrent = () => {
    if (value?.objectKey && sessionKeys.current.delete(value.objectKey)) void discardUpload(value.objectKey);
  };

  const addFile = async (files: File[]) => {
    const file = files.find((f) => f.type.startsWith("image/"));
    if (!file) {
      setError("اختر صورة فقط.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const config = await getFilesConfig().catch(() => null);
      let next: ImageAttachment;
      if (config?.enabled) {
        if (!config.allowedTypes.includes(file.type)) throw new Error("النوع غير مدعوم (JPG أو PNG أو WebP أو GIF).");
        if (file.size > config.maxFileSize) throw new Error(`الحجم أكبر من ${Math.round(config.maxFileSize / (1024 * 1024))}MB.`);
        next = await uploadImage(file, "products");
        if (next.objectKey) sessionKeys.current.add(next.objectKey);
      } else {
        next = await readAsDataUrl(file);
      }
      dropCurrent(); // الصورة السابقة (إن رُفعت في هذه الجلسة) لم تعد لازمة
      onChange(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div
        role="group"
        tabIndex={0}
        aria-label="منطقة لصق صورة المنتج"
        onClick={(e) => e.currentTarget.focus()}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (files.length > 0) {
            e.preventDefault();
            void addFile(files);
          }
        }}
        className="pp-box flex items-center gap-4 p-3 outline-none focus:ring-2 focus:ring-primary-deep"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) void addFile(files);
            e.target.value = "";
          }}
        />
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-control border border-border bg-background">
          {value ? (
            <AttachmentImage attachment={value} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted">
              <ImagePlus size={22} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-xs text-muted">
            {uploading ? (
              <span role="status" className="inline-flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" /> جارٍ رفع الصورة…
              </span>
            ) : (
              "اضغط هنا ثم الصق بـ Ctrl+V، أو ارفع صورة."
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              className="task-btn task-btn--secondary !h-9 !px-3 !text-sm disabled:opacity-50"
            >
              <ImagePlus size={14} />
              {value ? "تغيير الصورة" : "رفع صورة"}
            </button>
            {value && (
              <button
                type="button"
                disabled={uploading}
                onClick={(e) => {
                  e.stopPropagation();
                  dropCurrent();
                  onChange(null);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-sm text-muted transition-colors pp-hover-danger"
              >
                <Trash2 size={14} />
                إزالة
              </button>
            )}
          </div>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-problem">{error}</p>}
    </div>
  );
}
