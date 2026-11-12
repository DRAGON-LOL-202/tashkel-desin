import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, ShieldCheck, Trash2, UserCheck, UserRound, UserX, Users } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { Input } from "../components/ui/Field";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { useAuth } from "../components/auth/AuthProvider";
import { UserModal } from "../components/users/UserModal";
import { DeleteUserDialog } from "../components/users/DeleteUserDialog";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { inventoryAccessLabel, roleLabel, usersService } from "../services/usersService";
import { inventoryService } from "../services/inventoryService";
import { agentAdminService } from "../services/agentService";
import type { CreateUserInput, TeamMember, UpdateUserInput, UserRole } from "../types";

const roleColor: Record<UserRole, string> = {
  admin: "#FF6B6B",
  manager: "#F2B84B",
  designer: "#3FA796",
  packer: "#7C6BD6",
  operator: "#4F8FE0",
  sales_accountant: "#E07A5F",
  sales_editor: "#2A9D8F",
  sales_supervisor: "#3D5A80",
  sales_agent: "#C0709B",
};

/** شارة مجموعات السحب: اسم المجموعة، أو «الاثنتان» عند منح كل المجموعات */
function groupsLabel(ids: string[], names: Record<string, string>): string {
  const known = ids.map((id) => names[id]).filter(Boolean);
  const total = Object.keys(names).length;
  if (total > 1 && known.length === total) return "الاثنتان";
  return known.length > 0 ? known.join("، ") : `${ids.length} مجموعة`;
}

