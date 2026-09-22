import { CheckCircle2, GripVertical, ListTodo, Plus, Timer, UserRound } from "lucide-react";
import { useState } from "react";
import type { Task, TeamMember } from "../../types";
import { getTaskElapsed } from "../../hooks/useTaskTimer";
import { formatDuration } from "../../lib/date";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { TaskCard } from "./TaskCard";

interface TeamMemberCardProps {
  member: TeamMember;
  tasks: Task[];
  onAddTask: (member: TeamMember) => void;
  onStart: (id: string) => void;
  onRequestStop: (id: string) => void;
  onFinish: (id: string) => void;
  onDelete: (id: string) => void;
  onAddComment: (id: string) => void;
  onDeleteComment: (id: string, commentTime: number) => void;
  onMoveTask: (id: string, assigneeId: TeamMember["id"], beforeTaskId?: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

export function TeamMemberCard({
  member,
  tasks,
  onAddTask,
  onStart,
  onRequestStop,
  onFinish,
  onDelete,
  onAddComment,
  onDeleteComment,
  onMoveTask,
  onReorder,
}: TeamMemberCardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isDragOverMember, setIsDragOverMember] = useState(false);
  const completed = tasks.filter((task) => task.status === "completed").length;
  const totalDuration = tasks.reduce((sum, task) => sum + getTaskElapsed(task), 0);

  const reorderTask = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const orderedIds = tasks.map((task) => task.id);
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
    onMoveTask(sourceId, member.id, targetId);
  };

  return (
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
        if (sourceId) onMoveTask(sourceId, member.id);
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
      </div>

      <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border rounded-control border border-border bg-surface">
        <div className="p-3 text-center">
          <ListTodo size={16} className="mx-auto mb-1 text-primary-deep" />
          <p className="text-xs text-muted">المهام</p>
          <p className="font-mono font-bold text-text">{tasks.length}</p>
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

      <Button icon={<Plus size={16} />} onClick={() => onAddTask(member)} className="w-full">
        إضافة مهمة
      </Button>

      <div className="flex-1 space-y-3">
        {tasks.length === 0 ? (
          <EmptyState
            icon={<ListTodo size={22} />}
            title="لا توجد مهام"
            description="لا توجد مهام لهذا العضو في اليوم المحدد."
          />
        ) : (
          tasks.map((task) => (
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
                onStart={onStart}
                onRequestStop={onRequestStop}
                onFinish={onFinish}
                onDelete={onDelete}
                onAddComment={onAddComment}
                onDeleteComment={onDeleteComment}
              />
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
