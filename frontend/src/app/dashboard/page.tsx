"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { format, isValid, isToday, isTomorrow, isThisWeek } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Plus,
  Building2,
  ArrowRight,
  Users,
  Loader2,
  Calendar,
  CheckSquare,
  AlertCircle,
  Briefcase,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface Organization {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

interface OrgRef {
  id: string;
  name: string;
  org_id: string;
}

interface MyTask {
  id: string;
  title: string;
  status: string;
  priority?: string;
  due_date?: string | null;
  is_overdue: boolean;
  project: OrgRef | null;
  team?: OrgRef | null;
}

interface Meeting {
  id: string;
  title: string;
  start_at: string;
  end_at?: string | null;
  attendee_count: number;
  project: { id: string; name: string; org_id: string } | null;
}

function formatDueLabel(iso?: string | null): { label: string; tone: "overdue" | "today" | "soon" | "normal" } {
  if (!iso) return { label: "Tanpa deadline", tone: "normal" };
  const d = new Date(iso);
  if (!isValid(d)) return { label: "Tanpa deadline", tone: "normal" };
  const now = new Date();
  if (d < now) return { label: `Telat · ${format(d, "d MMM", { locale: idLocale })}`, tone: "overdue" };
  if (isToday(d)) return { label: `Hari ini · ${format(d, "HH:mm")}`, tone: "today" };
  if (isTomorrow(d)) return { label: `Besok · ${format(d, "HH:mm")}`, tone: "soon" };
  if (isThisWeek(d, { weekStartsOn: 1 })) return { label: format(d, "EEEE 'pukul' HH:mm", { locale: idLocale }), tone: "soon" };
  return { label: format(d, "d MMM yyyy", { locale: idLocale }), tone: "normal" };
}

function formatMeetingTime(iso: string) {
  const d = new Date(iso);
  if (!isValid(d)) return "—";
  if (isToday(d)) return `Hari ini · ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `Besok · ${format(d, "HH:mm")}`;
  return format(d, "EEE, d MMM · HH:mm", { locale: idLocale });
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isSuperUser = (user as any)?.role === "super_user" || (user as any)?.role === "developer";
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [stats, setStats] = useState<any>(null);

  const fetchAll = async () => {
    try {
      const [orgsRes, statsRes] = await Promise.all([
        api.get("/organizations"),
        api.get("/stats/dashboard"),
      ]);
      setOrganizations(orgsRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    try {
      setLoading(true);
      await api.post("/organizations", { name: newOrgName });
      setNewOrgName("");
      setIsCreating(false);
      await fetchAll();
    } catch (err) {
      console.error("Failed to create org", err);
    }
  };

  const taskStats = stats?.task_stats || { todo: 0, in_progress: 0, completed: 0, total: 0 };
  const myTasks: MyTask[] = stats?.my_tasks || [];
  const meetings: Meeting[] = stats?.upcoming_meetings || [];
  // Filter out zero-value slices so paddingAngle doesn't leave broken gaps
  // when only one or two statuses actually have tasks. Also swap the To Do
  // slate-400 for slate-500 so it doesn't disappear into the background.
  const rawChart = (stats?.chart_data || []) as { name: string; value: number; fill: string }[];
  const palette: Record<string, string> = {
    "To Do": "#64748b",
    "In Progress": "#3b82f6",
    Completed: "#10b981",
  };
  const chartData = rawChart
    .filter((c) => (c.value || 0) > 0)
    .map((c) => ({ ...c, fill: palette[c.name] || c.fill }));
  const hasAnyTask = (taskStats.total || 0) > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Dashboard</p>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1">Selamat Datang!</h1>
          <p className="text-sm text-muted-foreground mt-1">Ringkasan tugas, jadwal, dan workspace kamu hari ini.</p>
        </div>
        {isSuperUser && (
          <button
            onClick={() => setIsCreating(true)}
            className="shrink-0 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10"
          >
            <Plus className="w-4 h-4" />
            Workspace Baru
          </button>
        )}
      </div>

      {/* Create workspace inline */}
      {isCreating && (
        <div className="p-4 border border-border rounded-2xl bg-secondary/30 animate-in fade-in slide-in-from-top-2">
          <form onSubmit={handleCreateOrg} className="flex gap-3">
            <input
              autoFocus
              type="text"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Nama Perusahaan atau Tim"
              className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold hover:bg-primary/90">Simpan</button>
            <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 bg-background border border-border rounded-md text-sm font-medium hover:bg-secondary">Batal</button>
          </form>
        </div>
      )}

      {/* Main grid: My Tasks + Project Overview donut + Meetings */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* My Tasks (sorted by deadline) */}
        <div className="lg:col-span-1 p-5 bg-card border border-border rounded-2xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Tugasmu</p>
              <h2 className="text-base font-bold mt-1">Diurutkan dari deadline</h2>
            </div>
            <CheckSquare className="w-4 h-4 text-muted-foreground" />
          </div>
          {loading && !stats ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : myTasks.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mb-3">
                <CheckSquare className="w-5 h-5 text-muted-foreground/60" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">Belum ada tugas untukmu</p>
            </div>
          ) : (
            <ul className="flex-1 space-y-1.5 -mx-1.5">
              {myTasks.map((t) => {
                const due = formatDueLabel(t.due_date);
                // Task may live on a project OR a team — pick whichever is set.
                const ctx = t.project
                  ? { kind: "project" as const, ref: t.project }
                  : t.team
                    ? { kind: "team" as const, ref: t.team }
                    : null;
                const handleClick = () => {
                  if (!ctx) return;
                  if (ctx.kind === "project") {
                    router.push(`/org/${ctx.ref.org_id}/project/${ctx.ref.id}/board?task=${t.id}`);
                  } else {
                    router.push(`/org/${ctx.ref.org_id}/team/${ctx.ref.id}/board?task=${t.id}`);
                  }
                };
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={handleClick}
                      disabled={!ctx}
                      className="w-full text-left block px-3 py-2 rounded-xl hover:bg-secondary/60 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <p className="text-sm font-semibold leading-snug line-clamp-2">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px]">
                        {ctx && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Briefcase className="w-2.5 h-2.5" />
                            {ctx.ref.name}
                          </span>
                        )}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 font-bold",
                            due.tone === "overdue" && "text-destructive",
                            due.tone === "today" && "text-amber-600 dark:text-amber-400",
                            due.tone === "soon" && "text-primary",
                            due.tone === "normal" && "text-muted-foreground",
                          )}
                        >
                          {due.tone === "overdue" ? <AlertCircle className="w-2.5 h-2.5" /> : <Calendar className="w-2.5 h-2.5" />}
                          {due.label}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Project Overview donut */}
        <div className="lg:col-span-1 p-5 bg-card border border-border rounded-2xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Project Overview</p>
              <h2 className="text-base font-bold mt-1">Status semua tugas</h2>
            </div>
          </div>

          <div className="flex-1 relative min-h-[200px]">
            {hasAnyTask ? (
              <>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-black leading-none">{taskStats.total}</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Total</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      innerRadius="65%"
                      outerRadius="92%"
                      paddingAngle={4}
                      stroke="none"
                      isAnimationActive={false}
                      cx="50%"
                      cy="50%"
                    >
                      {chartData.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.fill}
                          style={{ outline: "none" }}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full border-4 border-secondary mb-3" />
                <p className="text-xs text-muted-foreground">Belum ada tugas untuk divisualisasikan</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 mt-4 text-[10px]">
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-secondary0" /><span className="font-semibold text-muted-foreground">To Do</span><span className="font-bold">{taskStats.todo}</span></span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /><span className="font-semibold text-muted-foreground">In Progress</span><span className="font-bold">{taskStats.in_progress}</span></span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="font-semibold text-muted-foreground">Done</span><span className="font-bold">{taskStats.completed}</span></span>
          </div>
        </div>

        {/* Upcoming meetings */}
        <div className="lg:col-span-1 p-5 bg-card border border-border rounded-2xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Jadwal</p>
              <h2 className="text-base font-bold mt-1">Meeting mendatang</h2>
            </div>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </div>
          {loading && !stats ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : meetings.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mb-3">
                <Calendar className="w-5 h-5 text-muted-foreground/60" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">Tidak ada meeting mendatang</p>
            </div>
          ) : (
            <ul className="flex-1 space-y-1.5 -mx-1.5">
              {meetings.map((m) => {
                const handleClick = () => {
                  if (!m.project) return;
                  router.push(`/org/${m.project.org_id}/project/${m.project.id}/calendar`);
                };
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={handleClick}
                      disabled={!m.project}
                      className="w-full text-left block px-3 py-2 rounded-xl hover:bg-secondary/60 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <p className="text-sm font-semibold leading-snug line-clamp-1">{m.title}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1 font-bold text-primary">
                          <Calendar className="w-2.5 h-2.5" />
                          {formatMeetingTime(m.start_at)}
                        </span>
                        {m.project && (
                          <span className="inline-flex items-center gap-1">
                            <Briefcase className="w-2.5 h-2.5" />
                            {m.project.name}
                          </span>
                        )}
                        {m.attendee_count > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-2.5 h-2.5" />
                            {m.attendee_count}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Workspaces */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <h2 className="text-base font-bold">Workspace Kamu</h2>
          <div className="flex-1 h-px bg-border" />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : organizations.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {organizations.map((org) => (
              <Link
                key={org.id}
                href={`/org/${org.id}`}
                className="group p-5 border border-border rounded-2xl bg-card hover:border-primary/50 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center border border-border group-hover:bg-primary/5 transition-colors">
                    <Building2 className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                </div>
                <h3 className="font-bold text-base group-hover:text-primary transition-colors line-clamp-1">{org.name}</h3>
                <p className="text-[10px] text-muted-foreground mt-1 inline-flex items-center gap-1.5">
                  <Users className="w-3 h-3" /> Workspace
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border border-dashed border-border rounded-2xl space-y-2">
            <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mx-auto mb-2">
              <Building2 className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-bold">Belum ada workspace</h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">Buat workspace pertama kamu untuk mulai mengelola proyek tim.</p>
          </div>
        )}
      </div>
    </div>
  );
}
