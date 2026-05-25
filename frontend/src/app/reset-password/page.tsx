"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // Read token from the URL without useSearchParams (avoids Suspense setup).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pw.length < 6) { setError("Password minimal 6 karakter."); return; }
    if (pw !== pw2) { setError("Konfirmasi password tidak cocok."); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: pw });
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Gagal reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-6">
            <img src="/assets/logo.png" alt="Things Logo" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Password Baru</h1>
          <p className="text-muted-foreground">Buat password baru untuk akunmu.</p>
        </div>

        {done ? (
          <div className="rounded-2xl border border-border bg-secondary/30 p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
            <p className="text-sm font-medium">Password berhasil diubah</p>
            <p className="text-xs text-muted-foreground">Mengarahkan ke halaman masuk…</p>
          </div>
        ) : !token ? (
          <div className="rounded-2xl border border-border bg-destructive/10 p-6 text-center text-sm text-destructive">
            Link reset tidak valid. Minta link baru dari halaman Lupa Password.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{error}</div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="pw">Password Baru</label>
              <input id="pw" type="password" required value={pw} onChange={(e) => setPw(e.target.value)}
                className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="pw2">Ulangi Password</label>
              <input id="pw2" type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)}
                className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-2xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan Password"}
            </button>
          </form>
        )}

        <Link href="/login" className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Masuk
        </Link>
      </div>
    </div>
  );
}
