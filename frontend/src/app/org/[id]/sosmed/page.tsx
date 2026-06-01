"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { Share2, Camera, Loader2, CalendarClock, Plus, Trash2, RefreshCw, Users, Image as ImageIcon, ChevronDown, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Heart, MessageCircle, ExternalLink, Bookmark, Send, Eye, EyeOff, Reply } from "lucide-react";
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
    // Growth dashboard butuh metrics + posts (untuk Video Views & Top Content
    // table) — load keduanya begitu user expand.
    if (!metrics[accountId]) loadMetrics(accountId);
    if (!posts[accountId]) loadPosts(accountId);
  };

  const selectSubTab = (accountId: string, tab: SubTab) => {
    setSubTab(tab);
    if (!posts[accountId]) loadPosts(accountId);
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

function GrowthTab({ accountId, m, posts, platform }: {
  accountId: string;
  m?: AccountMetrics;
  posts: Post[];
  platform: "instagram" | "tiktok";
}) {
  if (!m) return <p className="text-xs text-muted-foreground text-center py-4">Belum ada data.</p>;

  // ─── KPI computations ─────────────────────────────────────────────────────
  const latest = m.latest;
  // "vs first record" — pakai snapshot pertama yang ada di history sebagai baseline.
  const firstRec = m.history[0] || null;
  const postCount = posts.length;

  const followers = latest?.followers ?? 0;
  // Video Views = sum dari reach semua postingan. Untuk IG: reach. TikTok: views.
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
  // First-record engagement rate dihitung dari snapshot pertama
  // (kalau ada views/reach historis — yang kita gak punya per snapshot, fallback 0).
  const firstEng = (firstRec ? (firstRec.likes ?? 0) + (firstRec.comments ?? 0) + (firstRec.shares ?? 0) : 0);

  const pct = (delta: number | null, base: number) => {
    if (delta == null || base === 0) return null;
    return (delta / Math.max(base, 1)) * 100;
  };

  // ─── Chart data ──────────────────────────────────────────────────────────
  // Audience Growth: pure follower history.
  const audienceData = m.history.map((h) => ({ date: h.date, followers: h.followers ?? 0 }));
  // Engagement Over Time: derived "views" pakai followers sbg proxy bila reach
  // tidak tersedia per snapshot. Kalau pengen real views per hari, butuh
  // backend untuk snapshot reach harian — sementara pakai likes+comments
  // sebagai engagement signal.
  const engagementData = m.history.map((h) => ({
    date: h.date,
    likes: h.likes ?? 0,
    engagement: ((h.likes ?? 0) + (h.comments ?? 0) + (h.shares ?? 0)),
    // views proxy: scale linearly dari interpolasi, atau pakai totalViews terakhir
    views: 0,
  }));
  // Spread totalViews di hari terakhir saja kalau view per hari tidak tersedia.
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
          deltaPct={pct(dFollowers, firstRec?.followers ?? 0)}
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
          deltaPct={pct(dLikes, firstRec?.likes ?? 0)}
          subtitle={postCount > 0 ? `Avg ${Math.round(totalLikes / postCount).toLocaleString("id-ID")} per video` : "Profile + video likes"}
          subtitle2="Profile + video likes"
          icon={<Heart className="w-3.5 h-3.5" />}
          color="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
        />
        <KPICard
          label="Comments"
          value={totalComments}
          delta={dComments}
          deltaPct={pct(dComments, firstRec?.comments ?? 0)}
          subtitle={postCount > 0 ? `Avg ${Math.round(totalComments / postCount).toLocaleString("id-ID")} per video` : "Total comments"}
          subtitle2="Total comments received"
          icon={<MessageCircle className="w-3.5 h-3.5" />}
          color="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
        />
        <KPICard
          label="Shares"
          value={totalShares}
          delta={dShares}
          deltaPct={pct(dShares, firstRec?.shares ?? 0)}
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
      <TopPerformingTable posts={posts} followers={followers} platform={platform} />

      {(m.latest?.shares == null && m.latest?.saves == null) && (
        <p className="text-[11px] text-muted-foreground italic">
          Share &amp; Save kosong? Hubungkan ulang akun untuk memberi izin insights, lalu Refresh.
        </p>
      )}
    </div>
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
                return (
                  <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-3 py-2 max-w-[240px]">
                      <a href={p.permalink || "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group">
                        <span className="w-9 h-9 rounded bg-secondary overflow-hidden shrink-0 flex items-center justify-center border border-border">
                          {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-muted-foreground" />}
                        </span>
                        <span className="truncate text-xs font-medium group-hover:text-primary">
                          {p.caption || "(tanpa caption)"}
                        </span>
                      </a>
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
