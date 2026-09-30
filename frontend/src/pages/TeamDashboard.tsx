import { useMemo, useState } from "react";
import { CalendarRange, CheckCircle2, ListTodo, PlayCircle, Timer, UserRound, X } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Card } from "../components/ui/Card";
import { FieldWrap, Select } from "../components/ui/Field";
import { IconButton } from "../components/ui/IconButton";
import { tasksService } from "../services/tasksService";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useResource } from "../hooks/useResource";
import { useTeamMembers } from "../hooks/useTeamMembers";
import type { Task } from "../types";
import { getTaskElapsed } from "../hooks/useTaskTimer";
import { formatArabicDate, formatDuration } from "../lib/date";

export default function TeamDashboardPage() {
  const { data: tasks, loading: tasksLoading, error: tasksError, retry: retryTasks } = useResource<Task[]>(tasksService.list, []);
  const { members: teamMembers, loading: membersLoading, error: membersError, reload: reloadMembers } = useTeamMembers();
  const loading = tasksLoading || membersLoading;
  const error = tasksError ?? membersError;
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [month, setMonth] = useState("");

  const availableDates = useMemo(
    () => [...new Set(tasks.map((task) => task.date))].sort((first, second) => first.localeCompare(second)),
    [tasks]
  );
  const fromDateOptions = availableDates.filter((date) => !toDate || date <= toDate);
  const toDateOptions = availableDates.filter((date) => !fromDate || date >= fromDate);
  const availableMonths = [...new Set(tasks.map((task) => task.date.slice(0, 7)))].sort((first, second) =>
    first.localeCompare(second)
  );

  const members = useMemo(
    () =>
      teamMembers.map((member) => {
        const memberTasks = tasks
          .filter((task) => task.assigneeId === member.id)
          .filter((task) => !month || task.date.startsWith(month))
          .filter((task) => !fromDate || task.date >= fromDate)
          .filter((task) => !toDate || task.date <= toDate);
        const mainTasks = memberTasks.filter((task) => !task.parentId);
        return {
          ...member,
          total: mainTasks.length,
          completed: mainTasks.filter((task) => task.status === "completed").length,
          running: memberTasks.filter((task) => task.status === "running").length,
          duration: memberTasks.reduce((sum, task) => sum + getTaskElapsed(task), 0),
        };
      }),
    [tasks, teamMembers, fromDate, toDate, month]
  );

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="Dashboard"
          description="إدارة ومتابعة أعضاء فريق التصميم"
          onOpenMobileNav={openMobileNav}
        />
      )}
    >
      {loading ? (
        <LoadingState label="جارٍ تحميل بيانات الفريق..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { void retryTasks(); void reloadMembers(); }} />
      ) : (
      <div className="flex flex-col gap-6">
        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex items-center gap-2 text-sm font-semibold text-text sm:mb-4">
              <CalendarRange size={18} className="text-primary-deep" />
              الفترة الزمنية
            </div>
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
              <FieldWrap label="الشهر">
                <Select
                  value={month}
                  onChange={(event) => {
                    setMonth(event.target.value);
                    setFromDate("");
                    setToDate("");
                  }}
                >
                  <option value="">كل الأشهر</option>
                  {availableMonths.map((value) => <option key={value} value={value}>{formatArabicDate(value + "-01", "MMMM yyyy")}</option>)}
                </Select>
              </FieldWrap>
              <FieldWrap label="من تاريخ">
                <Select
                  value={fromDate}
                  onChange={(event) => {
                    const nextFromDate = event.target.value;
                    setFromDate(nextFromDate);
                    setMonth("");
                    if (toDate && nextFromDate > toDate) setToDate("");
                  }}
                >
                  <option value="">بداية كل الفترات</option>
                  {fromDateOptions.map((date) => <option key={date} value={date}>{formatArabicDate(date)}</option>)}
                </Select>
              </FieldWrap>
              <FieldWrap label="إلى تاريخ">
                <Select
                  value={toDate}
                  onChange={(event) => {
                    const nextToDate = event.target.value;
                    setToDate(nextToDate);
                    setMonth("");
                    if (fromDate && nextToDate && nextToDate < fromDate) setFromDate("");
                  }}
                >
                  <option value="">نهاية كل الفترات</option>
                  {toDateOptions.map((date) => <option key={date} value={date}>{formatArabicDate(date)}</option>)}
                </Select>
              </FieldWrap>
            </div>
            {(month || fromDate || toDate) && (
              <IconButton
                onClick={() => { setMonth(""); setFromDate(""); setToDate(""); }}
                aria-label="مسح الفترة الزمنية"
                title="مسح الفترة الزمنية"
                className="mb-4 h-10 w-10"
              >
                <X size={16} />
              </IconButton>
            )}
          </div>
        </Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {members.map((member) => (
            <Card key={member.id} className="p-5">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-dark text-background shadow-pop">
                  <UserRound size={22} />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-text">{member.name}</h2>
                  <p className="text-xs text-muted">{member.role}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-control border border-border bg-background/40 p-3">
                  <ListTodo size={16} className="mb-1 text-primary-deep" />
                  <p className="text-xs text-muted">المهام الرئيسية</p>
                  <p className="font-mono text-lg font-bold text-text">{member.total}</p>
                </div>
                <div className="rounded-control border border-border bg-background/40 p-3">
                  <CheckCircle2 size={16} className="mb-1 text-primary-dark" />
                  <p className="text-xs text-muted">المكتملة</p>
                  <p className="font-mono text-lg font-bold text-text">{member.completed}</p>
                </div>
                <div className="rounded-control border border-border bg-background/40 p-3">
                  <PlayCircle size={16} className="mb-1 text-idea" />
                  <p className="text-xs text-muted">قيد التنفيذ</p>
                  <p className="font-mono text-lg font-bold text-text">{member.running}</p>
                </div>
                <div className="rounded-control border border-border bg-background/40 p-3">
                  <Timer size={16} className="mb-1 text-operational" />
                  <p className="text-xs text-muted">وقت العمل</p>
                  <p className="font-mono text-sm font-bold text-text">{formatDuration(member.duration)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      )}
    </AppLayout>
  );
}
