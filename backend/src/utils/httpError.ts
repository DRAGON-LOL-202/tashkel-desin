export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
export const badRequest = (m = "بيانات غير صالحة") => new HttpError(400, m, "BAD_REQUEST");
export const unauthorized = (m = "يجب تسجيل الدخول") => new HttpError(401, m, "UNAUTHORIZED");
export const forbidden = (m = "ليست لديك صلاحية لهذا الإجراء") => new HttpError(403, m, "FORBIDDEN");
export const notFound = (m = "غير موجود") => new HttpError(404, m, "NOT_FOUND");
export const conflict = (m = "تعارض في البيانات") => new HttpError(409, m, "CONFLICT");
