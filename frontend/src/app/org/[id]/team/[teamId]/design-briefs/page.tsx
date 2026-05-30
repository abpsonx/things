"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Image as ImageIcon, Plus, Loader2, Calendar, MessageCircle, ChevronRight, Trash2, AlertCircle, Tag, X } from "lucide-react";
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
  publish_date: string | null;
  final_image_url: string | null;
  creator: { id: string; name: string; avatar_url?: string } | null;
  annotation_count: number;
  open_annotation_count: number;
  created_at: string;
  updated_at: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:      { label: "Draft",      cls: "bg-secondary text-muted-foreground border-border" },
  onprogress: { label: "On Progress", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  review:     { label: "Review",     cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  published:  { label: "Published",  cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
};

export default function DesignBriefsListPage() {
  const { id: orgId, teamId } = useParams();
  const router = useRouter();
  const base = `/organizations/${orgId}/teams/${teamId}/design-briefs`;
  const [briefs, setBriefs] = useState<BriefListItem[]>([]);
  const [brands, setBrands] = useState<BrandLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");  // "all" | brand_id | "_none_"
  const [showManageBrands, setShowManageBrands] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");

  const fetchBriefs = async () => {
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
    if (teamId) fetchBriefs();
  }, [teamId]);

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

  const createBrief = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await api.post(base, { title: newTitle, status: "draft" });
      setNewTitle("");
      router.push(`/org/${orgId}/team/${teamId}/design-briefs/${res.data.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal membuat brief");
    } finally {
      setCreating(false);
    }
  };

  const deleteBrief = async (id: string, title: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Hapus brief "${title}" beserta annotasi-nya?`)) return;
    try {
      await api.delete(`${base}/${id}`);
      setBriefs((prev) => prev.filter((b) => b.id !== id));
      toast.success("Brief dihapus");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menghapus");
    }
  };

  const visible = briefs.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (brandFilter === "_none_") return !b.brand_id;
    if (brandFilter !== "all" && b.brand_id !== brandFilter) return false;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      <TeamNav orgId={orgId as string} teamId={teamId as string} />
      <div className="flex-1 p-8 max-w-6xl mx-auto w-full space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <ImageIcon className="w-8 h-8 text-primary" />
            Brief Design
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Brief asset desain (poster, feed IG, banner) + review pin-style di atas artwork.</p>

          <form onSubmit={createBrief} className="flex flex-wrap items-center gap-2 pt-4">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Judul brief baru… (mis. 'Ucapan Lebaran 2026')"
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

          <div className="flex flex-wrap gap-2 pt-2">
            {(["all", "draft", "onprogress", "review", "published"] as const).map((s) => {
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

          {/* Brand filter row */}
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
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-border rounded-3xl space-y-4">
            <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto opacity-20" />
            <h3 className="font-bold text-xl">{briefs.length === 0 ? "Belum ada brief design" : "Tidak ada brief di status ini"}</h3>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map((b) => {
              const meta = STATUS_META[b.status] || STATUS_META.draft;
              return (
                <Link
                  key={b.id}
                  href={`/org/${orgId}/team/${teamId}/design-briefs/${b.id}`}
                  className="group block rounded-2xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all overflow-hidden"
                >
                  {/* Thumbnail */}
                  <div className="aspect-square bg-secondary/30 border-b border-border flex items-center justify-center overflow-hidden relative">
                    {b.final_image_url ? (
                      <img src={b.final_image_url} alt={b.title} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-12 h-12 text-muted-foreground/40" />
                    )}
                    {b.open_annotation_count > 0 && (
                      <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-500 text-white shadow">
                        <AlertCircle className="w-3 h-3" /> {b.open_annotation_count} revisi
                      </span>
                    )}
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-sm leading-snug flex-1 group-hover:text-primary transition-colors">
                        {b.title}
                      </h3>
                      <span className={cn("shrink-0 px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-widest border", meta.cls)}>
                        {meta.label}
                      </span>
                    </div>
                    {b.brand_label ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
                        style={b.brand_label.color
                          ? { backgroundColor: `${b.brand_label.color}1a`, color: b.brand_label.color }
                          : undefined}
                      >
                        <Tag className="w-3 h-3" /> {b.brand_label.name}
                      </span>
                    ) : b.brand ? (
                      <p className="text-[11px] text-primary font-semibold">{b.brand}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-1">
                      {b.publish_date && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(b.publish_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                        </span>
                      )}
                      {b.annotation_count > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" /> {b.annotation_count}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border/70">
                      <span className="text-[10px] text-muted-foreground">
                        {b.creator?.name || "Anonim"}
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
