"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  UserPlus,
  Archive as ArchiveIcon,
  X
} from "lucide-react";
import TeamKanbanColumn from "./TeamKanbanColumn";
import TeamTaskCard from "./TeamTaskCard";
import TeamNav from "@/components/team/TeamNav";
import TeamTaskDetailModal from "./TeamTaskDetailModal";
import InviteTeamMemberModal from "@/components/team/InviteTeamMemberModal";
import ArchivedTasksModal from "@/components/board/ArchivedTasksModal";
import BoardFilterBar from "@/components/board/BoardFilterBar";
import { applyBoardFilter, useBoardFilter } from "@/components/board/useBoardFilter";

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: "low" | "medium" | "high";
  assignee_id?: string;
  position: number;
  due_date?: string;
  comments_count?: number;
  attachments_count?: number;
  created_at: string;
  assignee?: { name: string; avatar_url?: string };
  assignees?: { id?: string; name: string; avatar_url?: string }[];
}

interface TeamInfo {
  id: string;
  name: string;
  description?: string;
}

interface BoardCol {
  id: string;
  slug: string;
  title: string;
  position: number;
}

export default function TeamBoardPage() {
  const params = useParams();
  const orgId = params.id as string;
  const teamId = params.teamId as string;
  const searchParams = useSearchParams();

  const router = useRouter();
  const { user } = useAuthStore();
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<BoardCol[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);

  const {
    filter,
    setFilter,
    resetFilter,
    savedViews,
    saveView,
    applyView,
    deleteView,
  } = useBoardFilter(`team:${teamId}`);

  const memberOptions = useMemo(
    () =>
      members
        .filter((m: any) => m.user)
        .map((m: any) => ({
          id: m.user_id || m.user.id,
          name: m.user.name,
          avatar_url: m.user.avatar_url,
        })),
    [members],
  );

  const filteredTasks = useMemo(
    () => applyBoardFilter(tasks, filter, user?.id),
    [tasks, filter, user?.id],
  );
  
  // DND State
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  // Open task detail directly when URL has ?task=<id>
  // (used by the dashboard "Tugasmu" widget for team-scoped tasks).
  useEffect(() => {
    const t = searchParams?.get("task");
    if (t) {
      setSelectedTaskId(t);
      setIsModalOpen(true);
    }
  }, [searchParams]);

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
      const [teamRes, tasksRes, membersRes, colsRes] = await Promise.all([
        api.get(`/organizations/${orgId}/teams/${teamId}`),
        api.get(`/organizations/${orgId}/teams/${teamId}/tasks`),
        api.get(`/organizations/${orgId}/teams/${teamId}/members`),
        api.get(`/organizations/${orgId}/teams/${teamId}/columns`).catch(() => ({ data: [] })),
      ]);
      setTeam(teamRes.data);
      setTasks(tasksRes.data);
      setMembers(membersRes.data);
      setColumns(Array.isArray(colsRes.data) ? colsRes.data : []);
    } catch (err) {
      console.error("Failed to fetch team data", err);
    } finally {
      setLoading(false);
    }
  }, [orgId, teamId]);

  const createColumn = async () => {
    const title = window.prompt("Nama kolom baru (misal: Urgent, Note):");
    if (!title || !title.trim()) return;
    try {
      await api.post(`/organizations/${orgId}/teams/${teamId}/columns`, { title: title.trim() });
      await fetchData();
    } catch { alert("Gagal menambah kolom."); }
  };

  const renameColumn = async (col: BoardCol) => {
    const title = window.prompt("Ubah nama kolom:", col.title);
    if (!title || !title.trim() || title === col.title) return;
    try {
      await api.patch(`/organizations/${orgId}/teams/${teamId}/columns/${col.id}`, { title: title.trim() });
      await fetchData();
    } catch { alert("Gagal mengubah nama kolom."); }
  };

  const deleteColumn = async (col: BoardCol) => {
    if (!window.confirm(`Hapus kolom "${col.title}"? Tugas di dalamnya akan dipindah ke kolom pertama.`)) return;
    try {
      await api.delete(`/organizations/${orgId}/teams/${teamId}/columns/${col.id}`);
      await fetchData();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Gagal menghapus kolom.");
    }
  };

  useEffect(() => {
    if (orgId && teamId) {
      fetchData();
    }
    const onShortcutCreated = () => fetchData();
    window.addEventListener("things:task-created", onShortcutCreated);
    return () => {
      window.removeEventListener("things:task-created", onShortcutCreated);
    };
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
    const isOverAColumn = columns.some((c) => c.slug === overId);
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
    const newStatus = columns.some(c => c.slug === overId) ? overId : tasks.find(t => t.id === overId)?.status || task.status;
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
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border px-8 py-5 flex items-center justify-between bg-card/80 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-500/20">
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
          <button
            onClick={() => setArchivedOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 text-xs font-bold transition-all"
          >
            <ArchiveIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Arsip</span>
          </button>
          <button
            onClick={() => setIsInviteOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 shadow-md shadow-primary/20 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Tambah Anggota</span>
          </button>
        </div>
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="px-8">
        <BoardFilterBar
          filter={filter}
          onChange={setFilter}
          onReset={resetFilter}
          members={memberOptions}
          savedViews={savedViews}
          onSaveView={saveView}
          onApplyView={applyView}
          onDeleteView={deleteView}
        />
      </div>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex-1 overflow-x-auto p-8 pt-2">
          <div className="flex gap-6 h-full min-w-max pb-4">
            {columns.map((col) => (
              <TeamKanbanColumn
                key={col.id}
                id={col.slug}
                title={col.title}
                tasks={filteredTasks.filter((t) => t.status === col.slug)}
                onAddTask={() => handleAddTask(col.slug)}
                onTaskClick={handleTaskClick}
                onRename={() => renameColumn(col)}
                onDelete={columns.length > 1 ? () => deleteColumn(col) : undefined}
              />
            ))}
            {/* Add custom column */}
            <button
              onClick={createColumn}
              className="flex flex-col items-center justify-center w-[280px] min-w-[280px] min-h-[120px] rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-secondary/20 transition-all gap-2 self-start"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-bold">Tambah Kolom</span>
            </button>
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

      <InviteTeamMemberModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        orgId={orgId}
        teamId={teamId}
        existingMembers={members}
        onAdded={fetchData}
      />

      <ArchivedTasksModal
        isOpen={archivedOpen}
        onClose={() => setArchivedOpen(false)}
        baseUrl={`/organizations/${orgId}/teams/${teamId}/tasks`}
        onChange={fetchData}
      />
    </div>
  );
}
