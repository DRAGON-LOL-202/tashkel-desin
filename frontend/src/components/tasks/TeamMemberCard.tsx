import { CheckCircle2, ChevronDown, GripVertical, ListTodo, Maximize2, Minimize2, Plus, Timer, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { Task, TeamMember } from "../../types";
import { getTaskElapsed } from "../../hooks/useTaskTimer";
import { formatDuration } from "../../lib/date";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { IconButton } from "../ui/IconButton";
import { EmptyState } from "../ui/EmptyState";
import { usePermissions } from "../../hooks/usePermissions";
import { TaskCard } from "./TaskCard";

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
  onMoveTask: (id: string, assigneeId: TeamMember["id"], beforeTaskId?: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

export function TeamMemberCard({
  member,
  tasks,
  onAddNormalTask,
  onAddMainTask,
  onAddSubtask,
  onStart,
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
      className={`p-4 md:p-5 flex min-h-[520px] flex-col gap-4 transition-colors ${
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

      <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border rounded-control border border-border bg-surface">
        <div className="p-3 text-center">
          <ListTodo size={16} className="mx-auto mb-1 text-primary-deep" />
          <p className="text-xs text-muted">المهام</p>
          <p className="font-mono font-bold text-text">{rootTasks.length}</p>
        </div>
        <div className="p-3 text-center">
          <CheckCircle2 size={16} className="mx-auto mb-1 text-primary-dark" />
          <p className="text-xs text-muted">مكتملة</p>
          <p className="font-mono font-bold text-text">{completed}</p>
        </div>
        <div className="p-3 text-center">
          <Timer size={16} className="mx-auto mb-1 text-muted" />
          <p className="text-xs text-muted">الوقت</p>
          <p className="font-mono text-sm font-bold text-text">{formatDuration(totalDuration)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button icon={<Plus size={16} />} onClick={() => onAddNormalTask(member)}>
          إضافة مهمة
        </Button>
        <div className="relative">
        <Button
          variant="secondary"
          icon={<ChevronDown size={16} />}
          onClick={() => setTaskMenuOpen((value) => !value)}
          className="w-full"
        >
          مهمة
        </Button>
        {taskMenuOpen && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-control border border-border bg-surface shadow-pop">
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
              <div className="absolute left-3 bottom-7 z-10 text-muted">
                <GripVertical size={18} />
              </div>
              <TaskCard
                task={task}
                subtasks={getSubtasks(task.id)}
                getSubtasks={getSubtasks}
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
      <div className="mx-auto max-w-4xl p-3 md:p-6" style={{ zoom: 1.25 }}>
        {card}
      </div>
    </div>
  );
}
