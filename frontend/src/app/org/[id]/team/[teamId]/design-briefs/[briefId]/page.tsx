"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Image as ImageIcon, ChevronLeft, Loader2, Trash2, Upload, MapPin,
  Check, X, MessageCircle, Plus, Square as SquareIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import TeamNav from "@/components/team/TeamNav";
import { useAuthStore } from "@/store/useAuthStore";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface Annotation {
  id: string;
  brief_id: string;
  image_id: string | null;
  creator_id: string | null;
  creator: { id: string; name: string; avatar_url?: string } | null;
  x_pct: number;
  y_pct: number;
  w_pct?: number | null;
  h_pct?: number | null;
  content: string;
  resolved: boolean;
  created_at: string;
}

interface BriefImage {
  id: string;
  brief_id: string;
  image_url: string;
  position: number;
  created_at: string;
  annotations: Annotation[];
}

interface CustomProp { name: string; value: string }

interface Brief {
  id: string;
  team_id: string;
  title: string;
  brand: string | null;
  visual_text: string | null;
  caption: string | null;
  publish_date: string | null;
  hashtag: string | null;
  reference_url: string | null;
  final_image_url: string | null;
  custom_properties: CustomProp[];
  status: string;
  images: BriefImage[];
  annotations: Annotation[]; // union semua image annotations (legacy)
  creator: { id: string; name: string; avatar_url?: string } | null;
}

