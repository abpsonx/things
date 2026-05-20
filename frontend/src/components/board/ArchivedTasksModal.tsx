"use client";

import React, { useEffect, useState } from "react";
import { X, Archive, RotateCcw, Trash2, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { format, isValid } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Base tasks URL, e.g. "/projects/{id}/tasks" or
   *  "/organizations/{org}/teams/{team}/tasks". */
  baseUrl: string;
  onChange: () => void;
}

export default function ArchivedTasksModal({ isOpen, onClose, baseUrl, onChange }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchArchived = async () => {
    setLoading(true);
    try {
      const res = await api.get(`${baseUrl}/archived`);
      setTasks(res.data || []);
    } catch (err) {
      console.error("Failed to load archived tasks", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchArchived();
  }, [isOpen]);

  const restore = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`${baseUrl}/${id}/restore`);
      toast.success("Tugas dipulihkan");
      await fetchArchived();
      onChange();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal memulihkan");
    } finally {
      setBusyId(null);
    }
  };

  const hardDelete = async (id: string, title: string) => {
    if (!confirm(`Hapus permanen "${title}"? Tidak bisa dibatalkan.`)) return;
    setBusyId(id);
    try {
      await api.delete(`${baseUrl}/${id}`);
      toast.success("Tugas dihapus permanen");
      await fetchArchived();
      onChange();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menghapus");
    } finally {
      setBusyId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-3xl w-full max-w-2xl shadow-2xl border border-border overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm">
              <Archive className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold">Tugas yang Diarsipkan</h2>
              <p className="text-[11px] text-muted-foreground">{tasks.length} tugas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Belum ada tugas yang diarsipkan
            </div>
          ) : (
            tasks.map((t) => {
              const archivedAt = t.archived_at ? new Date(t.archived_at) : null;
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl hover:bg-secondary/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground truncate">{t.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {archivedAt && isValid(archivedAt)
                        ? `Diarsipkan ${format(archivedAt, "d MMM yyyy", { locale: idLocale })}`
                        : ""}
                      {t.assignee?.name ? ` · ${t.assignee.name}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => restore(t.id)}
                      disabled={busyId === t.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold hover:bg-primary/90 disabled:opacity-50 transition-all"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Pulihkan
                    </button>
                    <button
                      onClick={() => hardDelete(t.id, t.title)}
                      disabled={busyId === t.id}
                      className="p-2 rounded-xl text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-all"
                      title="Hapus permanen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
