"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy 
} from "@dnd-kit/sortable";
import { 
  Plus, 
  Loader2,
  Users,
  ArrowLeft,
  X
} from "lucide-react";
import TeamKanbanColumn from "./TeamKanbanColumn";
import TeamTaskCard from "./TeamTaskCard";
import TeamNav from "@/components/team/TeamNav";
import TeamTaskDetailModal from "./TeamTaskDetailModal";

interface Task {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "pending" | "done";
  priority: "low" | "medium" | "high";
  assignee_id?: string;
  position: number;
  due_date?: string;
  comments_count?: number;
  attachments_count?: number;
  created_at: string;
  assignee?: { name: string; avatar_url?: string };
}

interface TeamInfo {
  id: string;
  name: string;
  description?: string;
}

const COLUMNS = [
  { id: "todo", title: "To Do", color: "border-t-blue-500", bg: "bg-blue-500/10", badge: "bg-blue-500" },
  { id: "in_progress", title: "Dikerjakan", color: "border-t-amber-500", bg: "bg-amber-500/10", badge: "bg-amber-500" },
  { id: "pending", title: "Pending", color: "border-t-orange-500", bg: "bg-orange-500/10", badge: "bg-orange-500" },
  { id: "done", title: "Selesai", color: "border-t-emerald-500", bg: "bg-emerald-500/10", badge: "bg-emerald-500" },
];

export default function TeamBoardPage() {
  const params = useParams();
  const orgId = params.id as string;
  const teamId = params.teamId as string;
  
  const router = useRouter();
  const { user } = useAuthStore();
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  
  // DND State
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchData = useCallback(async () => {
    try {
      const [teamRes, tasksRes, membersRes] = await Promise.all([
        api.get(`/organizations/${orgId}/teams/${teamId}`),
        api.get(`/organizations/${orgId}/teams/${teamId}/tasks`),
        api.get(`/organizations/${orgId}/teams/${teamId}/members`),
      ]);
      setTeam(teamRes.data);
      setTasks(tasksRes.data);
      setMembers(membersRes.data);
    } catch (err) {
      console.error("Failed to fetch team data", err);
    } finally {
      setLoading(false);
    }
  }, [orgId, teamId]);

  useEffect(() => {
    if (orgId && teamId) {
      fetchData();
    }
  }, [orgId, teamId, fetchData]);

  const handleAddTask = async (status: string) => {
    try {
      const res = await api.post(`/organizations/${orgId}/teams/${teamId}/tasks`, {
        title: "Tugas Baru",
        status,
      });
      const newTask = res.data;
      await fetchData();
      
      // Auto open the detail modal for the new task
      setSelectedTaskId(newTask.id);
      setIsModalOpen(true);
    } catch (err) {
      console.error("Failed to add task", err);
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === "Task") {
      setActiveTask(event.active.data.current.task);
      return;
    }
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveATask = active.data.current?.type === "Task" || tasks.some(t => t.id === activeId);
    const isOverATask = over.data.current?.type === "Task" || tasks.some(t => t.id === overId);

    if (!isActiveATask) return;

    // Dropping a Task over another Task
    if (isActiveATask && isOverATask) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const overIndex = tasks.findIndex((t) => t.id === overId);

        if (tasks[activeIndex].status !== tasks[overIndex].status) {
          tasks[activeIndex].status = tasks[overIndex].status;
          return arrayMove(tasks, activeIndex, overIndex - 1);
        }

        return arrayMove(tasks, activeIndex, overIndex);
      });
    }

    // Dropping a Task over a Column
    const isOverAColumn = COLUMNS.some((c) => c.id === overId);
    if (isActiveATask && isOverAColumn) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        tasks[activeIndex].status = overId as any;
        return arrayMove(tasks, activeIndex, activeIndex);
      });
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;
    const task = tasks.find((t) => t.id === taskId);
    
    if (!task) return;

    // Find new position and status
    const newStatus = COLUMNS.some(c => c.id === overId) ? overId : tasks.find(t => t.id === overId)?.status || task.status;
    const columnTasks = tasks.filter(t => t.status === newStatus);
    const newPosition = columnTasks.findIndex(t => t.id === taskId);

    try {
      await api.patch(`/organizations/${orgId}/teams/${teamId}/tasks/${taskId}/move`, {
        status: newStatus,
        position: newPosition === -1 ? columnTasks.length : newPosition
      });
    } catch (err) {
      console.error("Failed to sync task move", err);
      fetchData(); // Revert on error
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTaskId(task.id);
    setIsModalOpen(true);
  };

  if (loading || !team) {
    return (
      <div className="flex-1 flex justify-center items-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#fafafa]">
      {/* Header */}
      <div className="border-b border-border px-8 py-5 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">{team?.name}</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Team Workspace</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {members.slice(0, 5).map((m: any) => (
                <div
                  key={m.id}
                  className="w-8 h-8 rounded-full bg-secondary border-2 border-white flex items-center justify-center text-[10px] font-bold overflow-hidden shadow-sm"
                  title={m.user?.name}
                >
                  {m.user?.avatar_url ? (
                    <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    m.user?.name?.charAt(0)
                  )}
                </div>
              ))}
              {members.length > 5 && (
                <div className="w-8 h-8 rounded-full bg-secondary border-2 border-white flex items-center justify-center text-[10px] font-bold text-muted-foreground shadow-sm">
                  +{members.length - 5}
                </div>
              )}
            </div>
            <div className="flex flex-col">
               <span className="text-xs font-bold text-foreground">{members.length} Anggota</span>
               <span className="text-[9px] text-muted-foreground">Aktif di tim ini</span>
            </div>
          </div>
        </div>
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex-1 overflow-x-auto p-8">
          <div className="flex gap-6 h-full min-w-max pb-4">
            {COLUMNS.map((col) => (
              <TeamKanbanColumn
                key={col.id}
                id={col.id}
                title={col.title}
                color={col.color}
                badge={col.badge}
                tasks={tasks.filter((t) => t.status === col.id)}
                onAddTask={() => handleAddTask(col.id)}
                onTaskClick={handleTaskClick}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeTask ? (
            <TeamTaskCard task={activeTask} isOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Task Detail Modal */}
      {selectedTaskId && (
        <TeamTaskDetailModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTaskId(null);
          }}
          taskId={selectedTaskId}
          teamId={teamId as string}
          onUpdate={fetchData}
        />
      )}
    </div>
  );
}
