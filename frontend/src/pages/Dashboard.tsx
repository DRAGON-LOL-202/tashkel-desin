import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserCheck } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { TaskStats } from "../components/tasks/TaskStats";
import { TaskFilters, type TaskFilterValue } from "../components/tasks/TaskFilters";
import { NewTaskModal } from "../components/tasks/NewTaskModal";
import { StopTaskModal } from "../components/tasks/StopTaskModal";
import { TaskCommentModal } from "../components/tasks/TaskCommentModal";
import { DateNavigator } from "../components/tasks/DateNavigator";
import { TeamMemberCard } from "../components/tasks/TeamMemberCard";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { MoveDateModal } from "../components/tasks/MoveDateModal";
import { CopyTaskModal } from "../components/tasks/CopyTaskModal";
import { applyMoveToMember, applyReorder, isTaskTreeCompleted, tasksService } from "../services/tasksService";
import { attendanceService } from "../services/attendanceService";
import { useResource } from "../hooks/useResource";
import type { AttendanceSession, AttendanceToday, CalendarDateState, CreateTaskInput, Task, TeamMember } from "../types";
import { getTaskElapsed } from "../hooks/useTaskTimer";
import { todayISO } from "../lib/date";
import { useToast } from "../components/ui/ToastProvider";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useAuth } from "../components/auth/AuthProvider";
import { useSafeAction } from "../hooks/useSafeAction";
import { useTeamMembers } from "../hooks/useTeamMembers";
import { useLiveSync } from "../hooks/useLiveSync";
import { usePermissions } from "../hooks/usePermissions";
import { errorMessage } from "../lib/api";
import { downloadDailyReport } from "../lib/exportDailyReport";
import { buildNumberMap, getSiblings, insertAtPosition } from "../lib/taskOrder";

const NO_ATTENDANCE: AttendanceToday = { today: "", sessions: [] };