const STATUS_OPTIONS = [
  { value: "draft",      label: "Draft",       color: "bg-secondary text-muted-foreground" },
  { value: "onprogress", label: "On Progress", color: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  { value: "review",     label: "Review",      color: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  { value: "published",  label: "Published",   color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
];

export default function DesignBriefDetailPage() {
  const { id: orgId, teamId, briefId } = useParams();
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const base = `/organizations/${orgId}/teams/${teamId}/design-briefs`;
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingHeader, setSavingHeader] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: "", brand: "", visual_text: "", caption: "", publish_date: "",
    hashtag: "", reference_url: "", status: "draft",
  });

  // Annotation state — drag-to-box. pendingPin sekarang berbentuk:
  //   { x, y, w?, h? } — saat mousedown set anchor, drag bikin width/height,
  //   release minimal threshold dibawah ini dianggap pin titik (w/h undef).
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number; w?: number; h?: number } | null>(null);
  const [pendingNote, setPendingNote] = useState("");
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Custom properties draft (Notion-style add row)
  const [propDraftName, setPropDraftName] = useState("");
  const [propDraftValue, setPropDraftValue] = useState("");

  const fetchBrief = useCallback(async () => {
    try {
      const res = await api.get(`${base}/${briefId}`);
      const data = res.data;
      if (!Array.isArray(data.custom_properties)) data.custom_properties = [];
      if (!Array.isArray(data.images)) data.images = [];
      // Defensive: kalau backend lama (sebelum migration jalan) cuma kasih
      // final_image_url, sintesis 1 image biar UI tetap render.
      if (data.images.length === 0 && data.final_image_url) {
        data.images = [{
          id: `__legacy__${data.id}`,
          brief_id: data.id,
          image_url: data.final_image_url,
          position: 0,
          created_at: data.created_at,
          annotations: data.annotations || [],
        }];
      }
      setBrief(data);
      setForm({
        title: data.title || "",
        brand: data.brand || "",
        visual_text: data.visual_text || "",
        caption: data.caption || "",
        publish_date: data.publish_date || "",
        hashtag: data.hashtag || "",
        reference_url: data.reference_url || "",
        status: data.status || "draft",
      });
      setActiveImageId((cur) => {
        if (cur && data.images.some((i: BriefImage) => i.id === cur)) return cur;
        return data.images[0]?.id || null;
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal memuat brief");
    } finally {
      setLoading(false);
    }
  }, [base, briefId]);

  useEffect(() => {
    if (briefId) fetchBrief();
  }, [briefId, fetchBrief]);

  const saveHeader = async (patch: Partial<typeof form>) => {
    setSavingHeader(true);
    try {
      const body: any = {};
      for (const k of Object.keys(patch) as (keyof typeof form)[]) {
        body[k] = patch[k] === "" ? null : patch[k];
      }
      const res = await api.patch(`${base}/${briefId}`, body);
      setBrief(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menyimpan");
    } finally {
      setSavingHeader(false);
    }
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // POST /images — append ke carousel (tidak replace yang sudah ada).
      const res = await api.post(`${base}/${briefId}/images`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newImg: BriefImage = { ...res.data, annotations: res.data.annotations || [] };
      setBrief((prev) => prev ? {
        ...prev,
        images: [...prev.images, newImg],
        final_image_url: prev.final_image_url || newImg.image_url,
      } : prev);
      setActiveImageId(newImg.id);
      toast.success("Gambar ter-upload");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal upload gambar");
    } finally {
      setUploading(false);
    }
  };

  const deleteImage = async (imageId: string) => {
    if (!brief) return;
    const img = brief.images.find((i) => i.id === imageId);
    if (!img) return;
    const openCount = img.annotations.filter((a) => !a.resolved).length;
    const warn = openCount > 0
      ? `Gambar ini punya ${openCount} revisi aktif. Hapus tetap?`
      : "Hapus gambar ini dari brief?";
    if (!confirm(warn)) return;
    try {
      await api.delete(`${base}/${briefId}/images/${imageId}`);
      setBrief((prev) => {
        if (!prev) return prev;
        const nextImages = prev.images.filter((i) => i.id !== imageId);
        return {
          ...prev,
          images: nextImages,
          final_image_url: nextImages[0]?.image_url || null,
        };
      });
      // Pindahkan active ke sibling kalau yang dihapus adalah yang aktif.
      setActiveImageId((cur) => {
        if (cur !== imageId) return cur;
        const idx = brief.images.findIndex((i) => i.id === imageId);
        const nextImages = brief.images.filter((i) => i.id !== imageId);
        return nextImages[Math.min(idx, nextImages.length - 1)]?.id || null;
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menghapus gambar");
    }
  };

  // ─── Drag-to-box annotation handlers ────────────────────────────────────
  const pctFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  };
  const onImageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeImageId || activeAnnotation || pendingPin) return;
    if (e.button !== 0) return;
    const { x, y } = pctFromEvent(e);
    dragStart.current = { x, y };
  };
  const onImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const { x, y } = pctFromEvent(e);
    const dx = x - dragStart.current.x;
    const dy = y - dragStart.current.y;
    // Live preview pakai pendingPin sementara — kalau drag sudah > 1.5%
    // di salah satu axis, render box, else tetap pin.
    const w = Math.abs(dx);
    const h = Math.abs(dy);
    if (w > 1.5 || h > 1.5) {
      setPendingPin({
        x: dx >= 0 ? dragStart.current.x : x,
        y: dy >= 0 ? dragStart.current.y : y,
        w,
        h,
      });
    }
  };
  const onImageMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const start = dragStart.current;
    dragStart.current = null;
    const { x, y } = pctFromEvent(e);
    const dx = x - start.x;
    const dy = y - start.y;
    const w = Math.abs(dx);
    const h = Math.abs(dy);
    // Threshold: drag < 1.5% di kedua axis dianggap pin titik.
    if (w < 1.5 && h < 1.5) {
      setPendingPin({ x: start.x, y: start.y });
    } else {
      setPendingPin({
        x: dx >= 0 ? start.x : x,
        y: dy >= 0 ? start.y : y,
        w, h,
      });
    }
    setPendingNote("");
  };

  const submitAnnotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPin || !pendingNote.trim() || !activeImageId) return;
    try {
      const payload: any = {
        image_id: activeImageId,
        x_pct: pendingPin.x,
        y_pct: pendingPin.y,
        content: pendingNote.trim(),
      };
      if (pendingPin.w !== undefined && pendingPin.h !== undefined) {
        payload.w_pct = pendingPin.w;
        payload.h_pct = pendingPin.h;
      }
      const res = await api.post(`${base}/${briefId}/annotations`, payload);
      const created: Annotation = res.data;
      setBrief((prev) => prev ? {
        ...prev,
        annotations: [...prev.annotations, created],
        images: prev.images.map((i) => i.id === activeImageId
          ? { ...i, annotations: [...i.annotations, created] }
          : i,
        ),
      } : prev);
      setPendingPin(null);
      setPendingNote("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menyimpan annotation");
    }
  };

  // ─── Custom properties ──────────────────────────────────────────────────
  const saveCustomProps = async (next: CustomProp[]) => {
    setBrief((prev) => prev ? { ...prev, custom_properties: next } : prev);
    try {
      await api.patch(`${base}/${briefId}`, { custom_properties: next });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menyimpan properti");
      fetchBrief();
    }
  };
  const addCustomProp = () => {
    if (!brief || !propDraftName.trim()) return;
    const next = [...(brief.custom_properties || []), { name: propDraftName.trim(), value: propDraftValue }];
    setPropDraftName(""); setPropDraftValue("");
    saveCustomProps(next);
  };
  const updateCustomProp = (idx: number, patch: Partial<CustomProp>) => {
    if (!brief) return;
    const next = brief.custom_properties.map((p, i) => i === idx ? { ...p, ...patch } : p);
    saveCustomProps(next);
  };
  const removeCustomProp = (idx: number) => {
    if (!brief) return;
    const next = brief.custom_properties.filter((_, i) => i !== idx);
    saveCustomProps(next);
  };

  const toggleResolved = async (a: Annotation) => {
    try {
      const res = await api.patch(`${base}/${briefId}/annotations/${a.id}`, { resolved: !a.resolved });
      const updated: Annotation = res.data;
      setBrief((prev) => prev ? {
        ...prev,
        annotations: prev.annotations.map((x) => x.id === a.id ? updated : x),
        images: prev.images.map((i) => ({
          ...i,
          annotations: i.annotations.map((x) => x.id === a.id ? updated : x),
        })),
      } : prev);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal mengubah status");
    }
  };

  const deleteAnnotation = async (id: string) => {
    if (!confirm("Hapus annotation ini?")) return;
    try {
      await api.delete(`${base}/${briefId}/annotations/${id}`);
      setBrief((prev) => prev ? {
        ...prev,
        annotations: prev.annotations.filter((a) => a.id !== id),
        images: prev.images.map((i) => ({
          ...i,
          annotations: i.annotations.filter((a) => a.id !== id),
        })),
      } : prev);
      if (activeAnnotation === id) setActiveAnnotation(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menghapus");
    }
  };

  const deleteBrief = async () => {
    if (!brief) return;
    if (!confirm(`Hapus brief "${brief.title}"?`)) return;
    try {
      await api.delete(`${base}/${briefId}`);
      toast.success("Brief dihapus");
      router.push(`/org/${orgId}/team/${teamId}/design-briefs`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menghapus brief");
    }
  };

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
  if (!brief) return null;

  // Annotations sekarang per-image (carousel). Aktif → filter ke gambar aktif.
  const activeImage = brief.images.find((i) => i.id === activeImageId) || brief.images[0] || null;
  const imageAnnotations = activeImage?.annotations || [];
  const openAnnotations = imageAnnotations.filter((a) => !a.resolved);
  const resolvedAnnotations = imageAnnotations.filter((a) => a.resolved);
  const active = brief.annotations.find((a) => a.id === activeAnnotation) || null;
  const isCreator = !!(brief.creator?.id && currentUser?.id && String(brief.creator.id) === String(currentUser.id));

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      <TeamNav orgId={orgId as string} teamId={teamId as string} />
      <div className="flex-1 px-4 md:px-6 py-8 w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Link href={`/org/${orgId}/team/${teamId}/design-briefs`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-3.5 h-3.5" /> Semua brief design
          </Link>
          <div className="flex items-center gap-2">
            {savingHeader && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            <select
              value={form.status}
              onChange={(e) => { setForm({ ...form, status: e.target.value }); saveHeader({ status: e.target.value }); }}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold border border-border outline-none cursor-pointer",
                STATUS_OPTIONS.find((s) => s.value === form.status)?.color || "bg-secondary text-foreground",
              )}
            >
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button onClick={deleteBrief} title="Hapus brief"
              className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ImageIcon className="w-7 h-7 text-primary shrink-0" />
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            onBlur={() => { if (form.title !== brief.title) saveHeader({ title: form.title }); }}
            placeholder="Judul brief…"
            className="flex-1 text-2xl font-bold tracking-tight bg-transparent border-0 outline-none focus:bg-secondary/30 focus:px-2 focus:py-1 focus:rounded-lg transition-all"
          />
        </div>

        {/* 2-column: form (left) + image carousel (right). Form sengaja
            dilebarin ke 560px supaya caption/visual text gak cramped. */}
        <div className="grid lg:grid-cols-[560px_1fr] gap-6">
          {/* Form panel */}
          <div className="space-y-3 p-4 rounded-2xl border border-border bg-secondary/20 h-fit lg:sticky lg:top-4">
            <Field
              label="Brand"
              value={form.brand}
              placeholder="mis. Gokuah / Klien X"
              onChange={(v) => setForm({ ...form, brand: v })}
              onBlur={() => { if (form.brand !== (brief.brand || "")) saveHeader({ brand: form.brand }); }}
            />
            <Field
              label="Visual Text"
              value={form.visual_text}
              placeholder="Teks yang muncul di artwork (mis. 'DISKON 15%')"
              onChange={(v) => setForm({ ...form, visual_text: v })}
              onBlur={() => { if (form.visual_text !== (brief.visual_text || "")) saveHeader({ visual_text: form.visual_text }); }}
              textarea
            />
            <Field
              label="Caption Posting"
              value={form.caption}
              placeholder="Caption lengkap untuk posting…"
              onChange={(v) => setForm({ ...form, caption: v })}
              onBlur={() => { if (form.caption !== (brief.caption || "")) saveHeader({ caption: form.caption }); }}
              textarea
              rows={4}
            />
            <Field
              label="Tanggal Publish"
              type="date"
              value={form.publish_date}
              onChange={(v) => setForm({ ...form, publish_date: v })}
              onBlur={() => { if (form.publish_date !== (brief.publish_date || "")) saveHeader({ publish_date: form.publish_date }); }}
            />
            <Field
              label="Hashtag"
              value={form.hashtag}
              placeholder="#promo #lebaran"
              onChange={(v) => setForm({ ...form, hashtag: v })}
              onBlur={() => { if (form.hashtag !== (brief.hashtag || "")) saveHeader({ hashtag: form.hashtag }); }}
            />
            <Field
              label="Link Referensi"
              type="url"
              value={form.reference_url}
              placeholder="https://…"
              onChange={(v) => setForm({ ...form, reference_url: v })}
              onBlur={() => { if (form.reference_url !== (brief.reference_url || "")) saveHeader({ reference_url: form.reference_url }); }}
            />

            {/* Custom properties — Notion-style ad-hoc field rows */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Properti Tambahan</label>
              {brief.custom_properties.length > 0 && (
                <div className="space-y-1.5">
                  {brief.custom_properties.map((p, i) => (
                    <div key={i} className="group flex items-center gap-1">
                      <input
                        value={p.name}
                        onChange={(e) => updateCustomProp(i, { name: e.target.value })}
                        onBlur={() => { if (!p.name.trim()) removeCustomProp(i); }}
                        placeholder="Nama"
                        className="w-28 px-2 py-1.5 text-[11px] font-bold bg-card border border-border rounded-lg outline-none focus:border-primary"
                      />
                      <input
                        value={p.value}
                        onChange={(e) => updateCustomProp(i, { value: e.target.value })}
                        placeholder="Nilai"
                        className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-card border border-border rounded-lg outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => removeCustomProp(i)}
                        title="Hapus"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Add row */}
              <form
                onSubmit={(e) => { e.preventDefault(); addCustomProp(); }}
                className="flex items-center gap-1"
              >
                <input
                  value={propDraftName}
                  onChange={(e) => setPropDraftName(e.target.value)}
                  placeholder="Nama properti"
                  className="w-28 px-2 py-1.5 text-[11px] font-bold bg-secondary/30 border border-dashed border-border rounded-lg outline-none focus:border-primary focus:bg-card"
                />
                <input
                  value={propDraftValue}
                  onChange={(e) => setPropDraftValue(e.target.value)}
                  placeholder="Nilai"
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-secondary/30 border border-dashed border-border rounded-lg outline-none focus:border-primary focus:bg-card"
                />
                <button
                  type="submit"
                  disabled={!propDraftName.trim()}
                  title="Tambah"
                  className="p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-30 hover:shadow-md transition-all"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </form>
            </div>
          </div>

          {/* Image carousel + annotation panel */}
          <div className="space-y-3">
            {brief.images.length > 0 && activeImage ? (
              <>
                {/* Thumbnail strip — horizontal scroll. Active highlighted. */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                  {brief.images.map((img, idx) => {
                    const openCount = img.annotations.filter((a) => !a.resolved).length;
                    const isActive = img.id === activeImageId;
                    return (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => { setActiveImageId(img.id); setActiveAnnotation(null); setPendingPin(null); }}
                        className={cn(
                          "group relative shrink-0 w-20 h-20 rounded-xl border-2 overflow-hidden transition-all",
                          isActive
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border hover:border-primary/40 opacity-80 hover:opacity-100",
                        )}
                        title={`Gambar ${idx + 1}`}
                      >
                        <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                        <span className={cn(
                          "absolute top-0.5 left-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white ring-1 ring-white",
                          isActive ? "bg-primary" : "bg-foreground/60",
                        )}>{idx + 1}</span>
                        {openCount > 0 && (
                          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-extrabold flex items-center justify-center ring-1 ring-white">
                            {openCount}
                          </span>
                        )}
                        {isCreator && (
                          <span
                            role="button"
                            onClick={(e) => { e.stopPropagation(); deleteImage(img.id); }}
                            title="Hapus gambar"
                            className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded bg-card/90 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            <Trash2 className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <label className="shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-secondary/30 cursor-pointer flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-all">
                    {uploading
                      ? <Loader2 className="w-5 h-5 animate-spin" />
                      : <><Plus className="w-5 h-5" /><span className="text-[9px] font-bold mt-1">Tambah</span></>
                    }
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadImage(f); e.currentTarget.value = ""; } }}
                    />
                  </label>
                </div>

                {/* Main canvas (active image) */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div
                    key={activeImage.id}
                    className="relative cursor-crosshair select-none bg-secondary/40 flex items-center justify-center"
                    style={{ maxHeight: "min(70vh, 720px)" }}
                    onMouseDown={onImageMouseDown}
                    onMouseMove={onImageMouseMove}
                    onMouseUp={onImageMouseUp}
                    onMouseLeave={() => { dragStart.current = null; }}
                  >
                    <img
                      ref={imgRef}
                      src={activeImage.image_url}
                      alt={`${brief.title} #${(brief.images.findIndex((i) => i.id === activeImage.id) + 1)}`}
                      className="block max-w-full object-contain"
                      style={{ maxHeight: "min(70vh, 720px)" }}
                      draggable={false}
                    />
                    {imageAnnotations.map((a, idx) => {
                      const isBox = a.w_pct != null && a.h_pct != null && (Number(a.w_pct) > 0 || Number(a.h_pct) > 0);
                      if (isBox) {
                        return (
                          <button
                            key={a.id}
                            onClick={(e) => { e.stopPropagation(); setActiveAnnotation(a.id === activeAnnotation ? null : a.id); }}
                            style={{
                              left: `${a.x_pct}%`,
                              top: `${a.y_pct}%`,
                              width: `${a.w_pct}%`,
                              height: `${a.h_pct}%`,
                            }}
                            className={cn(
                              "absolute border-2 rounded-md transition-all hover:bg-rose-500/10",
                              a.resolved ? "border-emerald-500 bg-emerald-500/5" : "border-rose-500 bg-rose-500/5",
                              activeAnnotation === a.id && "ring-2 ring-offset-1",
                              activeAnnotation === a.id && (a.resolved ? "ring-emerald-500" : "ring-rose-500"),
                            )}
                            title={a.content}
                          >
                            <span className={cn(
                              "absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white shadow ring-2 ring-white",
                              a.resolved ? "bg-emerald-500" : "bg-rose-500",
                            )}>{idx + 1}</span>
                          </button>
                        );
                      }
                      return (
                        <button
                          key={a.id}
                          onClick={(e) => { e.stopPropagation(); setActiveAnnotation(a.id === activeAnnotation ? null : a.id); }}
                          style={{ left: `${a.x_pct}%`, top: `${a.y_pct}%` }}
                          className={cn(
                            "absolute -translate-x-1/2 -translate-y-full w-7 h-7 rounded-full rounded-bl-none flex items-center justify-center text-[10px] font-extrabold text-white shadow-lg ring-2 ring-white transition-transform hover:scale-110",
                            a.resolved ? "bg-emerald-500" : "bg-rose-500",
                            activeAnnotation === a.id && "scale-125",
                          )}
                          title={a.content}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                    {/* Pending pin/box preview */}
                    {pendingPin && (
                      pendingPin.w !== undefined && pendingPin.h !== undefined ? (
                        <div
                          style={{
                            left: `${pendingPin.x}%`,
                            top: `${pendingPin.y}%`,
                            width: `${pendingPin.w}%`,
                            height: `${pendingPin.h}%`,
                          }}
                          className="absolute border-2 border-primary border-dashed bg-primary/10 rounded-md animate-pulse pointer-events-none"
                        />
                      ) : (
                        <div
                          style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%` }}
                          className="absolute -translate-x-1/2 -translate-y-full w-7 h-7 rounded-full rounded-bl-none flex items-center justify-center bg-primary text-white shadow-lg ring-2 ring-white animate-pulse pointer-events-none"
                        >
                          <MapPin className="w-3 h-3" />
                        </div>
                      )
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 p-3 border-t border-border text-[11px] text-muted-foreground">
                    <span>
                      Gambar <strong>{(brief.images.findIndex((i) => i.id === activeImage.id) + 1)}/{brief.images.length}</strong>
                      <span className="mx-2 opacity-50">·</span>
                      <strong>Klik</strong> = pin titik · <strong>Drag</strong> = kotak revisi area.
                    </span>
                  </div>
                </div>

                {/* Pending-pin compose box */}
                {pendingPin && (
                  <form onSubmit={submitAnnotation} className="p-3 rounded-2xl border-2 border-primary border-dashed bg-primary/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary inline-flex items-center gap-1.5">
                        {pendingPin.w !== undefined ? <><SquareIcon className="w-3 h-3" />Kotak baru</> : <><MapPin className="w-3 h-3" />Pin baru</>}
                        <span className="opacity-70">
                          ({pendingPin.x.toFixed(1)}%, {pendingPin.y.toFixed(1)}%)
                        </span>
                      </span>
                      <button type="button" onClick={() => { setPendingPin(null); setPendingNote(""); }}
                        className="p-1 rounded text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <textarea
                      autoFocus
                      value={pendingNote}
                      onChange={(e) => setPendingNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitAnnotation(e as any); }}
                      placeholder="Tulis revisi… (Ctrl/Cmd+Enter untuk simpan)"
                      rows={2}
                      className="w-full px-3 py-2 text-xs bg-card border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={!pendingNote.trim()}
                        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
                      >
                        Simpan
                      </button>
                    </div>
                  </form>
                )}

                {/* Annotation list (untuk gambar aktif saja) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Revisi gambar #{(brief.images.findIndex((i) => i.id === activeImage.id) + 1)} ({openAnnotations.length} aktif, {resolvedAnnotations.length} selesai)
                    </h3>
                  </div>
                  {imageAnnotations.length === 0 ? (
                    <p className="text-[11px] italic text-muted-foreground p-3 border border-dashed border-border rounded-xl">
                      Belum ada revisi untuk gambar ini. Klik di gambar untuk mulai memberi catatan.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {imageAnnotations.map((a, idx) => {
                        const isMine = currentUser?.id && a.creator?.id === currentUser.id;
                        return (
                          <div
                            key={a.id}
                            onClick={() => setActiveAnnotation(a.id === activeAnnotation ? null : a.id)}
                            className={cn(
                              "group p-2.5 rounded-xl border cursor-pointer transition-all",
                              activeAnnotation === a.id
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "border-border bg-card hover:border-primary/30",
                              a.resolved && "opacity-60",
                            )}
                          >
                            <div className="flex items-start gap-2.5">
                              <span className={cn(
                                "shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white",
                                a.resolved ? "bg-emerald-500" : "bg-rose-500",
                              )}>
                                {idx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                  <span className="font-bold text-foreground">{a.creator?.name || "Anon"}</span>
                                  <span>·</span>
                                  <span>{(() => { try { return formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: idLocale }); } catch { return ""; } })()}</span>
                                  {a.resolved && <span className="ml-1 inline-flex items-center gap-0.5 text-emerald-600 font-bold"><Check className="w-3 h-3" />selesai</span>}
                                </div>
                                <p className="text-xs mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{a.content}</p>
                              </div>
                              <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleResolved(a); }}
                                  title={a.resolved ? "Batalkan resolve" : "Tandai selesai"}
                                  className="p-1 rounded hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600 transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                {isMine && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); deleteAnnotation(a.id); }}
                                    title="Hapus"
                                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <label className="block aspect-video rounded-2xl border-2 border-dashed border-border bg-secondary/20 hover:border-primary/40 hover:bg-secondary/30 transition-all cursor-pointer flex items-center justify-center">
                <div className="text-center space-y-3 p-8">
                  {uploading ? (
                    <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
                  ) : (
                    <Upload className="w-10 h-10 text-muted-foreground mx-auto" />
                  )}
                  <div>
                    <p className="font-bold text-sm">Upload gambar pertama</p>
                    <p className="text-xs text-muted-foreground mt-1">Bisa upload banyak gambar (carousel). Tiap gambar punya revisi sendiri.</p>
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadImage(f); e.currentTarget.value = ""; } }}
                />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Active annotation drawer (mobile-friendly). Posisi sengaja
          digeser ke atas chat widget bubble (fixed bottom-8 right-8,
          w-16 h-16) supaya gak ke-overlap. */}
      {active && (
        <div className="fixed bottom-28 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-2xl p-4 space-y-2 animate-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold">Revisi #{imageAnnotations.findIndex((x) => x.id === active.id) + 1}</span>
            </div>
            <button onClick={() => setActiveAnnotation(null)} className="p-1 rounded text-muted-foreground hover:bg-secondary">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs whitespace-pre-wrap break-words">{active.content}</p>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border">
            <span>{active.creator?.name || "Anon"}</span>
            <button
              onClick={() => toggleResolved(active)}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold transition-colors",
                active.resolved ? "text-emerald-600 hover:bg-emerald-500/10" : "text-muted-foreground hover:bg-secondary",
              )}
            >
              <Check className="w-3 h-3" /> {active.resolved ? "Selesai" : "Tandai selesai"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, onBlur, placeholder, type = "text", textarea = false, rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  type?: string;
  textarea?: boolean;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={rows}
          className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-y"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      )}
    </div>
  );
}
