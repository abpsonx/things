"use client";

import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { History, Plus, Pencil, ArrowRightLeft, Archive, RotateCcw, Loader2 } from "lucide-react";

interface Activity {
  id: string;
  action: string;
  summary: string[];
  title?: string | null;
  created_at: string;
  user?: { id: string; name: string; avatar_url?: string | null } | null;
}

const ACTION_META: Record<string, { label: string; Icon: any; color: string }> = {
  task_created: { label: "membuat tugas ini", Icon: Plus, color: "text-emerald-500" },
  task_updated: { label: "memperbarui tugas", Icon: Pencil, color: "text-blue-500" },
  task_moved: { label: "memindahkan tugas", Icon: ArrowRightLeft, color: "text-indigo-500" },
  task_archived: { label: "mengarsipkan tugas", Icon: Archive, color: "text-amber-500" },
  task_restored: { label: "memulihkan tugas", Icon: RotateCcw, color: "text-emerald-500" },
};

export default function TaskActivityLog({ taskId, reloadKey }: { taskId: string; reloadKey?: number }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get(`/tasks/${taskId}/activities`);
        if (alive) setActivities(res.data || []);
      } catch (err) {
        console.error("Failed to fetch task activities", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [taskId, reloadKey]);

  return (
    <div className="space-y-4 pt-6 border-t border-border">
      <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
        <History className="w-4 h-4" />
        Riwayat Aktivitas
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Memuat…
        </div>
      ) : activities.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Belum ada aktivitas.</p>
      ) : (
        <ol className="space-y-4">
          {activities.map((a) => {
            const meta = ACTION_META[a.action] || { label: a.action, Icon: Pencil, color: "text-muted-foreground" };
            const Icon = meta.Icon;
            return (
              <li key={a.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0">
                    <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs leading-relaxed">
                    <span className="font-bold">{a.user?.name || "Seseorang"}</span>{" "}
                    <span className="text-muted-foreground">{meta.label}</span>
                  </p>
                  {a.summary?.length > 0 && (
                    <ul className="space-y-0.5">
                      {a.summary.map((s, i) => (
                        <li key={i} className="text-[11px] text-foreground/80 bg-secondary/40 rounded-md px-2 py-1 w-fit max-w-full break-words">
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[10px] text-muted-foreground">{formatDate(a.created_at)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
