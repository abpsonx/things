"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { Share2, Camera, Loader2, CalendarClock, Plus, Trash2, RefreshCw, Users, Image as ImageIcon, ChevronDown, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Heart, MessageCircle, ExternalLink, Bookmark, Send, Eye, EyeOff, Reply, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from "recharts";

interface SocialAccount {
  id: string;
  platform: "instagram" | "tiktok";
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

interface MetricPoint {
  date: string;
  followers: number | null;
  following: number | null;
  posts_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

interface Delta {
  prev: number | null;
  d7: number | null;
  d30: number | null;
}

type GrowthMetric = "followers" | "likes" | "comments" | "shares" | "saves";

interface InsightsBlob {
  profile?: Record<string, number>;
  demographics?: {
    gender_age?: Record<string, number>;
    city?: Record<string, number>;
    country?: Record<string, number>;
    age?: Record<string, number>;
  };
  errors?: string[];
  fetched_at?: string;
}

interface AccountMetrics {
  account: SocialAccount;
  latest: MetricPoint | null;
  history: MetricPoint[];
  deltas: Record<GrowthMetric, Delta>;
  insights?: InsightsBlob | null;
}

interface Post {
  id: string;
  media_type?: string | null;
  caption?: string | null;
  permalink?: string | null;
  thumbnail_url?: string | null;
  posted_at?: string | null;
  like_count?: number | null;
  comments_count?: number | null;
  reach?: number | null;
  saved?: number | null;
  shares?: number | null;
  views?: number | null;
  total_interactions?: number | null;
  profile_visits?: number | null;
  profile_activity?: number | null;
  follows?: number | null;
  navigation?: number | null;
  avg_watch_time_ms?: number | null;
  total_watch_time_ms?: number | null;
  engagement: number;
}

type SubTab = "growth" | "calendar" | "posts" | "stories" | "schedule";

interface Story {
  id: string;
  external_id: string;
  media_type: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  posted_at: string | null;
  expires_at: string | null;
  is_live: boolean;
  impressions: number | null;
  reach: number | null;
  exits: number | null;
  taps_forward: number | null;
  taps_back: number | null;
  taps_total: number | null;
  replies: number | null;
  profile_visits: number | null;
  follows: number | null;
  completion_rate: number | null;
}

interface StoriesPayload {
  stories: Story[];
  summary: {
    count: number;
    live_count: number;
    total_impressions?: number | null;
    total_reach?: number | null;
    total_replies?: number | null;
    total_exits?: number | null;
    total_profile_visits?: number | null;
    total_follows?: number | null;
  };
}

interface ScheduledPost {
  id: string;
  account_id: string;
  design_brief_id: string | null;
  caption: string | null;
  media_url: string;
  media_type: string | null;
  carousel_urls: Array<{ url: string; is_video: boolean }> | null;
  collaborators: string[] | null;
  share_to_feed: boolean;
  scheduled_at: string;
  status: string; // pending | publishing | posted | failed | cancelled
  ig_media_id: string | null;
  ig_permalink: string | null;
  posted_at: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
}

export default function SosmedPage() {
  const { id: orgId } = useParams();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [config, setConfig] = useState<{ instagram_ready: boolean; tiktok_ready: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("growth");
  const [metrics, setMetrics] = useState<Record<string, AccountMetrics>>({});
  const [metricsLoading, setMetricsLoading] = useState<string | null>(null);
  const [posts, setPosts] = useState<Record<string, Post[]>>({});
  const [postsLoading, setPostsLoading] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Record<string, ScheduledPost[]>>({});
  const [schedulesLoading, setSchedulesLoading] = useState<string | null>(null);
  const [stories, setStories] = useState<Record<string, StoriesPayload>>({});
  const [storiesLoading, setStoriesLoading] = useState<string | null>(null);

  // Modal "Buat Jadwal Baru" — dipakai dari tab Jadwal.
  const [newOpen, setNewOpen] = useState(false);
  const [newAccountId, setNewAccountId] = useState<string>("");
  const [newCaption, setNewCaption] = useState("");
  const [newAt, setNewAt] = useState("");  // datetime-local string
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPreview, setNewPreview] = useState<string>("");
  const [newPostType, setNewPostType] = useState<"FEED" | "CAROUSEL" | "REELS" | "STORY">("FEED");
  const [newCarouselFiles, setNewCarouselFiles] = useState<File[]>([]);
  const [newCarouselPreviews, setNewCarouselPreviews] = useState<string[]>([]);
  const [newCollaborators, setNewCollaborators] = useState<string[]>([]);
  const [newCollabInput, setNewCollabInput] = useState("");
  const [newCollabLookup, setNewCollabLookup] = useState<{
    loading: boolean;
    found?: boolean;
    username?: string;
    name?: string | null;
    profile_picture_url?: string | null;
    followers_count?: number | null;
    reason?: string;
  } | null>(null);
  const [newShareToFeed, setNewShareToFeed] = useState(true);
  const [newSubmitting, setNewSubmitting] = useState(false);

  const resetCarousel = () => {
    newCarouselPreviews.forEach((u) => URL.revokeObjectURL(u));
    setNewCarouselFiles([]);
    setNewCarouselPreviews([]);
  };

  const openNewSchedule = (accountId: string) => {
    setNewAccountId(accountId);
    setNewCaption("");
    setNewFile(null);
    setNewPreview("");
    setNewPostType("FEED");
    resetCarousel();
    setNewCollaborators([]);
    setNewCollabInput("");
    setNewShareToFeed(true);
    // Default jadwal: +1 jam dari sekarang, dibulatkan ke 5 menit terdekat.
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
    const pad = (n: number) => String(n).padStart(2, "0");
    setNewAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setNewOpen(true);
  };

  const pickNewFile = (f: File | null) => {
    setNewFile(f);
    if (newPreview) URL.revokeObjectURL(newPreview);
    setNewPreview(f ? URL.createObjectURL(f) : "");
    // Auto-suggest tipe post berdasarkan jenis file (skip kalau lagi CAROUSEL).
    if (f && newPostType !== "CAROUSEL") {
      const isVideo = (f.type || "").startsWith("video/");
      setNewPostType(isVideo ? "REELS" : "FEED");
    }
  };

  const pickCarouselFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const merged = [...newCarouselFiles, ...arr].slice(0, 10);
    newCarouselPreviews.forEach((u) => URL.revokeObjectURL(u));
    setNewCarouselFiles(merged);
    setNewCarouselPreviews(merged.map((f) => URL.createObjectURL(f)));
  };

