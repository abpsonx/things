"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Clapperboard, Plus, Loader2, Calendar, Layers, ChevronRight, ChevronLeft, Trash2, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import TeamNav from "@/components/team/TeamNav";

interface BrandLabel { id: string; name: string; color: string | null }

interface BriefListItem {
  id: string;
  title: string;
  brand: string | null;
  brand_id: string | null;
  brand_label: BrandLabel | null;
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
  const [brands, setBrands] = useState<BrandLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all"); // "all" | brand_id | "_none_"
  const [showManageBrands, setShowManageBrands] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  const fetchAll = async () => {
    try {
      const [bRes, brRes] = await Promise.all([
        api.get(base),
        api.get(`${base}/_brands`),
      ]);
      setBriefs(bRes.data || []);
      setBrands(brRes.data || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal memuat brief");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (teamId) fetchAll();
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

  const addBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newBrandName.trim();
    if (!name) return;
    try {
      const res = await api.post(`${base}/_brands`, { name });
      setBrands((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewBrandName("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menambah brand");
    }
  };

  const removeBrand = async (id: string, name: string) => {
    if (!confirm(`Hapus brand "${name}"? Brief yang ditautkan akan jadi tanpa brand.`)) return;
    try {
      await api.delete(`${base}/_brands/${id}`);
      setBrands((prev) => prev.filter((b) => b.id !== id));
      setBriefs((prev) => prev.map((b) => b.brand_id === id ? { ...b, brand_id: null, brand_label: null } : b));
      if (brandFilter === id) setBrandFilter("all");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal hapus brand");
    }
  };

  const visible = briefs.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (brandFilter === "_none_") return !b.brand_id;
    if (brandFilter !== "all" && b.brand_id !== brandFilter) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const paginated = visible.slice(pageStart, pageEnd);

  useEffect(() => { setPage(1); }, [statusFilter, brandFilter]);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      <TeamNav orgId={orgId as string} teamId={teamId as string} />
      <div className="flex-1 p-8 max-w-7xl mx-auto w-full space-y-6">
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

        {/* Brand filter row — sama pattern dgn design briefs.
            Brand di-share via tabel design_brands per tim. */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground inline-flex items-center gap-1">
            <Tag className="w-3 h-3" /> Brand
          </span>
          <button
            onClick={() => setBrandFilter("all")}
            className={cn(
              "px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all",
              brandFilter === "all"
                ? "bg-foreground text-background border-foreground"
                : "bg-secondary/30 text-muted-foreground border-border hover:border-primary/40"
            )}
          >Semua</button>
          {brands.map((br) => (
            <button
              key={br.id}
              onClick={() => setBrandFilter(br.id)}
              style={brandFilter === br.id && br.color ? { backgroundColor: br.color, borderColor: br.color } : undefined}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all",
                brandFilter === br.id
                  ? "text-white"
                  : "bg-secondary/30 text-muted-foreground border-border hover:border-primary/40",
                brandFilter === br.id && !br.color && "bg-primary border-primary text-primary-foreground",
              )}
            >
              {br.name} <span className="opacity-70">({briefs.filter((b) => b.brand_id === br.id).length})</span>
            </button>
          ))}
          <button
            onClick={() => setBrandFilter("_none_")}
            className={cn(
              "px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all italic",
              brandFilter === "_none_"
                ? "bg-muted text-foreground border-muted-foreground"
                : "bg-secondary/30 text-muted-foreground border-border hover:border-primary/40"
            )}
          >Tanpa brand ({briefs.filter((b) => !b.brand_id).length})</button>
          <button
            type="button"
            onClick={() => setShowManageBrands((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-all"
          >
            <Plus className="w-3 h-3" /> Kelola brand
          </button>
        </div>

        {showManageBrands && (
          <div className="p-3 rounded-2xl border border-border bg-secondary/20 space-y-2">
            <form onSubmit={addBrand} className="flex gap-2">
              <input
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="Nama brand baru (mis. 'Gokuah', 'Klien X')…"
                className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-card text-xs outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={!newBrandName.trim()}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
              >Tambah</button>
            </form>
            {brands.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {brands.map((br) => (
                  <span key={br.id} className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-card border border-border text-[11px]">
                    <span className="font-bold">{br.name}</span>
                    <button
                      onClick={() => removeBrand(br.id, br.name)}
                      title="Hapus brand"
                      className="opacity-50 group-hover:opacity-100 hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground italic">
              Brand di-share dengan Brief Design — buat sekali, pakai di kedua brief.
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-border rounded-3xl space-y-4">
          <Clapperboard className="w-12 h-12 text-muted-foreground mx-auto opacity-20" />
          <h3 className="font-bold text-xl">{briefs.length === 0 ? "Belum ada brief" : "Tidak ada brief di filter ini"}</h3>
          <p className="text-muted-foreground text-sm">
            {briefs.length === 0 ? "Buat brief pertama untuk mulai menyusun storyboard iklan." : "Coba ganti filter di atas."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {paginated.map((b) => {
            const meta = STATUS_META[b.status] || STATUS_META.draft;
            return (
              <Link
                key={b.id}
                href={`/org/${orgId}/team/${teamId}/briefs/${b.id}`}
                className="group block p-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm leading-tight line-clamp-2 flex-1 group-hover:text-primary transition-colors">
                    {b.title}
                  </h3>
                  <span className={cn("shrink-0 px-1.5 py-0 rounded text-[9px] font-extrabold uppercase tracking-widest border", meta.cls)}>
                    {meta.label}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {b.brand_label ? (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0 rounded text-[9px] font-bold"
                      style={b.brand_label.color
                        ? { backgroundColor: `${b.brand_label.color}1a`, color: b.brand_label.color }
                        : undefined}
                    >
                      <Tag className="w-2.5 h-2.5" /> {b.brand_label.name}
                    </span>
                  ) : b.brand ? (
                    <span className="text-[10px] text-primary font-semibold truncate">{b.brand}</span>
                  ) : null}
                  {b.creator?.name && (
                    <span className="text-[9px] text-muted-foreground truncate" title={`Dibuat oleh ${b.creator.name}`}>
                      · {b.creator.name}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5">
                    <Layers className="w-2.5 h-2.5" /> {b.scene_count} scene
                  </span>
                  {b.shoot_date && (
                    <span className="inline-flex items-center gap-0.5">
                      <Calendar className="w-2.5 h-2.5" />
                      {new Date(b.shoot_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  {b.video_format && (
                    <span className="px-1 py-0 bg-secondary rounded text-[9px] font-bold">{b.video_format}</span>
                  )}
                </div>

                {b.platforms.length > 0 && (
                  <div className="flex flex-wrap gap-0.5">
                    {b.platforms.slice(0, 3).map((p) => (
                      <span key={p} className="px-1 py-0 rounded text-[9px] font-semibold bg-primary/5 text-primary border border-primary/20">{p}</span>
                    ))}
                    {b.platforms.length > 3 && (
                      <span className="px-1 py-0 rounded text-[9px] text-muted-foreground">+{b.platforms.length - 3}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end pt-1 border-t border-border/70 -mx-3 px-3">
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => deleteBrief(b.id, b.title, e)}
                      title="Hapus"
                      className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && visible.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-border">
          <span className="text-[11px] text-muted-foreground">
            Menampilkan <strong>{pageStart + 1}–{Math.min(pageEnd, visible.length)}</strong> dari <strong>{visible.length}</strong>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="p-1.5 rounded-lg border border-border bg-card hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Sebelumnya"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {(() => {
              const items: (number | "...")[] = [];
              const window = 2;
              const start = Math.max(2, safePage - window);
              const end = Math.min(totalPages - 1, safePage + window);
              items.push(1);
              if (start > 2) items.push("...");
              for (let i = start; i <= end; i++) items.push(i);
              if (end < totalPages - 1) items.push("...");
              if (totalPages > 1) items.push(totalPages);
              return items.map((it, i) => it === "..." ? (
                <span key={`d-${i}`} className="px-1.5 text-muted-foreground text-xs">…</span>
              ) : (
                <button
                  key={it}
                  onClick={() => setPage(it)}
                  className={cn(
                    "min-w-[28px] px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors",
                    it === safePage
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-muted-foreground hover:bg-secondary",
                  )}
                >{it}</button>
              ));
            })()}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="p-1.5 rounded-lg border border-border bg-card hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Berikutnya"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
