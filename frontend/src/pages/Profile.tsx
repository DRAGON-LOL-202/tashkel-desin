import { useState } from "react";
import { Mail, ShieldCheck, UserRound } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FieldWrap, Input } from "../components/ui/Field";
import { useToast } from "../components/ui/ToastProvider";
import { useAuth } from "../components/auth/AuthProvider";
import { useSafeAction } from "../hooks/useSafeAction";
import { roleLabel, usersService } from "../services/usersService";
import type { TeamMember, UpdateProfileInput } from "../types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = Partial<Record<"name" | "email" | "currentPassword" | "newPassword" | "confirm", string>>;

/** نموذج تعديل الاسم والبريد والمسمى وكلمة المرور. الدور والصلاحيات لا تُعدَّل من هنا. */
function ProfileForm({ user, onSaved }: { user: TeamMember; onSaved: (user: TeamMember) => void }) {
  const { show } = useToast();
  const safe = useSafeAction();
  const initialJobTitle = user.role !== roleLabel[user.accessRole] ? user.role : "";
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [jobTitle, setJobTitle] = useState(initialJobTitle);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    const found: Errors = {};
    if (!name.trim()) found.name = "الاسم مطلوب";
    if (!EMAIL_RE.test(email.trim())) found.email = "بريد إلكتروني غير صالح";
    if (newPassword || currentPassword || confirm) {
      if (!currentPassword) found.currentPassword = "كلمة المرور الحالية مطلوبة";
      if (newPassword.length < 8) found.newPassword = "كلمة المرور الجديدة 8 أحرف على الأقل";
      else if (newPassword !== confirm) found.confirm = "تأكيد كلمة المرور غير مطابق";
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // إرسال الحقول التي تغيّرت فقط
    const patch: UpdateProfileInput = {};
    if (name.trim() !== user.name) patch.name = name.trim();
    if (email.trim().toLowerCase() !== user.email) patch.email = email.trim();
    if (jobTitle.trim() && jobTitle.trim() !== initialJobTitle) patch.jobTitle = jobTitle.trim();
    if (newPassword) {
      patch.currentPassword = currentPassword;
      patch.newPassword = newPassword;
    }
    if (Object.keys(patch).length === 0) {
      show("لا توجد تغييرات للحفظ", "info");
      return;
    }

    setSubmitting(true);
    try {
      const result = await safe(() => usersService.updateMe(patch));
      if (!result.ok) return;
      onSaved(result.value);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      show("تم حفظ بياناتك");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="max-w-xl p-5">
      <h3 className="mb-4 text-base font-semibold text-text">تعديل البيانات</h3>
      <FieldWrap label="الاسم *" htmlFor="profile-name" error={errors.name}>
        <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
      </FieldWrap>
      <FieldWrap label="البريد الإلكتروني *" htmlFor="profile-email" error={errors.email}>
        <Input id="profile-email" type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} />
      </FieldWrap>
      <FieldWrap label="المسمى الوظيفي" htmlFor="profile-job">
        <Input id="profile-job" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} maxLength={100} />
      </FieldWrap>

      <div className="mt-2 border-t border-border pt-4">
        <h4 className="mb-1 text-sm font-semibold text-text">تغيير كلمة المرور</h4>
        <p className="mb-3 text-xs text-muted">اترك الحقول فارغة إن لم ترد تغييرها</p>
        <FieldWrap label="كلمة المرور الحالية" htmlFor="profile-current" error={errors.currentPassword}>
          <Input id="profile-current" type="password" dir="ltr" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} maxLength={200} />
        </FieldWrap>
        <FieldWrap label="كلمة المرور الجديدة" htmlFor="profile-new" error={errors.newPassword}>
          <Input id="profile-new" type="password" dir="ltr" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} maxLength={200} placeholder="8 أحرف على الأقل" />
        </FieldWrap>
        <FieldWrap label="تأكيد كلمة المرور الجديدة" htmlFor="profile-confirm" error={errors.confirm}>
          <Input id="profile-confirm" type="password" dir="ltr" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} maxLength={200} />
        </FieldWrap>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? "جارٍ الحفظ..." : "حفظ التغييرات"}
        </Button>
      </div>
    </Card>
  );
}

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  if (!user) return null;

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header title="صفحتي" description="بيانات الحساب الشخصي" onOpenMobileNav={openMobileNav} />
      )}
    >
      <div className="flex flex-col gap-4">
      <Card className="max-w-xl p-5">
        <div className="flex items-center gap-4 border-b border-border pb-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-dark text-background shadow-pop">
            <UserRound size={25} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text">{user.name}</h2>
            <p className="text-sm text-muted">{user.role}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          <div className="flex items-center gap-3 rounded-control border border-border bg-background/40 p-3">
            <Mail size={17} className="text-primary-deep" />
            <div>
              <p className="text-xs text-muted">البريد الإلكتروني</p>
              <p className="text-sm text-text">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-control border border-border bg-background/40 p-3">
            <ShieldCheck size={17} className="text-primary-deep" />
            <div>
              <p className="text-xs text-muted">الدور</p>
              <p className="text-sm text-text">{roleLabel[user.accessRole]}</p>
            </div>
          </div>
        </div>
      </Card>
      <ProfileForm key={`${user.id}:${user.name}:${user.email}:${user.role}`} user={user} onSaved={setUser} />
      </div>
    </AppLayout>
  );
}
