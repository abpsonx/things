"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  ListTodo,
  AlertTriangle,
  ChevronDown,
  Flag,
  Lightbulb,
} from "lucide-react";
import api from "@/lib/api";
import TeamNav from "@/components/team/TeamNav";
import { cn } from "@/lib/utils";
import { format, isValid } from "date-fns";
import { id as idLocale } from "date-fns/locale";

type PeriodKey = "all" | "7d" | "30d" | "month" | "custom";

export default function TeamReportPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;

  const [team, setTeam] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [teamRes, tasksRes] = await Promise.all([
        api.get(`/organizations/${orgId}/teams/${teamId}`),
        api.get(`/organizations/${orgId}/teams/${teamId}/tasks`),
      ]);
      setTeam(teamRes.data);
      setTasks(tasksRes.data || []);
    } catch (err) {
      console.error("Failed to fetch team report", err);
    } finally {
      setLoading(false);
    }
  }, [orgId, teamId]);

  useEffect(() => {
    if (orgId && teamId) fetchData();
  }, [orgId, teamId, fetchData]);

  // Period range
  const range = useMemo(() => {
    const now = new Date();
    if (period === "all") return null;
    if (period === "7d") {
      const from = new Date(now); from.setDate(from.getDate() - 7);
      return { from, to: now };
    }
    if (period === "30d") {
      const from = new Date(now); from.setDate(from.getDate() - 30);
      return { from, to: now };
    }
    if (period === "month") {
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    }
    if (period === "custom" && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(`${customTo}T23:59:59`) };
    }
    return null;
  }, [period, customFrom, customTo]);

  const filteredTasks = useMemo(() => {
    if (!range) return tasks;
    return tasks.filter((t) => {
      const c = t.created_at ? new Date(t.created_at) : null;
      return c && c >= range.from && c <= range.to;
    });
  }, [tasks, range]);

  const now = new Date();
  const startOfToday = new Date(now.toDateString());
  const isOverdue = (t: any) => t.due_date && t.status !== "done" && new Date(t.due_date) < startOfToday;

  const groups = useMemo(() => ({
    done: filteredTasks.filter((t) => t.status === "done"),
    in_progress: filteredTasks.filter((t) => t.status === "in_progress"),
    belum: filteredTasks.filter((t) => t.status === "todo" || t.status === "pending"),
    overdue: filteredTasks.filter(isOverdue),
  }), [filteredTasks]);

  const total = filteredTasks.length;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const completionRate = pct(groups.done.length);

  const CARDS = [
    { key: "done", label: "Selesai", count: groups.done.length, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", bar: "bg-emerald-500" },
    { key: "in_progress", label: "Dikerjakan", count: groups.in_progress.length, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10", bar: "bg-amber-500" },
    { key: "belum", label: "Belum Dikerjakan", count: groups.belum.length, icon: ListTodo, color: "text-blue-500", bg: "bg-blue-500/10", bar: "bg-blue-500" },
    { key: "overdue", label: "Terlambat", count: groups.overdue.length, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10", bar: "bg-red-500" },
  ] as const;

  const PERIODS: { key: PeriodKey; label: string }[] = [
    { key: "all", label: "Semua" },
    { key: "7d", label: "7 hari" },
    { key: "30d", label: "30 hari" },
    { key: "month", label: "Bulan ini" },
    { key: "custom", label: "Custom" },
  ];

  const priorityFlag = (p?: string) =>
    p === "high" ? "text-red-500" : p === "medium" ? "text-amber-500" : "text-emerald-500";

  const conclusion = useMemo(() => {
    if (total === 0) return "Belum ada tugas pada periode ini.";
    const parts: string[] = [];
    parts.push(`Dari ${total} tugas, ${groups.done.length} selesai (${completionRate}%).`);
    if (groups.overdue.length > 0) {
      parts.push(`Ada ${groups.overdue.length} tugas terlambat yang perlu segera ditangani.`);
    } else {
      parts.push("Tidak ada tugas yang terlambat — bagus!");
    }
    if (completionRate >= 80) parts.push("Performa tim luar biasa, pertahankan.");
    else if (completionRate >= 50) parts.push("Performa cukup baik, terus tingkatkan penyelesaian.");
    else parts.push("Fokuskan energi untuk menuntaskan tugas yang masih berjalan.");
    return parts.join(" ");
  }, [total, groups, completionRate]);

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center h-screen bg-background dark:bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderTaskList = (list: any[]) => (
    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Tidak ada tugas.</p>
      ) : (
        list.map((t) => {
          const d = t.due_date ? new Date(t.due_date) : null;
          const overdue = isOverdue(t);
          return (
            <button
              key={t.id}
              onClick={() => router.push(`/org/${orgId}/team/${teamId}/board?task=${t.id}`)}
              className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-secondary/50 transition-colors text-left"
            >
              <Flag className={cn("w-3.5 h-3.5 fill-current shrink-0", priorityFlag(t.priority))} />
              <span className="flex-1 min-w-0 text-xs font-semibold text-foreground truncate">{t.title}</span>
              {d && isValid(d) && (
                <span className={cn("text-[10px] font-bold shrink-0", overdue ? "text-red-500" : "text-muted-foreground")}>
                  {format(d, "d MMM", { locale: idLocale })}
                </span>
              )}
              {t.assignee?.name && <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">· {t.assignee.name}</span>}
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background dark:bg-background">
      {/* Header */}
      <div className="border-b border-border px-3 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5 flex items-center justify-between bg-card/80 dark:bg-card/60 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-500/20">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">{team?.name}</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Laporan Kinerja</p>
            </div>
          </div>
        </div>
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:p-8 max-w-5xl mx-auto w-full space-y-6">
        {/* Period filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mr-1">Periode:</span>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
                period === p.key ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary/50",
              )}
            >
              {p.label}
            </button>
          ))}
          {period === "custom" && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-2 py-1.5 rounded-xl border border-border bg-background text-xs" />
              <span className="text-xs text-muted-foreground">s/d</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-2 py-1.5 rounded-xl border border-border bg-background text-xs" />
            </div>
          )}
        </div>

        {/* Completion headline */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-950 rounded-3xl p-8 text-white flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-white/70 font-medium">Tingkat Penyelesaian</p>
            <p className="text-5xl font-black mt-1">{completionRate}%</p>
            <p className="text-xs text-white/60 mt-2">{groups.done.length} dari {total} tugas selesai</p>
          </div>
          <div className="w-28 h-28 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `conic-gradient(#10b981 ${completionRate * 3.6}deg, rgba(255,255,255,0.12) 0deg)` }}>
            <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
          </div>
        </div>

        {/* Category cards (clickable to expand task list) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CARDS.map((c) => (
            <div key={c.key} className="bg-card border border-border rounded-3xl p-5 shadow-sm">
              <button
                onClick={() => setExpanded(expanded === c.key ? null : c.key)}
                className="w-full flex items-center gap-4 text-left"
              >
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0", c.bg)}>
                  <c.icon className={cn("w-6 h-6", c.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-foreground">{c.label}</p>
                    <span className="text-2xl font-black text-foreground">{c.count}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                      <div className={cn("h-full rounded-full", c.bar)} style={{ width: `${pct(c.count)}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-muted-foreground shrink-0">{pct(c.count)}%</span>
                  </div>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", expanded === c.key && "rotate-180")} />
              </button>
              {expanded === c.key && renderTaskList(groups[c.key as keyof typeof groups])}
            </div>
          ))}
        </div>

        {/* Conclusion */}
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-500" /> Kesimpulan
          </h2>
          <p className="text-sm text-foreground/80 leading-relaxed">{conclusion}</p>
          {groups.overdue.length > 0 && (
            <div className="mt-4 p-3 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-400">
                {groups.overdue.length} tugas terlambat. Klik kartu "Terlambat" di atas untuk lihat detailnya & segera tindak lanjuti.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
