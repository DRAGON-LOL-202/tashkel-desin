import { useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Input, Select } from "../ui/Field";
import { Button } from "../ui/Button";
import { roleLabel } from "../../services/usersService";
import type { CreateUserInput, TeamMember, UpdateUserInput, UserRole } from "../../types";

interface UserModalProps {
  open: boolean;
  onClose: () => void;
  /** المستخدم المُعدَّل؛ null للإضافة. الأب يعيد تركيب المكوّن (key) عند تغيّره. */
  editing: TeamMember | null;
  /** المستخدم الحالي: يحدد الأدوار المسموحة وقيود تعديل الذات */
  actor: TeamMember;
  /** تُرجع false عند فشل الحفظ لإبقاء النافذة مفتوحة */
  onSubmit: (input: CreateUserInput | UpdateUserInput) => Promise<boolean>;
}

const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = Partial<Record<"name" | "username" | "email" | "password", string>>;

export function UserModal({ open, onClose, editing, actor, onSubmit }: UserModalProps) {
  // المسمى الوظيفي المعروض يرجع لاسم الدور عند غيابه؛ لا نعتبره مسمى فعلياً في هذه الحالة
  const initialJobTitle = editing && editing.role !== roleLabel[editing.accessRole] ? editing.role : "";
  const [name, setName] = useState(editing?.name ?? "");
  const [username, setUsername] = useState(editing?.username ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(editing?.accessRole ?? "designer");
  const [jobTitle, setJobTitle] = useState(initialJobTitle);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const isAdminActor = actor.accessRole === "admin";
  // دور ADMIN لا يُمنح إلا من ADMIN؛ ولا يُغيَّر دور الذات ولا دور مستخدم النظام (يرفضه الـ backend أيضاً)
  const roleLocked = !!editing && (editing.id === actor.id || editing.isSystemUser);
  const roleOptions: UserRole[] = isAdminActor ? ["designer", "manager", "admin"] : ["designer", "manager"];

  const validate = (): Errors => {
    const next: Errors = {};
    if (!name.trim()) next.name = "الاسم مطلوب";
    const u = username.trim();
    if (u.length < 3) next.username = "اسم المستخدم 3 أحرف على الأقل";
    else if (!USERNAME_RE.test(u)) next.username = "حروف إنجليزية وأرقام و . _ - فقط";
    if (!EMAIL_RE.test(email.trim())) next.email = "بريد إلكتروني غير صالح";
    if (!editing && password.length < 8) next.password = "كلمة المرور 8 أحرف على الأقل";
    if (editing && password && password.length < 8) next.password = "كلمة المرور 8 أحرف على الأقل";
    return next;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    let input: CreateUserInput | UpdateUserInput;
    if (!editing) {
      input = {
        name: name.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        role,
        ...(jobTitle.trim() ? { jobTitle: jobTitle.trim() } : {}),
      };
    } else {
      // إرسال الحقول التي تغيّرت فقط
      const patch: UpdateUserInput = {};
      if (name.trim() !== editing.name) patch.name = name.trim();
      if (username.trim().toLowerCase() !== editing.username) patch.username = username.trim();
      if (email.trim().toLowerCase() !== editing.email) patch.email = email.trim();
      if (!roleLocked && role !== editing.accessRole) patch.role = role;
      if (jobTitle.trim() && jobTitle.trim() !== initialJobTitle) patch.jobTitle = jobTitle.trim();
      if (password) patch.password = password;
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      input = patch;
    }

    setSubmitting(true);
    try {
      const saved = await onSubmit(input);
      if (saved) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "تعديل المستخدم" : "إضافة مستخدم جديد"}
      description={editing ? "اترك كلمة المرور فارغة للإبقاء على الحالية" : "سيظهر المستخدم الجديد كعضو في الفريق تلقائياً"}
      size="lg"
    >
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <FieldWrap label="الاسم *" htmlFor="user-name" error={errors.name}>
          <Input id="user-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
        </FieldWrap>
        <FieldWrap label="المسمى الوظيفي" htmlFor="user-job">
          <Input id="user-job" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} maxLength={100} placeholder="مثال: مصمم جرافيك" />
        </FieldWrap>
        <FieldWrap label="اسم المستخدم *" htmlFor="user-username" error={errors.username}>
          <Input
            id="user-username"
            dir="ltr"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={50}
            autoComplete="off"
          />
        </FieldWrap>
        <FieldWrap label="البريد الإلكتروني *" htmlFor="user-email" error={errors.email}>
          <Input id="user-email" type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} autoComplete="off" />
        </FieldWrap>
        <FieldWrap label={editing ? "كلمة مرور جديدة" : "كلمة المرور *"} htmlFor="user-password" error={errors.password}>
          <Input
            id="user-password"
            type="password"
            dir="ltr"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={200}
            autoComplete="new-password"
            placeholder="8 أحرف على الأقل"
          />
        </FieldWrap>
        <FieldWrap label="الدور" htmlFor="user-role">
          <Select id="user-role" value={role} onChange={(event) => setRole(event.target.value as UserRole)} disabled={roleLocked}>
            {roleOptions.map((value) => (
              <option key={value} value={value}>
                {roleLabel[value]}
              </option>
            ))}
          </Select>
        </FieldWrap>
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          إلغاء
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? "جارٍ الحفظ..." : editing ? "حفظ التعديلات" : "إضافة المستخدم"}
        </Button>
      </div>
    </Modal>
  );
}
