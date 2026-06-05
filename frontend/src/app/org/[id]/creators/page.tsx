"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import {
  Star, Plus, Search, Filter, Loader2, X, ExternalLink, Trash2,
  Edit2, Phone, Mail, MessageCircle, MapPin, Users, Calendar as CalIcon,
  Wallet, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Brand { id: string; name: string; color?: string | null }

interface Creator {
  id: string;
  org_id: string;
  ig_username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  tier?: string | null;
  follower_count?: number | null;
  categories: string[];
  location?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_wa?: string | null;
  rate_card?: Record<string, any>;
  notes?: string | null;
  status: string;
  campaign_count: number;
  total_spent: number;
  last_campaign_date?: string | null;
  created_at: string;
}

interface Campaign {
  id: string;
  creator_id: string;
  brand_id?: string | null;
  brand?: Brand | null;
  title: string;
  campaign_date?: string | null;
  deliverables: string[];
  budget?: number | null;
  status: string;
  result_notes?: string | null;
  created_at: string;
}

interface CreatorDetail extends Creator {
  campaigns: Campaign[];
}

const TIERS = [
  { value: "nano",  label: "Nano",  range: "< 10k", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  { value: "micro", label: "Micro", range: "10k-100k", color: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200" },
  { value: "mid",   label: "Mid",   range: "100k-500k", color: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  { value: "macro", label: "Macro", range: "500k-1M", color: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-200" },
  { value: "mega",  label: "Mega",  range: "1M+", color: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200" },
];

const STATUSES = [
  { value: "active",    label: "Active",    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" },
  { value: "inactive",  label: "Inactive",  cls: "bg-secondary text-muted-foreground" },
  { value: "blacklist", label: "Blacklist", cls: "bg-destructive/20 text-destructive" },
];

const CAMPAIGN_STATUSES = [
  { value: "planned",   label: "Planned",   cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  { value: "ongoing",   label: "Ongoing",   cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200" },
  { value: "done",      label: "Done",      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" },
  { value: "cancelled", label: "Cancelled", cls: "bg-secondary text-muted-foreground line-through" },
];

const PRESET_CATEGORIES = [
  "Food", "Beauty", "Fashion", "Lifestyle", "Tech", "Gaming", "Travel",
  "Parenting", "Fitness", "Edukasi", "Komedi", "Otomotif", "Bisnis",
];

function tierMeta(t?: string | null) { return TIERS.find((x) => x.value === t) || null; }
function statusMeta(s?: string | null) { return STATUSES.find((x) => x.value === s) || STATUSES[0]; }
function fmtIDR(n?: number | null) {
  if (n == null) return "—";
  return `Rp ${n.toLocaleString("id-ID")}`;
}
function fmtFollower(n?: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ─── Empty creator form template ───────────────────────────────────────────

const emptyForm = (): Partial<Creator> => ({
  ig_username: "",
  display_name: "",
  avatar_url: "",
  tier: "",
  follower_count: undefined,
  categories: [],
  location: "",
  contact_email: "",
  contact_phone: "",
  contact_wa: "",
  rate_card: {},
  notes: "",
  status: "active",
});

// ─── Page ──────────────────────────────────────────────────────────────────

export default function CreatorPoolPage() {
  const { id: orgId } = useParams();
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [filterCategory, setFilterCategory] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Creator | null>(null);
  const [form, setForm] = useState<Partial<Creator>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<CreatorDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Apakah POOL benar2 kosong (gak ada creator sama sekali) vs cuma
  // narrow karena filter? Cek tanpa filter sekali di mount + setelah
  // create/delete biar tau onboarding mode atau enggak.
  const [poolHasAny, setPoolHasAny] = useState<boolean | null>(null);
  useEffect(() => {
    if (!orgId) return;
    api.get(`/organizations/${orgId}/creators`).then((r) => {
      setPoolHasAny((r.data || []).length > 0);
    }).catch(() => setPoolHasAny(false));
  }, [orgId]);

  const fetchCreators = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search.trim()) params.q = search.trim();
      if (filterStatus) params.status = filterStatus;
      if (filterTier) params.tier = filterTier;
      if (filterCategory) params.category = filterCategory;
      const res = await api.get(`/organizations/${orgId}/creators`, { params });
      setCreators(res.data || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal memuat creators");
    } finally {
      setLoading(false);
    }
  }, [orgId, search, filterStatus, filterTier, filterCategory]);

  useEffect(() => {
    if (orgId) {
      const t = setTimeout(fetchCreators, 250);  // debounce search
      return () => clearTimeout(t);
    }
  }, [orgId, fetchCreators]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };
  const openEdit = (c: Creator) => {
    setEditing(c);
    setForm({ ...c });
    setModalOpen(true);
  };

  const submitForm = async () => {
    const uname = (form.ig_username || "").trim().replace(/^@/, "");
    if (!uname) { alert("Username IG wajib"); return; }
    if (!/^[A-Za-z0-9._]{1,30}$/.test(uname)) { alert("Format username tidak valid"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        ig_username: uname.toLowerCase(),
        follower_count: form.follower_count ? Number(form.follower_count) : null,
        tier: form.tier || null,
      };
      if (editing) {
        const res = await api.patch(`/organizations/${orgId}/creators/${editing.id}`, payload);
        setCreators((prev) => prev.map((c) => c.id === editing.id ? res.data : c));
        toast.success("Creator di-update");
      } else {
        const res = await api.post(`/organizations/${orgId}/creators`, payload);
        setCreators((prev) => [res.data, ...prev]);
        setPoolHasAny(true);
        toast.success("Creator ditambahkan");
      }
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const deleteCreator = async (c: Creator) => {
    if (!confirm(`Hapus creator @${c.ig_username} dari pool? Semua riwayat campaign ikut hilang.`)) return;
    try {
      await api.delete(`/organizations/${orgId}/creators/${c.id}`);
      setCreators((prev) => prev.filter((x) => x.id !== c.id));
      toast.success(`@${c.ig_username} dihapus`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menghapus");
    }
  };

  const openDetail = async (c: Creator) => {
    setDetail(null);
    setDetailOpen(true);
    setLoadingDetail(true);
    try {
      const res = await api.get(`/organizations/${orgId}/creators/${c.id}`);
      setDetail(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal memuat detail");
      setDetailOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Aggregate stats untuk header
  const stats = useMemo(() => {
    return {
      total: creators.length,
      active: creators.filter((c) => c.status === "active").length,
      campaigns: creators.reduce((sum, c) => sum + c.campaign_count, 0),
      spent: creators.reduce((sum, c) => sum + c.total_spent, 0),
    };
  }, [creators]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Star className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Creator Pool</h1>
        </div>
        <p className="text-muted-foreground">
          Catatan internal MEDBER — kontak creator/influencer yang pernah/calon kerja sama.
          Input manual, lalu tracking campaign per orang.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Total Creator" value={stats.total} />
        <StatCard icon={TrendingUp} label="Aktif" value={stats.active} />
        <StatCard icon={CalIcon} label="Total Campaign" value={stats.campaigns} />
        <StatCard icon={Wallet} label="Total Spent" value={fmtIDR(stats.spent)} />
      </div>

      {/* Toolbar — sembunyiin kalau pool kosong (gak ada apapun yg bisa di-search) */}
      {poolHasAny && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3 border border-border rounded-2xl">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari username, nama, lokasi, kontak, notes…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm"
              />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-semibold">
              <option value="">Semua status</option>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-semibold">
              <option value="">Semua tier</option>
              {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label} ({t.range})</option>)}
            </select>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-semibold">
              <option value="">Semua kategori</option>
              {PRESET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 shadow-md"
          >
            <Plus className="w-4 h-4" /> Tambah Creator
          </button>
        </div>
      )}

      {/* Grid */}
      {loading || poolHasAny === null ? (
        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : !poolHasAny ? (
        /* True empty — pool benar2 kosong. Onboarding. */
        <div className="rounded-3xl border-2 border-dashed border-primary/30 bg-primary/5 p-10 text-center space-y-4">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-primary/10 items-center justify-center">
            <Star className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-extrabold text-foreground">Mulai bangun database creator MEDBER</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              Creator Pool ini <strong>catatan internal kalian</strong> — bukan directory universal.
              Setiap creator harus di-input dulu (username, kontak, rate, dll). Setelah ada datanya,
              baru bisa di-search & filter.
            </p>
          </div>
          <div className="text-left max-w-md mx-auto bg-background border border-border rounded-2xl p-4 space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Tipikal workflow:</p>
            <ol className="text-xs text-foreground space-y-1.5 list-decimal list-inside">
              <li>Ketemu calon collab via DM IG / referensi / scout hashtag</li>
              <li>Input ke pool: username, follower, kategori, lokasi, rate, kontak</li>
              <li>Setelah collab → log campaign di profil creator (budget, hasil, dll)</li>
              <li>Search/filter waktu cari creator buat campaign berikutnya</li>
            </ol>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-extrabold hover:opacity-90 shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" /> Tambah Creator Pertama
          </button>
        </div>
      ) : creators.length === 0 ? (
        /* Pool ada datanya tapi filter narrow → 0 hasil. Hint reset filter. */
        <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center space-y-3">
          <Search className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <div>
            <p className="text-sm font-bold text-foreground mb-1">Gak ketemu creator yang cocok</p>
            <p className="text-xs text-muted-foreground italic">
              Filter atau search-nya kemungkinan terlalu sempit. Coba reset di bawah.
            </p>
          </div>
          <button
            onClick={() => { setSearch(""); setFilterTier(""); setFilterCategory(""); setFilterStatus("active"); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/70"
          >
            Reset Filter
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {creators.map((c) => <CreatorCard key={c.id} c={c} onClick={() => openDetail(c)} onEdit={() => openEdit(c)} onDelete={() => deleteCreator(c)} />)}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => !saving && setModalOpen(false)} title={editing ? `Edit @${editing.ig_username}` : "Tambah Creator Baru"} className="max-w-2xl">
        <CreatorForm form={form} setForm={setForm} saving={saving} onSubmit={submitForm} onCancel={() => setModalOpen(false)} editing={!!editing} />
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={detailOpen} onClose={() => setDetailOpen(false)} title={detail ? `@${detail.ig_username}` : "Detail Creator"} className="max-w-3xl">
        {loadingDetail || !detail ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <CreatorDetailView
            detail={detail}
            orgId={orgId as string}
            onCampaignAdded={(cc) => {
              setDetail((d) => d ? { ...d, campaigns: [cc, ...d.campaigns] } : d);
              setCreators((prev) => prev.map((x) => x.id === detail.id ? { ...x, campaign_count: x.campaign_count + 1, total_spent: x.total_spent + (cc.status === "done" ? (cc.budget || 0) : 0) } : x));
            }}
            onCampaignUpdated={(cc) => {
              setDetail((d) => d ? { ...d, campaigns: d.campaigns.map((x) => x.id === cc.id ? cc : x) } : d);
            }}
            onCampaignDeleted={(id) => {
              setDetail((d) => d ? { ...d, campaigns: d.campaigns.filter((x) => x.id !== id) } : d);
              setCreators((prev) => prev.map((x) => x.id === detail.id ? { ...x, campaign_count: Math.max(0, x.campaign_count - 1) } : x));
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <p className="text-xl font-extrabold tabular-nums mt-1">{value}</p>
    </div>
  );
}

// ─── Creator card ──────────────────────────────────────────────────────────

function CreatorCard({ c, onClick, onEdit, onDelete }: { c: Creator; onClick: () => void; onEdit: () => void; onDelete: () => void }) {
  const tier = tierMeta(c.tier);
  const st = statusMeta(c.status);
  return (
    <div
      onClick={onClick}
      className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group relative"
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center shrink-0 text-base font-bold">
          {c.avatar_url
            ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
            : (c.display_name || c.ig_username).charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{c.display_name || `@${c.ig_username}`}</p>
          <a
            href={`https://instagram.com/${c.ig_username}/`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1 truncate"
          >
            @{c.ig_username} <ExternalLink className="w-2.5 h-2.5" />
          </a>
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {tier && <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", tier.color)}>{tier.label}</span>}
            <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", st.cls)}>{st.label}</span>
            {c.follower_count != null && (
              <span className="text-[9px] font-semibold text-muted-foreground">· {fmtFollower(c.follower_count)} followers</span>
            )}
          </div>
        </div>
      </div>

      {c.categories.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {c.categories.slice(0, 4).map((cat) => (
            <span key={cat} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary/60 text-foreground/80">{cat}</span>
          ))}
          {c.categories.length > 4 && <span className="text-[9px] text-muted-foreground">+{c.categories.length - 4}</span>}
        </div>
      )}

      {c.location && (
        <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
          <MapPin className="w-2.5 h-2.5" /> {c.location}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border">
        <div>
          <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Campaign</p>
          <p className="text-sm font-extrabold tabular-nums">{c.campaign_count}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Total Spent</p>
          <p className="text-sm font-extrabold tabular-nums">{fmtIDR(c.total_spent)}</p>
        </div>
      </div>

      {/* Quick action buttons (hover) */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Edit"
          className="p-1.5 rounded-lg bg-background border border-border text-muted-foreground hover:text-foreground"
        >
          <Edit2 className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Hapus"
          className="p-1.5 rounded-lg bg-background border border-border text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Creator form (add/edit) ───────────────────────────────────────────────

function CreatorForm({
  form, setForm, saving, onSubmit, onCancel, editing,
}: {
  form: Partial<Creator>;
  setForm: (f: Partial<Creator>) => void;
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  editing: boolean;
}) {
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const toggleCategory = (cat: string) => {
    const current = form.categories || [];
    setForm({ ...form, categories: current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat] });
  };
  const addCustomCategory = () => {
    const c = newCategoryInput.trim();
    if (!c) return;
    const current = form.categories || [];
    if (!current.includes(c)) setForm({ ...form, categories: [...current, c] });
    setNewCategoryInput("");
  };

  // Rate card — fixed slots biar gampang isi
  const rateSlots = ["feed", "story", "reels", "package"];
  const setRate = (key: string, value: string) => {
    const next = { ...(form.rate_card || {}) };
    if (!value) delete next[key];
    else next[key] = parseInt(value, 10) || 0;
    setForm({ ...form, rate_card: next });
  };

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">IG Username *</label>
          <input
            value={form.ig_username || ""}
            onChange={(e) => setForm({ ...form, ig_username: e.target.value })}
            placeholder="username (tanpa @)"
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Nama Tampilan</label>
          <input
            value={form.display_name || ""}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            placeholder="Nama lengkap / brand"
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>
      </div>

      {/* Tier + follower + status */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Tier</label>
          <select value={form.tier || ""} onChange={(e) => setForm({ ...form, tier: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm">
            <option value="">— Pilih tier —</option>
            {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label} · {t.range}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Followers</label>
          <input
            type="number"
            value={form.follower_count ?? ""}
            onChange={(e) => setForm({ ...form, follower_count: e.target.value ? parseInt(e.target.value, 10) : undefined })}
            placeholder="50000"
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Status</label>
          <select value={form.status || "active"} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm">
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Categories */}
      <div>
        <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Kategori</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {PRESET_CATEGORIES.map((c) => {
            const active = (form.categories || []).includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategory(c)}
                className={cn("px-2.5 py-1 rounded-full text-xs font-semibold border transition-all",
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary/50")}
              >{c}</button>
            );
          })}
          {/* Custom-added categories */}
          {(form.categories || []).filter((c) => !PRESET_CATEGORIES.includes(c)).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleCategory(c)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground border border-primary"
            >
              {c} <X className="w-3 h-3" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <input
            value={newCategoryInput}
            onChange={(e) => setNewCategoryInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomCategory(); } }}
            placeholder="+ Kategori custom…"
            className="flex-1 px-2.5 py-1.5 text-xs border border-dashed border-border bg-secondary/30 rounded-lg"
          />
          <button type="button" onClick={addCustomCategory} disabled={!newCategoryInput.trim()} className="px-3 py-1.5 rounded-lg bg-secondary text-xs font-bold disabled:opacity-40">Tambah</button>
        </div>
      </div>

      {/* Location + Avatar URL */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Lokasi</label>
          <input value={form.location || ""} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Jakarta / Bandung / WFH" className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Avatar URL</label>
          <input value={form.avatar_url || ""} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://…" className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
        </div>
      </div>

      {/* Contact */}
      <div>
        <p className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground mb-1">Kontak</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="relative">
            <Mail className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={form.contact_email || ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="email@" className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-sm" />
          </div>
          <div className="relative">
            <Phone className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={form.contact_phone || ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="Phone" className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-sm" />
          </div>
          <div className="relative">
            <MessageCircle className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={form.contact_wa || ""} onChange={(e) => setForm({ ...form, contact_wa: e.target.value })} placeholder="WA (628…)" className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-sm" />
          </div>
        </div>
      </div>

      {/* Rate card */}
      <div>
        <p className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground mb-1">Rate Card (IDR)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {rateSlots.map((k) => (
            <div key={k}>
              <label className="text-[9px] uppercase tracking-wider text-muted-foreground capitalize">{k}</label>
              <input
                type="number"
                value={form.rate_card?.[k] ?? ""}
                onChange={(e) => setRate(k, e.target.value)}
                placeholder="0"
                className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs tabular-nums"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Catatan</label>
        <textarea
          value={form.notes || ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
          placeholder="Karakter creator, gaya konten, pengalaman collab, dll..."
          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <button onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold text-muted-foreground hover:bg-secondary">Batal</button>
        <button onClick={onSubmit} disabled={saving || !form.ig_username?.trim()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 hover:opacity-90">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
          {editing ? "Simpan Perubahan" : "Tambah Creator"}
        </button>
      </div>
    </div>
  );
}

// ─── Detail view + campaign tab ────────────────────────────────────────────

function CreatorDetailView({
  detail, orgId,
  onCampaignAdded, onCampaignUpdated, onCampaignDeleted,
}: {
  detail: CreatorDetail;
  orgId: string;
  onCampaignAdded: (cc: Campaign) => void;
  onCampaignUpdated: (cc: Campaign) => void;
  onCampaignDeleted: (id: string) => void;
}) {
  const [campaignFormOpen, setCampaignFormOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  const startNew = () => { setEditingCampaign(null); setCampaignFormOpen(true); };
  const startEdit = (cc: Campaign) => { setEditingCampaign(cc); setCampaignFormOpen(true); };

  const tier = tierMeta(detail.tier);
  const st = statusMeta(detail.status);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-20 h-20 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center text-2xl font-bold shrink-0">
          {detail.avatar_url
            ? <img src={detail.avatar_url} alt="" className="w-full h-full object-cover" />
            : (detail.display_name || detail.ig_username).charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-extrabold">{detail.display_name || `@${detail.ig_username}`}</h3>
          <a href={`https://instagram.com/${detail.ig_username}/`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            @{detail.ig_username} <ExternalLink className="w-3 h-3" />
          </a>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {tier && <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded", tier.color)}>{tier.label}</span>}
            <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded", st.cls)}>{st.label}</span>
            {detail.follower_count != null && <span className="text-[10px] text-muted-foreground">{fmtFollower(detail.follower_count)} followers</span>}
            {detail.location && <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {detail.location}</span>}
          </div>
          {detail.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {detail.categories.map((c) => <span key={c} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary/60">{c}</span>)}
            </div>
          )}
        </div>
      </div>

      {/* Contact + rate */}
      {(detail.contact_email || detail.contact_phone || detail.contact_wa) && (
        <div className="p-3 rounded-xl bg-secondary/30 border border-border space-y-1.5 text-xs">
          {detail.contact_email && <p className="flex items-center gap-2"><Mail className="w-3 h-3 text-muted-foreground" /> <a href={`mailto:${detail.contact_email}`} className="hover:text-primary">{detail.contact_email}</a></p>}
          {detail.contact_phone && <p className="flex items-center gap-2"><Phone className="w-3 h-3 text-muted-foreground" /> {detail.contact_phone}</p>}
          {detail.contact_wa && <p className="flex items-center gap-2"><MessageCircle className="w-3 h-3 text-muted-foreground" /> <a href={`https://wa.me/${detail.contact_wa.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary">{detail.contact_wa}</a></p>}
        </div>
      )}

      {detail.rate_card && Object.keys(detail.rate_card).length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Rate Card</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(detail.rate_card).map(([k, v]) => (
              <div key={k} className="p-2 rounded-lg border border-border bg-card">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground capitalize">{k}</p>
                <p className="text-sm font-extrabold tabular-nums">{fmtIDR(Number(v))}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {detail.notes && (
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Catatan</p>
          <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{detail.notes}</p>
        </div>
      )}

      {/* Campaign history */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-extrabold">Riwayat Campaign ({detail.campaigns.length})</p>
          <button onClick={startNew} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90">
            <Plus className="w-3.5 h-3.5" /> Tambah Campaign
          </button>
        </div>
        {detail.campaigns.length === 0 ? (
          <div className="p-4 rounded-xl border-2 border-dashed border-border text-center text-xs text-muted-foreground italic">
            Belum ada riwayat campaign.
          </div>
        ) : (
          <div className="space-y-2">
            {detail.campaigns.map((cc) => (
              <CampaignRow key={cc.id} cc={cc} orgId={orgId} creatorId={detail.id}
                onEdit={() => startEdit(cc)}
                onUpdated={onCampaignUpdated}
                onDeleted={onCampaignDeleted}
              />
            ))}
          </div>
        )}
      </div>

      {/* Campaign form modal — overlay second modal */}
      {campaignFormOpen && (
        <CampaignFormModal
          orgId={orgId}
          creatorId={detail.id}
          editing={editingCampaign}
          onClose={() => setCampaignFormOpen(false)}
          onSaved={(cc) => {
            if (editingCampaign) onCampaignUpdated(cc);
            else onCampaignAdded(cc);
            setCampaignFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CampaignRow({ cc, orgId, creatorId, onEdit, onUpdated, onDeleted }: {
  cc: Campaign; orgId: string; creatorId: string;
  onEdit: () => void;
  onUpdated: (cc: Campaign) => void;
  onDeleted: (id: string) => void;
}) {
  const st = CAMPAIGN_STATUSES.find((s) => s.value === cc.status) || CAMPAIGN_STATUSES[0];
  const del = async () => {
    if (!confirm(`Hapus campaign "${cc.title}"?`)) return;
    try {
      await api.delete(`/organizations/${orgId}/creators/${creatorId}/campaigns/${cc.id}`);
      onDeleted(cc.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal hapus");
    }
  };
  return (
    <div className="rounded-xl border border-border bg-card p-3 hover:bg-secondary/10 transition-all group relative">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold">{cc.title}</p>
            <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", st.cls)}>{st.label}</span>
            {cc.brand && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={cc.brand.color ? { backgroundColor: `${cc.brand.color}30`, color: cc.brand.color, border: `1px solid ${cc.brand.color}` } : undefined}
              >{cc.brand.name}</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
            {cc.campaign_date && <span className="inline-flex items-center gap-0.5"><CalIcon className="w-2.5 h-2.5" /> {new Date(cc.campaign_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>}
            {cc.budget != null && <span className="font-bold text-foreground tabular-nums">{fmtIDR(cc.budget)}</span>}
            {cc.deliverables.length > 0 && <span>{cc.deliverables.join(" · ")}</span>}
          </div>
          {cc.result_notes && <p className="text-[10px] text-muted-foreground italic mt-1 line-clamp-2">"{cc.result_notes}"</p>}
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button onClick={onEdit} className="p-1 rounded text-muted-foreground hover:text-foreground"><Edit2 className="w-3 h-3" /></button>
          <button onClick={del} className="p-1 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>
    </div>
  );
}

function CampaignFormModal({
  orgId, creatorId, editing, onClose, onSaved,
}: {
  orgId: string;
  creatorId: string;
  editing: Campaign | null;
  onClose: () => void;
  onSaved: (cc: Campaign) => void;
}) {
  const [form, setForm] = useState<Partial<Campaign>>(
    editing
      ? { ...editing }
      : { title: "", campaign_date: "", deliverables: [], budget: undefined, status: "planned", result_notes: "" }
  );
  const [delivInput, setDelivInput] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title?.trim()) { alert("Judul wajib"); return; }
    setSaving(true);
    try {
      const payload: any = {
        title: form.title.trim(),
        campaign_date: form.campaign_date || null,
        deliverables: form.deliverables || [],
        budget: form.budget ? Number(form.budget) : null,
        status: form.status || "planned",
        result_notes: form.result_notes || null,
      };
      const url = editing
        ? `/organizations/${orgId}/creators/${creatorId}/campaigns/${editing.id}`
        : `/organizations/${orgId}/creators/${creatorId}/campaigns`;
      const res = editing
        ? await api.patch(url, payload)
        : await api.post(url, payload);
      onSaved(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <CalIcon className="w-5 h-5 text-primary" />
          <h3 className="font-extrabold text-base flex-1">{editing ? "Edit Campaign" : "Tambah Campaign"}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Judul Campaign *</label>
          <input
            autoFocus={!editing}
            value={form.title || ""}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Misal: Endorse Lebaran 2026"
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Tanggal</label>
            <input type="date" value={form.campaign_date || ""} onChange={(e) => setForm({ ...form, campaign_date: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Budget (IDR)</label>
            <input type="number" value={form.budget ?? ""} onChange={(e) => setForm({ ...form, budget: e.target.value ? parseInt(e.target.value, 10) : undefined })} placeholder="0" className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm tabular-nums" />
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Status</label>
          <div className="mt-1 flex gap-1.5">
            {CAMPAIGN_STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setForm({ ...form, status: s.value })}
                className={cn("flex-1 px-2 py-1.5 rounded-lg text-xs font-bold border transition-all",
                  form.status === s.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary/50")}
              >{s.label}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Deliverables</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {(form.deliverables || []).map((d, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                {d}
                <button onClick={() => setForm({ ...form, deliverables: (form.deliverables || []).filter((_, j) => j !== i) })}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <input
              value={delivInput}
              onChange={(e) => setDelivInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && delivInput.trim()) {
                  e.preventDefault();
                  setForm({ ...form, deliverables: [...(form.deliverables || []), delivInput.trim()] });
                  setDelivInput("");
                }
              }}
              placeholder="+ Misal: 1 feed, 3 story, 1 reels"
              className="flex-1 px-2.5 py-1.5 text-xs border border-dashed border-border bg-secondary/30 rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Catatan Hasil</label>
          <textarea
            value={form.result_notes || ""}
            onChange={(e) => setForm({ ...form, result_notes: e.target.value })}
            rows={3}
            placeholder="Engagement, sentimen, masalah selama collab, dll..."
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold text-muted-foreground hover:bg-secondary">Batal</button>
          <button onClick={save} disabled={saving || !form.title?.trim()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 hover:opacity-90">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalIcon className="w-3.5 h-3.5" />}
            {editing ? "Simpan" : "Tambah"}
          </button>
        </div>
      </div>
    </div>
  );
}
