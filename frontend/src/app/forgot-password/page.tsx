"use client";

import React, { useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { Loader2, ArrowLeft, MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Terjadi kesalahan. Coba lagi.");
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
          <h1 className="text-3xl font-bold tracking-tight">Lupa Password</h1>
          <p className="text-muted-foreground">Masukkan email kamu, kami kirim link reset.</p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-border bg-secondary/30 p-6 text-center space-y-3">
            <MailCheck className="w-10 h-10 mx-auto text-emerald-500" />
            <p className="text-sm font-medium">Cek email kamu</p>
            <p className="text-xs text-muted-foreground">
              Kalau <b>{email}</b> terdaftar, link reset password sudah dikirim ke sana (berlaku 30 menit). Cek folder spam juga ya.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{error}</div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kamu@email.com"
                className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-2xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Kirim Link Reset"}
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
