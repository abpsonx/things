"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Image as ImageIcon, ChevronLeft, Loader2, Trash2, Upload, MapPin,
  Check, X, MessageCircle, Plus, Square as SquareIcon, CalendarClock, Send,
  XCircle, ShieldCheck,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import TeamNav from "@/components/team/TeamNav";
import { MarkdownToolbar, MarkdownText } from "@/components/ui/Markdown";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
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

interface BrandLabel { id: string; name: string; color: string | null }

interface Brief {
  id: string;
  team_id: string;
  title: string;
  brand: string | null;
  brand_id: string | null;
  brand_label: BrandLabel | null;
  visual_text: string | null; // legacy — gak ditampilkan lagi
  headline: string | null;
  sub_headline: string | null;
  body_text: string | null;
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
  // Approval workflow
  approved_by?: { id: string; name: string; avatar_url?: string } | null;
  approved_at?: string | null;
  approval_note?: string | null;
  rejected_by?: { id: string; name: string; avatar_url?: string } | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
}

const STATUS_OPTIONS = [
  { value: "draft",      label: "Draft",       color: "bg-secondary text-muted-foreground" },
  { value: "onprogress", label: "On Progress", color: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  { value: "review",     label: "Review",      color: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  { value: "approved",   label: "Approved",    color: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
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
    title: "", brand: "", visual_text: "",
    headline: "", sub_headline: "", body_text: "",
    caption: "", publish_date: "",
    hashtag: "", reference_url: "", status: "draft",
  });

  // Debounce autosave Caption Posting (RichTextEditor cuma punya onChange,
  // tidak onBlur). 800ms setelah keystroke terakhir → patch ke server.
  useEffect(() => {
    if (!brief) return;
    if (form.caption === (brief.caption || "")) return;
    const t = setTimeout(() => saveHeader({ caption: form.caption }), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.caption]);

  // Annotation state — drag-to-box. pendingPin sekarang berbentuk:
  //   { x, y, w?, h? } — saat mousedown set anchor, drag bikin width/height,
  //   release minimal threshold dibawah ini dianggap pin titik (w/h undef).
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number; w?: number; h?: number } | null>(null);
  const [pendingNote, setPendingNote] = useState("");
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  // Schedule-to-IG modal state
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [igAccounts, setIgAccounts] = useState<{ id: string; username: string; display_name?: string; avatar_url?: string }[]>([]);
  const [scheduleAccountId, setScheduleAccountId] = useState<string>("");
  const [scheduleCaption, setScheduleCaption] = useState("");
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [brands, setBrands] = useState<BrandLabel[]>([]);
  const [newBrandName, setNewBrandName] = useState("");
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
        // Backfill ke headline jika data lama hanya punya visual_text.
        headline: data.headline ?? (data.visual_text || ""),
        sub_headline: data.sub_headline || "",
        body_text: data.body_text || "",
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
      // langsung tautkan brief ke brand baru
      assignBrand(created.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menambah brand");
    }
  };

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

  const uploadImage = async (file: File): Promise<BriefImage | null> => {
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
      return newImg;
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || `Gagal upload "${file.name}"`);
      return null;
    }
  };

  // Batch upload — sequential supaya posisi urut sesuai pilihan user.
  // Progress di-track via setUploading + counter biar UI bisa tampilkan
  // "Upload 2/5".
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: files.length });
    let firstUploaded: BriefImage | null = null;
    for (let i = 0; i < files.length; i++) {
      const img = await uploadImage(files[i]);
      if (img && !firstUploaded) firstUploaded = img;
      setUploadProgress({ done: i + 1, total: files.length });
    }
    if (firstUploaded) setActiveImageId(firstUploaded.id);
    setUploading(false);
    setUploadProgress(null);
    if (files.length > 1) toast.success(`${files.length} gambar ter-upload`);
    else if (firstUploaded) toast.success("Gambar ter-upload");
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

  // ─── Schedule to IG ──────────────────────────────────────────────────────
  const openScheduleModal = async () => {
    if (!brief) return;
    // Hashtag dari brief di-append ke caption (kalau ada).
    const captionBase = brief.caption ? brief.caption.replace(/<[^>]+>/g, "").trim() : "";
    const hashtagLine = brief.hashtag ? `\n\n${brief.hashtag}` : "";
    setScheduleCaption(captionBase + hashtagLine);
    // Default: 1 jam ke depan, dibulatkan ke 5 menit terdekat.
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
    // datetime-local butuh format YYYY-MM-DDTHH:mm (tanpa Z, asumsi local time).
    const pad = (n: number) => String(n).padStart(2, "0");
    setScheduleAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setScheduleOpen(true);
    // Fetch IG accounts dari workspace.
    try {
      const res = await api.get(`/organizations/${orgId}/sosmed/accounts`);
      const igOnly = (res.data || []).filter((a: any) => a.platform === "instagram");
      setIgAccounts(igOnly);
      if (igOnly[0] && !scheduleAccountId) setScheduleAccountId(igOnly[0].id);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal memuat akun IG");
    }
  };

  const submitSchedule = async () => {
    if (!brief || !activeImage || !scheduleAccountId || !scheduleAt) return;
    setScheduleSubmitting(true);
    try {
      // datetime-local → ISO. Anggap local (browser tz), convert ke UTC.
      const localDate = new Date(scheduleAt);
      await api.post(
        `/organizations/${orgId}/sosmed/accounts/${scheduleAccountId}/scheduled-posts`,
        {
          caption: scheduleCaption,
          media_url: activeImage.image_url,
          media_type: "IMAGE",
          scheduled_at: localDate.toISOString(),
          design_brief_id: brief.id,
        },
      );
      toast.success("Posting terjadwal!");
      setScheduleOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menjadwalkan posting");
    } finally {
      setScheduleSubmitting(false);
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

  // Approval workflow
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const approveBrief = async () => {
    if (!brief) return;
    const note = prompt("Catatan approval (opsional):") ?? null;
    if (note === null) return;
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

        {/* Approval banner — render kalau status review / approved / atau ada rejection metadata */}
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

        {/* 2-column: form (left) + image carousel (right). Form sengaja
            dilebarin ke 560px supaya caption/visual text gak cramped. */}
        <div className="grid lg:grid-cols-[560px_1fr] gap-6">
          {/* Form panel */}
          <div className="space-y-3 p-4 rounded-2xl border border-border bg-secondary/20 h-fit lg:sticky lg:top-4">
            {/* Brand selector — pilih dari label tim, atau ketik nama baru
                untuk auto-create. Brand di-link via brand_id (label resmi).
                Field free-text lama (brief.brand) tetap dipertahankan di DB. */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Brand</label>
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
                {brief.brand_label && brief.brand_label.color && (
                  <span
                    className="inline-block w-3 h-3 rounded-full border border-border"
                    style={{ backgroundColor: brief.brand_label.color }}
                    title={brief.brand_label.color}
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
            {/* Visual Text dipecah jadi 3: headline / sub headline / body text
                — biar designer langsung tahu hierarki tipografi-nya. */}
            <Field
              label="Headline"
              value={form.headline}
              placeholder="Teks utama / big title (mis. 'DISKON 15%')"
              onChange={(v) => setForm({ ...form, headline: v })}
              onBlur={() => { if (form.headline !== (brief.headline || "")) saveHeader({ headline: form.headline }); }}
              textarea
              rows={2}
            />
            <Field
              label="Sub Headline"
              value={form.sub_headline}
              placeholder="Tagline / penjelas singkat (mis. 'Berlaku 1–7 Juni')"
              onChange={(v) => setForm({ ...form, sub_headline: v })}
              onBlur={() => { if (form.sub_headline !== (brief.sub_headline || "")) saveHeader({ sub_headline: form.sub_headline }); }}
              textarea
              rows={2}
            />
            <Field
              label="Body Text"
              value={form.body_text}
              placeholder="Detail kecil / syarat & ketentuan, dst."
              onChange={(v) => setForm({ ...form, body_text: v })}
              onBlur={() => { if (form.body_text !== (brief.body_text || "")) saveHeader({ body_text: form.body_text }); }}
              textarea
              rows={3}
            />
            {/* Caption Posting → RichTextEditor (TipTap) — autosave 800ms debounced. */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Caption Posting</label>
              <RichTextEditor
                content={form.caption}
                onChange={(v) => setForm((f) => ({ ...f, caption: v }))}
                placeholder="Caption lengkap untuk posting…"
              />
            </div>
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
                    {uploading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {uploadProgress && (
                          <span className="text-[9px] font-bold mt-1">{uploadProgress.done}/{uploadProgress.total}</span>
                        )}
                      </>
                    ) : (
                      <><Plus className="w-5 h-5" /><span className="text-[9px] font-bold mt-1">Tambah</span></>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length) uploadFiles(files);
                        e.currentTarget.value = "";
                      }}
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
                    {/* Schedule-to-IG: pakai gambar yg lagi aktif. */}
                    <button
                      type="button"
                      onClick={openScheduleModal}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-foreground text-background text-[10px] font-bold hover:opacity-90 transition-opacity"
                    >
                      <CalendarClock className="w-3 h-3" /> Jadwalkan ke IG
                    </button>
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
                    <>
                      <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
                      {uploadProgress && (
                        <p className="text-xs font-bold text-primary">Upload {uploadProgress.done}/{uploadProgress.total}</p>
                      )}
                    </>
                  ) : (
                    <Upload className="w-10 h-10 text-muted-foreground mx-auto" />
                  )}
                  <div>
                    <p className="font-bold text-sm">Upload gambar (bisa banyak sekaligus)</p>
                    <p className="text-xs text-muted-foreground mt-1">Pilih 1 atau lebih file — semuanya jadi 1 carousel. Tiap gambar punya revisi sendiri.</p>
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length) uploadFiles(files);
                    e.currentTarget.value = "";
                  }}
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

      {/* Schedule to Instagram modal */}
      <Modal isOpen={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Jadwalkan ke Instagram">
        {igAccounts.length === 0 ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground italic">
              Belum ada akun Instagram terhubung. Hubungkan dulu di <Link href={`/org/${orgId}/sosmed`} className="text-primary underline">Sosmed</Link>.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Image preview */}
            {activeImage && (
              <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-secondary/20">
                <img src={activeImage.image_url} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0 border border-border" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold">Gambar #{brief.images.findIndex((i) => i.id === activeImage.id) + 1}</p>
                  <p className="text-[10px] text-muted-foreground">{brief.title}</p>
                </div>
              </div>
            )}

            {/* Account picker */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Akun IG</label>
              <select
                value={scheduleAccountId}
                onChange={(e) => setScheduleAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-card border border-border rounded-xl text-sm outline-none focus:border-primary"
              >
                {igAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.display_name || a.username} (@{a.username})</option>
                ))}
              </select>
            </div>

            {/* Schedule datetime */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tanggal & Jam Publish</label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="w-full px-3 py-2 bg-card border border-border rounded-xl text-sm outline-none focus:border-primary"
              />
              <p className="text-[10px] text-muted-foreground italic">Worker cek tiap 5 menit — boleh telat hingga 5 menit dari waktu jadwal.</p>
            </div>

            {/* Caption */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Caption</label>
              <textarea
                value={scheduleCaption}
                onChange={(e) => setScheduleCaption(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 bg-card border border-border rounded-xl text-sm outline-none focus:border-primary resize-y"
              />
              <p className="text-[10px] text-muted-foreground">Caption + hashtag dari brief sudah di-prefill, edit sesuai kebutuhan.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setScheduleOpen(false)}
                className="px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={submitSchedule}
                disabled={scheduleSubmitting || !scheduleAccountId || !scheduleAt}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 hover:shadow-md transition-all"
              >
                {scheduleSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Jadwalkan
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject modal */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !rejecting && setRejectOpen(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" />
              <h3 className="font-extrabold text-base">Tolak Brief</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Alasan akan disimpan + status balik ke <strong>Draft</strong>. Designer bisa lihat alasan dan perbaiki.
            </p>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Misal: warna brand kurang pas, headline terlalu panjang, perlu CTA tombol di pojok kanan bawah..."
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

function Field({
  label, value, onChange, onBlur, placeholder, type = "text", textarea = false, rows = 3, markdown = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  type?: string;
  textarea?: boolean;
  rows?: number;
  markdown?: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Auto-grow textarea: tinggi disesuaikan dengan scrollHeight setiap value
  // berubah (atau saat mount). User tetap bisa override via drag bawah
  // textarea (resize-y).
  useEffect(() => {
    if (!textarea) return;
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, textarea]);

  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</label>
      {textarea ? (
        <div className="space-y-1.5">
          {markdown && <MarkdownToolbar taRef={taRef} value={value} onChange={onChange} />}
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            rows={rows}
            className="w-full px-3 py-2 bg-card border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-y leading-relaxed overflow-hidden"
            style={{ minHeight: `${rows * 28 + 20}px` }}
          />
          {markdown && value.trim() && (
            <details className="text-[10px]">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">Pratinjau format</summary>
              <MarkdownText text={value} className="mt-1.5 p-3 rounded-lg bg-secondary/30 border border-border text-xs leading-relaxed" />
            </details>
          )}
        </div>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-card border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      )}
    </div>
  );
}
