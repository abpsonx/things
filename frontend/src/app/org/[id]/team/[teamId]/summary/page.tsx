"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  LayoutDashboard,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  ListTodo,
  Calendar,
  Activity as ActivityIcon,
  Flag,
} from "lucide-react";
import { format, isValid } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import api from "@/lib/api";
import TeamNav from "@/components/team/TeamNav";
import { cn } from "@/lib/utils";

export default function TeamSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;

  const [team, setTeam] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [teamRes, tasksRes, memRes, actRes] = await Promise.all([
        api.get(`/organizations/${orgId}/teams/${teamId}`),
        api.get(`/organizations/${orgId}/teams/${teamId}/tasks`),
        api.get(`/organizations/${orgId}/teams/${teamId}/members`),
        api.get(`/organizations/${orgId}/teams/${teamId}/activities`).catch(() => ({ data: [] })),
      ]);
      setTeam(teamRes.data);
      setTasks(tasksRes.data || []);
      setMembers(memRes.data || []);
      setActivities(actRes.data || []);
    } catch (err) {
      console.error("Failed to fetch team summary", err);
    } finally {
      setLoading(false);
    }
  }, [orgId, teamId]);

  useEffect(() => {
    if (orgId && teamId) fetchData();
  }, [orgId, teamId, fetchData]);

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center h-screen bg-background dark:bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const counts = {
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    pending: tasks.filter((t) => t.status === "pending").length,
    done: tasks.filter((t) => t.status === "done").length,
    total: tasks.length,
  };
  const completion = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;

  const now = new Date();
  const overdue = tasks.filter(
    (t) => t.due_date && t.status !== "done" && new Date(t.due_date) < new Date(now.toDateString()),
  ).length;

  // Workload per member
  const workload = members
    .map((m: any) => {
      const uid = m.user_id || m.user?.id;
      const assigned = tasks.filter((t) => t.assignee_id === uid && t.status !== "done").length;
      const done = tasks.filter((t) => t.assignee_id === uid && t.status === "done").length;
      return { ...m, assigned, done };
    })
    .sort((a, b) => b.assigned - a.assigned);

  // Upcoming deadlines (open tasks with due_date, soonest first)
  const upcoming = tasks
    .filter((t) => t.due_date && t.status !== "done")
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 5);

  const STATUS_CARDS = [
    { key: "todo", label: "To Do", value: counts.todo, icon: ListTodo, color: "text-blue-500", bg: "bg-blue-500/10" },
    { key: "in_progress", label: "Dikerjakan", value: counts.in_progress, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
    { key: "pending", label: "Pending", value: counts.pending, icon: AlertCircle, color: "text-orange-500", bg: "bg-orange-500/10" },
    { key: "done", label: "Selesai", value: counts.done, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  const priorityFlag = (p?: string) =>
    p === "high" ? "text-red-500" : p === "medium" ? "text-amber-500" : "text-emerald-500";

  const activityText = (a: any) => {
    const name = a.user?.name || "Seseorang";
    const map: Record<string, string> = {
      task_created: "membuat tugas",
      task_moved: "memindahkan tugas",
      task_updated: "mengubah tugas",
      task_deleted: "menghapus tugas",
      member_added_to_team: "menambahkan anggota",
      member_removed_from_team: "mengeluarkan anggota",
      team_updated: "mengubah pengaturan tim",
    };
    return `${name} ${map[a.action] || a.action}`;
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background dark:bg-background">
      {/* Header */}
      <div className="border-b border-border px-3 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5 flex items-center justify-between bg-card/80 dark:bg-card/60 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-500/20">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">{team?.name}</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ringkasan Tim</p>
            </div>
          </div>
        </div>
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:p-8 space-y-6 max-w-6xl mx-auto w-full">
        {/* Status cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STATUS_CARDS.map((c) => (
            <div key={c.key} className="bg-card border border-border rounded-3xl p-5 shadow-sm">
              <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center mb-3", c.bg)}>
                <c.icon className={cn("w-5 h-5", c.color)} />
              </div>
              <p className="text-3xl font-bold text-foreground">{c.value}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>

        {/* Progress + meta */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-card border border-border rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-foreground">Progress Tim</h2>
              <span className="text-2xl font-extrabold text-primary">{completion}%</span>
            </div>
            <div className="h-3 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${completion}%` }} />
            </div>
            <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {counts.done} selesai</span>
              <span className="inline-flex items-center gap-1"><ListTodo className="w-3.5 h-3.5 text-blue-500" /> {counts.total} total</span>
              {overdue > 0 && (
                <span className="inline-flex items-center gap-1 text-red-500 font-semibold"><AlertCircle className="w-3.5 h-3.5" /> {overdue} overdue</span>
              )}
            </div>
          </div>
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Anggota</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{members.length}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">aktif di tim ini</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Workload */}
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Beban Kerja Anggota
            </h2>
            {workload.length === 0 ? (
              <p className="text-xs text-muted-foreground">Belum ada anggota</p>
            ) : (
              <div className="space-y-3">
                {workload.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                      {m.user?.avatar_url ? (
                        <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (m.user?.name || "?").charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{m.user?.name}</p>
                      <p className="text-[10px] text-muted-foreground">{m.assigned} aktif · {m.done} selesai</p>
                    </div>
                    <span className="text-sm font-bold text-foreground shrink-0">{m.assigned}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming deadlines */}
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Deadline Terdekat
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">Tidak ada deadline mendatang</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((t) => {
                  const d = new Date(t.due_date);
                  const isOverdue = d < new Date(now.toDateString());
                  return (
                    <button
                      key={t.id}
                      onClick={() => router.push(`/org/${orgId}/team/${teamId}/board?task=${t.id}`)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-secondary/50 transition-colors text-left"
                    >
                      <Flag className={cn("w-3.5 h-3.5 fill-current shrink-0", priorityFlag(t.priority))} />
                      <span className="flex-1 min-w-0 text-xs font-semibold text-foreground truncate">{t.title}</span>
                      <span className={cn("text-[10px] font-bold shrink-0", isOverdue ? "text-red-500" : "text-muted-foreground")}>
                        {isValid(d) ? format(d, "d MMM", { locale: idLocale }) : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <ActivityIcon className="w-4 h-4 text-primary" /> Aktivitas Terbaru
          </h2>
          {activities.length === 0 ? (
            <p className="text-xs text-muted-foreground">Belum ada aktivitas</p>
          ) : (
            <div className="space-y-3">
              {activities.slice(0, 8).map((a: any) => {
                const d = a.created_at ? new Date(a.created_at) : null;
                return (
                  <div key={a.id} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-[9px] font-bold overflow-hidden shrink-0">
                      {a.user?.avatar_url ? (
                        <img src={a.user.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (a.user?.name || "?").charAt(0).toUpperCase()
                      )}
                    </div>
                    <p className="flex-1 min-w-0 text-xs text-foreground/80 truncate">{activityText(a)}</p>
                    {d && isValid(d) && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {format(d, "d MMM HH:mm", { locale: idLocale })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
