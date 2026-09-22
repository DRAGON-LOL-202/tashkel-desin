import { useMemo, useState } from "react";
import { Target, UserCheck } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { GoalColumn } from "../components/goals/GoalColumn";
import { GoalFilters, type GoalFilterValue } from "../components/goals/GoalFilters";
import { GoalModal } from "../components/goals/GoalModal";
import { GoalStats } from "../components/goals/GoalStats";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { goalsService } from "../services/goalsService";
import type { CreateGoalInput, Goal, GoalStatus, GoalType } from "../types";
import { todayISO } from "../lib/date";
import { useToast } from "../components/ui/ToastProvider";

const sections: { type: GoalType; label: string; accent: string }[] = [
  { type: "weekly", label: "أهداف أسبوعية", accent: "#27C6A3" },
  { type: "monthly", label: "أهداف شهرية", accent: "#8B6FEF" },
  { type: "quarterly", label: "أهداف ربع سنوية", accent: "#F2B84B" },
];

const statusOrder: Record<GoalStatus, number> = {
  in_progress: 0,
  not_started: 1,
  paused: 2,
  completed: 3,
};

function sortGoals(a: Goal, b: Goal): number {
  const byStatus = statusOrder[a.status] - statusOrder[b.status];
  if (byStatus !== 0) return byStatus;
  return a.createdAt - b.createdAt;
}

function isGoalVisibleOnDate(goal: Goal, date: string): boolean {
  return goal.startDate <= date && goal.endDate >= date;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>(() => goalsService.list());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [defaultType, setDefaultType] = useState<GoalType>("weekly");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<GoalFilterValue>("all");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const { show } = useToast();

  const filteredGoals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return goals
      .filter((goal) => isGoalVisibleOnDate(goal, selectedDate))
      .filter((goal) => (filter === "all" ? true : goal.status === filter))
      .filter((goal) => {
        if (!query) return true;
        return `${goal.title} ${goal.description ?? ""}`.toLowerCase().includes(query);
      })
      .sort(sortGoals);
  }, [filter, goals, search, selectedDate]);

  const grouped = useMemo(() => {
    const map: Record<GoalType, Goal[]> = { weekly: [], monthly: [], quarterly: [] };
    filteredGoals.forEach((goal) => map[goal.type].push(goal));
    return map;
  }, [filteredGoals]);

  const handleSubmit = (input: CreateGoalInput) => {
    if (editing) {
      setGoals(goalsService.update(editing.id, input));
      show("تم تحديث الهدف");
    } else {
      setGoals(goalsService.create(input));
      show("تمت إضافة الهدف بنجاح");
    }
    setEditing(null);
  };

  const handleAdd = (type: GoalType) => {
    setDefaultType(type);
    setEditing(null);
    setModalOpen(true);
  };

  const handleEdit = (goal: Goal) => {
    setDefaultType(goal.type);
    setEditing(goal);
    setModalOpen(true);
  };

  const handleToggleComplete = (goal: Goal) => {
    const nextStatus = goal.status === "completed" ? "in_progress" : "completed";
    const nextCurrent = nextStatus === "completed" ? goal.target : Math.min(goal.current, goal.target - 1);
    setGoals(goalsService.update(goal.id, { status: nextStatus, current: Math.max(nextCurrent, 0) }));
  };

  const handleIncrement = (goal: Goal) => {
    const nextCurrent = Math.min(goal.current + 1, goal.target);
    setGoals(
      goalsService.update(goal.id, {
        current: nextCurrent,
        status: nextCurrent >= goal.target ? "completed" : "in_progress",
      })
    );
  };

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="الأهداف"
          description="تابع تقدم فريق التصميم نحو أهدافه"
          onOpenMobileNav={openMobileNav}
          action={
            <div className="hidden sm:flex items-center gap-2 rounded-control bg-primary/15 px-3 py-2 text-sm">
              <UserCheck size={16} className="text-primary-deep" />
              <span className="font-semibold text-text">بشمهندس عبدالله</span>
              <span className="rounded-full bg-primary/30 px-2 py-0.5 text-xs font-medium text-primary-deep">
                مشرف الفريق
              </span>
            </div>
          }
        />
      )}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Target size={28} className="text-primary-deep" />
              <h1 className="text-3xl font-bold text-text">الأهداف</h1>
            </div>
            <p className="mt-2 text-sm text-muted">تابع تقدم فريق التصميم نحو أهدافه</p>
          </div>
        </div>

        <GoalStats goals={filteredGoals} />
        <GoalFilters
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          date={selectedDate}
          onDateChange={setSelectedDate}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5 items-start">
          {sections.map((section) => (
            <GoalColumn
              key={section.type}
              type={section.type}
              title={section.label}
              accent={section.accent}
              goals={grouped[section.type]}
              onAdd={handleAdd}
              onEdit={handleEdit}
              onDelete={setDeleteId}
              onToggleComplete={handleToggleComplete}
              onIncrement={handleIncrement}
            />
          ))}
        </div>
      </div>

      {modalOpen && (
        <GoalModal
          key={editing?.id ?? defaultType}
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSubmit={handleSubmit}
          editing={editing}
          defaultType={defaultType}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) {
            setGoals(goalsService.remove(deleteId));
            show("تم حذف الهدف", "info");
          }
        }}
        title="حذف الهدف"
        description="هل أنت متأكد من حذف هذا الهدف؟"
        confirmLabel="حذف الهدف"
      />
    </AppLayout>
  );
}
