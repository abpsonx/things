"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  CheckSquare,
  Flag,
  Calendar,
  Folder,
  Users,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { format, isValid } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string;
  due_date?: string | null;
  is_overdue: boolean;
  project?: { id: string; name: string; org_id: string } | null;
  team?: { id: string; name: string; org_id: string } | null;
}

const PRIORITY_META: Record<string, { label: string; flagColor: string; textColor: string }> = {
  high: { label: "HIGH", flagColor: "text-red-500", textColor: "text-red-500" },
  medium: { label: "MEDIUM", flagColor: "text-amber-500", textColor: "text-amber-500" },
  low: { label: "LOW", flagColor: "text-emerald-500", textColor: "text-emerald-500" },
};

export default function MyTasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeDone, setIncludeDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get("/stats/my-tasks", { params: { include_done: includeDone } })
      .then((res) => {
        if (!cancelled) setTasks(res.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [includeDone]);

  const groups = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const endOfWeek = new Date(startOfDay);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const buckets: Record<string, Task[]> = {
      overdue: [],
      today: [],
      week: [],
      later: [],
      noDate: [],
    };

    for (const t of tasks) {
      if (!t.due_date) {
        buckets.noDate.push(t);
        continue;
      }
      const d = new Date(t.due_date);
      if (!isValid(d)) {
        buckets.noDate.push(t);
        continue;
      }
      if (d < startOfDay) buckets.overdue.push(t);
      else if (d <= endOfDay) buckets.today.push(t);
      else if (d <= endOfWeek) buckets.week.push(t);
      else buckets.later.push(t);
    }
    return buckets;
  }, [tasks]);

  const openTask = (t: Task) => {
    if (t.project) router.push(`/org/${t.project.org_id}/project/${t.project.id}/board?task=${t.id}`);
    else if (t.team) router.push(`/org/${t.team.org_id}/team/${t.team.id}/board?task=${t.id}`);
  };

  const renderGroup = (key: string, label: string, color: string) => {
    const items = groups[key];
    if (items.length === 0) return null;
    return (
      <section key={key} className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full", color)} />
          <h2 className="text-[11px] font-extrabold tracking-widest uppercase text-muted-foreground">
            {label}
          </h2>
          <span className="text-[11px] font-bold text-muted-foreground">{items.length}</span>
        </div>
        <div className="space-y-2">
          {items.map((t) => {
            const priority = t.priority ? PRIORITY_META[t.priority] : undefined;
            const dueDate = t.due_date ? new Date(t.due_date) : null;
            const dueValid = !!dueDate && isValid(dueDate);
            return (
              <button
                key={t.id}
                onClick={() => openTask(t)}
                className="w-full text-left p-4 bg-card border border-border/70 rounded-2xl hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  {priority ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-wider",
                        priority.textColor,
                      )}
                    >
                      <Flag className={cn("w-3 h-3 fill-current", priority.flagColor)} />
                      {priority.label}
                    </span>
                  ) : (
                    <span />
                  )}
                  {t.is_overdue && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-red-600 uppercase tracking-wider">
                      <AlertCircle className="w-3 h-3" /> Overdue
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1">{t.title}</h3>
                {t.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mb-2">
                    {t.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  {t.project && (
                    <span className="inline-flex items-center gap-1">
                      <Folder className="w-3 h-3" /> {t.project.name}
                    </span>
                  )}
                  {t.team && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3" /> {t.team.name}
                    </span>
                  )}
                  {dueValid && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {format(dueDate!, "d MMM yyyy", { locale: idLocale })}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-8 w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <CheckSquare className="w-7 h-7 text-primary" />
            Tugas Saya
          </h1>
          <p className="text-muted-foreground mt-2">
            Semua tugas yang di-assign ke kamu — lintas workspace dan tim.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={includeDone}
            onChange={(e) => setIncludeDone(e.target.checked)}
            className="accent-primary"
          />
          Tampilkan yang selesai
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground border border-dashed border-border rounded-3xl">
          <CheckSquare className="w-10 h-10 mx-auto opacity-30 mb-2" />
          <p className="text-sm font-medium">Belum ada tugas yang di-assign ke kamu</p>
        </div>
      ) : (
        <div className="space-y-8">
          {renderGroup("overdue", "Overdue", "bg-red-500")}
          {renderGroup("today", "Hari ini", "bg-amber-500")}
          {renderGroup("week", "Minggu ini", "bg-blue-500")}
          {renderGroup("later", "Nanti", "bg-violet-500")}
          {renderGroup("noDate", "Tanpa deadline", "bg-slate-400")}
        </div>
      )}
    </div>
  );
}