export default function ManageUsersPage() {
  const { user: actor } = useAuth();
  const { show } = useToast();
  const safe = useSafeAction();
  const { data: users, loading, error, reload, retry } = useResource<TeamMember[]>(usersService.list, []);
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    inventoryService
      .listGroups()
      .then((res) => {
        if (!cancelled) setGroupNames(Object.fromEntries(res.groups.map((g) => [g.id, g.name])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const [query, setQuery] = useState("");
  // null = مغلق، "new" = إضافة، غير ذلك = المستخدم المُعدَّل
  const [modalTarget, setModalTarget] = useState<TeamMember | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.name, u.username, u.email, u.role].some((v) => v.toLowerCase().includes(q)));
  }, [users, query]);

  if (!actor) return null;

  // المدير لا يعدّل حساب المدير العام (الـ backend يرفض أيضاً؛ هذا للعرض فقط)
  const canModify = (target: TeamMember) => actor.accessRole === "admin" || target.accessRole !== "admin";

  const handleSubmit = async (input: CreateUserInput | UpdateUserInput, extra?: { agentPrefix?: number }): Promise<boolean> => {
    const editing = modalTarget && modalTarget !== "new" ? modalTarget : null;
    const prefix = extra?.agentPrefix;
    // فتاة قائمة: نحفظ Prefix أولاً (إن رُفض لا يُحفظ شيء والنافذة تبقى مفتوحة). حساب جديد/تغيير دور: بعد الحساب.
    const prefixFirst = !!editing && editing.accessRole === "sales_agent";
    if (prefix !== undefined && editing && prefixFirst) {
      const p = await safe(() => agentAdminService.setPrefix(editing.id, prefix));
      if (!p.ok) return false;
    }
    let userId = editing?.id;
    if (!editing || Object.keys(input).length > 0) {
      const result = await safe(() =>
        editing ? usersService.update(editing.id, input as UpdateUserInput) : usersService.create(input as CreateUserInput)
      );
      if (!result.ok) return false;
      userId = result.value.id;
    }
    if (prefix !== undefined && userId && !prefixFirst) {
      const p = await safe(() => agentAdminService.setPrefix(userId!, prefix));
      // الحساب حُفظ فعلاً؛ تظهر رسالة الخطأ ويمكن ضبط Prefix بتعديل المستخدم أو من صفحة حسابات الفتيات
      if (!p.ok) {
        await reload();
        return !editing;
      }
    }
    show(editing ? "تم حفظ التعديلات" : "تمت إضافة المستخدم");
    await reload();
    return true;
  };

  const handleToggleActive = async (target: TeamMember) => {
    const result = await safe(() => usersService.setActive(target.id, !target.isActive));
    if (!result.ok) return;
    show(target.isActive ? "تم تعطيل الحساب" : "تم تفعيل الحساب");
    await reload();
  };

  const handleDeleteAll = async (target: TeamMember) => {
    const result = await safe(() => usersService.remove(target.id, true));
    if (!result.ok) return;
    setDeleteTarget(null);
    show("تم حذف المستخدم وكل بياناته");
    await reload();
  };

  const handleDisableInstead = async (target: TeamMember) => {
    setDeleteTarget(null);
    if (target.isActive) await handleToggleActive(target);
    else show("الحساب معطّل بالفعل وبياناته محفوظة");
  };

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="إدارة المستخدمين"
          description="إضافة الحسابات وتعديلها وتعطيلها"
          onOpenMobileNav={openMobileNav}
          action={
            <Button icon={<Plus size={16} />} onClick={() => setModalTarget("new")}>
              مستخدم جديد
            </Button>
          }
        />
      )}
    >
      {loading ? (
        <LoadingState label="جارٍ تحميل المستخدمين..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث بالاسم أو اسم المستخدم أو البريد"
                aria-label="بحث في المستخدمين"
                className="pr-10"
              />
            </div>
          </Card>

          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Users size={24} />}
                title={query ? "لا نتائج مطابقة" : "لا يوجد مستخدمون"}
                description={query ? "جرّب كلمة بحث أخرى" : "أضف أول مستخدم للبدء"}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {visible.map((target) => {
                const isSelf = target.id === actor.id;
                const modifiable = canModify(target);
                const canToggle = modifiable && (target.isActive ? !isSelf && !target.isSystemUser : true);
                const canDelete = modifiable && !isSelf && !target.isSystemUser;
                return (
                  <Card key={target.id} className={`p-4 ${target.isActive ? "" : "opacity-70"}`} data-testid={`user-row-${target.username}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-dark text-background shadow-pop">
                          <UserRound size={20} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-base font-bold text-text">{target.name}</h2>
                            {isSelf && <span className="text-xs text-muted">(أنت)</span>}
                            {target.showTaskCard && target.showProductionCard && <Badge color="#3FA796">كرت مهام</Badge>}
                            {target.showProductionCard && <Badge color="#C08A3E">كرت مهام إنتاج</Badge>}
                            {!target.showTaskCard && !target.showProductionCard && <Badge color="#78847F">بلا كرت مهام</Badge>}
                            {target.isSystemUser && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted">
                                <ShieldCheck size={13} /> مستخدم نظام
                              </span>
                            )}
                          </div>
                          <p className="truncate text-sm text-muted">{target.role}</p>
                          <p className="truncate text-xs text-muted" dir="ltr" style={{ textAlign: "right" }}>
                            {target.username} · {target.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge color={roleColor[target.accessRole]}>{roleLabel[target.accessRole]}</Badge>
                        {target.accessRole === "designer" && <Badge color="#78847F">{inventoryAccessLabel[target.inventoryAccess]}</Badge>}
                        {(target.accessRole === "packer" || target.accessRole === "operator") && (
                          <Badge color={target.allowedGroupIds?.length ? "#78847F" : "#E0A100"}>
                            {target.allowedGroupIds?.length ? groupsLabel(target.allowedGroupIds, groupNames) : "بلا مجموعات"}
                          </Badge>
                        )}
                        <Badge color={target.isActive ? "#55C98B" : "#78847F"}>{target.isActive ? "مفعّل" : "معطّل"}</Badge>
                      </div>

                      <div className="flex items-center gap-1">
                        <IconButton
                          onClick={() => setModalTarget(target)}
                          disabled={!modifiable}
                          aria-label={`تعديل ${target.name}`}
                          title={modifiable ? "تعديل" : "لا يمكنك تعديل حساب المدير العام"}
                        >
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton
                          onClick={() => void handleToggleActive(target)}
                          disabled={!canToggle}
                          aria-label={target.isActive ? `تعطيل ${target.name}` : `تفعيل ${target.name}`}
                          title={target.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
                        >
                          {target.isActive ? <UserX size={16} /> : <UserCheck size={16} />}
                        </IconButton>
                        {canDelete && (
                          <IconButton
                            onClick={() => setDeleteTarget(target)}
                            aria-label={`حذف ${target.name}`}
                            title="حذف"
                            className="hover:!bg-problem/10 hover:!text-problem"
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {modalTarget && (
        <UserModal
          key={modalTarget === "new" ? "new" : modalTarget.id}
          open
          onClose={() => setModalTarget(null)}
          editing={modalTarget === "new" ? null : modalTarget}
          actor={actor}
          onSubmit={handleSubmit}
        />
      )}

      <DeleteUserDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleteAll={(t) => void handleDeleteAll(t)}
        onDisable={(t) => void handleDisableInstead(t)}
      />
    </AppLayout>
  );
}
