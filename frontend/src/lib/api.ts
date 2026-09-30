// عميل الـ API: يضيف JWT في ترويسة Authorization، ويحوّل الأخطاء إلى ApiError برسالة عربية،
// ويُطلق حدث "auth:unauthorized" عند 401 حتى تُسجّل الواجهة الخروج وتعيد المستخدم لصفحة الدخول.
// الحماية الحقيقية في الـ backend؛ هذا الملف لا يقرر أي صلاحية.

const TOKEN_KEY = "tashkeel_token";

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:4000/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // التخزين غير متاح: الجلسة ستنتهي عند إعادة التحميل
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  },
};

export const UNAUTHORIZED_EVENT = "auth:unauthorized";

const defaultMessages: Record<number, string> = {
  400: "بيانات غير صالحة",
  401: "انتهت الجلسة، سجّل الدخول مرة أخرى",
  403: "ليست لديك صلاحية لتنفيذ هذا الإجراء",
  404: "العنصر غير موجود",
  409: "تعارض في البيانات",
  413: "حجم البيانات أو المرفقات كبير جداً",
  429: "محاولات كثيرة، حاول لاحقاً",
};

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
  /** بدون هذا الخيار يُطلق 401 حدث انتهاء الجلسة (يُعطَّل في تسجيل الدخول نفسه) */
  skipAuthEvent?: boolean;
}

function extractMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const p = payload as { error?: unknown; message?: unknown; details?: unknown };
    const raw = typeof p.error === "string" ? p.error : typeof p.message === "string" ? p.message : undefined;
    // أخطاء التحقق (zod): نُلحق أول تفصيل ليعرف المستخدم الحقل المقصود
    const first = Array.isArray(p.details) ? (p.details[0] as { message?: unknown } | undefined) : undefined;
    const detail = first && typeof first.message === "string" ? first.message : undefined;
    if (raw && detail) return `${raw}: ${detail}`;
    if (raw) return raw;
  }
  return defaultMessages[status] ?? (status >= 500 ? "خطأ في الخادم، حاول لاحقاً" : "تعذّر تنفيذ الطلب");
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, skipAuthEvent } = options;
  const url = new URL(`${API_URL}${path}`, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") url.searchParams.set(key, value);
    });
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("تعذّر الاتصال بالخادم، تحقق من الاتصال بالإنترنت", 0);
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !skipAuthEvent) {
      tokenStore.clear();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(extractMessage(payload, response.status), response.status);
  }
  return payload as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "حدث خطأ غير متوقع";
}
