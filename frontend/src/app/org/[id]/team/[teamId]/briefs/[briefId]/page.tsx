"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clapperboard, Loader2, ChevronLeft, Plus, Trash2, Save, Layers, X, Tag, Check, XCircle, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import TeamNav from "@/components/team/TeamNav";

interface Scene {
  id: string;
  brief_id: string;
  position: number;
  scene_type: string | null;
  time_range: string | null;
  location: string | null;
  shoot_time: string | null;
  script_vo: string | null;
  footage: string | null;
  text_on_video: string | null;
  talent: string | null;
  duration: string | null;
}

interface BrandLabel { id: string; name: string; color: string | null }

interface Brief {
  id: string;
  team_id: string;
  title: string;
  brand: string | null;
  brand_id: string | null;
  brand_label: BrandLabel | null;
  shoot_date: string | null;
  shoot_time: string | null;
  video_duration: string | null;
  video_format: string | null;
  platforms: string[];
  reference_url: string | null;
  final_url: string | null;
  status: string;
  scenes: Scene[];
  creator: { id: string; name: string; avatar_url?: string } | null;
  created_at?: string;
  // Approval workflow
  approved_by?: { id: string; name: string; avatar_url?: string } | null;
  approved_at?: string | null;
  approval_note?: string | null;
  rejected_by?: { id: string; name: string; avatar_url?: string } | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  // Legacy — backend masih simpan tapi UI gak nampilin.
  location?: string | null;
  tone?: string | null;
}

