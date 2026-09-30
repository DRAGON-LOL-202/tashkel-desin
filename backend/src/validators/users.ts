import { z } from "zod";

const roleInput = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(["ADMIN", "MANAGER", "DESIGNER"]));

const name = z.string().trim().min(1).max(100);
const username = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-zA-Z0-9._-]+$/, "اسم المستخدم: حروف إنجليزية وأرقام و . _ - فقط")
  .transform((s) => s.toLowerCase());
const email = z.string().trim().toLowerCase().max(200).pipe(z.email());
const jobTitle = z.string().trim().min(1).max(100);
const password = z.string().min(8, "كلمة المرور 8 أحرف على الأقل").max(200);

export const createUserSchema = z.object({
  name,
  username,
  email,
  password,
  role: roleInput.default("DESIGNER"),
  jobTitle: jobTitle.optional(),
});

export const updateUserSchema = z
  .object({
    name: name.optional(),
    username: username.optional(),
    email: email.optional(),
    password: password.optional(),
    role: roleInput.optional(),
    jobTitle: jobTitle.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" });

export const statusSchema = z.object({ isActive: z.boolean() });

// الملف الشخصي: لا دور ولا تفعيل ولا isSystemUser. تغيير كلمة المرور يتطلب الحالية.
export const updateProfileSchema = z
  .object({
    name: name.optional(),
    email: email.optional(),
    jobTitle: jobTitle.optional(),
    currentPassword: z.string().min(1).max(200).optional(),
    newPassword: password.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" })
  .refine((v) => !v.newPassword || !!v.currentPassword, {
    message: "كلمة المرور الحالية مطلوبة لتغيير كلمة المرور",
    path: ["currentPassword"],
  });
