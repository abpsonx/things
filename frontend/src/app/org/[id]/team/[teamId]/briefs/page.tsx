"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Clapperboard, Plus, Loader2, Calendar, Layers, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import TeamNav from "@/components/team/TeamNav";

interface BriefListItem {
  id: string;
  title: string;
  status: string;
  shoot_date: string | null;
  video_format: string | null;
  platforms: string[];
  creator: { id: string; name: string; avatar_url?: string } | null;
  scene_count: number;
  created_at: string;
  updated_at: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-secondary text-muted-foreground border-border" },
  review:    { label: "Review",    cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  approved:  { label: "Approved",  cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  published: { label: "Published", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
};

export default function BriefsListPage() {
  const { id: orgId, teamId } = useParams();
  const router = useRouter();
  const base = `/organizations/${orgId}/teams/${teamId}/briefs`;
  const [briefs, setBriefs] = useState<BriefListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchBriefs = async () => {
    try {
      const res = await api.get(base);
      setBriefs(res.data || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal memuat brief");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (teamId) fetchBriefs();
  }, [teamId]);

  const createBrief = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await api.post(base, { title: newTitle, platforms: [], status: "draft" });
      setNewTitle("");
      router.push(`/org/${orgId}/team/${teamId}/briefs/${res.data.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal membuat brief");
    } finally {
      setCreating(false);
    }
  };

  const deleteBrief = async (id: string, title: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Hapus brief "${title}" beserta semua scene-nya?`)) return;
    try {
      await api.delete(`${base}/${id}`);
      setBriefs((prev) => prev.filter((b) => b.id !== id));
      toast.success("Brief dihapus");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menghapus");
    }
  };

  const visible = statusFilter === "all" ? briefs : briefs.filter((b) => b.status === statusFilter);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      <TeamNav orgId={orgId as string} teamId={teamId as string} />
      <div className="flex-1 p-8 max-w-6xl mx-auto w-full space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Clapperboard className="w-8 h-8 text-primary" />
              Brief Konten
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Storyboard terstruktur per video iklan — gantikan spreadsheet.</p>
          </div>
        </div>

        {/* Create form (always visible — single-input quick add) */}
        <form onSubmit={createBrief} className="flex flex-wrap items-center gap-2 pt-4">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Judul brief baru… (mis. 'Promo Lebaran 30s')"
            className="flex-1 min-w-[220px] px-4 py-2.5 rounded-2xl border border-border bg-secondary/30 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
          <button
            type="submit"
            disabled={creating || !newTitle.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 hover:shadow-lg hover:shadow-primary/20 transition-all"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Buat Brief
          </button>
        </form>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2 pt-2">
          {(["all", "draft", "review", "approved", "published"] as const).map((s) => {
            const active = statusFilter === s;
            const label = s === "all" ? "Semua" : STATUS_META[s].label;
            const count = s === "all" ? briefs.length : briefs.filter((b) => b.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1 rounded-full text-[11px] font-bold border transition-all",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/30 text-muted-foreground border-border hover:border-primary/40"
                )}
              >
                {label} <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-border rounded-3xl space-y-4">
          <Clapperboard className="w-12 h-12 text-muted-foreground mx-auto opacity-20" />
          <h3 className="font-bold text-xl">{briefs.length === 0 ? "Belum ada brief" : "Tidak ada brief di status ini"}</h3>
          <p className="text-muted-foreground text-sm">
            {briefs.length === 0 ? "Buat brief pertama untuk mulai menyusun storyboard iklan." : "Coba ganti filter di atas."}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((b) => {
            const meta = STATUS_META[b.status] || STATUS_META.draft;
            return (
              <Link
                key={b.id}
                href={`/org/${orgId}/team/${teamId}/briefs/${b.id}`}
                className="group block p-5 rounded-2xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-base leading-snug flex-1 group-hover:text-primary transition-colors">
                    {b.title}
                  </h3>
                  <span className={cn("shrink-0 px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-widest border", meta.cls)}>
                    {meta.label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Layers className="w-3 h-3" /> {b.scene_count} scene
                  </span>
                  {b.shoot_date && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(b.shoot_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                  {b.video_format && (
                    <span className="px-1.5 py-0.5 bg-secondary rounded text-[10px] font-bold">{b.video_format}</span>
                  )}
                </div>

                {b.platforms.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {b.platforms.slice(0, 4).map((p) => (
                      <span key={p} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/5 text-primary border border-primary/20">{p}</span>
                    ))}
                    {b.platforms.length > 4 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] text-muted-foreground">+{b.platforms.length - 4}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border/70">
                  <span className="text-[10px] text-muted-foreground">
                    {b.creator?.name || "Anonim"} · {new Date(b.updated_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => deleteBrief(b.id, b.title, e)}
                      title="Hapus"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
