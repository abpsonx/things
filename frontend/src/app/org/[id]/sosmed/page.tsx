"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { Share2, Camera, Loader2, CalendarClock, Plus, Trash2, RefreshCw, Users, UserPlus, Image as ImageIcon, ChevronDown, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus, Heart, MessageCircle, ExternalLink, Bookmark, Send, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
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

interface AccountMetrics {
  account: SocialAccount;
  latest: MetricPoint | null;
  history: MetricPoint[];
  deltas: Record<GrowthMetric, Delta>;
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
  engagement: number;
}

type SubTab = "growth" | "calendar" | "posts";

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
    if (!metrics[accountId]) loadMetrics(accountId);
  };

  const selectSubTab = (accountId: string, tab: SubTab) => {
    setSubTab(tab);
    if ((tab === "calendar" || tab === "posts") && !posts[accountId]) loadPosts(accountId);
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
    <div className="max-w-5xl mx-auto space-y-8 pb-24 p-6">
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
                      <div className="flex items-center gap-1 px-3 pt-3">
                        {([
                          { key: "growth", label: "Pertumbuhan" },
                          { key: "calendar", label: "Kalender" },
                          { key: "posts", label: "Postingan" },
                        ] as { key: SubTab; label: string }[]).map((t) => (
                          <button
                            key={t.key}
                            onClick={() => selectSubTab(a.id, t.key)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                              subTab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                            )}
                          >
                            {t.label}
                          </button>
                        ))}
                        <button
                          onClick={() => (subTab === "growth" ? loadMetrics(a.id, true) : loadPosts(a.id, true))}
                          disabled={metricsLoading === a.id || postsLoading === a.id}
                          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-secondary transition-all disabled:opacity-50"
                        >
                          <RefreshCw className={cn("w-3.5 h-3.5", (metricsLoading === a.id || postsLoading === a.id) && "animate-spin")} /> Refresh
                        </button>
                      </div>

                      <div className="p-4">
                        {subTab === "growth" && (
                          metricsLoading === a.id && !m ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                          ) : (
                            <GrowthTab accountId={a.id} m={m} />
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
                            <PostsTab posts={posts[a.id] || []} followers={m?.latest?.followers ?? null} />
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

      {/* Coming soon */}
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 opacity-70">
          <div className="flex items-center gap-2 font-bold mb-1"><CalendarClock className="w-4 h-4 text-primary" /> Jadwal Post</div>
          <p className="text-xs text-muted-foreground">Bikin &amp; jadwalkan postingan ke IG/TikTok. Segera.</p>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number | null }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        {icon} {label}
      </div>
      <p className="text-lg font-bold tabular-nums">
        {value != null ? value.toLocaleString("id-ID") : "—"}
      </p>
    </div>
  );
}

function DeltaBadge({ label, value }: { label: string; value?: number | null }) {
  const has = value != null;
  const up = (value ?? 0) > 0;
  const down = (value ?? 0) < 0;
  return (
    <div className="rounded-xl border border-border bg-card p-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <div className={cn(
        "flex items-center justify-center gap-1 text-sm font-bold tabular-nums",
        !has && "text-muted-foreground", up && "text-emerald-600", down && "text-red-500"
      )}>
        {has && (up ? <ArrowUp className="w-3.5 h-3.5" /> : down ? <ArrowDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />)}
        {has ? `${up ? "+" : ""}${value!.toLocaleString("id-ID")}` : "—"}
      </div>
    </div>
  );
}

const GROWTH_META: Record<GrowthMetric, { label: string; color: string }> = {
  followers: { label: "Follower", color: "#8b5cf6" },
  likes: { label: "Like", color: "#f43f5e" },
  comments: { label: "Komentar", color: "#0ea5e9" },
  shares: { label: "Share", color: "#22c55e" },
  saves: { label: "Save", color: "#f59e0b" },
};

