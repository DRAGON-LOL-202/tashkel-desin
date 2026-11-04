import { CheckCircle2, ChevronDown, Clock, Layers, ListTodo, Maximize2, Minimize2, Plus, Target, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { AttendanceSession, Task, TeamMember, TimerAction } from "../../types";
import { getTaskElapsed } from "../../hooks/useTaskTimer";
import { formatDuration } from "../../lib/date";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { IconButton } from "../ui/IconButton";
import { EmptyState } from "../ui/EmptyState";
import { usePermissions } from "../../hooks/usePermissions";
import { TaskCard } from "./TaskCard";
import { AttendanceBar } from "./AttendanceBar";

interface TeamMemberCardProps {
  member: TeamMember;
  tasks: Task[];
  onAddNormalTask: (member: TeamMember) => void;
  onAddMainTask: (member: TeamMember) => void;
  onAddSubtask: (member: TeamMember) => void;
  onStart: (id: string) => void;
  onRequestStop: (id: string) => void;
  onFinish: (id: string) => void;
  onReopen: (id: string) => void;
  onMoveToDate: (task: Task) => void;
  onCopy: (task: Task) => void;
  onDelete: (task: Task) => void;
  onAddSubtaskToParent: (task: Task) => void;
  onEdit: (task: Task) => void;
  onSetCurrent: (id: string, current: number) => void;
  onAddComment: (id: string) => void;
  onDeleteComment: (id: string, commentTime: number) => void;
  onTimer: (id: string, action: TimerAction) => void;
  onMoveTask: (id: string, assigneeId: TeamMember["id"], beforeTaskId?: string) => void;
  onReorder: (orderedIds: string[]) => void;
  taskNumbers: Map<string, number>;
  /** جلسات حضور هذا العضو (اليوم + أي جلسة مفتوحة) */
  attendanceSessions: AttendanceSession[];
  attendanceToday: string;
  /** الأزرار لصاحب الكرت فقط */
  canPunchAttendance: boolean;
  attendanceBusy: boolean;
  onCheckIn: () => void;
  onRequestCheckOut: () => void;
  /** حذف جلسة حضور: يُمرَّر لمدير النظام فقط */
  onRequestDeleteSession?: (session: AttendanceSession) => void;
}

export function TeamMemberCard({
  member,
  tasks,
  onAddNormalTask,
  onAddMainTask,
  onAddSubtask,
  onStart,
  onTimer,
  onRequestStop,
  onFinish,
  onReopen,
  onMoveToDate,
  onCopy,
  onDelete,
  onAddSubtaskToParent,
  onEdit,
  onSetCurrent,
  onAddComment,
  onDeleteComment,
  onMoveTask,
  onReorder,
  taskNumbers,
  attendanceSessions,
  attendanceToday,
  canPunchAttendance,
  attendanceBusy,
  onCheckIn,
  onRequestCheckOut,
  onRequestDeleteSession,
}: TeamMemberCardProps) {
  const { canManageTasks } = usePermissions();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isDragOverMember, setIsDragOverMember] = useState(false);
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  // وضع التركيز: تكبّر البطاقة لتملأ الشاشة ويكبر الخط لمتابعة مهام العضو
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[role='dialog']")) setFocusMode(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusMode]);

  const getSubtasks = (parentId: string) => tasks.filter((task) => task.parentId === parentId);
  const isTaskCompleted = (task: Task): boolean => {
    const subtasks = getSubtasks(task.id);
    return subtasks.length > 0 ? subtasks.every(isTaskCompleted) : task.status === "completed";
  };
  const rootTasks = tasks
    .filter((task) => !task.parentId)
    .sort((first, second) => {
      const completionOrder = Number(isTaskCompleted(first)) - Number(isTaskCompleted(second));
      return completionOrder !== 0 ? completionOrder : first.sortOrder - second.sortOrder;
    });
  const completed = rootTasks.filter(isTaskCompleted).length;
  const totalDuration = tasks.reduce((sum, task) => sum + getTaskElapsed(task), 0);
  const completionRate = rootTasks.length > 0 ? Math.round((completed / rootTasks.length) * 100) : 0;
  const ringRadius = 17;
  const ringLength = 2 * Math.PI * ringRadius;

  const reorderTask = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const orderedIds = rootTasks.map((task) => task.id);
    const fromIndex = orderedIds.indexOf(fromId);
    const toIndex = orderedIds.indexOf(toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = orderedIds.splice(fromIndex, 1);
    orderedIds.splice(toIndex, 0, moved);
    onReorder(orderedIds);
  };

  const handleTaskDrop = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const isLocalMove = tasks.some((task) => task.id === sourceId);
    if (isLocalMove) {
      reorderTask(sourceId, targetId);
      return;
    }
    if (canManageTasks) onMoveTask(sourceId, member.id, targetId);
  };

  const card = (
    <Card
      className={`tm-card p-4 md:p-5 flex ${focusMode ? "min-h-[calc(100vh-2.5rem)]" : "min-h-[520px]"} flex-col gap-4 transition-colors ${
        isDragOverMember ? "border-primary-deep bg-primary/5" : ""
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsDragOverMember(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDragOverMember(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sourceId = event.dataTransfer.getData("text/plain") || draggingId;
        if (sourceId && canManageTasks) onMoveTask(sourceId, member.id);
        setDraggingId(null);
        setDragOverId(null);
        setIsDragOverMember(false);
      }}
    >
      <div className="rounded-control bg-primary/10 p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 shrink-0 rounded-full bg-primary-dark text-white flex items-center justify-center shadow-pop">
            <UserRound size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-text truncate">{member.name}</h2>
            <p className="text-xs text-muted">{member.role}</p>
          </div>
        </div>
        <IconButton
          onClick={() => setFocusMode((value) => !value)}
          aria-label={focusMode ? "تصغير" : "تكبير"}
          title={focusMode ? "تصغير (Esc)" : "تكبير لملء الشاشة"}
          className="h-8 w-8 shrink-0"
        >
          {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </IconButton>
      </div>

      <AttendanceBar
        sessions={attendanceSessions}
        today={attendanceToday}
        canPunch={canPunchAttendance}
        busy={attendanceBusy}
        onCheckIn={onCheckIn}
        onCheckOut={onRequestCheckOut}
        onDeleteSession={onRequestDeleteSession}
      />

      {/* شريط الإحصائيات + إضافة مهمة (بنفس شكل مدير المهام) */}
      <div className="tm-stats">
        <div className="tm-add">
          <Button icon={<Plus size={18} />} onClick={() => onAddNormalTask(member)} className="tm-add-btn">
            إضافة مهمة
          </Button>
          <div className="relative">
            <button
              type="button"
              className="tm-add-more"
              onClick={() => setTaskMenuOpen((value) => !value)}
              aria-expanded={taskMenuOpen}
              aria-label="إضافة مهمة رئيسية أو فرعية"
              title="مهمة رئيسية / فرعية"
            >
              <ChevronDown size={18} />
            </button>
            {taskMenuOpen && (
              <div className="absolute end-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-control border border-border bg-surface shadow-pop">
                <button
                  type="button"
                  onClick={() => { setTaskMenuOpen(false); onAddMainTask(member); }}
                  className="w-full px-3 py-2.5 text-right text-sm text-text hover:bg-primary/10"
                >
                  مهمة رئيسية
                </button>
                <button
                  type="button"
                  onClick={() => { setTaskMenuOpen(false); onAddSubtask(member); }}
                  className="w-full border-t border-border px-3 py-2.5 text-right text-sm text-text hover:bg-primary/10"
                >
                  مهمة فرعية
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="tm-stat">
          <Layers size={22} aria-hidden className="tm-stat-ico" />
          <div>
            <p className="tm-stat-v">{rootTasks.length}</p>
            <p className="tm-stat-k">إجمالي المهام</p>
          </div>
        </div>
        <div className="tm-stat">
          <CheckCircle2 size={22} aria-hidden className="tm-stat-ico" />
          <div>
            <p className="tm-stat-v">{completed}</p>
            <p className="tm-stat-k">مكتملة</p>
          </div>
        </div>
        <div className="tm-stat">
          <Clock size={22} aria-hidden className="tm-stat-ico" />
          <div>
            <p className="tm-stat-v" dir="ltr">{formatDuration(totalDuration)}</p>
            <p className="tm-stat-k">إجمالي الوقت</p>
          </div>
        </div>
        <div className="tm-stat tm-stat--ring">
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="tm-ring">
            <circle cx="22" cy="22" r={ringRadius} fill="none" strokeWidth="5" className="tm-ring-bg" />
            <circle
              cx="22" cy="22" r={ringRadius} fill="none" strokeWidth="5" strokeLinecap="round"
              className="tm-ring-fg"
              strokeDasharray={ringLength}
              strokeDashoffset={ringLength * (1 - completionRate / 100)}
              transform="rotate(-90 22 22)"
            />
          </svg>
          <div>
            <p className="tm-stat-v"><Target size={15} aria-hidden className="tm-stat-inline" /> <span dir="ltr">{completionRate}%</span></p>
            <p className="tm-stat-k">معدل الإنجاز</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3">
        {rootTasks.length === 0 ? (
          <EmptyState
            icon={<ListTodo size={22} />}
            title="لا توجد مهام"
            description="لا توجد مهام لهذا العضو في اليوم المحدد."
          />
        ) : (
          rootTasks.map((task) => (
            <div
              key={task.id}
              draggable
              onDragStart={(event) => {
                setDraggingId(task.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", task.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverId(task.id);
              }}
              onDragLeave={() => setDragOverId((id) => (id === task.id ? null : id))}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const sourceId = event.dataTransfer.getData("text/plain") || draggingId;
                if (sourceId) handleTaskDrop(sourceId, task.id);
                setDraggingId(null);
                setDragOverId(null);
                setIsDragOverMember(false);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDragOverId(null);
                setIsDragOverMember(false);
              }}
              className={`relative cursor-grab active:cursor-grabbing transition-transform ${
                draggingId === task.id ? "opacity-50 scale-[0.99]" : ""
              } ${dragOverId === task.id && draggingId !== task.id ? "translate-y-1" : ""}`}
            >
              <TaskCard
                task={task}
                subtasks={getSubtasks(task.id)}
                getSubtasks={getSubtasks}
                taskNumbers={taskNumbers}
                onStart={onStart}
                onRequestStop={onRequestStop}
                onFinish={onFinish}
                onReopen={onReopen}
                onMoveToDate={onMoveToDate}
                onCopy={onCopy}
                onDelete={onDelete}
                onEdit={onEdit}
                onSetCurrent={onSetCurrent}
                onAddSubtask={onAddSubtaskToParent}
                onAddComment={onAddComment}
                onDeleteComment={onDeleteComment}
                onTimer={onTimer}
              />
            </div>
          ))
        )}
      </div>
    </Card>
  );

  if (!focusMode) return card;
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-background">
      <div className="w-full p-3 md:p-5" style={{ zoom: 1.1 }}>
        {card}
      </div>
    </div>
  );
}
