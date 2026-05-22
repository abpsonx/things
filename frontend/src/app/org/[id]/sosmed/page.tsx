"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { Share2, Camera, Loader2, TrendingUp, CalendarClock, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SocialAccount {
  id: string;
  platform: "instagram" | "tiktok";
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

export default function SosmedPage() {
  const { id: orgId } = useParams();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [config, setConfig] = useState<{ instagram_ready: boolean; tiktok_ready: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

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
        🚧 <span className="font-semibold text-foreground">Tahap 1 (fondasi).</span> Tombol hubungkan akan aktif begitu developer app Instagram &amp; TikTok selesai disiapkan. Pantau pertumbuhan &amp; jadwal post menyusul.
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
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden text-xs font-bold">
                    {a.avatar_url ? <img src={a.avatar_url} alt="" className="w-full h-full object-cover" /> : (a.display_name || a.username || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{a.display_name || a.username}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{a.platform} · @{a.username}</p>
                  </div>
                </div>
                <button onClick={() => disconnect(a.id)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Coming soon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 opacity-70">
          <div className="flex items-center gap-2 font-bold mb-1"><TrendingUp className="w-4 h-4 text-primary" /> Pertumbuhan Akun</div>
          <p className="text-xs text-muted-foreground">Grafik follower &amp; engagement harian. Segera.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 opacity-70">
          <div className="flex items-center gap-2 font-bold mb-1"><CalendarClock className="w-4 h-4 text-primary" /> Jadwal Post</div>
          <p className="text-xs text-muted-foreground">Bikin &amp; jadwalkan postingan ke IG/TikTok. Segera.</p>
        </div>
      </div>
    </div>
  );
}