  const removeCarouselAt = (idx: number) => {
    const next = newCarouselFiles.filter((_, i) => i !== idx);
    URL.revokeObjectURL(newCarouselPreviews[idx]);
    setNewCarouselFiles(next);
    setNewCarouselPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const addCollab = () => {
    const raw = newCollabInput.trim().replace(/^@/, "");
    if (!raw) return;
    if (newCollaborators.length >= 3) { alert("Maksimal 3 collaborator."); return; }
    // Wajib validated dulu — gak boleh add username yang gak terbukti ada.
    if (!newCollabLookup || newCollabLookup.loading || newCollabLookup.found !== true) {
      alert("Username belum tervalidasi. Tunggu lookup atau ganti username.");
      return;
    }
    const u = newCollabLookup.username || raw;
    if (newCollaborators.includes(u)) {
      setNewCollabInput("");
      setNewCollabLookup(null);
      return;
    }
    setNewCollaborators([...newCollaborators, u]);
    setNewCollabInput("");
    setNewCollabLookup(null);
  };

  const submitNewSchedule = async () => {
    if (!newAt) { alert("Pilih waktu jadwal."); return; }
    if (new Date(newAt).getTime() < Date.now() + 60_000) {
      alert("Jadwal harus minimal 1 menit ke depan."); return;
    }

    // Validasi per-tipe.
    if (newPostType === "CAROUSEL") {
      if (newCarouselFiles.length < 2) { alert("Carousel butuh minimal 2 media."); return; }
    } else {
      if (!newFile) { alert("Pilih dulu gambar/video-nya."); return; }
      const isVideo = (newFile.type || "").startsWith("video/");
      if (newPostType === "FEED" && isVideo) {
        alert("Feed image cuma terima gambar. Pilih Reels untuk video, Carousel, atau Story.");
        return;
      }
      if (newPostType === "REELS" && !isVideo) {
        alert("Reels butuh video. Pilih Feed, Carousel, atau Story.");
        return;
      }
    }

    setNewSubmitting(true);
    try {
      // Helper: upload satu file → dapat URL public.
      const uploadOne = async (f: File): Promise<string> => {
        const form = new FormData();
        form.append("file", f);
        const r = await api.post(`/media/upload`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        const u = r.data?.url;
        if (!u) throw new Error("Upload gagal");
        return u;
      };

      const payload: Record<string, any> = {
        caption: newCaption,
        scheduled_at: new Date(newAt).toISOString(),
      };

      if (newPostType === "CAROUSEL") {
        // Upload semua file paralel — batas 10.
        const urls = await Promise.all(newCarouselFiles.map(uploadOne));
        payload.media_type = "CAROUSEL";
        // media_url butuh nilai (kolom NOT NULL) — pakai item pertama sebagai cover.
        payload.media_url = urls[0];
        payload.carousel_urls = urls.map((u, i) => ({
          url: u,
          is_video: (newCarouselFiles[i].type || "").startsWith("video/"),
        }));
      } else {
        const mediaUrl = await uploadOne(newFile!);
        payload.media_url = mediaUrl;
        payload.media_type =
          newPostType === "REELS" ? "REELS" :
          newPostType === "STORY" ? "STORIES" :
          "IMAGE";
      }

      // Reels-only extras.
      if (newPostType === "REELS") {
        if (newCollaborators.length > 0) payload.collaborators = newCollaborators;
        payload.share_to_feed = newShareToFeed;
      }

      await api.post(
        `/organizations/${orgId}/sosmed/accounts/${newAccountId}/scheduled-posts`,
        payload
      );
      setNewOpen(false);
      if (newPreview) URL.revokeObjectURL(newPreview);
      setNewPreview("");
      setNewFile(null);
      resetCarousel();
      loadSchedules(newAccountId);
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.message || "Gagal menjadwalkan");
    } finally {
      setNewSubmitting(false);
    }
  };

  const loadStories = async (accountId: string, refresh = false) => {
    setStoriesLoading(accountId);
    try {
      const res = await api.get(
        `/organizations/${orgId}/sosmed/accounts/${accountId}/stories`,
        { params: refresh ? { refresh: true } : {} }
      );
      setStories((prev) => ({ ...prev, [accountId]: res.data }));
    } catch (err) {
      console.error("Failed to load stories", err);
    } finally {
      setStoriesLoading(null);
    }
  };

  const loadSchedules = async (accountId: string) => {
    setSchedulesLoading(accountId);
    try {
      const res = await api.get(`/organizations/${orgId}/sosmed/accounts/${accountId}/scheduled-posts`);
      setSchedules((prev) => ({ ...prev, [accountId]: res.data?.items || [] }));
    } catch (err) {
      console.error("Failed to load scheduled posts", err);
    } finally {
      setSchedulesLoading(null);
    }
  };

  const cancelSchedule = async (id: string, accountId: string) => {
    if (!confirm("Batalkan posting terjadwal ini?")) return;
    try {
      await api.delete(`/organizations/${orgId}/sosmed/scheduled-posts/${id}`);
      loadSchedules(accountId);
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal membatalkan");
    }
  };

  const loadMetrics = async (accountId: string, refresh = false) => {
    setMetricsLoading(accountId);
    try {
      const res = await api.get(
        `/organizations/${orgId}/sosmed/accounts/${accountId}/metrics`,
        { params: refresh ? { refresh: true } : {} }
      );
      setMetrics((prev) => ({ ...prev, [accountId]: res.data }));
    } catch (err) {
      console.error("Failed to load metrics", err);
    } finally {
      setMetricsLoading(null);
    }
  };

  const loadPosts = async (accountId: string, refresh = false) => {
    setPostsLoading(accountId);
    try {
      const res = await api.get(
        `/organizations/${orgId}/sosmed/accounts/${accountId}/posts`,
        { params: refresh ? { refresh: true } : {} }
      );
      setPosts((prev) => ({ ...prev, [accountId]: res.data.posts || [] }));
    } catch (err) {
      console.error("Failed to load posts", err);
    } finally {
      setPostsLoading(null);
    }
  };

  const toggleExpand = (accountId: string) => {
    if (expandedId === accountId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(accountId);
    setSubTab("growth");
    // Growth dashboard butuh metrics + posts (untuk Video Views & Top Content
    // table) — load keduanya begitu user expand.
    if (!metrics[accountId]) loadMetrics(accountId);
    if (!posts[accountId]) loadPosts(accountId);
  };

  const selectSubTab = (accountId: string, tab: SubTab) => {
    setSubTab(tab);
    if (tab === "schedule") {
      if (!schedules[accountId]) loadSchedules(accountId);
    } else if (tab === "stories") {
      if (!stories[accountId]) loadStories(accountId);
    } else {
      if (!posts[accountId]) loadPosts(accountId);
    }
  };

  const refresh = async () => {
    try {
      const [accRes, cfgRes] = await Promise.all([
        api.get(`/organizations/${orgId}/sosmed/accounts`),
        api.get(`/organizations/${orgId}/sosmed/config`),
      ]);
      setAccounts(accRes.data || []);
      setConfig(cfgRes.data);
    } catch (err) {
      console.error("Failed to load sosmed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) refresh();
  }, [orgId]);

  // Debounce IG username lookup buat collab input. Validasi via Business
  // Discovery API — tampilkan preview profil supaya jelas siapa yang ke-tag.
  useEffect(() => {
    const raw = newCollabInput.trim().replace(/^@/, "");
    if (!raw || !newAccountId || raw.length < 2) {
      setNewCollabLookup(null);
      return;
    }
    // Basic sanity sebelum hit API.
    if (!/^[A-Za-z0-9._]{2,30}$/.test(raw)) {
      setNewCollabLookup({ loading: false, found: false, username: raw, reason: "Format username tidak valid" });
      return;
    }
    setNewCollabLookup({ loading: true });
    const t = setTimeout(async () => {
      try {
        const res = await api.get(
          `/organizations/${orgId}/sosmed/accounts/${newAccountId}/ig-lookup`,
          { params: { username: raw } }
        );
        setNewCollabLookup({ loading: false, ...res.data });
      } catch (err: any) {
        setNewCollabLookup({
          loading: false,
          found: false,
          username: raw,
          reason: err?.response?.data?.detail || "Gagal lookup",
        });
      }
    }, 500);
    return () => clearTimeout(t);
  }, [newCollabInput, newAccountId, orgId]);

  // Surface the Instagram OAuth callback result, then strip the query params.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("ig_connected")) {
      alert("Instagram berhasil terhubung! 🎉");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("ig_error")) {
      alert(`Gagal menghubungkan Instagram: ${params.get("ig_error")}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const connect = async (platform: string, ready: boolean) => {
    if (!ready) {
      alert("Integrasi belum dikonfigurasi. Selesaikan dulu setup developer app (Meta / TikTok) — lihat checklist dari Claude.");
      return;
    }
    if (platform === "instagram") {
      try {
        const res = await api.get(`/organizations/${orgId}/sosmed/connect/instagram`);
        window.location.href = res.data.auth_url; // hop to instagram.com to authorize
      } catch (err) {
        console.error("Failed to start Instagram connect", err);
        alert("Gagal memulai koneksi Instagram. Coba lagi.");
      }
      return;
    }
    // TikTok OAuth wired in a later step.
    alert("Koneksi TikTok sedang disiapkan untuk tahap berikutnya.");
  };

  const disconnect = async (id: string) => {
    if (!confirm("Putuskan koneksi akun ini?")) return;
    try {
      await api.delete(`/organizations/${orgId}/sosmed/accounts/${id}`);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to disconnect", err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const platforms: { key: "instagram" | "tiktok"; label: string; ready: boolean }[] = [
    { key: "instagram", label: "Instagram", ready: !!config?.instagram_ready },
    { key: "tiktok", label: "TikTok", ready: !!config?.tiktok_ready },
  ];

  return (
    <div className="w-full space-y-8 pb-24 p-6">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Share2 className="w-8 h-8 text-primary" /> Sosmed
        </h2>
        <p className="text-muted-foreground">Kelola akun sosial media brand — pantau pertumbuhan & jadwalkan postingan.</p>
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-4 text-xs text-muted-foreground">
        📊 <span className="font-semibold text-foreground">Instagram aktif.</span> Hubungkan akun brand, klik akun untuk lihat pertumbuhan follower. Snapshot diambil otomatis tiap hari. TikTok &amp; penjadwalan post menyusul.
      </div>

      {/* Connect platforms */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {platforms.map((p) => (
          <div key={p.key} className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white">
                {p.key === "instagram" ? <Camera className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
              </div>
              <div>
                <p className="font-bold">{p.label}</p>
                <p className={cn("text-[11px] font-semibold", p.ready ? "text-emerald-600" : "text-muted-foreground")}>
                  {p.ready ? "Siap dihubungkan" : "Belum dikonfigurasi"}
                </p>
              </div>
            </div>
            <button
              onClick={() => connect(p.key, p.ready)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" /> Hubungkan
            </button>
          </div>
        ))}
      </div>

      {/* Connected accounts */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Akun Terhubung</h3>
        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Belum ada akun terhubung.
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map((a) => {
              const expanded = expandedId === a.id;
              const m = metrics[a.id];
              return (
                <div key={a.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between p-3">
                    <button onClick={() => toggleExpand(a.id)} className="flex items-center gap-3 flex-1 text-left min-w-0">
                      <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden text-xs font-bold shrink-0">
                        {a.avatar_url ? <img src={a.avatar_url} alt="" className="w-full h-full object-cover" /> : (a.display_name || a.username || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{a.display_name || a.username}</p>
                        <p className="text-[11px] text-muted-foreground capitalize">{a.platform} · @{a.username}</p>
                      </div>
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", expanded && "rotate-180")} />
                    </button>
                    <button onClick={() => disconnect(a.id)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {expanded && (
                    <div className="border-t border-border bg-secondary/10">
                      {/* Sub-tabs */}
                      <div className="flex items-center gap-1 px-3 pt-3 overflow-x-auto whitespace-nowrap scrollbar-thin">
                        {([
                          { key: "growth", label: "Pertumbuhan" },
                          { key: "calendar", label: "Kalender" },
                          { key: "posts", label: "Postingan" },
                          { key: "stories", label: "Stories" },
                          { key: "schedule", label: "Jadwal" },
                        ] as { key: SubTab; label: string }[]).map((t) => (
                          <button
                            key={t.key}
                            onClick={() => selectSubTab(a.id, t.key)}
                            className={cn(
                              "shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                              subTab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                            )}
                          >
                            {t.label}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            if (subTab === "growth") loadMetrics(a.id, true);
                            else if (subTab === "schedule") loadSchedules(a.id);
                            else if (subTab === "stories") loadStories(a.id, true);
                            else loadPosts(a.id, true);
                          }}
                          disabled={metricsLoading === a.id || postsLoading === a.id || schedulesLoading === a.id || storiesLoading === a.id}
                          className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-secondary transition-all disabled:opacity-50"
                        >
                          <RefreshCw className={cn("w-3.5 h-3.5", (metricsLoading === a.id || postsLoading === a.id || schedulesLoading === a.id) && "animate-spin")} /> Refresh
                        </button>
                      </div>

                      <div className="p-4">
                        {subTab === "growth" && (
                          metricsLoading === a.id && !m ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                          ) : (
                            <GrowthTab accountId={a.id} m={m} posts={posts[a.id] || []} platform={a.platform} />
                          )
                        )}
                        {subTab === "calendar" && (
                          postsLoading === a.id && !posts[a.id] ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                          ) : (
                            <CalendarTab posts={posts[a.id] || []} />
                          )
                        )}
                        {subTab === "posts" && (
                          postsLoading === a.id && !posts[a.id] ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                          ) : (
                            <PostsTab posts={posts[a.id] || []} followers={m?.latest?.followers ?? null} orgId={String(orgId)} accountId={a.id} />
                          )
                        )}
                        {subTab === "stories" && (
                          storiesLoading === a.id && !stories[a.id] ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                          ) : (
                            <StoriesTab payload={stories[a.id]} />
                          )
                        )}
                        {subTab === "schedule" && (
                          schedulesLoading === a.id && !schedules[a.id] ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                          ) : (
                            <ScheduleTab
                              items={schedules[a.id] || []}
                              onCancel={(id) => cancelSchedule(id, a.id)}
                              onCreate={() => openNewSchedule(a.id)}
                            />
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick launcher buat Jadwal Post */}
      {accounts.filter((a) => a.platform === "instagram").length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          <button
            onClick={() => {
              const ig = accounts.find((a) => a.platform === "instagram");
              if (ig) {
                setExpandedId(ig.id);
                setSubTab("schedule");
                if (!schedules[ig.id]) loadSchedules(ig.id);
                openNewSchedule(ig.id);
              }
            }}
            className="rounded-2xl border border-border bg-card p-5 text-left hover:border-primary hover:shadow-[2px_2px_0_#0f172a] dark:hover:shadow-[2px_2px_0_#334155] transition-all"
          >
            <div className="flex items-center gap-2 font-bold mb-1"><CalendarClock className="w-4 h-4 text-primary" /> Jadwal Post Baru</div>
            <p className="text-xs text-muted-foreground">
              Upload gambar/video → atur waktu → auto-publish ke IG. Worker cek tiap 5 menit.
            </p>
          </button>
        </div>
      )}

      {/* Modal: Buat Jadwal Baru */}
      <Modal isOpen={newOpen} onClose={() => setNewOpen(false)} title="Buat Jadwal Posting Baru" className="max-w-lg">
        <div className="space-y-4">
          {/* Brand / akun picker — selalu tampil biar jelas posting ke akun mana */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Brand / Akun</label>
            <select
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-semibold"
            >
              {accounts.filter((a) => a.platform === "instagram").map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name ? `${a.display_name} (@${a.username})` : `@${a.username}`}
                </option>
              ))}
            </select>
          </div>

          {/* Tipe Post: Feed / Carousel / Reels / Story */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Tipe Post</label>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {([
                { key: "FEED" as const, label: "Feed", hint: "Gambar", icon: ImageIcon, requiresVideo: false },
                { key: "CAROUSEL" as const, label: "Carousel", hint: "2-10 media", icon: ImageIcon, requiresVideo: null },
                { key: "REELS" as const, label: "Reels", hint: "Video", icon: Camera, requiresVideo: true },
                { key: "STORY" as const, label: "Story", hint: "24 jam", icon: CalendarClock, requiresVideo: null },
              ]).map((t) => {
                // Single-file mode → cek match dgn requiresVideo.
                const isVideo = newFile ? (newFile.type || "").startsWith("video/") : false;
                const disabled = t.key !== "CAROUSEL" && newFile != null && (
                  (t.requiresVideo === true && !isVideo) ||
                  (t.requiresVideo === false && isVideo)
                );
                const Icon = t.icon;
                const active = newPostType === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => setNewPostType(t.key)}
                    className={cn(
                      "flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border-2 text-xs font-bold transition-all",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground hover:border-primary/50",
                      disabled && "opacity-40 cursor-not-allowed hover:border-border"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{t.label}</span>
                    <span className="text-[9px] font-normal text-muted-foreground">{t.hint}</span>
                  </button>
                );
              })}
            </div>
            {newPostType === "STORY" && (
              <p className="text-[10px] text-muted-foreground italic mt-1.5">
                ⓘ Story gak terima caption — caption diabaikan saat publish.
              </p>
            )}
            {newPostType === "CAROUSEL" && (
              <p className="text-[10px] text-muted-foreground italic mt-1.5">
                ⓘ Carousel: 2-10 media (gambar/video boleh campur). Urutan ikut order upload.
              </p>
            )}
          </div>

          {/* Media picker — beda UI utk CAROUSEL vs single */}
          {newPostType === "CAROUSEL" ? (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">
                Media Carousel ({newCarouselFiles.length}/10)
              </label>
              {newCarouselFiles.length > 0 && (
                <div className="mt-1 grid grid-cols-5 gap-2">
                  {newCarouselPreviews.map((src, i) => {
                    const isVid = (newCarouselFiles[i].type || "").startsWith("video/");
                    return (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-secondary group">
                        {isVid ? (
                          <video src={src} className="w-full h-full object-cover" />
                        ) : (
                          <img src={src} alt="" className="w-full h-full object-cover" />
                        )}
                        <span className="absolute top-1 left-1 text-[9px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded">{i + 1}</span>
                        <button
                          onClick={() => removeCarouselAt(i)}
                          className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Hapus"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {newCarouselFiles.length < 10 && (
                <label className="mt-2 flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-border bg-secondary/30 hover:bg-secondary/60 cursor-pointer transition-all">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <p className="text-[11px] text-muted-foreground text-center">
                    Klik untuk tambah media (bisa pilih banyak)<br />
                    <span className="text-[9px] italic">Max 10 · campur gambar + video boleh</span>
                  </p>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => { pickCarouselFiles(e.target.files); e.currentTarget.value = ""; }}
                  />
                </label>
              )}
            </div>
          ) : (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Media</label>
              {newPreview ? (
                <div className="mt-1 relative rounded-xl border border-border overflow-hidden bg-secondary">
                  {newFile?.type.startsWith("video/") ? (
                    <video src={newPreview} controls className="w-full max-h-64 object-contain bg-black" />
                  ) : (
                    <img src={newPreview} alt="" className="w-full max-h-64 object-contain" />
                  )}
                  <button
                    onClick={() => pickNewFile(null)}
                    className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white hover:bg-black/80"
                    title="Hapus"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="mt-1 flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-border bg-secondary/30 hover:bg-secondary/60 cursor-pointer transition-all">
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground text-center">
                    Klik untuk pilih gambar / video<br />
                    <span className="text-[10px] italic">JPG/PNG → IMAGE · MP4/MOV → REELS · max 50MB</span>
                  </p>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => pickNewFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>
          )}

          {/* Reels-only extras: Collaborators + Share to Feed */}
          {newPostType === "REELS" && (
            <div className="space-y-3 p-3 rounded-xl border border-border bg-secondary/20">
              <p className="text-[10px] uppercase tracking-widest font-extrabold text-primary">Opsi Reels</p>

              {/* Collaborators */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground">Collaborators (opsional, max 3)</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={newCollabInput}
                    onChange={(e) => setNewCollabInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCollab(); } }}
                    placeholder="@username"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
                  />
                  <button
                    type="button"
                    onClick={addCollab}
                    disabled={
                      !newCollabInput.trim() ||
                      newCollaborators.length >= 3 ||
                      !newCollabLookup ||
                      newCollabLookup.loading ||
                      newCollabLookup.found !== true
                    }
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40"
                  >
                    Tambah
                  </button>
                </div>

                {/* Preview lookup result — validation feedback */}
                {newCollabInput.trim() && newCollabLookup && (
                  <div className="mt-2">
                    {newCollabLookup.loading ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Cek username...</span>
                      </div>
                    ) : newCollabLookup.found ? (
                      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300/50">
                        {newCollabLookup.profile_picture_url ? (
                          <img
                            src={newCollabLookup.profile_picture_url}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-border bg-secondary"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-bold">
                            {(newCollabLookup.username || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">
                            {newCollabLookup.name || `@${newCollabLookup.username}`}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            @{newCollabLookup.username}
                            {newCollabLookup.followers_count != null && (
                              <> · {newCollabLookup.followers_count.toLocaleString("id-ID")} followers</>
                            )}
                          </p>
                        </div>
                        <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400">
                          ✓ VALID
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-300/50">
                        <X className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-snug">
                          {newCollabLookup.reason || "Username tidak ditemukan."}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {newCollaborators.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {newCollaborators.map((u) => (
                      <span key={u} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                        @{u}
                        <button onClick={() => setNewCollaborators(newCollaborators.filter((x) => x !== u))}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[9px] text-muted-foreground italic mt-1">
                  Collaborator harus accept invite di IG mereka — post tampil di kedua akun.
                </p>
              </div>

              {/* Share to Feed */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newShareToFeed}
                  onChange={(e) => setNewShareToFeed(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-xs font-bold">Share ke Feed juga</span>
                <span className="text-[10px] text-muted-foreground italic">(default ON)</span>
              </label>
            </div>
          )}

          {/* Caption */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Caption</label>
            <textarea
              value={newCaption}
              onChange={(e) => setNewCaption(e.target.value)}
              rows={4}
              placeholder="Caption posting + hashtag..."
              className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">{newCaption.length} karakter</p>
          </div>

          {/* Schedule datetime */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Waktu Tayang</label>
            <input
              type="datetime-local"
              value={newAt}
              onChange={(e) => setNewAt(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <p className="text-[10px] text-muted-foreground italic mt-1">
              Worker cek tiap 5 menit. Toleransi ±5 menit dari waktu yang dipilih.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setNewOpen(false)}
              disabled={newSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-bold text-muted-foreground hover:bg-secondary transition-all"
            >
              Batal
            </button>
            <button
              onClick={submitNewSchedule}
              disabled={newSubmitting || !newAt || (newPostType === "CAROUSEL" ? newCarouselFiles.length < 2 : !newFile)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-all"
            >
              {newSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
              {newSubmitting ? "Menjadwalkan..." : "Jadwalkan"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Dispatcher — pilih dashboard layout sesuai platform.
function GrowthTab({ accountId, m, posts, platform }: {
  accountId: string;
  m?: AccountMetrics;
  posts: Post[];
  platform: "instagram" | "tiktok";
}) {
  if (!m) return <p className="text-xs text-muted-foreground text-center py-4">Belum ada data.</p>;
  if (platform === "instagram") {
    return <InstagramDashboard accountId={accountId} m={m} posts={posts} />;
  }
  return <TiktokDashboard accountId={accountId} m={m} posts={posts} />;
}

// ─── Shared computation utils ────────────────────────────────────────────────
function deltaPct(delta: number | null, base: number) {
  if (delta == null || base === 0) return null;
  return (delta / Math.max(base, 1)) * 100;
}

// ─── TikTok dashboard (6 KPI horizontal) ─────────────────────────────────────
function TiktokDashboard({ accountId, m, posts }: { accountId: string; m: AccountMetrics; posts: Post[] }) {
  const latest = m.latest;
  const firstRec = m.history[0] || null;
  const postCount = posts.length;

  const followers = latest?.followers ?? 0;
  const totalViews = posts.reduce((s, p) => s + (p.reach ?? 0), 0);
  const totalLikes = latest?.likes ?? 0;
  const totalComments = latest?.comments ?? 0;
  const totalShares = latest?.shares ?? 0;
  const engagement = totalLikes + totalComments + totalShares;
  const engagementRate = totalViews > 0 ? (engagement / totalViews) * 100 : 0;

  const dFollowers = firstRec ? followers - (firstRec.followers ?? 0) : null;
  const dLikes = firstRec ? totalLikes - (firstRec.likes ?? 0) : null;
  const dComments = firstRec ? totalComments - (firstRec.comments ?? 0) : null;
  const dShares = firstRec ? totalShares - (firstRec.shares ?? 0) : null;
  const firstEng = (firstRec ? (firstRec.likes ?? 0) + (firstRec.comments ?? 0) + (firstRec.shares ?? 0) : 0);

  const audienceData = m.history.map((h) => ({ date: h.date, followers: h.followers ?? 0 }));
  const engagementData = m.history.map((h) => ({
    date: h.date,
    likes: h.likes ?? 0,
    engagement: ((h.likes ?? 0) + (h.comments ?? 0) + (h.shares ?? 0)),
    views: 0,
  }));
  if (engagementData.length > 0) engagementData[engagementData.length - 1].views = totalViews;

  const hasHistory = m.history.length >= 2;

  return (
    <div className="space-y-6">
      {/* ─── 6 KPI cards row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          label="Followers"
          value={followers}
          delta={dFollowers}
          deltaPct={deltaPct(dFollowers, firstRec?.followers ?? 0)}
          subtitle="Total followers"
          icon={<Users className="w-3.5 h-3.5" />}
          color="bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
        />
        <KPICard
          label="Video Views"
          value={totalViews}
          delta={null}
          deltaPct={null}
          subtitle={postCount > 0 ? `Avg ${Math.round(totalViews / postCount).toLocaleString("id-ID")} per video` : "Belum ada postingan"}
          subtitle2="Total across all videos"
          icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
          color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        />
        <KPICard
          label="Total Likes"
          value={totalLikes}
          delta={dLikes}
          deltaPct={deltaPct(dLikes, firstRec?.likes ?? 0)}
          subtitle={postCount > 0 ? `Avg ${Math.round(totalLikes / postCount).toLocaleString("id-ID")} per video` : "Profile + video likes"}
          subtitle2="Profile + video likes"
          icon={<Heart className="w-3.5 h-3.5" />}
          color="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
        />
        <KPICard
          label="Comments"
          value={totalComments}
          delta={dComments}
          deltaPct={deltaPct(dComments, firstRec?.comments ?? 0)}
          subtitle={postCount > 0 ? `Avg ${Math.round(totalComments / postCount).toLocaleString("id-ID")} per video` : "Total comments"}
          subtitle2="Total comments received"
          icon={<MessageCircle className="w-3.5 h-3.5" />}
          color="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
        />
        <KPICard
          label="Shares"
          value={totalShares}
          delta={dShares}
          deltaPct={deltaPct(dShares, firstRec?.shares ?? 0)}
          subtitle={postCount > 0 ? `Avg ${Math.round(totalShares / postCount).toLocaleString("id-ID")} per video` : "Total shares"}
          subtitle2="Total video shares"
          icon={<Share2 className="w-3.5 h-3.5" />}
          color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
        />
        <KPICard
          label="Engagement Rate"
          value={engagementRate}
          delta={null}
          deltaPct={firstEng > 0 && totalViews > 0 ? engagementRate - ((firstEng / Math.max(totalViews, 1)) * 100) : null}
          subtitle="Interactions / views"
          isPercent
          icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 12l3-3 3 3 4-4 5 5 3-3"/></svg>}
          color="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
        />
      </div>

      {/* ─── Charts row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Audience Growth" subtitle="Daily follower snapshots">
          {hasHistory ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={audienceData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`audience-${accountId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f172a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0f172a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.slice(5)} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="followers" name="Followers" stroke="#0f172a" strokeWidth={2} fill={`url(#audience-${accountId})`} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard title="Engagement Over Time" subtitle="Daily total likes & engagement">
          {hasHistory ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={engagementData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.slice(5)} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="likes" name="Likes" stroke="#facc15" strokeWidth={2} fillOpacity={0.2} fill="#facc15" />
                  <Area type="monotone" dataKey="engagement" name="Total Engagement" stroke="#ec4899" strokeWidth={2} fillOpacity={0.15} fill="#ec4899" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      {/* ─── Top Performing Content table ────────────────────────────────── */}
      <TopPerformingTable posts={posts} followers={followers} platform="tiktok" />

      {(m.latest?.shares == null && m.latest?.saves == null) && (
        <p className="text-[11px] text-muted-foreground italic">
          Share &amp; Save kosong? Hubungkan ulang akun untuk memberi izin insights, lalu Refresh.
        </p>
      )}
    </div>
  );
}

// ─── Instagram dashboard (4 KPI grouped + content format + demographics) ────
function InstagramDashboard({ accountId, m, posts }: { accountId: string; m: AccountMetrics; posts: Post[] }) {
  const latest = m.latest;
  const firstRec = m.history[0] || null;
  const postCount = posts.length;

  // Profile header data (dari account info — sosmed page punya akses
  // tapi GrowthTab tidak. Display "bio" akan kosong sampai backend ekspos
  // bio field — sementara pakai display_name + handle saja).
  const followers = latest?.followers ?? 0;
  const following = latest?.following ?? 0;
  const posts_count = latest?.posts_count ?? postCount;

  // KPI grouping (sesuai screenshot IG):
  // VIEWS: total reach (content plays & displays) + sub "Accounts reached"
  // INTERACTIONS: likes+comments+shares+saves
  // PROFILE: profile_visits + external_link_taps (belum ada di MetricPoint)
  // ENGAGEMENT: saves (utama) + breakdown likes/comments/shares/saves
  const totalReach = posts.reduce((s, p) => s + (p.reach ?? 0), 0);
  const totalLikes = posts.reduce((s, p) => s + (p.like_count ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.comments_count ?? 0), 0);
  const totalShares = posts.reduce((s, p) => s + (p.shares ?? 0), 0);
  const totalSaves = posts.reduce((s, p) => s + (p.saved ?? 0), 0);
  const totalInteractions = totalLikes + totalComments + totalShares + totalSaves;

  // Content format split — Reels vs Carousels vs Image dari media_type.
  // IG media_type: IMAGE, VIDEO, CAROUSEL_ALBUM, REELS (atau VIDEO untuk reels).
  const formatCount = posts.reduce(
    (acc, p) => {
      const t = (p.media_type || "").toUpperCase();
      if (t.includes("CAROUSEL")) acc.carousel++;
      else if (t.includes("VIDEO") || t.includes("REELS") || t.includes("REEL")) acc.reels++;
      else acc.image++;
      return acc;
    },
    { reels: 0, carousel: 0, image: 0 },
  );
  const totalFormatPosts = formatCount.reels + formatCount.carousel + formatCount.image;

  // Profile insights (dari Graph API /me/insights — kosong kalau akun gak
  // qualified untuk audience demographics, atau scope belum granted).
  const insights = m.insights || {};
  const profile = insights.profile || {};
  const demographics = insights.demographics || {};
  const insightsErrors = insights.errors || [];
  // Graph v22+ pakai `views` sebagai umbrella metric (gabung profile_views
  // + impression context). Untuk external link taps, ambil yang TERBESAR
  // antara website_clicks (akun bio single-website) vs profile_links_taps
  // (akun bio multi-link). Akun bisa punya 0 di salah satu — gak boleh
  // pakai ?? karena 0 bukan nullish jadi gak fall back.
  const profileViews = profile.views ?? profile.profile_views ?? 0;
  const websiteClicks = Math.max(profile.profile_links_taps ?? 0, profile.website_clicks ?? 0);
  const accountsEngaged = profile.accounts_engaged ?? 0;
  const profileReach = profile.reach ?? 0;
  // Error spesifik per area, di-extract dari errors[] yang punya prefix.
  const profileErr = insightsErrors.find((e: string) => e.startsWith("profile:"))?.replace(/^profile:\s*/, "");
  const demoErr = (key: string) =>
    insightsErrors.find((e: string) => e.startsWith(`demographics.${key}:`))?.replace(/^demographics\.[^:]+:\s*/, "");

  // Audience growth chart (followers only — kalau backend nantinya simpan
  // reach harian, tinggal tambah dataKey "reach").
  const audienceData = m.history.map((h) => ({ date: h.date, followers: h.followers ?? 0 }));
  const engagementData = m.history.map((h) => ({
    date: h.date,
    likes: h.likes ?? 0,
    comments: h.comments ?? 0,
    engagement: ((h.likes ?? 0) + (h.comments ?? 0) + (h.shares ?? 0)),
  }));
  const hasHistory = m.history.length >= 2;

  const dFollowers = firstRec ? followers - (firstRec.followers ?? 0) : null;

  return (
    <div className="space-y-6">
      {/* ─── Profile header bar ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[2px_2px_0_#0f172a] dark:shadow-[2px_2px_0_#334155]">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-full bg-secondary border border-border overflow-hidden shrink-0 flex items-center justify-center text-base font-bold">
            {m.account.avatar_url
              ? <img src={m.account.avatar_url} alt="" className="w-full h-full object-cover" />
              : (m.account.display_name || m.account.username || "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-lg leading-tight">{m.account.display_name || m.account.username}</h3>
            <p className="text-xs text-muted-foreground">@{m.account.username}</p>
            <div className="flex items-center gap-4 mt-2 text-[11px] font-bold uppercase tracking-widest">
              <span><span className="text-muted-foreground">Followers</span> <span className="tabular-nums">{followers.toLocaleString("id-ID")}</span></span>
              <span><span className="text-muted-foreground">Following</span> <span className="tabular-nums">{following.toLocaleString("id-ID")}</span></span>
              <span><span className="text-muted-foreground">Posts</span> <span className="tabular-nums">{posts_count.toLocaleString("id-ID")}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 4 KPI grouped cards row (IG layout) ───────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <IgKpiCard
          label="Views"
          icon={<Eye className="w-3.5 h-3.5" />}
          color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          main={{ value: totalReach, sub: "Content plays & displays" }}
          breakdown={[
            { label: "Accounts reached", value: profileReach > 0 ? profileReach : totalReach },
          ]}
        />
        <IgKpiCard
          label="Interactions"
          icon={<Heart className="w-3.5 h-3.5" />}
          color="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
          main={{ value: totalInteractions, sub: "Likes, comments, shares & saves" }}
          breakdown={[
            { label: "Accounts engaged", value: accountsEngaged > 0 ? accountsEngaged : totalInteractions },
          ]}
        />
        <IgKpiCard
          label="Profile"
          icon={<Users className="w-3.5 h-3.5" />}
          color="bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
          main={{ value: profileViews + websiteClicks, sub: "Profile activity" }}
          breakdown={[
            { label: "Profile visits", value: profileViews },
            { label: "External link taps", value: websiteClicks },
          ]}
          note={profileErr
            ? `Graph API: ${profileErr}`
            : (profileViews === 0 && websiteClicks === 0
              ? "Belum ada data. Akun butuh Business mode (bukan Creator/Personal)."
              : undefined)}
        />
        <IgKpiCard
          label="Engagement"
          icon={<Bookmark className="w-3.5 h-3.5" />}
          color="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
          main={{ value: totalSaves, sub: "Content saves" }}
          breakdown={[
            { label: "Likes", value: totalLikes },
            { label: "Comments", value: totalComments },
            { label: "Shares", value: totalShares },
            { label: "Saves", value: totalSaves },
          ]}
        />
      </div>

      {/* ─── Charts row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Follower Net Growth" subtitle="Instagram specific growth metrics">
          {hasHistory ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={audienceData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`audience-ig-${accountId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.slice(5)} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="followers" name="Followers" stroke="#8b5cf6" strokeWidth={2} fill={`url(#audience-ig-${accountId})`} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
          {dFollowers != null && (
            <p className="text-[10px] text-muted-foreground mt-2">
              {dFollowers > 0 ? "+" : ""}{dFollowers.toLocaleString("id-ID")} followers sejak data pertama
            </p>
          )}
        </ChartCard>

        <ChartCard title="Engagement Over Time" subtitle="Likes vs comments">
          {hasHistory ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={engagementData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.slice(5)} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="likes" name="Likes" stroke="#facc15" strokeWidth={2} fillOpacity={0.25} fill="#facc15" />
                  <Area type="monotone" dataKey="comments" name="Comments" stroke="#0ea5e9" strokeWidth={2} fillOpacity={0.2} fill="#0ea5e9" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      {/* ─── Content Format + Demographics row ──────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <ChartCard title="Content Format" subtitle="Performance by type">
          {totalFormatPosts > 0 ? (
            <div className="flex items-center gap-4">
              <ContentFormatDonut counts={formatCount} total={totalFormatPosts} />
              <ul className="space-y-1 text-xs flex-1">
                <li className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-sky-400" /> Reels</span> <strong className="tabular-nums">{formatCount.reels}</strong></li>
                <li className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400" /> Carousels</span> <strong className="tabular-nums">{formatCount.carousel}</strong></li>
                <li className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-slate-400" /> Image</span> <strong className="tabular-nums">{formatCount.image}</strong></li>
              </ul>
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground text-center py-6">Belum ada postingan.</p>
          )}
        </ChartCard>

        <ChartCard title="Gender Split" subtitle="Audience demographics">
          <DemoBars
            data={demographics.gender_age || {}}
            colorOf={(label: string) => label.toLowerCase() === "f" || label.toLowerCase().startsWith("female") ? "bg-rose-500"
              : label.toLowerCase() === "m" || label.toLowerCase().startsWith("male") ? "bg-slate-700 dark:bg-slate-300"
              : "bg-amber-500"}
            labelOf={(label: string) => label === "F" ? "Female" : label === "M" ? "Male" : label === "U" ? "Other" : label}
            emptyNote={demoErr("gender_age") ? `Graph API: ${demoErr("gender_age")}` : "Belum tersedia — butuh ≥ 100 follower yg engage + Business mode."}
          />
        </ChartCard>

        <ChartCard title="Top Cities" subtitle="Audience location">
          <DemoBars
            data={demographics.city || {}}
            top={5}
            colorOf={() => "bg-pink-400"}
            emptyNote={demoErr("city") ? `Graph API: ${demoErr("city")}` : "Belum tersedia — butuh ≥ 100 follower yg engage + Business mode."}
          />
        </ChartCard>

        <ChartCard title="Age Range" subtitle="Audience age distribution">
          <DemoBars
            data={demographics.age || {}}
            colorOf={() => "bg-indigo-500"}
            sortBy="key"
            emptyNote={demoErr("age") ? `Graph API: ${demoErr("age")}` : "Belum tersedia — butuh ≥ 100 follower yg engage + Business mode."}
          />
        </ChartCard>
      </div>

      {/* ─── Top Performing Content table ──────────────────────────────────── */}
      <TopPerformingTable posts={posts} followers={followers} platform="instagram" />

      {(m.latest?.shares == null && m.latest?.saves == null) && (
        <p className="text-[11px] text-muted-foreground italic">
          Share &amp; Save kosong? Hubungkan ulang akun untuk memberi izin insights, lalu Refresh.
        </p>
      )}
    </div>
  );
}

// IG KPI card — main number + sub-list breakdown.
function IgKpiCard({
  label, icon, color, main, breakdown, note,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  main: { value: number; sub: string };
  breakdown?: { label: string; value: number }[];
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[2px_2px_0_#0f172a] dark:shadow-[2px_2px_0_#334155] flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        <span className={cn("w-6 h-6 rounded-full flex items-center justify-center", color)}>{icon}</span>
      </div>
      <p className="text-2xl font-extrabold tabular-nums leading-tight">
        {main.value >= 1000 ? `${(main.value / 1000).toFixed(main.value >= 10000 ? 0 : 1)}K`.replace(".0K", "K") : main.value.toLocaleString("id-ID")}
      </p>
      <p className="text-[10px] text-muted-foreground">{main.sub}</p>
      {breakdown && breakdown.length > 0 && (
        <ul className="space-y-0.5 mt-1 pt-2 border-t border-border/60">
          {breakdown.map((b) => (
            <li key={b.label} className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{b.label}</span>
              <strong className="tabular-nums">{b.value.toLocaleString("id-ID")}</strong>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="text-[9px] italic text-muted-foreground mt-1">{note}</p>}
    </div>
  );
}

// Simple SVG donut chart for IG content format.
function ContentFormatDonut({ counts, total }: { counts: { reels: number; carousel: number; image: number }; total: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const reelsLen = (counts.reels / total) * c;
  const carouselLen = (counts.carousel / total) * c;
  const imageLen = (counts.image / total) * c;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="shrink-0">
      <circle cx="48" cy="48" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="14" />
      {/* Reels segment */}
      {counts.reels > 0 && (
        <circle cx="48" cy="48" r={r} fill="none" stroke="#38bdf8" strokeWidth="14"
          strokeDasharray={`${reelsLen} ${c}`}
          transform="rotate(-90 48 48)"
        />
      )}
      {/* Carousel segment */}
      {counts.carousel > 0 && (
        <circle cx="48" cy="48" r={r} fill="none" stroke="#fb7185" strokeWidth="14"
          strokeDasharray={`${carouselLen} ${c}`}
          strokeDashoffset={-reelsLen}
          transform="rotate(-90 48 48)"
        />
      )}
      {/* Image segment */}
      {counts.image > 0 && (
        <circle cx="48" cy="48" r={r} fill="none" stroke="#94a3b8" strokeWidth="14"
          strokeDasharray={`${imageLen} ${c}`}
          strokeDashoffset={-(reelsLen + carouselLen)}
          transform="rotate(-90 48 48)"
        />
      )}
      <text x="48" y="50" textAnchor="middle" dominantBaseline="middle" className="text-xs font-extrabold fill-foreground">
        {total}
      </text>
      <text x="48" y="62" textAnchor="middle" dominantBaseline="middle" className="text-[8px] font-bold uppercase tracking-widest fill-muted-foreground">
        Posts
      </text>
    </svg>
  );
}

/** Horizontal bar chart untuk demographics row (gender/cities/age).
 *  Sort default by value desc. `top` opsional — batasin jumlah baris (city
 *  biasanya banyak, ambil top 5). `colorOf` & `labelOf` callback opsional
 *  buat customisation per-baris. */
function DemoBars({
  data, top, colorOf, labelOf, sortBy = "value", emptyNote,
}: {
  data: Record<string, number>;
  top?: number;
  colorOf?: (label: string) => string;
  labelOf?: (label: string) => string;
  sortBy?: "value" | "key";
  emptyNote?: string;
}) {
  const entries = Object.entries(data).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) {
    return (
      <div className="h-28 flex items-center justify-center text-center text-[10px] italic text-muted-foreground px-3">
        {emptyNote || "Belum ada data."}
      </div>
    );
  }
  const sorted = entries.sort((a, b) => sortBy === "value" ? Number(b[1]) - Number(a[1]) : a[0].localeCompare(b[0]));
  const sliced = top ? sorted.slice(0, top) : sorted;
  const total = sliced.reduce((s, [, v]) => s + Number(v), 0);
  return (
    <ul className="space-y-1.5">
      {sliced.map(([label, value]) => {
        const v = Number(value);
        const pct = total > 0 ? (v / total) * 100 : 0;
        const color = colorOf ? colorOf(label) : "bg-primary";
        const display = labelOf ? labelOf(label) : label;
        return (
          <li key={label}>
            <div className="flex items-center justify-between text-[10px] font-medium">
              <span className="truncate">{display}</span>
              <span className="tabular-nums text-muted-foreground">{pct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── KPI card component ──────────────────────────────────────────────────────
function KPICard({
  label, value, delta, deltaPct, subtitle, subtitle2, icon, color, isPercent = false,
}: {
  label: string;
  value: number;
  delta: number | null;
  deltaPct: number | null;
  subtitle: string;
  subtitle2?: string;
  icon: React.ReactNode;
  color: string;
  isPercent?: boolean;
}) {
  const hasDelta = delta != null || deltaPct != null;
  const positive = (delta ?? deltaPct ?? 0) >= 0;
  return (
    <div className="relative rounded-2xl border border-border bg-card p-4 shadow-[2px_2px_0_#0f172a] dark:shadow-[2px_2px_0_#334155] flex flex-col gap-1.5">
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        <span className={cn("w-6 h-6 rounded-full flex items-center justify-center", color)}>
          {icon}
        </span>
      </div>
      <p className="text-2xl font-extrabold tabular-nums leading-tight">
        {isPercent
          ? `${value.toFixed(2)}%`
          : value >= 1000
            ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`.replace(".0K", "K")
            : value.toLocaleString("id-ID")}
      </p>
      {hasDelta && (
        <div className="flex items-center gap-1 text-[10px] font-bold">
          {positive ? (
            <ArrowUp className="w-3 h-3 text-emerald-500" />
          ) : (
            <ArrowDown className="w-3 h-3 text-rose-500" />
          )}
          {delta != null && (
            <span className={positive ? "text-emerald-600" : "text-rose-600"}>
              {positive ? "+" : ""}{Math.abs(delta) >= 1000 ? `${(delta / 1000).toFixed(1)}K` : delta.toLocaleString("id-ID")}
            </span>
          )}
          {deltaPct != null && (
            <span className={cn("px-1 rounded", positive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40" : "bg-rose-100 text-rose-700 dark:bg-rose-900/40")}>
              {positive ? "+" : ""}{deltaPct.toFixed(1)}%
            </span>
          )}
          <span className="text-muted-foreground">vs first record</span>
        </div>
      )}
      {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      {subtitle2 && <p className="text-[10px] text-muted-foreground font-semibold mt-1">{subtitle2}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[2px_2px_0_#0f172a] dark:shadow-[2px_2px_0_#334155]">
      <div className="mb-3">
        <h3 className="font-extrabold text-sm uppercase tracking-widest">{title}</h3>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-56 flex items-center justify-center text-xs text-muted-foreground italic text-center px-6">
      Grafik muncul setelah ada minimal 2 hari snapshot. Refresh besok untuk lihat tren.
    </div>
  );
}

// ─── Top Performing Content table ────────────────────────────────────────────
type SortKey = "posted_at" | "reach" | "like_count" | "shares" | "saved" | "comments_count" | "engagement";

function TopPerformingTable({ posts, followers, platform }: { posts: Post[]; followers: number; platform: "instagram" | "tiktok" }) {
  const [sortKey, setSortKey] = useState<SortKey>("engagement");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const arr = [...posts];
    arr.sort((a, b) => {
      let av: any = (a as any)[sortKey];
      let bv: any = (b as any)[sortKey];
      if (sortKey === "posted_at") {
        av = av ? new Date(av).getTime() : 0;
        bv = bv ? new Date(bv).getTime() : 0;
      } else {
        av = av ?? 0;
        bv = bv ?? 0;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return arr;
  }, [posts, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const platformBadge = platform === "tiktok"
    ? "bg-sky-200 text-sky-900 border-sky-300"
    : "bg-pink-200 text-pink-900 border-pink-300";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-[2px_2px_0_#0f172a] dark:shadow-[2px_2px_0_#334155]">
      <div className="bg-amber-300 dark:bg-amber-400 px-4 py-2.5">
        <h3 className="font-extrabold text-sm uppercase tracking-widest text-amber-950">Top Performing Content</h3>
      </div>
      {posts.length === 0 ? (
        <p className="text-xs italic text-muted-foreground text-center py-8">
          Belum ada postingan. Klik tab Postingan lalu Refresh.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-3 py-2 text-left font-bold uppercase tracking-widest">Content</th>
                <th className="px-3 py-2 text-left font-bold uppercase tracking-widest">Platform</th>
                <SortableTh label="Date Created" k="posted_at" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Views" k="reach" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Likes" k="like_count" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Shares" k="shares" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Saves" k="saved" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Comments" k="comments_count" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Engagement" k="engagement" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.slice(0, 20).map((p) => {
                const rate = followers > 0 ? (p.engagement / followers) * 100 : (p.reach && p.reach > 0 ? (p.engagement / p.reach) * 100 : null);
                const isOpen = expandedId === p.id;
                const isReel = (p.media_type || "").toUpperCase() === "VIDEO" || (p.media_type || "").toUpperCase() === "REELS";
                const hasDeep = p.total_interactions != null || p.profile_visits != null || p.follows != null || p.profile_activity != null || p.navigation != null || p.avg_watch_time_ms != null;
                return (
                  <React.Fragment key={p.id}>
                    <tr
                      onClick={() => setExpandedId(isOpen ? null : p.id)}
                      className={cn("transition-colors cursor-pointer", isOpen ? "bg-amber-50/60 dark:bg-amber-950/20" : "hover:bg-secondary/30")}
                    >
                      <td className="px-3 py-2 max-w-[240px]">
                        <div className="flex items-center gap-2 group">
                          <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0", isOpen && "rotate-180")} />
                          <span className="w-9 h-9 rounded bg-secondary overflow-hidden shrink-0 flex items-center justify-center border border-border">
                            {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-muted-foreground" />}
                          </span>
                          <span className="truncate text-xs font-medium">
                            {p.caption || "(tanpa caption)"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-widest border", platformBadge)}>
                          {platform}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">
                        {p.posted_at ? new Date(p.posted_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{(p.reach ?? 0).toLocaleString("id-ID")}</td>
                      <td className="px-3 py-2 tabular-nums">{(p.like_count ?? 0).toLocaleString("id-ID")}</td>
                      <td className="px-3 py-2 tabular-nums">{(p.shares ?? 0).toLocaleString("id-ID")}</td>
                      <td className="px-3 py-2 tabular-nums">{(p.saved ?? 0).toLocaleString("id-ID")}</td>
                      <td className="px-3 py-2 tabular-nums">{(p.comments_count ?? 0).toLocaleString("id-ID")}</td>
                      <td className="px-3 py-2 tabular-nums font-bold">{rate != null ? `${rate.toFixed(1)}%` : "—"}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-amber-50/30 dark:bg-amber-950/10">
                        <td colSpan={9} className="px-4 py-3">
                          {!hasDeep ? (
                            <p className="text-[11px] text-muted-foreground italic">
                              Insights detail belum tersedia. Klik Refresh di tab Postingan untuk fetch ulang
                              (atau scope insights token belum lengkap).
                            </p>
                          ) : (
                            <div className="space-y-2.5">
                              <p className="text-[10px] uppercase tracking-widest font-extrabold text-amber-900 dark:text-amber-300">Insights Detail</p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                                <DeepStat label="Interaksi Total" val={p.total_interactions} />
                                <DeepStat label="Profil Dilihat" val={p.profile_visits} />
                                <DeepStat label="Aktivitas Profil" val={p.profile_activity} hint="Tap link/email/CTA" />
                                <DeepStat label="Follow Baru" val={p.follows} />
                                {p.views != null && <DeepStat label="Views" val={p.views} />}
                                {isReel && p.navigation != null && (
                                  <DeepStat label="Navigation" val={p.navigation} hint="Swipe / dismiss" />
                                )}
                                {isReel && p.avg_watch_time_ms != null && (
                                  <DeepStat label="Avg Watch" val={null} display={`${(p.avg_watch_time_ms / 1000).toFixed(1)}s`} />
                                )}
                                {isReel && p.total_watch_time_ms != null && (
                                  <DeepStat label="Total Watch" val={null} display={formatDuration(p.total_watch_time_ms)} />
                                )}
                              </div>
                              {p.permalink && (
                                <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                                  <ExternalLink className="w-2.5 h-2.5" /> Buka post di IG
                                </a>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {posts.length > 20 && (
            <p className="text-[10px] text-muted-foreground italic text-center py-2 border-t border-border">
              Menampilkan 20 dari {posts.length} postingan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DeepStat({ label, val, hint, display }: { label: string; val: number | null | undefined; hint?: string; display?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold leading-tight">{label}</p>
      <p className="text-sm font-extrabold tabular-nums mt-0.5">
        {display ?? (val != null ? val.toLocaleString("id-ID") : "—")}
      </p>
      {hint && <p className="text-[9px] text-muted-foreground italic mt-0.5">{hint}</p>}
    </div>
  );
}

function formatDuration(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins < 60) return rem ? `${mins}m ${rem}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rmin = mins % 60;
  return rmin ? `${hrs}h ${rmin}m` : `${hrs}h`;
}

function SortableTh({ label, k, sortKey, sortDir, onClick }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc"; onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onClick(k)}
      className="px-3 py-2 text-left font-bold uppercase tracking-widest cursor-pointer hover:bg-slate-800 transition-colors select-none"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortDir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
        ) : (
          <span className="opacity-30 flex flex-col leading-none">
            <ArrowUp className="w-2.5 h-2.5 -mb-1" />
            <ArrowDown className="w-2.5 h-2.5" />
          </span>
        )}
      </span>
    </th>
  );
}

function CalendarTab({ posts }: { posts: Post[] }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const byDay = useMemo(() => {
    const map: Record<string, Post[]> = {};
    for (const p of posts) {
      if (!p.posted_at) continue;
      const d = new Date(p.posted_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      (map[key] ||= []).push(p);
    }
    return map;
  }, [posts]);

  const year = month.getFullYear();
  const mIdx = month.getMonth();
  const firstWeekday = new Date(year, mIdx, 1).getDay();
  const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = month.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const postsThisMonth = cells.reduce((s: number, day) => s + (day ? (byDay[`${year}-${mIdx}-${day}`]?.length || 0) : 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonth(new Date(year, mIdx - 1, 1))} className="p-1.5 rounded-lg hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
        <div className="text-center">
          <p className="text-sm font-bold capitalize">{monthLabel}</p>
          <p className="text-[11px] text-muted-foreground">{postsThisMonth} postingan bulan ini</p>
        </div>
        <button onClick={() => setMonth(new Date(year, mIdx + 1, 1))} className="p-1.5 rounded-lg hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d, i) => (
          <div key={i} className="text-[10px] font-semibold text-muted-foreground py-1">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day == null) return <div key={i} />;
          const dayPosts = byDay[`${year}-${mIdx}-${day}`] || [];
          const has = dayPosts.length > 0;
          const thumb = dayPosts.find((p) => p.thumbnail_url)?.thumbnail_url;
          return (
            <div key={i} className={cn(
              "aspect-square rounded-lg border text-[11px] flex flex-col items-center justify-center relative overflow-hidden",
              has ? "border-primary/40 font-bold" : "border-border text-muted-foreground"
            )}>
              {has && thumb && <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />}
              <span className="relative">{day}</span>
              {has && <span className="relative mt-0.5 px-1.5 rounded-full bg-primary text-primary-foreground text-[9px] leading-tight">{dayPosts.length}</span>}
            </div>
          );
        })}
      </div>
      {posts.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Belum ada postingan terambil. Klik Refresh.</p>}
    </div>
  );
}

interface Reply { id: string; text?: string | null; username?: string | null; timestamp?: string | null; }
interface Comment {
  id: string;
  text?: string | null;
  username?: string | null;
  timestamp?: string | null;
  like_count?: number | null;
  hidden?: boolean | null;
  replies: Reply[];
}

// ─── Stories tab (live + archived snapshot + per-story insights) ─────────────
function StoriesTab({ payload }: { payload?: StoriesPayload }) {
  if (!payload || payload.stories.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground italic">
        Belum ada stories ter-sync. Posting story dari aplikasi Instagram, lalu refresh.
      </div>
    );
  }
  const s = payload.summary;
  const stat = (label: string, val: number | null | undefined) => (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">{label}</p>
      <p className="text-base font-extrabold tabular-nums mt-0.5">{val?.toLocaleString("id-ID") ?? "—"}</p>
    </div>
  );
  return (
    <div className="space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <div className="rounded-lg border border-border bg-card p-2.5">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Total</p>
          <p className="text-base font-extrabold tabular-nums mt-0.5">
            {s.count}
            {s.live_count > 0 && <span className="ml-1 text-[10px] text-emerald-600">· {s.live_count} live</span>}
          </p>
        </div>
        {stat("Impressions", s.total_impressions)}
        {stat("Reach", s.total_reach)}
        {stat("Replies", s.total_replies)}
        {stat("Profile Visit", s.total_profile_visits)}
        {stat("Follows", s.total_follows)}
      </div>

      {/* Story rows */}
      <div className="space-y-2">
        {payload.stories.map((st) => {
          const posted = st.posted_at ? new Date(st.posted_at) : null;
          return (
            <div key={st.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start gap-3">
                {st.thumbnail_url ? (
                  <img src={st.thumbnail_url} alt="" className="w-14 h-24 rounded-lg object-cover shrink-0 border border-border bg-secondary" />
                ) : (
                  <div className="w-14 h-24 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
                        {st.media_type || "STORY"}
                      </span>
                      {st.is_live && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-widest bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-300/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                        </span>
                      )}
                    </div>
                    {posted && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {posted.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    <Stat label="Reach" val={st.reach} />
                    <Stat label="Impr." val={st.impressions} />
                    <Stat label="Exits" val={st.exits} />
                    <Stat label="Reply" val={st.replies} />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <Stat label="Tap →" val={st.taps_forward} />
                    <Stat label="Tap ←" val={st.taps_back} />
                    <Stat label="Visit" val={st.profile_visits} />
                    <Stat label="Follow" val={st.follows} />
                  </div>

                  {st.completion_rate !== null && (
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-[10px] text-muted-foreground">Completion</span>
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${Math.min(100, Math.max(0, st.completion_rate))}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums">{st.completion_rate}%</span>
                    </div>
                  )}

                  {st.permalink && (
                    <a href={st.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                      <ExternalLink className="w-2.5 h-2.5" /> Buka di IG
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, val }: { label: string; val: number | null | undefined }) {
  return (
    <div className="rounded border border-border/60 bg-secondary/40 p-1.5 text-center">
      <p className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold leading-tight">{label}</p>
      <p className="text-xs font-extrabold tabular-nums leading-tight mt-0.5">{val?.toLocaleString("id-ID") ?? "—"}</p>
    </div>
  );
}


// ─── Schedule tab (list scheduled posts + cancel + create) ───────────────────
function ScheduleTab({ items, onCancel, onCreate }: { items: ScheduledPost[]; onCancel: (id: string) => void; onCreate: () => void }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-10 space-y-3">
        <p className="text-xs text-muted-foreground italic">
          Belum ada posting terjadwal.
        </p>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-[2px_2px_0_#334155]"
        >
          <Plus className="w-4 h-4" /> Buat Jadwal Baru
        </button>
        <p className="text-[10px] text-muted-foreground italic">
          Atau lewat tombol &quot;Jadwalkan ke IG&quot; di brief design.
        </p>
      </div>
    );
  }
  const statusMeta: Record<string, { label: string; cls: string }> = {
    pending: { label: "Menunggu", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300/50" },
    publishing: { label: "Mempublish", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300/50" },
    posted: { label: "Sudah Tayang", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300/50" },
    failed: { label: "Gagal", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-300/50" },
    cancelled: { label: "Dibatalkan", cls: "bg-secondary text-muted-foreground border-border" },
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">
          {items.length} jadwal
        </p>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Buat Jadwal Baru
        </button>
      </div>
      {items.map((p) => {
        const meta = statusMeta[p.status] || statusMeta.pending;
        const scheduledD = new Date(p.scheduled_at);
        const cancellable = p.status === "pending" || p.status === "failed";
        return (
          <div key={p.id} className="rounded-xl border border-border bg-card p-3 flex items-start gap-3">
            <img src={p.media_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border" />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-widest border", meta.cls)}>
                  {meta.label}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {scheduledD.toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {p.caption && (
                <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed whitespace-pre-wrap">{p.caption}</p>
              )}
              {p.error && p.status === "failed" && (
                <p className="text-[10px] text-rose-600 italic">⚠ {p.error}</p>
              )}
              <div className="flex items-center gap-2 pt-1">
                {p.ig_permalink && (
                  <a href={p.ig_permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                    <ExternalLink className="w-2.5 h-2.5" /> Lihat di IG
                  </a>
                )}
                {cancellable && (
                  <button
                    onClick={() => onCancel(p.id)}
                    className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> Batalkan
                  </button>
                )}
                {p.attempts > 0 && (
                  <span className="text-[9px] text-muted-foreground italic">attempt {p.attempts}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


function PostsTab({ posts, followers, orgId, accountId }: { posts: Post[]; followers: number | null; orgId: string; accountId: string }) {
  if (posts.length === 0) return <p className="text-xs text-muted-foreground text-center py-6">Belum ada postingan terambil. Klik Refresh.</p>;
  return (
    <div className="space-y-2">
      {posts.map((p) => (
        <PostRow key={p.id} post={p} followers={followers} orgId={orgId} accountId={accountId} />
      ))}
    </div>
  );
}

function PostRow({ post, followers, orgId, accountId }: { post: Post; followers: number | null; orgId: string; accountId: string }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rate = followers && followers > 0 ? (post.engagement / followers) * 100 : null;

  const loadComments = async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get(`/organizations/${orgId}/sosmed/accounts/${accountId}/posts/${post.id}/comments`);
      setComments(res.data.comments || []);
      if (res.data.error) setErr(res.data.error);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Gagal memuat komentar");
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && comments === null) loadComments();
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 p-2.5">
        <a href={post.permalink || "#"} target="_blank" rel="noopener noreferrer" className="w-14 h-14 rounded-lg bg-secondary overflow-hidden shrink-0 flex items-center justify-center">
          {post.thumbnail_url ? <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-muted-foreground" />}
        </a>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium truncate">{post.caption || "(tanpa caption)"}</p>
            <a href={post.permalink || "#"} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" /></a>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {post.posted_at ? new Date(post.posted_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—"}
            {post.media_type ? ` · ${post.media_type.toLowerCase().replace("_", " ")}` : ""}
            {rate != null ? ` · ${rate.toFixed(1)}% eng.` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="flex items-center gap-1 text-rose-500"><Heart className="w-3.5 h-3.5" /> {(post.like_count ?? 0).toLocaleString("id-ID")}</span>
            <span className="flex items-center gap-1 text-sky-500"><MessageCircle className="w-3.5 h-3.5" /> {(post.comments_count ?? 0).toLocaleString("id-ID")}</span>
            {post.shares != null && <span className="flex items-center gap-1 text-emerald-500"><Send className="w-3.5 h-3.5" /> {post.shares.toLocaleString("id-ID")}</span>}
            {post.saved != null && <span className="flex items-center gap-1 text-amber-500"><Bookmark className="w-3.5 h-3.5" /> {post.saved.toLocaleString("id-ID")}</span>}
            {post.reach != null && <span className="flex items-center gap-1 text-muted-foreground"><Eye className="w-3.5 h-3.5" /> {post.reach.toLocaleString("id-ID")}</span>}
          </div>
          <button onClick={toggle} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline mt-0.5">
            <MessageCircle className="w-3.5 h-3.5" /> {open ? "Tutup komentar" : `Kelola komentar (${post.comments_count ?? 0})`}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border p-3 space-y-2 bg-secondary/10">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {err && <p className="text-[11px] text-amber-600">{err}</p>}
              {comments && comments.length === 0 && !err && (
                (post.comments_count ?? 0) > 0 ? (
                  <p className="text-[11px] text-amber-600 text-center py-2">
                    Ada {post.comments_count} komentar tapi tidak bisa diambil — Hubungkan ulang akun dengan izin <b>kelola komentar</b>, lalu buka lagi.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground text-center py-2">Belum ada komentar.</p>
                )
              )}
              {comments?.map((c) => (
                <CommentItem key={c.id} c={c} orgId={orgId} accountId={accountId} onChange={loadComments} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CommentItem({ c, orgId, accountId, onChange }: { c: Comment; orgId: string; accountId: string; onChange: () => void }) {
  const [reply, setReply] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = `/organizations/${orgId}/sosmed/accounts/${accountId}/comments/${c.id}`;

  const sendReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api.post(`${base}/reply`, { message: reply.trim() });
      setReply(""); setShowReply(false);
      onChange();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Gagal membalas");
    } finally { setBusy(false); }
  };

  const toggleHide = async () => {
    setBusy(true);
    try { await api.post(`${base}/hide`, { hidden: !c.hidden }); onChange(); }
    catch (e: any) { alert(e?.response?.data?.detail || "Gagal"); }
    finally { setBusy(false); }
  };

  const del = async () => {
    if (!confirm("Hapus komentar ini?")) return;
    setBusy(true);
    try { await api.delete(base); onChange(); }
    catch (e: any) { alert(e?.response?.data?.detail || "Gagal menghapus"); }
    finally { setBusy(false); }
  };

  return (
    <div className={cn("rounded-lg p-2 space-y-1", c.hidden ? "bg-secondary/20 opacity-60" : "bg-secondary/40")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-snug">
          <span className="font-bold">@{c.username || "?"}</span> {c.text}
        </p>
        <div className="flex items-center gap-0.5 shrink-0">
          <button disabled={busy} onClick={() => setShowReply((v) => !v)} title="Balas" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Reply className="w-3.5 h-3.5" /></button>
          <button disabled={busy} onClick={toggleHide} title={c.hidden ? "Tampilkan" : "Sembunyikan"} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">{c.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
          <button disabled={busy} onClick={del} title="Hapus" className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {c.timestamp ? new Date(c.timestamp).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : ""}
        {c.like_count != null ? ` · ${c.like_count} suka` : ""}
        {c.hidden ? " · disembunyikan" : ""}
      </p>

      {c.replies?.length > 0 && (
        <div className="pl-3 border-l-2 border-border space-y-1 mt-1">
          {c.replies.map((r) => (
            <p key={r.id} className="text-[11px] leading-snug"><span className="font-bold">@{r.username || "?"}</span> {r.text}</p>
          ))}
        </div>
      )}

      {showReply && (
        <div className="flex items-center gap-1.5 mt-1">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendReply()}
            placeholder="Tulis balasan…"
            disabled={busy}
            className="flex-1 text-[11px] rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
          />
          <button disabled={busy || !reply.trim()} onClick={sendReply} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}