function sortTasks(a: Task, b: Task): number {
  if (a.status === "completed" && b.status !== "completed") return 1;
  if (a.status !== "completed" && b.status === "completed") return -1;
  const byOrder = a.sortOrder - b.sortOrder;
  if (byOrder !== 0) return byOrder;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dateStates, setDateStates] = useState<Record<string, CalendarDateState>>({});
  const [calendarRange, setCalendarRange] = useState<{ from: string; to: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [newTaskAssignee, setNewTaskAssignee] = useState<TeamMember | undefined>();
  const [newTaskParent, setNewTaskParent] = useState<Task | undefined>();
  const [newTaskMode, setNewTaskMode] = useState<"normal" | "main" | "subtask">("normal");
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [deleteTask, setDeleteTask] = useState<Task | undefined>();
  const [moveDateTask, setMoveDateTask] = useState<Task | undefined>();
  const [copyTask, setCopyTask] = useState<Task | undefined>();
  const [stopTaskId, setStopTaskId] = useState<string | null>(null);
  const [commentTaskId, setCommentTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskFilterValue>("all");
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [deleteSession, setDeleteSession] = useState<AttendanceSession | undefined>();
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const { show } = useToast();
  const { user } = useAuth();
  const { isStaff } = usePermissions();
  const run = useSafeAction();
  const { members: teamMembers, loading: membersLoading, error: membersError, reload: reloadMembers } = useTeamMembers();

  // نجلب مهام اليوم المعروض فقط. عدّاد seq يتجاهل ردود الأيام القديمة المتأخرة.
  const seq = useRef(0);
  const fetchDay = useCallback(async (date: string) => {
    const id = ++seq.current;
    const result = await tasksService.list({ date });
    if (id === seq.current) setTasks(result);
  }, []);

  // ألوان التقويم (أحمر/أخضر) للشبكة المعروضة من مسار خفيف بدل حسابها من كل المهام
  const refreshDateStates = useCallback(async () => {
    if (!calendarRange) return;
    try {
      setDateStates(await tasksService.dayStates(calendarRange.from, calendarRange.to));
    } catch {
      // نُبقي الألوان الحالية
    }
  }, [calendarRange]);

  const loadTasks = useCallback(async () => {
    setDayLoading(true);
    try {
      await fetchDay(selectedDate);
      setTasksError(null);
    } catch (error) {
      setTasksError(errorMessage(error));
    } finally {
      setDayLoading(false);
      setTasksLoading(false);
    }
  }, [selectedDate, fetchDay]);

  // يعيد التحميل عند تغيير اليوم المعروض
  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // يحدّث الألوان عند تغيير الشهر المعروض في التقويم
  useEffect(() => {
    void refreshDateStates();
  }, [refreshDateStates]);

  // مزامنة صامتة مع الخادم: تُستعمل بعد كل عملية (نجحت أو فشلت) ليبقى الـ backend هو مصدر الحقيقة
  const refreshTasks = useCallback(async () => {
    try {
      await Promise.all([fetchDay(selectedDate), refreshDateStates()]);
    } catch (error) {
      show(errorMessage(error), "error");
    }
  }, [selectedDate, fetchDay, refreshDateStates, show]);

  // تحديث تلقائي صامت: عندما يضيف/يعدّل أي مستخدم مهمة أو تعليقاً تظهر عند الجميع بدون رفرش
  const syncTasks = useCallback(async () => {
    try {
      await Promise.all([fetchDay(selectedDate), refreshDateStates()]);
    } catch {
      // نُبقي القائمة الحالية ونحاول عند التغيير التالي
    }
  }, [selectedDate, fetchDay, refreshDateStates]);
  useLiveSync(syncTasks);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // الحضور والانصراف: يتحدث تلقائياً عند أي تغيير من أي مستخدم، وكل 5 دقائق ليلتقط تغيّر اليوم بعد منتصف الليل.
  // فشل تحميله لا يعطّل صفحة المهام (تظهر الكروت بدون جلسات).
  const { data: attendance, reload: reloadAttendance } = useResource<AttendanceToday>(attendanceService.today, NO_ATTENDANCE);
  useEffect(() => {
    const id = setInterval(() => void reloadAttendance(), 5 * 60_000);
    return () => clearInterval(id);
  }, [reloadAttendance]);

  const handleCheckIn = async () => {
    setAttendanceBusy(true);
    const result = await run(() => attendanceService.checkIn());
    await reloadAttendance();
    setAttendanceBusy(false);
    if (result.ok) show("تم تسجيل الحضور", "success");
  };

  const handleConfirmDeleteSession = async () => {
    if (!deleteSession) return;
    const id = deleteSession.id;
    setDeleteSession(undefined);
    setAttendanceBusy(true);
    const result = await run(() => attendanceService.remove(id));
    await reloadAttendance();
    setAttendanceBusy(false);
    if (result.ok) show("تم حذف الجلسة", "info");
  };

  const handleCheckOut = async () => {
    setAttendanceBusy(true);
    const result = await run(() => attendanceService.checkOut());
    await reloadAttendance();
    setAttendanceBusy(false);
    if (result.ok) show("تم تسجيل الانصراف", "info");
  };

  const dayTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks
      .filter((task) => task.date === selectedDate)
      .filter((task) => (filter === "all" ? true : task.status === filter))
      .filter((task) => {
        if (!query) return true;
        return `${task.title} ${task.description ?? ""}`.toLowerCase().includes(query);
      })
      .sort(sortTasks);
  }, [tasks, selectedDate, filter, search]);

  // أرقام المهام تُحسب من كل مهام اليوم (بدون فلترة) لتبقى ثابتة
  const taskNumbers = useMemo(() => buildNumberMap(tasks), [tasks]);

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: dayTasks.length,
      completed: dayTasks.filter((task) => task.status === "completed").length,
      running: dayTasks.filter((task) => task.status === "running").length,
      totalDuration: dayTasks.reduce((sum, task) => sum + getTaskElapsed(task, now), 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayTasks, tick]);

  const unfinishedCount = useMemo(
    () =>
      tasks.filter(
        (task) => task.date === selectedDate && !task.parentId && !isTaskTreeCompleted(tasks, task)
      ).length,
    [tasks, selectedDate]
  );

  /** ينفّذ عملية على الخادم ثم يعيد المزامنة؛ يعيد true عند النجاح */
  const mutate = async (action: () => Promise<unknown>, successMessage?: string, kind: "success" | "info" = "success") => {
    const result = await run(action);
    await refreshTasks();
    if (result.ok && successMessage) show(successMessage, kind);
    return result.ok;
  };

  const handleCreate = (input: CreateTaskInput) =>
    mutate(async () => {
      const created = await tasksService.create(input);
      // الخادم يضع المهمة الجديدة في أعلى القائمة؛ نعيد ترتيب الأشقاء حسب الرقم المختار (الافتراضي: الرقم التالي في النهاية)
      const siblingIds = getSiblings(tasks, { date: created.date, assigneeId: created.assigneeId, parentId: created.parentId }).map((task) => task.id);
      const orderedIds = insertAtPosition(siblingIds, created.id, input.position ?? siblingIds.length + 1);
      await tasksService.reorder(orderedIds);
    }, "تمت إضافة المهمة بنجاح");

  const handleOpenNewTask = (member: TeamMember) => {
    setNewTaskParent(undefined);
    setNewTaskMode("main");
    setEditingTask(undefined);
    setNewTaskAssignee(member);
  };

  const handleOpenNormalTask = (member: TeamMember) => {
    setNewTaskParent(undefined);
    setNewTaskMode("normal");
    setEditingTask(undefined);
    setNewTaskAssignee(member);
  };

  const handleOpenNewSubtask = (member: TeamMember) => {
    setNewTaskParent(undefined);
    setNewTaskMode("subtask");
    setEditingTask(undefined);
    setNewTaskAssignee(member);
  };

  const handleAddSubtask = (parentTask: Task) => {
    setNewTaskParent(parentTask);
    setNewTaskMode("subtask");
    setEditingTask(undefined);
    setNewTaskAssignee(teamMembers.find((member) => member.id === parentTask.assigneeId));
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setNewTaskParent(undefined);
    setNewTaskMode(task.parentId ? "subtask" : "normal");
    setNewTaskAssignee(teamMembers.find((member) => member.id === task.assigneeId));
  };

  const handleUpdate = (id: string, input: CreateTaskInput) =>
    mutate(async () => {
      await tasksService.update(id, input);
      const current = tasks.find((task) => task.id === id);
      if (!current || !input.position || input.position === taskNumbers.get(id)) return;
      const siblingIds = getSiblings(tasks, { date: current.date, assigneeId: current.assigneeId, parentId: current.parentId }).map((task) => task.id);
      await tasksService.reorder(insertAtPosition(siblingIds, id, input.position));
    }, "تم تعديل المهمة بنجاح");

  const handleStart = (id: string) => void mutate(() => tasksService.start(id));

  const handleRequestStop = (id: string) => setStopTaskId(id);

  const handleConfirmStop = async (note: string) => {
    if (!stopTaskId) return;
    const id = stopTaskId;
    setStopTaskId(null);
    await mutate(() => tasksService.stop(id, note), "تم إيقاف المهمة وحفظ الملاحظة");
  };

  const handleFinish = (id: string) => void mutate(() => tasksService.finish(id), "تم إنهاء المهمة بنجاح");

  const handleReopen = (id: string) => void mutate(() => tasksService.reopen(id), "أُعيد فتح المهمة");

  const handleDelete = (task: Task) => setDeleteTask(task);

  const handleConfirmDelete = async () => {
    if (!deleteTask) return;
    const id = deleteTask.id;
    setDeleteTask(undefined);
    await mutate(() => tasksService.remove(id), "تم حذف المهمة", "info");
  };

  const handleSetCurrent = (id: string, current: number) => void mutate(() => tasksService.setCurrent(id, current));

  const handleAddComment = async (comment: string) => {
    if (!commentTaskId) return;
    const id = commentTaskId;
    setCommentTaskId(null);
    await mutate(() => tasksService.addComment(id, comment), "تم حفظ التعليق");
  };

  const handleDeleteComment = (id: string, commentTime: number) => {
    const commentId = tasks.find((task) => task.id === id)?.comments.find((comment) => comment.time === commentTime)?.id;
    if (!commentId) return;
    void mutate(() => tasksService.removeComment(id, commentId), "تم حذف التعليق", "info");
  };

  // السحب والإفلات: تحديث فوري محلي ثم مزامنة مع الخادم (تُسترجع الحالة الحقيقية عند الفشل)
  const handleReorder = (orderedIds: string[]) => {
    setTasks((current) => applyReorder(current, orderedIds));
    void mutate(() => tasksService.reorder(orderedIds));
  };

  const handleMoveTask = (id: string, assigneeId: TeamMember["id"], beforeTaskId?: string) => {
    setTasks((current) => applyMoveToMember(current, id, assigneeId, beforeTaskId));
    void mutate(() => tasksService.moveToMember(id, assigneeId, beforeTaskId));
  };

  const handleCopyTo = (id: string, assigneeId: string) =>
    mutate(() => tasksService.copyTo(id, assigneeId), "تم نسخ الأوردر");

  const handleMoveToDate = (id: string, date: string) =>
    mutate(() => tasksService.moveToDate(id, date), "تم نقل الأوردر إلى اليوم المحدد");

  const handleMoveUnfinishedToNextDay = async () => {
    if (unfinishedCount === 0) {
      show("لا توجد مهام غير منتهية لنقلها");
      return;
    }
    await mutate(() => tasksService.moveUnfinishedToNextDay(selectedDate), "تم نقل المهام غير المنتهية إلى اليوم التالي");
  };

  const handleExportExcel = () => {
    const dayAll = tasks.filter((task) => task.date === selectedDate);
    if (dayAll.length === 0) {
      show("لا توجد مهام في هذا اليوم لتصديرها");
      return;
    }
    try {
      downloadDailyReport(dayAll, teamMembers, selectedDate);
      show("تم تصدير التقرير", "success");
    } catch {
      show("تعذّر إنشاء ملف Excel", "error");
    }
  };

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="المهام اليومية"
          description="إدارة ومتابعة مهام فريق التصميم"
          onOpenMobileNav={openMobileNav}
          action={
            <div className="hidden sm:flex items-center gap-2 rounded-control bg-primary/15 px-3 py-2 text-sm">
              <UserCheck size={16} className="text-primary-deep" />
              <span className="font-semibold text-text">{user?.name}</span>
              <span className="rounded-full bg-primary/30 px-2 py-0.5 text-xs font-medium text-primary-deep">
                {user?.role}
              </span>
            </div>
          }
        />
      )}
    >
      {tasksLoading || membersLoading ? (
        <LoadingState label="جارٍ تحميل المهام..." />
      ) : tasksError || membersError ? (
        <ErrorState
          message={tasksError ?? membersError ?? "تعذّر تحميل البيانات"}
          onRetry={() => {
            setTasksLoading(true);
            void loadTasks();
            void reloadMembers();
          }}
        />
      ) : (
      <div className="flex flex-col gap-6">
        <DateNavigator
          value={selectedDate}
          dateStates={dateStates}
          onChange={setSelectedDate}
          onViewRangeChange={(range) =>
            setCalendarRange((previous) => (previous && previous.from === range.from && previous.to === range.to ? previous : range))
          }
        />
        <TaskStats
          total={stats.total}
          completed={stats.completed}
          running={stats.running}
          totalDuration={stats.totalDuration}
        />
        <TaskFilters
          value={filter}
          onChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          onMoveUnfinishedToNextDay={isStaff ? handleMoveUnfinishedToNextDay : undefined}
          moveDisabled={unfinishedCount === 0}
          onExportExcel={handleExportExcel}
        />

        <div className={`grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5 items-start transition-opacity ${dayLoading ? "opacity-60" : ""}`}>
          {teamMembers.map((member) => (
            <TeamMemberCard
              key={member.id}
              member={member}
              tasks={dayTasks.filter((task) => task.assigneeId === member.id)}
              onAddNormalTask={handleOpenNormalTask}
              onAddMainTask={handleOpenNewTask}
              onAddSubtask={handleOpenNewSubtask}
              onStart={handleStart}
              onRequestStop={handleRequestStop}
              onFinish={handleFinish}
              onReopen={handleReopen}
              onMoveToDate={setMoveDateTask}
              onCopy={setCopyTask}
              onDelete={handleDelete}
              onAddSubtaskToParent={handleAddSubtask}
              onEdit={handleEdit}
              onSetCurrent={handleSetCurrent}
              onAddComment={setCommentTaskId}
              onDeleteComment={handleDeleteComment}
              onMoveTask={handleMoveTask}
              onReorder={handleReorder}
              taskNumbers={taskNumbers}
              attendanceSessions={attendance.sessions.filter((session) => session.userId === member.id)}
              attendanceToday={attendance.today}
              canPunchAttendance={member.id === user?.id}
              attendanceBusy={attendanceBusy}
              onCheckIn={() => void handleCheckIn()}
              onRequestCheckOut={() => setCheckOutOpen(true)}
              onRequestDeleteSession={user?.accessRole === "admin" ? setDeleteSession : undefined}
            />
          ))}
        </div>
      </div>
      )}

      <NewTaskModal
        open={!!newTaskAssignee}
        assignee={newTaskAssignee}
        parentTask={newTaskParent}
        parentOptions={dayTasks.filter((task) => task.assigneeId === newTaskAssignee?.id && !task.parentId)}
        allTasks={tasks}
        mode={newTaskMode}
        editing={editingTask}
        date={selectedDate}
        onClose={() => {
          setNewTaskAssignee(undefined);
          setNewTaskParent(undefined);
          setEditingTask(undefined);
        }}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
      />
      <StopTaskModal
        open={!!stopTaskId}
        onClose={() => setStopTaskId(null)}
        onConfirm={handleConfirmStop}
      />
      <TaskCommentModal
        open={!!commentTaskId}
        onClose={() => setCommentTaskId(null)}
        onConfirm={handleAddComment}
      />
      <CopyTaskModal task={copyTask} members={teamMembers.filter((member) => member.isActive)} onClose={() => setCopyTask(undefined)} onConfirm={handleCopyTo} />
      <ConfirmDialog
        open={checkOutOpen}
        onClose={() => setCheckOutOpen(false)}
        onConfirm={() => void handleCheckOut()}
        title="تسجيل الانصراف"
        description="هل أنت متأكد من الانصراف؟ سيُسجَّل وقت الانصراف الآن، ويمكنك الضغط على «عودة» لبدء جلسة جديدة."
        confirmLabel="نعم، انصراف"
      />
      <ConfirmDialog
        open={!!deleteSession}
        onClose={() => setDeleteSession(undefined)}
        onConfirm={() => void handleConfirmDeleteSession()}
        title="حذف جلسة الحضور"
        description="سيُحذف هذا التسجيل نهائياً من سجل الحضور والتقرير الشهري. هل أنت متأكد؟"
        confirmLabel="حذف"
      />
      <MoveDateModal task={moveDateTask} onClose={() => setMoveDateTask(undefined)} onConfirm={handleMoveToDate} />
      <ConfirmDialog
        open={!!deleteTask}
        onClose={() => setDeleteTask(undefined)}
        onConfirm={handleConfirmDelete}
        title="حذف المهمة"
        description={deleteTask?.parentId ? "هل تريد حذف المهمة الفرعية؟" : "هل تريد حذف المهمة الرئيسية وكل مهامها الفرعية؟"}
        confirmLabel="حذف"
      />
    </AppLayout>
  );
}
