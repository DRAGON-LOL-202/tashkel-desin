import { useEffect, useMemo, useState } from "react";
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
import { teamMembers, tasksService } from "../services/tasksService";
import type { CreateTaskInput, Task, TeamMember } from "../types";
import { getTaskElapsed } from "../hooks/useTaskTimer";
import { todayISO } from "../lib/date";
import { useToast } from "../components/ui/ToastProvider";

function sortTasks(a: Task, b: Task): number {
  if (a.status === "completed" && b.status !== "completed") return 1;
  if (a.status !== "completed" && b.status === "completed") return -1;
  const byOrder = a.sortOrder - b.sortOrder;
  if (byOrder !== 0) return byOrder;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [newTaskAssignee, setNewTaskAssignee] = useState<TeamMember | undefined>();
  const [stopTaskId, setStopTaskId] = useState<string | null>(null);
  const [commentTaskId, setCommentTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskFilterValue>("all");
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);
  const { show } = useToast();

  useEffect(() => {
    setTasks(tasksService.list());
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

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
    () => tasks.filter((task) => task.date === selectedDate && task.status !== "completed").length,
    [tasks, selectedDate]
  );

  const dateStates = useMemo(() => {
    return tasks.reduce<Record<string, "completed" | "pending">>((states, task) => {
      const taskDate = task.date.slice(0, 10);
      if (!taskDate) return states;

      if (task.status !== "completed") {
        states[taskDate] = "pending";
        return states;
      }

      if (!states[taskDate]) {
        states[taskDate] = "completed";
      }

      return states;
    }, {});
  }, [tasks]);

  const refreshTasks = () => setTasks(tasksService.list());

  const handleCreate = (input: CreateTaskInput) => {
    tasksService.create(input);
    refreshTasks();
    show("تمت إضافة المهمة بنجاح");
  };

  const handleStart = (id: string) => {
    tasksService.start(id);
    refreshTasks();
  };

  const handleRequestStop = (id: string) => setStopTaskId(id);

  const handleConfirmStop = (note: string) => {
    if (!stopTaskId) return;
    tasksService.stop(stopTaskId, note);
    refreshTasks();
    setStopTaskId(null);
    show("تم إيقاف المهمة وحفظ الملاحظة");
  };

  const handleFinish = (id: string) => {
    tasksService.finish(id);
    refreshTasks();
    show("تم إنهاء المهمة بنجاح");
  };

  const handleDelete = (id: string) => {
    tasksService.remove(id);
    refreshTasks();
  };

  const handleAddComment = (comment: string) => {
    if (!commentTaskId) return;
    setTasks(tasksService.addComment(commentTaskId, comment));
    setCommentTaskId(null);
    show("تم حفظ التعليق");
  };

  const handleDeleteComment = (id: string, commentTime: number) => {
    setTasks(tasksService.removeComment(id, commentTime));
    show("تم حذف التعليق", "info");
  };

  const handleReorder = (orderedIds: string[]) => {
    setTasks(tasksService.reorder(orderedIds));
  };

  const handleMoveTask = (id: string, assigneeId: TeamMember["id"], beforeTaskId?: string) => {
    setTasks(tasksService.moveToMember(id, assigneeId, beforeTaskId));
  };

  const handleMoveUnfinishedToNextDay = () => {
    if (unfinishedCount === 0) {
      show("لا توجد مهام غير منتهية لنقلها");
      return;
    }

    setTasks(tasksService.moveUnfinishedToNextDay(selectedDate));
    show("تم نقل المهام غير المنتهية إلى اليوم التالي");
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
        <DateNavigator value={selectedDate} dateStates={dateStates} onChange={setSelectedDate} />
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
          onMoveUnfinishedToNextDay={handleMoveUnfinishedToNextDay}
          moveDisabled={unfinishedCount === 0}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5 items-start">
          {teamMembers.map((member) => (
            <TeamMemberCard
              key={member.id}
              member={member}
              tasks={dayTasks.filter((task) => task.assigneeId === member.id)}
              onAddTask={setNewTaskAssignee}
              onStart={handleStart}
              onRequestStop={handleRequestStop}
              onFinish={handleFinish}
              onDelete={handleDelete}
              onAddComment={setCommentTaskId}
              onDeleteComment={handleDeleteComment}
              onMoveTask={handleMoveTask}
              onReorder={handleReorder}
            />
          ))}
        </div>
      </div>

      <NewTaskModal
        open={!!newTaskAssignee}
        assignee={newTaskAssignee}
        date={selectedDate}
        onClose={() => setNewTaskAssignee(undefined)}
        onCreate={handleCreate}
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
    </AppLayout>
  );
}
