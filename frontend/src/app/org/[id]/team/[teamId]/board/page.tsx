"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import Sidebar from "@/components/layout/Sidebar";
import { 
  Plus, 
  MoreHorizontal, 
  Loader2,
  Users,
  Trash2,
  GripVertical,
  ArrowLeft,
  UserPlus,
  X
} from "lucide-react";

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

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-500/20 text-slate-400",
  medium: "bg-amber-500/20 text-amber-400",
  high: "bg-rose-500/20 text-rose-400",
};

export default function TeamBoardPage() {
  const { id: orgId, teamId } = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);

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
    fetchData();
  }, [fetchData]);

  const handleAddTask = async (status: string) => {
    const title = newTaskTitle[status]?.trim();
    if (!title) return;

    try {
      await api.post(`/organizations/${orgId}/teams/${teamId}/tasks`, {
        title,
        status,
      });
      setNewTaskTitle((prev) => ({ ...prev, [status]: "" }));
      setAddingTo(null);
      fetchData();
    } catch (err) {
      console.error("Failed to add task", err);
    }
  };

  const handleMoveTask = async (taskId: string, newStatus: string) => {
    try {
      const columnTasks = tasks.filter((t) => t.status === newStatus);
      await api.patch(
        `/organizations/${orgId}/teams/${teamId}/tasks/${taskId}/move`,
        { status: newStatus, position: columnTasks.length }
      );
      fetchData();
    } catch (err) {
      console.error("Failed to move task", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.delete(`/organizations/${orgId}/teams/${teamId}/tasks/${taskId}`);
      fetchData();
    } catch (err) {
      console.error("Failed to delete task", err);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex justify-center items-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border px-8 py-5 flex items-center justify-between bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">{team?.name}</h1>
                {team?.description && (
                  <p className="text-xs text-muted-foreground">{team.description}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Member Avatars */}
            <div className="flex -space-x-2">
              {members.slice(0, 5).map((m: any) => (
                <div
                  key={m.id}
                  className="w-8 h-8 rounded-full bg-secondary border-2 border-card flex items-center justify-center text-xs font-bold overflow-hidden"
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
                <div className="w-8 h-8 rounded-full bg-secondary border-2 border-card flex items-center justify-center text-xs font-medium text-muted-foreground">
                  +{members.length - 5}
                </div>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{members.length} anggota</span>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-5 h-full min-w-max">
            {COLUMNS.map((col) => {
              const columnTasks = tasks.filter((t) => t.status === col.id);
              return (
                <div
                  key={col.id}
                  className={cn(
                    "w-[320px] flex flex-col rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm border-t-4",
                    col.color
                  )}
                >
                  {/* Column Header */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-foreground">{col.title}</h3>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full text-white", col.badge)}>
                        {columnTasks.length}
                      </span>
                    </div>
                    <button
                      onClick={() => setAddingTo(addingTo === col.id ? null : col.id)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Add Task Input */}
                  {addingTo === col.id && (
                    <div className="px-3 pb-3">
                      <div className="bg-card border border-border rounded-lg p-3 shadow-sm">
                        <input
                          type="text"
                          autoFocus
                          placeholder="Judul tugas..."
                          value={newTaskTitle[col.id] || ""}
                          onChange={(e) =>
                            setNewTaskTitle((prev) => ({
                              ...prev,
                              [col.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddTask(col.id);
                            if (e.key === "Escape") setAddingTo(null);
                          }}
                          className="w-full text-sm bg-transparent border-none focus:outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleAddTask(col.id)}
                            className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
                          >
                            Tambah
                          </button>
                          <button
                            onClick={() => setAddingTo(null)}
                            className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Task Cards */}
                  <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 scrollbar-hide">
                    {columnTasks.map((task) => (
                      <div
                        key={task.id}
                        className="group bg-card border border-border/50 rounded-lg p-3 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground leading-snug flex-1">
                            {task.title}
                          </p>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTask(task.id);
                              }}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {task.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-3">
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", PRIORITY_COLORS[task.priority])}>
                            {task.priority}
                          </span>

                          {/* Quick move buttons */}
                          <div className="flex-1" />
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            {COLUMNS.filter((c) => c.id !== col.id).map((target) => (
                              <button
                                key={target.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveTask(task.id, target.id);
                                }}
                                className={cn(
                                  "w-2 h-2 rounded-full transition-transform hover:scale-150",
                                  target.badge
                                )}
                                title={`Pindah ke ${target.title}`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bottom Add Button */}
                  {addingTo !== col.id && (
                    <button
                      onClick={() => setAddingTo(col.id)}
                      className="mx-3 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Buat Tugas
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