function GrowthTab({ accountId, m }: { accountId: string; m?: AccountMetrics }) {
  const [metric, setMetric] = useState<GrowthMetric>("followers");
  if (!m) return <p className="text-xs text-muted-foreground text-center py-4">Belum ada data.</p>;
  const meta = GROWTH_META[metric];
  const d = m.deltas?.[metric];

  return (
    <div className="space-y-4">
      {/* Profile stats */}
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Users className="w-3.5 h-3.5" />} label="Follower" value={m.latest?.followers} />
        <Stat icon={<UserPlus className="w-3.5 h-3.5" />} label="Following" value={m.latest?.following} />
        <Stat icon={<ImageIcon className="w-3.5 h-3.5" />} label="Postingan" value={m.latest?.posts_count} />
      </div>

      {/* Engagement totals */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Total Engagement</p>
        <div className="grid grid-cols-4 gap-2">
          <Stat icon={<Heart className="w-3.5 h-3.5" />} label="Like" value={m.latest?.likes} />
          <Stat icon={<MessageCircle className="w-3.5 h-3.5" />} label="Komentar" value={m.latest?.comments} />
          <Stat icon={<Share2 className="w-3.5 h-3.5" />} label="Share" value={m.latest?.shares} />
          <Stat icon={<Bookmark className="w-3.5 h-3.5" />} label="Save" value={m.latest?.saves} />
        </div>
        {(m.latest?.shares == null && m.latest?.saves == null) && (
          <p className="text-[10px] text-muted-foreground mt-1">Share &amp; Save kosong? Hubungkan ulang akun untuk memberi izin insights, lalu Refresh.</p>
        )}
      </div>

      {/* Metric switcher */}
      <div className="flex items-center gap-1">
        {(Object.keys(GROWTH_META) as GrowthMetric[]).map((k) => (
          <button
            key={k}
            onClick={() => setMetric(k)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
              metric === k ? "bg-secondary text-foreground ring-1 ring-border" : "text-muted-foreground hover:bg-secondary/60"
            )}
          >
            {GROWTH_META[k].label}
          </button>
        ))}
      </div>

      {/* Deltas for the selected metric */}
      <div>
        <div className="grid grid-cols-3 gap-2">
          <DeltaBadge label="vs kemarin" value={d?.prev} />
          <DeltaBadge label="7 hari" value={d?.d7} />
          <DeltaBadge label="30 hari" value={d?.d30} />
        </div>
        {m.history.length < 2 && (
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Data baru 1 hari — pertumbuhan mulai keisi besok (butuh ≥2 hari snapshot).
          </p>
        )}
      </div>

      {/* Trend chart for the selected metric */}
      {m.history.length > 1 ? (
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={m.history} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id={`g-${accountId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={meta.color} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={meta.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.slice(5)} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <RechartsTooltip />
              <Area type="monotone" dataKey={metric} name={meta.label} stroke={meta.color} strokeWidth={2} fill={`url(#g-${accountId})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-4">
          Grafik pertumbuhan muncul setelah ada minimal 2 hari data. Snapshot diambil otomatis tiap hari halaman dibuka.
        </p>
      )}
    </div>
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

function PostsTab({ posts, followers }: { posts: Post[]; followers: number | null }) {
  if (posts.length === 0) return <p className="text-xs text-muted-foreground text-center py-6">Belum ada postingan terambil. Klik Refresh.</p>;
  return (
    <div className="space-y-2">
      {posts.map((p) => {
        const rate = followers && followers > 0 ? (p.engagement / followers) * 100 : null;
        return (
          <a key={p.id} href={p.permalink || "#"} target="_blank" rel="noopener noreferrer"
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-2.5 hover:bg-secondary/40 transition-all">
            <div className="w-14 h-14 rounded-lg bg-secondary overflow-hidden shrink-0 flex items-center justify-center">
              {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium truncate">{p.caption || "(tanpa caption)"}</p>
                <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {p.posted_at ? new Date(p.posted_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                {p.media_type ? ` · ${p.media_type.toLowerCase().replace("_", " ")}` : ""}
                {rate != null ? ` · ${rate.toFixed(1)}% eng.` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className="flex items-center gap-1 text-rose-500"><Heart className="w-3.5 h-3.5" /> {(p.like_count ?? 0).toLocaleString("id-ID")}</span>
                <span className="flex items-center gap-1 text-sky-500"><MessageCircle className="w-3.5 h-3.5" /> {(p.comments_count ?? 0).toLocaleString("id-ID")}</span>
                {p.shares != null && <span className="flex items-center gap-1 text-emerald-500"><Send className="w-3.5 h-3.5" /> {p.shares.toLocaleString("id-ID")}</span>}
                {p.saved != null && <span className="flex items-center gap-1 text-amber-500"><Bookmark className="w-3.5 h-3.5" /> {p.saved.toLocaleString("id-ID")}</span>}
                {p.reach != null && <span className="flex items-center gap-1 text-muted-foreground"><Eye className="w-3.5 h-3.5" /> {p.reach.toLocaleString("id-ID")}</span>}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
