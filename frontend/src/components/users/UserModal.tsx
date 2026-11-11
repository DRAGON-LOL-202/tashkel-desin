import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Input, Select } from "../ui/Field";
import { Button } from "../ui/Button";
import { inventoryAccessLabel, roleLabel } from "../../services/usersService";
import { inventoryService } from "../../services/inventoryService";
import { isRestrictedRole, isSalesRole } from "../../lib/permissions";
import type { CreateUserInput, InventoryAccessLevel, InventoryGroup, TeamMember, UpdateUserInput, UserRole } from "../../types";

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

const ACCESS_OPTIONS: InventoryAccessLevel[] = ["none", "withdraw", "full"];

// الكروت مستقلة: يمكن تفعيل أحدهما أو كليهما أو تركهما معاً بلا كرت.
type CardKey = "design" | "production";
const CARD_OPTIONS: { value: CardKey; label: string }[] = [
  { value: "design", label: "كرت مهام" },
  { value: "production", label: "كرت مهام إنتاج" },
];
const CARD_HINT: Record<CardKey, string> = {
  design: "يظهر له كرت في لوحة «المهام اليومية» (فريق التصميم)، ويمكن إسناد مهام إليه هناك.",
  production: "يظهر له كرت في لوحة «مهام إنتاج»، ويمكن إسناد مهام إنتاج إليه.",
};
const NO_CARD_HINT = "لا يظهر له كرت في أي لوحة مهام ولا في إحصاءات الفريق، ولا يمكن إسناد مهام جديدة إليه.";
const ACCESS_HINT: Record<InventoryAccessLevel, string> = {
  none: "لا تظهر له صفحات المخزون ولا السحب.",
  withdraw: "تظهر له صفحة السحب فقط (من كل التصنيفات) بلا أسعار.",
  full: "يرى المخزون والنواقص والأسعار والسحب (للقراءة والسحب فقط).",
};
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function UserModal({ open, onClose, editing, actor, onSubmit }: UserModalProps) {
  // المسمى الوظيفي المعروض يرجع لاسم الدور عند غيابه؛ لا نعتبره مسمى فعلياً في هذه الحالة
  const initialJobTitle = editing && editing.role !== roleLabel[editing.accessRole] ? editing.role : "";
  const [name, setName] = useState(editing?.name ?? "");
  const [username, setUsername] = useState(editing?.username ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(editing?.accessRole ?? "designer");
  const [jobTitle, setJobTitle] = useState(initialJobTitle);
  // الكروت: كرت مهام (التصميم) و/أو كرت مهام إنتاج، أو لا شيء. الافتراضي للمستخدم الجديد: كرت مهام.
  const initialCards = { design: editing ? editing.showTaskCard : true, production: editing ? editing.showProductionCard : false };
  const [cards, setCards] = useState<Record<CardKey, boolean>>(initialCards);
  const toggleCard = (key: CardKey) => setCards((prev) => ({ ...prev, [key]: !prev[key] }));
  // المصمم: مستوى وصول المخزون. تعبئة/مشغل: المجموعات الرئيسية المسموح السحب من كل تصنيفاتها.
  const initialAccess: InventoryAccessLevel = editing?.accessRole === "designer" ? editing.inventoryAccess : "none";
  const initialGroupIds = editing?.allowedGroupIds ?? [];
  const [inventoryAccess, setInventoryAccess] = useState<InventoryAccessLevel>(initialAccess);
  const [groupIds, setGroupIds] = useState<string[]>(initialGroupIds);
  const [groups, setGroups] = useState<InventoryGroup[]>([]);
  const [groupsError, setGroupsError] = useState(false);
  // أسماء التصنيفات الفرعية تحت كل مجموعة (للعرض المختصر فقط)
  const [categoryNames, setCategoryNames] = useState<Record<string, string[]>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const isAdminActor = actor.accessRole === "admin";
  // دور ADMIN لا يُمنح إلا من ADMIN؛ ولا يُغيَّر دور الذات ولا دور مستخدم النظام (يرفضه الـ backend أيضاً)
  const roleLocked = !!editing && (editing.id === actor.id || editing.isSystemUser);
  const roleOptions: UserRole[] = isAdminActor
    ? ["designer", "packer", "operator", "sales_flagger", "sales_editor", "sales_supervisor", "manager", "admin"]
    : ["designer", "packer", "operator", "sales_flagger", "sales_editor", "sales_supervisor", "manager"];
  const restricted = isRestrictedRole(role);

  // المجموعتان وتصنيفاتهما تُجلبان عند الحاجة فقط (اختيار تعبئة/مشغل)
  useEffect(() => {
    if (!open || !restricted || groups.length > 0) return;
    let cancelled = false;
    Promise.all([inventoryService.listGroups(), inventoryService.listCategories().catch(() => [])])
      .then(([res, cats]) => {
        if (cancelled) return;
        setGroups(res.groups);
        const names: Record<string, string[]> = {};
        for (const c of cats) if (c.groupId) names[c.groupId] = [...(names[c.groupId] ?? []), c.name];
        setCategoryNames(names);
        setGroupsError(false);
      })
      .catch(() => {
        if (!cancelled) setGroupsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, restricted, groups.length]);

  const toggleGroup = (id: string) => setGroupIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

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
        showTaskCard: cards.design,
        showProductionCard: cards.production,
        ...(role === "designer" ? { inventoryAccess } : {}),
        ...(restricted ? { allowedGroupIds: groupIds } : {}),
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
      if (cards.design !== initialCards.design) patch.showTaskCard = cards.design;
      if (cards.production !== initialCards.production) patch.showProductionCard = cards.production;
      if (role === "designer" && (inventoryAccess !== initialAccess || editing.accessRole !== "designer")) patch.inventoryAccess = inventoryAccess;
      // عند التحويل إلى تعبئة/مشغل نرسل المجموعات دائماً؛ وإلا عند تغيّرها فقط
      if (restricted && (editing.accessRole !== role || !sameSet(groupIds, initialGroupIds))) patch.allowedGroupIds = groupIds;
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
          <Select
            id="user-role"
            value={role}
            onChange={(event) => {
              const nextRole = event.target.value as UserRole;
              setRole(nextRole);
              if (!editing) {
                setCards({ design: !isRestrictedRole(nextRole) && !isSalesRole(nextRole), production: false });
              }
            }}
            disabled={roleLocked}
          >
            {roleOptions.map((value) => (
              <option key={value} value={value}>
                {roleLabel[value]}
              </option>
            ))}
          </Select>
        </FieldWrap>
      </div>

      <fieldset className="mb-4 rounded-control border border-border p-3" data-testid="task-card-mode">
        <legend className="px-1 text-sm font-medium text-text">كرت المهام</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CARD_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-sm text-text hover:bg-border/40 ${cards[option.value] ? "border-primary-deep bg-primary/10 font-semibold" : "border-border"}`}
              data-testid={`card-mode-${option.value}`}
            >
              <input
                type="checkbox"
                name="task-card-mode"
                value={option.value}
                checked={cards[option.value]}
                onChange={() => toggleCard(option.value)}
                className="h-4 w-4 shrink-0 accent-[var(--color-primary-deep,#3FA796)]"
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {CARD_OPTIONS.filter((o) => cards[o.value]).map((o) => CARD_HINT[o.value]).join(" ") || NO_CARD_HINT}
        </p>
      </fieldset>

      {role === "designer" && (
        <div className="mb-4 rounded-control border border-border p-3" data-testid="inventory-access-section">
          <label htmlFor="user-inventory-access" className="block text-sm font-medium text-text mb-1.5">
            صلاحية المخزون
          </label>
          <Select id="user-inventory-access" value={inventoryAccess} onChange={(event) => setInventoryAccess(event.target.value as InventoryAccessLevel)}>
            {ACCESS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {inventoryAccessLabel[value]}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-muted">{ACCESS_HINT[inventoryAccess]}</p>
        </div>
      )}

      {restricted && (
        <fieldset className="mb-4 rounded-control border border-border p-3" data-testid="allowed-groups-section">
          <legend className="px-1 text-sm font-medium text-text">مجموعات السحب المسموحة</legend>
          <p className="mb-2 text-xs text-muted">يصل هذا المستخدم إلى صفحة السحب فقط. يصل إلى كل التصنيفات الداخلة تحت المجموعة المختارة، ومنها ما يُضاف لاحقاً.</p>
          {groupsError ? (
            <p className="text-xs text-problem">تعذّر تحميل المجموعات، أغلق النافذة وأعد المحاولة.</p>
          ) : groups.length === 0 ? (
            <p className="text-xs text-muted">جارٍ تحميل المجموعات…</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {groups.map((g) => {
                const names = categoryNames[g.id] ?? [];
                return (
                  <label key={g.id} className="flex cursor-pointer items-start gap-2.5 rounded-control border border-border px-3 py-2.5 text-sm text-text hover:bg-border/40">
                    <input
                      type="checkbox"
                      checked={groupIds.includes(g.id)}
                      onChange={() => toggleGroup(g.id)}
                      data-testid={`group-${g.key}`}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary-deep,#3FA796)]"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">{g.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {g.categoriesCount} تصنيف{names.length > 0 ? `: ${names.slice(0, 4).join("، ")}${names.length > 4 ? "…" : ""}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {groupIds.length === 0 && <p className="mt-2 text-xs font-medium text-problem">بدون مجموعات لن يستطيع السحب من أي صنف.</p>}
        </fieldset>
      )}

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
