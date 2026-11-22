export interface OptimizeImageOptions {
  maxDimension?: number;
  quality?: number;
}

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.8;

const EXT_BY_MIME: Record<string, string> = {
  "image/webp": ".webp",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

function renameWithExtension(filename: string, mimeType: string): string {
  const ext = EXT_BY_MIME[mimeType];
  if (!ext) return filename;
  const stem = filename.replace(/\.[^/.]+$/, "");
  return `${stem || "image"}${ext}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image load failed"));
    };
    img.src = objectUrl;
  });
}

/**
 * يصغّر الصور الكبيرة ويحوّلها إلى WebP قبل الرفع أو الحفظ، مع الحفاظ على GIF المتحرك كما هو
 * والرجوع الآمن للملف الأصلي إذا لم ينقص الحجم أو تعذّر التحويل في المتصفح.
 */
export async function optimizeImageFile(file: File, options: OptimizeImageOptions = {}): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  let bitmap: ImageBitmap | null = null;

  try {
    let source: CanvasImageSource;
    let width: number;
    let height: number;

    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(file);
        source = bitmap;
        width = bitmap.width;
        height = bitmap.height;
      } catch {
        const img = await loadHtmlImage(file);
        source = img;
        width = img.naturalWidth || img.width;
        height = img.naturalHeight || img.height;
      }
    } else {
      const img = await loadHtmlImage(file);
      source = img;
      width = img.naturalWidth || img.width;
      height = img.naturalHeight || img.height;
    }

    if (!width || !height) return file;

    const longest = Math.max(width, height);
    const scale = longest > maxDimension ? maxDimension / longest : 1;
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));
    const resized = scale < 1;

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, targetW, targetH);

    let blob = await canvasToBlob(canvas, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") {
      const fallbackMime = file.type === "image/png" ? "image/png" : "image/jpeg";
      blob = await canvasToBlob(canvas, fallbackMime, quality);
    }

    if (!blob || blob.size <= 0) return file;
    if (!resized && blob.size >= file.size) return file;

    const outMime = blob.type || "image/webp";
    const outName = renameWithExtension(file.name, outMime);
    return new File([blob], outName, { type: outMime, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