const STATUS_OPTIONS = [
  { value: "draft",     label: "Draft",     color: "bg-secondary text-muted-foreground" },
  { value: "review",    label: "Review",    color: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  { value: "approved",  label: "Approved",  color: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  { value: "published", label: "Published", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
];

const FORMAT_PRESETS = ["9:16", "16:9", "1:1", "4:5"];
const PLATFORM_PRESETS = ["Instagram", "TikTok", "YouTube Shorts", "YouTube", "Facebook", "X / Twitter"];
const SCENE_TYPE_PRESETS = ["HOOK", "PROBLEM", "SOLUSI", "CTA", "OUTRO", "B-ROLL", "TESTIMONI"];

const SCENE_TYPE_COLORS: Record<string, string> = {
  HOOK:      "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  PROBLEM:   "bg-red-500/15 text-red-700 dark:text-red-300",
  SOLUSI:    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  CTA:       "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  OUTRO:     "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  "B-ROLL":  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  TESTIMONI: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export default function BriefDetailPage() {
  const { id: orgId, teamId, briefId } = useParams();
  const base = `/organizations/${orgId}/teams/${teamId}/briefs`;
  const router = useRouter();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingHeader, setSavingHeader] = useState(false);
  const [addingScene, setAddingScene] = useState(false);
  const [brands, setBrands] = useState<BrandLabel[]>([]);
  const [newBrandName, setNewBrandName] = useState("");

  // Local editing state for header fields (save on blur).
  const [form, setForm] = useState({
    title: "", brand: "", shoot_date: "", shoot_time: "",
    video_duration: "", video_format: "", platforms: [] as string[],
    reference_url: "", final_url: "",
    status: "draft",
  });

  const fetchBrief = useCallback(async () => {
    try {
      const res = await api.get(`${base}/${briefId}`);
      setBrief(res.data);
      setForm({
        title: res.data.title || "",
        brand: res.data.brand || "",
        shoot_date: res.data.shoot_date || "",
        shoot_time: res.data.shoot_time || "",
        video_duration: res.data.video_duration || "",
        video_format: res.data.video_format || "",
        platforms: res.data.platforms || [],
        reference_url: res.data.reference_url || "",
        final_url: res.data.final_url || "",
        status: res.data.status || "draft",
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal memuat brief");
    } finally {
      setLoading(false);
    }
  }, [teamId, briefId, base]);

  useEffect(() => {
    if (briefId) fetchBrief();
  }, [briefId, fetchBrief]);

  const fetchBrands = useCallback(async () => {
    try {
      const res = await api.get(`${base}/_brands`);
      setBrands(res.data || []);
    } catch {/* silent */}
  }, [base]);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  const assignBrand = async (brandId: string | null) => {
    try {
      const res = await api.patch(`${base}/${briefId}`, { brand_id: brandId });
      setBrief(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal mengubah brand");
    }
  };

  const createBrandInline = async () => {
    const name = newBrandName.trim();
    if (!name) return;
    try {
      const res = await api.post(`${base}/_brands`, { name });
      const created: BrandLabel = res.data;
      setBrands((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewBrandName("");
      assignBrand(created.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menambah brand");
    }
  };

  const saveHeader = async (patch: Partial<typeof form>) => {
    setSavingHeader(true);
    try {
      // Send only the diff fields the caller specified — fewer accidental wipes.
      const body: any = {};
      for (const key of Object.keys(patch) as (keyof typeof form)[]) {
        body[key] = patch[key] === "" ? null : patch[key];
      }
      const res = await api.patch(`${base}/${briefId}`, body);
      setBrief(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menyimpan");
    } finally {
      setSavingHeader(false);
    }
  };

  const togglePlatform = (p: string) => {
    const next = form.platforms.includes(p)
      ? form.platforms.filter((x) => x !== p)
      : [...form.platforms, p];
    setForm({ ...form, platforms: next });
    saveHeader({ platforms: next });
  };

  const addScene = async () => {
    setAddingScene(true);
    try {
      const res = await api.post(`${base}/${briefId}/scenes`, {});
      setBrief((prev) => prev ? { ...prev, scenes: [...prev.scenes, res.data] } : prev);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menambah scene");
    } finally {
      setAddingScene(false);
    }
  };

  const updateScene = async (sceneId: string, patch: Partial<Scene>) => {
    // Optimistic — pasang dulu di UI sambil ngirim.
    setBrief((prev) => prev
      ? { ...prev, scenes: prev.scenes.map((s) => s.id === sceneId ? { ...s, ...patch } : s) }
      : prev);
    try {
      await api.patch(`${base}/${briefId}/scenes/${sceneId}`, patch);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menyimpan scene");
      fetchBrief(); // refetch to rollback
    }
  };

  const deleteScene = async (sceneId: string) => {
    if (!confirm("Hapus scene ini?")) return;
    setBrief((prev) => prev
      ? { ...prev, scenes: prev.scenes.filter((s) => s.id !== sceneId) }
      : prev);
    try {
      await api.delete(`${base}/${briefId}/scenes/${sceneId}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menghapus");
      fetchBrief();
    }
  };

  const deleteBrief = async () => {
    if (!brief) return;
    if (!confirm(`Hapus brief "${brief.title}"? Semua scene ikut terhapus.`)) return;
    try {
      await api.delete(`${base}/${briefId}`);
      toast.success("Brief dihapus");
      router.push(`/org/${orgId}/team/${teamId}/briefs`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menghapus brief");
    }
  };

  // Approval workflow
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const approveBrief = async () => {
    if (!brief) return;
    const note = prompt("Catatan approval (opsional):") ?? null;
    if (note === null) return;  // cancel
    setApproving(true);
    try {
      const res = await api.post(`${base}/${briefId}/approve`, { note: note || null });
      setBrief(res.data);
      setForm((f) => ({ ...f, status: res.data.status }));
      toast.success("Brief disetujui");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menyetujui");
    } finally {
      setApproving(false);
    }
  };

  const submitReject = async () => {
    if (!brief) return;
    if (!rejectReason.trim()) { toast.error("Alasan reject wajib"); return; }
    setRejecting(true);
    try {
      const res = await api.post(`${base}/${briefId}/reject`, { reason: rejectReason.trim() });
      setBrief(res.data);
      setForm((f) => ({ ...f, status: res.data.status }));
      setRejectOpen(false);
      setRejectReason("");
      toast.success("Brief ditolak — status balik ke draft");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menolak");
    } finally {
      setRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!brief) return null;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      <TeamNav orgId={orgId as string} teamId={teamId as string} />
      {/* Wider than other team pages — table view butuh ruang biar kolom
          (Scene/Script/Footage/Text-on-Video/Talent) gak terlalu sempit. */}
      <div className="flex-1 px-4 md:px-6 py-8 w-full space-y-6">
      {/* Header / breadcrumb */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          href={`/org/${orgId}/team/${teamId}/briefs`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Semua brief
        </Link>
        <div className="flex items-center gap-2">
          {savingHeader && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          <select
            value={form.status}
            onChange={(e) => { setForm({ ...form, status: e.target.value }); saveHeader({ status: e.target.value }); }}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold border outline-none cursor-pointer",
              STATUS_OPTIONS.find((s) => s.value === form.status)?.color || "bg-secondary text-foreground",
              "border-border"
            )}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={deleteBrief}
            title="Hapus brief"
            className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Title — large editable */}
      <div className="flex items-center gap-3">
        <Clapperboard className="w-7 h-7 text-primary shrink-0" />
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          onBlur={() => { if (form.title !== brief.title) saveHeader({ title: form.title }); }}
          placeholder="Judul brief…"
          className="flex-1 text-2xl font-bold tracking-tight bg-transparent border-0 outline-none focus:bg-secondary/30 focus:px-2 focus:py-1 focus:rounded-lg transition-all"
        />
      </div>

      {/* Creator banner — siapa yang bikin brief ini */}
      {brief.creator && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-bold overflow-hidden">
            {brief.creator.avatar_url
              ? <img src={brief.creator.avatar_url} alt="" className="w-full h-full object-cover" />
              : (brief.creator.name || "?").charAt(0)}
          </span>
          <span>Dibuat oleh <strong className="text-foreground">{brief.creator.name}</strong>
            {brief.created_at && (
              <> · {new Date(brief.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</>
            )}
          </span>
        </div>
      )}

      {/* Approval banner — render kalau status review / approved / atau rejected (status balik draft + ada reason) */}
      {(brief.status === "review" || brief.status === "approved" || brief.rejection_reason) && (
        <div className={cn(
          "rounded-2xl border-2 p-4 space-y-3",
          brief.status === "approved"
            ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
            : brief.rejection_reason
              ? "border-destructive bg-destructive/5"
              : "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20"
        )}>
          {brief.status === "approved" && brief.approved_by ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-emerald-900 dark:text-emerald-100">
                    ✓ Disetujui oleh {brief.approved_by.name}
                  </p>
                  {brief.approved_at && (
                    <p className="text-[10px] text-emerald-800/80 dark:text-emerald-200/80">
                      {new Date(brief.approved_at).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
              {brief.approval_note && (
                <div className="text-xs text-foreground pl-10 italic border-l-2 border-emerald-500/40 ml-3">
                  "{brief.approval_note}"
                </div>
              )}
            </div>
          ) : brief.rejection_reason && brief.rejected_by ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-destructive flex items-center justify-center">
                  <XCircle className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-foreground">
                    Ditolak oleh {brief.rejected_by.name}
                  </p>
                  {brief.rejected_at && (
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(brief.rejected_at).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-xs text-foreground pl-10 italic border-l-2 border-destructive/40 ml-3">
                "{brief.rejection_reason}"
              </div>
              {brief.status === "draft" && (
                <p className="text-[10px] text-muted-foreground pl-10">
                  ⓘ Status sudah balik ke <strong>Draft</strong> — perbaiki, lalu submit ulang ke Review.
                </p>
              )}
            </div>
          ) : null}

          {/* Action buttons — muncul kalau status review (siapapun di tim boleh approve/reject) */}
          {brief.status === "review" && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-current/10">
              <p className="text-xs text-muted-foreground flex-1">
                Brief menunggu approval. Semua anggota tim bisa menyetujui atau menolak.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setRejectOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs font-bold hover:bg-destructive/20 transition-all"
                >
                  <XCircle className="w-3.5 h-3.5" /> Tolak
                </button>
                <button
                  onClick={approveBrief}
                  disabled={approving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all"
                >
                  {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Setujui
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 rounded-2xl border border-border bg-secondary/20">
        {/* Brand selector — share label dari design briefs.
            User bisa pilih dari list ATAU ketik nama baru auto-create. */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1">
            <Tag className="w-3 h-3" /> Brand
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={brief.brand_id || ""}
              onChange={(e) => assignBrand(e.target.value || null)}
              className="px-3 py-2 bg-card border border-border rounded-xl text-sm outline-none focus:border-primary"
            >
              <option value="">— Tanpa brand —</option>
              {brands.map((br) => (
                <option key={br.id} value={br.id}>{br.name}</option>
              ))}
            </select>
            {brief.brand_label?.color && (
              <span
                className="inline-block w-3 h-3 rounded-full border border-border"
                style={{ backgroundColor: brief.brand_label.color }}
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 pt-1">
            <input
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createBrandInline(); } }}
              placeholder="+ Brand baru…"
              className="flex-1 px-2.5 py-1.5 text-xs bg-secondary/30 border border-dashed border-border rounded-lg outline-none focus:border-primary focus:bg-card"
            />
            <button
              type="button"
              onClick={createBrandInline}
              disabled={!newBrandName.trim()}
              className="p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-30 hover:shadow-md transition-all"
              title="Tambah brand & tautkan"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
        <Field
          label="Tanggal Syuting"
          type="date"
          value={form.shoot_date}
          onChange={(v) => setForm({ ...form, shoot_date: v })}
          onBlur={() => { if (form.shoot_date !== (brief.shoot_date || "")) saveHeader({ shoot_date: form.shoot_date }); }}
        />
        <Field
          label="Jam"
          value={form.shoot_time}
          placeholder="06.00 - 15.00 WIB"
          onChange={(v) => setForm({ ...form, shoot_time: v })}
          onBlur={() => { if (form.shoot_time !== (brief.shoot_time || "")) saveHeader({ shoot_time: form.shoot_time }); }}
        />
        <Field
          label="Durasi Video"
          value={form.video_duration}
          placeholder="30-60 detik"
          onChange={(v) => setForm({ ...form, video_duration: v })}
          onBlur={() => { if (form.video_duration !== (brief.video_duration || "")) saveHeader({ video_duration: form.video_duration }); }}
        />
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Format</label>
          <div className="flex flex-wrap gap-1.5">
            {FORMAT_PRESETS.map((f) => {
              const active = form.video_format === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    const next = active ? "" : f;
                    setForm({ ...form, video_format: next });
                    saveHeader({ video_format: next });
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all",
                    active
                      ? "bg-primary/10 text-primary border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary/40"
                  )}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>
        <Field
          label="Link Referensi"
          type="url"
          value={form.reference_url}
          placeholder="https://… (mood/competitor/inspirasi)"
          onChange={(v) => setForm({ ...form, reference_url: v })}
          onBlur={() => { if (form.reference_url !== (brief.reference_url || "")) saveHeader({ reference_url: form.reference_url }); }}
        />
        <Field
          label="Link Hasil Jadi"
          type="url"
          value={form.final_url}
          placeholder="https://… (video published)"
          onChange={(v) => setForm({ ...form, final_url: v })}
          onBlur={() => { if (form.final_url !== (brief.final_url || "")) saveHeader({ final_url: form.final_url }); }}
        />
        <div className="sm:col-span-2 lg:col-span-3 space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Platform</label>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORM_PRESETS.map((p) => {
              const active = form.platforms.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all",
                    active
                      ? "bg-primary/10 text-primary border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary/40"
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Scene table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" /> Storyboard
            <span className="text-xs font-normal text-muted-foreground">({brief.scenes.length})</span>
          </h2>
          <button
            onClick={addScene}
            disabled={addingScene}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 hover:shadow-md transition-all"
          >
            {addingScene ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Tambah Scene
          </button>
        </div>

        {brief.scenes.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-2xl text-sm text-muted-foreground">
            Belum ada scene. Klik "Tambah Scene" untuk mulai menyusun storyboard.
          </div>
        ) : (
          <div className="overflow-x-auto border border-border rounded-2xl bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30 border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-12">No</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-40">Scene / Waktu</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Script / VO</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Footage</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Text on Video</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-36">Talent</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {brief.scenes.map((scene, idx) => (
                  <SceneRow
                    key={scene.id}
                    scene={scene}
                    index={idx + 1}
                    onChange={(patch) => updateScene(scene.id, patch)}
                    onDelete={() => deleteScene(scene.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>

      {/* Reject modal */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !rejecting && setRejectOpen(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" />
              <h3 className="font-extrabold text-base">Tolak Brief</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Alasan akan disimpan + status balik ke <strong>Draft</strong>. Pembuat brief bisa lihat alasan dan perbaiki.
            </p>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Misal: hook kurang catchy, perlu CTA lebih jelas di scene 4..."
              rows={5}
              className="w-full p-3 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-destructive/40"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => { setRejectOpen(false); setRejectReason(""); }}
                disabled={rejecting}
                className="px-4 py-2 rounded-lg text-xs font-bold text-muted-foreground hover:bg-secondary transition-all"
              >
                Batal
              </button>
              <button
                onClick={submitReject}
                disabled={rejecting || !rejectReason.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-white text-xs font-bold disabled:opacity-50 hover:opacity-90 transition-all"
              >
                {rejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                Tolak Brief
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Field ----------

function Field({
  label, value, onChange, onBlur, placeholder, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-card border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
      />
    </div>
  );
}

// ---------- Scene row ----------

function SceneRow({
  scene, index, onChange, onDelete,
}: {
  scene: Scene;
  index: number;
  onChange: (patch: Partial<Scene>) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState(scene);
  useEffect(() => { setLocal(scene); }, [scene.id, scene.position]);

  const commit = (patch: Partial<Scene>) => {
    if (patch[Object.keys(patch)[0] as keyof Scene] !== scene[Object.keys(patch)[0] as keyof Scene]) {
      onChange(patch);
    }
  };

  const typeUpper = (local.scene_type || "").toUpperCase();
  const badgeCls = SCENE_TYPE_COLORS[typeUpper] || "bg-secondary text-muted-foreground";

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-secondary/10 align-top">
      <td className="px-3 py-3 text-xs font-bold text-muted-foreground">{index}</td>

      {/* Scene meta column — type badge selalu tampil, 3 sub-field (waktu /
          lokasi / jam) bersifat opsional: yang sudah terisi tampak, yang
          kosong cuma jadi affordance kecil "+ tambah" sehingga user gak
          merasa wajib isi 3. */}
      <td className="px-3 py-3 space-y-1.5">
        <SceneTypeInput
          value={local.scene_type || ""}
          badgeCls={badgeCls}
          onChange={(v) => setLocal({ ...local, scene_type: v })}
          // Pakai nv kalau preset di-klik (nilai baru langsung dilewatkan),
          // else fallback ke local.scene_type (buat blur input custom).
          onBlur={(nv) => commit({ scene_type: nv !== undefined ? nv : local.scene_type })}
        />
        <OptionalCell
          icon="⏱"
          value={local.time_range || ""}
          placeholder="waktu (mis. 0-3 dtk)"
          onChange={(v) => setLocal({ ...local, time_range: v })}
          onBlur={() => commit({ time_range: local.time_range })}
        />
        <OptionalCell
          icon="📍"
          value={local.location || ""}
          placeholder="lokasi"
          onChange={(v) => setLocal({ ...local, location: v })}
          onBlur={() => commit({ location: local.location })}
        />
        <OptionalCell
          icon="🕒"
          value={local.shoot_time || ""}
          placeholder="jam syuting"
          onChange={(v) => setLocal({ ...local, shoot_time: v })}
          onBlur={() => commit({ shoot_time: local.shoot_time })}
        />
      </td>

      <td className="px-3 py-3">
        <CellTextarea
          value={local.script_vo || ""}
          placeholder="Tulis script / VO…"
          onChange={(v) => setLocal({ ...local, script_vo: v })}
          onBlur={() => commit({ script_vo: local.script_vo })}
        />
      </td>
      <td className="px-3 py-3">
        <CellTextarea
          value={local.footage || ""}
          placeholder="Camera direction / shot list…"
          onChange={(v) => setLocal({ ...local, footage: v })}
          onBlur={() => commit({ footage: local.footage })}
        />
      </td>
      <td className="px-3 py-3">
        <CellTextarea
          value={local.text_on_video || ""}
          placeholder="Text overlay / caption di layar…"
          onChange={(v) => setLocal({ ...local, text_on_video: v })}
          onBlur={() => commit({ text_on_video: local.text_on_video })}
        />
      </td>
      <td className="px-3 py-3">
        <CellTextarea
          value={local.talent || ""}
          placeholder="Talent A, dst."
          onChange={(v) => setLocal({ ...local, talent: v })}
          onBlur={() => commit({ talent: local.talent })}
          rows={2}
        />
      </td>
      <td className="px-3 py-3">
        <button
          onClick={onDelete}
          title="Hapus scene"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

// Optional inline-meta cell — when empty, renders as a small ghosted hint
// with a leading icon so user can ignore it. When focused or filled, jadi
// input normal yang menyimpan saat blur. Tujuan: 3 sub-field (waktu/lokasi/
// jam) gak terlihat memaksa diisi semua.
function OptionalCell({
  value, onChange, onBlur, placeholder, icon,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  icon?: string;
}) {
  return (
    <div className="flex items-center gap-1 group/cell">
      {icon && (
        <span className={cn(
          "text-[10px] shrink-0 transition-opacity",
          value ? "opacity-70" : "opacity-30 group-hover/cell:opacity-60",
        )}>{icon}</span>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={cn(
          "flex-1 min-w-0 px-1.5 py-0.5 bg-transparent border border-transparent rounded-md text-[11px] outline-none transition-all",
          "focus:border-primary focus:bg-card",
          value ? "text-foreground" : "text-muted-foreground/50 hover:bg-secondary/30",
        )}
      />
    </div>
  );
}

function CellTextarea({
  value, onChange, onBlur, placeholder, rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-border focus:border-primary rounded-md text-xs outline-none transition-all resize-y leading-relaxed"
    />
  );
}

function SceneTypeInput({
  value, badgeCls, onChange, onBlur,
}: {
  value: string;
  badgeCls: string;
  onChange: (v: string) => void;
  // onBlur optionally menerima nilai baru — dipakai saat user klik preset,
  // supaya parent tidak baca stale local state (setLocal masih async sebelum
  // onBlur dipanggil).
  onBlur: (v?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-scene-type-pop]")) setOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" data-scene-type-pop>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-widest hover:opacity-80 transition-opacity",
          value ? badgeCls : "bg-secondary/50 text-muted-foreground border border-dashed border-border"
        )}
      >
        {value || "+ Tipe"}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-44 p-2 rounded-xl border border-border bg-card shadow-xl space-y-1">
          <div className="grid grid-cols-2 gap-1">
            {SCENE_TYPE_PRESETS.map((t) => {
              const cls = SCENE_TYPE_COLORS[t] || "bg-secondary";
              return (
                <button
                  key={t}
                  type="button"
                  // Pass t ke onBlur — kalau cuma onBlur() saja, parent akan
                  // baca local.scene_type yang masih nilai LAMA (setLocal di
                  // onChange belum di-apply React saat itu) → commit no-op,
                  // refresh page → label hilang.
                  onClick={() => { onChange(t); setOpen(false); onBlur(t); }}
                  className={cn("px-2 py-1 rounded text-[10px] font-extrabold uppercase tracking-widest", cls)}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => { onBlur(); }}
            placeholder="Custom…"
            className="w-full px-2 py-1 text-[10px] border border-border rounded outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  );
}
