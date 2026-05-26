"use client";

import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { 
  Settings as SettingsIcon, 
  ShieldCheck, 
  Key, 
  Save, 
  Loader2, 
  CheckCircle2,
  AlertCircle,
  User as UserIcon,
  Calendar as CalendarIcon,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import PushNotificationManager from "@/components/notifications/PushNotificationManager";
import { useAuthStore } from "@/store/useAuthStore";

export default function SettingsPage() {
  const { user: currentUser, updateUser } = useAuthStore();
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (pwNew.length < 6) { setPwMsg({ ok: false, text: "Password baru minimal 6 karakter." }); return; }
    if (pwNew !== pwConfirm) { setPwMsg({ ok: false, text: "Konfirmasi password tidak cocok." }); return; }
    setPwBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: pwCurrent, new_password: pwNew });
      setPwMsg({ ok: true, text: "Password berhasil diubah." });
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
    } catch (err: any) {
      setPwMsg({ ok: false, text: err.response?.data?.detail || "Gagal mengubah password." });
    } finally {
      setPwBusy(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const [res, statusRes] = await Promise.all([
        api.get("/settings"),
        api.get("/google/status")
      ]);
      setSettings(res.data);
      setGoogleConnected(statusRes.data.connected);
    } catch (err) {
      console.error("Failed to fetch settings", err);
      setError("Gagal mengambil pengaturan.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleUpdate = async (key: string, value: string) => {
    setSaving(true);
    setSuccess(false);
    setError("");
    try {
      await api.put(`/settings/${key}`, { value });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await fetchSettings();
    } catch (err) {
      setError("Gagal memperbarui pengaturan.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const regCode = settings.find(s => s.key === "registration_code")?.value || "";
  const regCodeStaff = settings.find(s => s.key === "registration_code_staff")?.value || "";

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground inline-flex items-center gap-2">
          <SettingsIcon className="w-3.5 h-3.5" />
          Settings
        </p>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1">
          Settings &amp; Profile
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Kelola profil pribadi dan konfigurasi sistem di sini.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Personal Profile Section */}
        <section className="p-6 border border-border rounded-2xl bg-card space-y-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold">Profil Pribadi</h2>
              <p className="text-[11px] text-muted-foreground">Atur bagaimana orang lain melihat kamu di Things.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-[1fr,2fr] gap-12">
            <div className="space-y-4">
              <label className="text-sm font-bold block">Foto Profil</label>
              <div className="relative group w-32 h-32 mx-auto md:mx-0">
                <div className="w-32 h-32 rounded-3xl bg-secondary border-2 border-dashed border-border flex items-center justify-center overflow-hidden transition-all group-hover:border-primary/50">
                  {currentUser?.avatar_url ? (
                    <img src={currentUser.avatar_url} alt={currentUser.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl font-bold text-muted-foreground">{currentUser?.name.charAt(0)}</span>
                  )}
                </div>
                <input 
                  type="file" 
                  accept="image/*"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setSaving(true);
                    try {
                      const formData = new FormData();
                      formData.append("file", file);
                      const res = await api.post("/auth/avatar", formData, {
                        headers: {
                          "Content-Type": "multipart/form-data",
                        },
                      });
                      updateUser({ avatar_url: res.data.avatar_url });
                    } catch (err) {
                      alert("Gagal upload foto.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                />
                <div className="absolute -bottom-2 -right-2 bg-primary text-primary-foreground p-2 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
                  <Plus className="w-4 h-4" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground text-center md:text-left">Klik foto untuk upload baru (Max 2MB).</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold block">Nama Lengkap</label>
                <input
                  type="text"
                  defaultValue={currentUser?.name}
                  onBlur={async (e) => {
                    if (e.target.value === currentUser?.name) return;
                    setSaving(true);
                    try {
                      await api.put("/auth/me", { name: e.target.value });
                      updateUser({ name: e.target.value });
                      setSuccess(true);
                      setTimeout(() => setSuccess(false), 3000);
                    } catch (err) {
                      setError("Gagal update nama.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold block">Bio / Tagline</label>
                <input
                  type="text"
                  maxLength={120}
                  defaultValue={(currentUser as any)?.tagline || ""}
                  placeholder="mis. makelar, content creator, finance…"
                  onBlur={async (e) => {
                    const val = e.target.value.trim();
                    if (val === ((currentUser as any)?.tagline || "")) return;
                    setSaving(true);
                    try {
                      await api.put("/auth/me", { tagline: val });
                      updateUser({ tagline: val } as any);
                      setSuccess(true);
                      setTimeout(() => setSuccess(false), 3000);
                    } catch (err) {
                      setError("Gagal update bio.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
                <p className="text-[10px] text-muted-foreground">Tampil di bawah namamu pada chat tim, proyek &amp; workspace (tidak di DM).</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold block text-muted-foreground">Email (Tetap)</label>
                <input
                  type="email"
                  value={currentUser?.email}
                  disabled
                  className="w-full px-4 py-3 bg-secondary/10 border border-border rounded-2xl text-muted-foreground cursor-not-allowed opacity-60"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold block text-muted-foreground">Level Akun</label>
                {(() => {
                  const role = (currentUser as any)?.role;
                  const meta: Record<string, { label: string; cls: string }> = {
                    super_user: { label: "Super User", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
                    developer: { label: "Developer", cls: "bg-violet-500/15 text-violet-600 border-violet-500/30" },
                    admin: { label: "Admin", cls: "bg-primary/10 text-primary border-primary/30" },
                  };
                  const m = meta[role] || { label: "Member / Staff", cls: "bg-secondary text-muted-foreground border-border" };
                  return (
                    <div className="flex items-center gap-2">
                      <span className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border", m.cls)}>
                        <ShieldCheck className="w-4 h-4" /> {m.label}
                      </span>
                      {(role === "super_user" || role === "developer") && (
                        <span className="text-[11px] text-muted-foreground">akses penuh semua workspace</span>
                      )}
                    </div>
                  );
                })()}
                <p className="text-[10px] text-muted-foreground">Level per-workspace (Admin/Manager/Member) bisa berbeda tiap workspace — lihat di halaman Members.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Change Password */}
        <section className="p-6 border border-border rounded-2xl bg-card space-y-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold">Ganti Password</h2>
              <p className="text-xs text-muted-foreground">Ubah password akunmu (butuh password lama).</p>
            </div>
          </div>
          <form onSubmit={changePassword} className="space-y-4 max-w-md">
            {pwMsg && (
              <div className={cn("text-sm rounded-xl px-4 py-3", pwMsg.ok ? "text-emerald-600 bg-emerald-500/10" : "text-destructive bg-destructive/10")}>
                {pwMsg.text}
              </div>
            )}
            <input type="password" placeholder="Password lama" required value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)}
              className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
            <input type="password" placeholder="Password baru (min. 6 karakter)" required value={pwNew} onChange={(e) => setPwNew(e.target.value)}
              className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
            <input type="password" placeholder="Ulangi password baru" required value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)}
              className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
            <button type="submit" disabled={pwBusy}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-2xl text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50">
              {pwBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan Password"}
            </button>
          </form>
        </section>

        {/* Security Section */}
        <section className="p-6 border border-border rounded-2xl bg-card space-y-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold">Kode Pendaftaran Platform</h2>
              <p className="text-xs text-muted-foreground">Gerbang siapa yang boleh <b>mendaftar akun</b> di aplikasi.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground space-y-1">
            <p className="font-bold text-foreground">Mau kasih level Admin / Manager / Member ke tim?</p>
            <p>Itu diatur <b>per workspace</b> — buka workspace → menu <b>Members</b> → bagian <b>“Kode Undangan per Level”</b>. Orang yang daftar pakai kode itu langsung masuk workspace dengan level yang kamu pilih.</p>
            <p>Kode di bawah ini beda fungsi: cuma <b>izin mendaftar akun</b> (bukan penentu level di workspace). Pembuatan workspace hanya untuk Super User.</p>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Admin Code */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <label className="text-sm font-bold flex items-center gap-2">
                      <Key className="w-4 h-4 text-primary" />
                      Kode Pendaftaran Internal
                    </label>
                    <p className="text-[10px] text-muted-foreground">Izin mendaftar sebagai akun internal. Level di workspace tetap diatur lewat Kode Undangan / undangan member.</p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    defaultValue={regCode}
                    placeholder="Contoh: THINGS-2026"
                    className="flex-1 px-4 py-3 bg-secondary/50 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono tracking-wider text-sm"
                    onBlur={(e) => {
                      if (e.target.value !== regCode) {
                        handleUpdate("registration_code", e.target.value);
                      }
                    }}
                  />
                </div>
              </div>

              {/* Staff Code */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <label className="text-sm font-bold flex items-center gap-2">
                      <UserIcon className="w-4 h-4 text-muted-foreground" />
                      Kode Staff (Limited)
                    </label>
                    <p className="text-[10px] text-muted-foreground">User dengan kode ini hanya bisa join atau akses terbatas.</p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    defaultValue={regCodeStaff}
                    placeholder="Contoh: THINGS-STAFF"
                    className="flex-1 px-4 py-3 bg-secondary/50 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono tracking-wider text-sm"
                    onBlur={(e) => {
                      if (e.target.value !== regCodeStaff) {
                        handleUpdate("registration_code_staff", e.target.value);
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-secondary/30 rounded-2xl border border-border/50 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-bold text-foreground">Tips:</span> Pastikan kode ini hanya dibagikan ke orang internal perusahaan. Ganti kode secara berkala jika Anda merasa kode tersebut sudah tersebar ke pihak luar.
            </div>
          </div>
        </section>

        {/* Notifications Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <h2 className="text-base font-bold">Notifikasi &amp; Alerts</h2>
          </div>
          <PushNotificationManager />

          <div className="p-6 border border-border rounded-2xl bg-card flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-bold">Email ringkasan harian</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Setiap jam 8 pagi (WIB), kamu dapat email berisi task yang overdue, due hari ini, dan due minggu ini.
              </p>
            </div>
            <button
              onClick={async () => {
                const next = !(currentUser?.daily_digest_enabled ?? true);
                try {
                  await api.put("/auth/me", { daily_digest_enabled: next });
                  updateUser({ daily_digest_enabled: next } as any);
                } catch (err) {
                  console.error("Failed to toggle daily digest", err);
                }
              }}
              className={`w-12 h-6 rounded-full relative transition-all shrink-0 ${
                (currentUser?.daily_digest_enabled ?? true) ? "bg-primary" : "bg-slate-200"
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-card rounded-full shadow-sm transition-all ${
                  (currentUser?.daily_digest_enabled ?? true) ? "right-1" : "left-1"
                }`}
              />
            </button>
          </div>
        </section>

        {/* Integrations Section */}
        <section className="p-6 border border-border rounded-2xl bg-card space-y-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold">Integrasi Aplikasi</h2>
              <p className="text-[11px] text-muted-foreground">Hubungkan Things dengan layanan lain.</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 border border-border rounded-2xl bg-secondary/10">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-card rounded-xl flex items-center justify-center shadow-sm">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12z" fill="#fff"/>
                    <path d="M14.6 15.6h-5.2v-7.2h5.2v7.2z" fill="#4285f4"/>
                    <path d="M14.6 15.6H9.4v-1.2h4v-4.8h-4v-1.2h5.2v7.2z" fill="#34a853"/>
                    <path d="M14.6 15.6v-1.2h-4v-4.8h4v-1.2h-5.2v7.2h5.2z" fill="#fbbc05"/>
                    <path d="M9.4 15.6v-1.2h4v-4.8h-4v-1.2h5.2v7.2H9.4z" fill="#ea4335"/>
                    <path d="M15 11h-2V9h2v2zm0-4h-2V5h2v2zm-4 4H9V9h2v2zm0-4H9V5h2v2z" fill="#188038"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-sm">Google Calendar</h3>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Semua tugas yang di-assign ke kamu dengan deadline akan otomatis masuk Google Calendar
                    dengan pengingat <span className="font-bold">H-1, 30 menit sebelum, dan saat deadline</span>.
                    Event biasa di kalender Things juga ikut sync.
                  </p>
                </div>
              </div>
              <button 
                onClick={async () => {
                  if (googleConnected) {
                    if (confirm("Putuskan koneksi Google Calendar?")) {
                      await api.delete("/google/disconnect");
                      setGoogleConnected(false);
                    }
                  } else {
                    const res = await api.get("/google/login");
                    window.location.href = res.data.auth_url;
                  }
                }}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  googleConnected 
                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {googleConnected ? "Disconnect" : "Hubungkan"}
              </button>
            </div>
          </div>
        </section>

        {/* Future sections can go here (Email Settings, Theme, etc.) */}
        <section className="p-6 border border-border border-dashed rounded-2xl opacity-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-secondary rounded-xl flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-base font-bold text-muted-foreground italic">Coming Soon</h2>
              <p className="text-[11px] text-muted-foreground">Email SMTP, Branding, &amp; Audit Logs.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
