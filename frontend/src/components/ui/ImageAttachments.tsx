import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageOff, ImagePlus, Loader2, Paperclip, Trash2 } from "lucide-react";
import type { ImageAttachment } from "../../types";
import { generateId } from "../../lib/id";
import { errorMessage } from "../../lib/api";
import { attachmentSrc } from "../../lib/attachments";
import { discardUpload, getFilesConfig, uploadImage, type UploadScope } from "../../services/filesService";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface ImageAttachmentsFieldProps {
  value: ImageAttachment[];
  onChange: (attachments: ImageAttachment[]) => void;
  /** نطاق التخزين في R2 (مسار الملفات): مهام أو ملاحظات */
  scope: UploadScope;
}

const MAX_ATTACHMENTS = 20; // نفس حد الـ backend

/** صورة مرفق مع بديل عند فشل التحميل (كائن محذوف أو رابط منتهٍ) */
function AttachmentImage({ attachment, className }: { attachment: ImageAttachment; className?: string }) {
  const src = attachmentSrc(attachment);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background text-muted" title="تعذّر تحميل الصورة" role="img" aria-label={"تعذّر تحميل " + attachment.name}>
        <ImageOff size={16} />
      </div>
    );
  }
  return <img src={src} alt={attachment.name} className={className} onError={() => setFailedSrc(src)} />;
}

function PreviewModal({ attachment, onClose }: { attachment: ImageAttachment | null; onClose: () => void }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <Modal open={!!attachment} onClose={onClose} title={attachment?.name ?? "معاينة الصورة"} size="xl">
      {attachment && (
        <AttachmentImage attachment={attachment} className="mx-auto max-h-[70vh] w-auto max-w-full rounded-control object-contain" />
      )}
    </Modal>
    ,
    document.body
  );
}

export function ImageAttachmentsField({ value, onChange, scope }: ImageAttachmentsFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ImageAttachment | null>(null);
  // آخر قيمة (الرفع غير متزامن وقد يتغير value أثناءه) + مفاتيح رُفعت في هذه الجلسة ولم تُحفظ بعد
  const valueRef = useRef(value);
  valueRef.current = value;
  const sessionKeys = useRef(new Set<string>());

  const readAsDataUrl = (file: File) =>
    new Promise<ImageAttachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ id: generateId("attachment"), name: file.name, dataUrl: String(reader.result) });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const addFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setError("اختر صورة فقط.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const room = MAX_ATTACHMENTS - valueRef.current.length;
      const batch = imageFiles.slice(0, Math.max(room, 0));
      const messages: string[] = [];
      if (batch.length < imageFiles.length) messages.push(`الحد الأقصى ${MAX_ATTACHMENTS} مرفقاً.`);

      const config = await getFilesConfig().catch(() => null);
      const added: ImageAttachment[] = [];

      if (config?.enabled) {
        // رفع مباشر إلى R2 (واحداً بعد الآخر)
        for (const file of batch) {
          if (!config.allowedTypes.includes(file.type)) {
            messages.push(`${file.name}: النوع غير مدعوم (JPG أو PNG أو WebP أو GIF).`);
            continue;
          }
          if (file.size > config.maxFileSize) {
            messages.push(`${file.name}: الحجم أكبر من ${Math.round(config.maxFileSize / (1024 * 1024))}MB.`);
            continue;
          }
          try {
            const attachment = await uploadImage(file, scope);
            if (attachment.objectKey) sessionKeys.current.add(attachment.objectKey);
            added.push(attachment);
          } catch (uploadError) {
            messages.push(`${file.name}: ${errorMessage(uploadError)}`);
          }
        }
      } else {
        // R2 غير مفعّل على الخادم: السلوك القديم (base64 داخل الطلب)
        added.push(...(await Promise.all(batch.map(readAsDataUrl))));
      }

      if (added.length > 0) onChange([...valueRef.current, ...added]);
      setError(messages.join(" "));
    } catch {
      setError("تعذّر إضافة الصور.");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (attachment: ImageAttachment) => {
    onChange(value.filter((item) => item.id !== attachment.id));
    // ملف رُفع في هذه الجلسة ولم يُحفظ: يُحذف من R2 الآن (الخادم يرفض إن كان محفوظاً في سجل)
    if (attachment.objectKey && sessionKeys.current.delete(attachment.objectKey)) void discardUpload(attachment.objectKey);
  };

  return (
    <>
      <div
        role="group"
        tabIndex={0}
        onClick={(event) => event.currentTarget.focus()}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (files.length > 0) {
            event.preventDefault();
            void addFiles(files);
          }
        }}
        className="rounded-control border border-dashed border-border bg-background/40 p-3 outline-none transition-colors hover:border-primary-deep/50 focus:ring-2 focus:ring-primary/40"
        aria-label="منطقة لصق الصور"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 0) void addFiles(files);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted">
            <ImagePlus size={18} className="text-primary-deep" />
            {uploading ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                <span role="status">جارٍ رفع الصور…</span>
              </>
            ) : (
              <span>اضغط هنا ثم الصق بـ Ctrl+V، أو ارفع صورة.</span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<Paperclip size={14} />}
            disabled={uploading}
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            إرفاق
          </Button>
        </div>

        {value.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {value.map((attachment) => (
              <div key={attachment.id} className="group relative h-16 w-16 overflow-hidden rounded-control border border-border bg-surface">
                <button type="button" onClick={(event) => { event.stopPropagation(); setPreview(attachment); }} className="h-full w-full">
                  <AttachmentImage attachment={attachment} className="h-full w-full object-cover" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeAttachment(attachment);
                  }}
                  className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center bg-problem text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={"حذف " + attachment.name}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-problem">{error}</p>}
      <PreviewModal attachment={preview} onClose={() => setPreview(null)} />
    </>
  );
}

export function ImageAttachmentGallery({ attachments = [] }: { attachments?: ImageAttachment[] }) {
  const [preview, setPreview] = useState<ImageAttachment | null>(null);
  if (attachments.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <button
            key={attachment.id}
            type="button"
            onClick={() => setPreview(attachment)}
            className="h-14 w-14 overflow-hidden rounded-control border border-border bg-background transition-transform hover:scale-105"
            title={attachment.name}
          >
            <AttachmentImage attachment={attachment} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      <PreviewModal attachment={preview} onClose={() => setPreview(null)} />
    </>
  );
}
