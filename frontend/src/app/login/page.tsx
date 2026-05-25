"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/lib/utils";
import { Loader2, ArrowRight } from "lucide-react";

type StorageDebug = {
  has_access: boolean;
  has_refresh: boolean;
  has_auth_storage: boolean;
  is_pwa: boolean;
  user_agent: string;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debug, setDebug] = useState<StorageDebug | null>(null);
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  // Diagnostic: when the user lands on /login (usually after being bounced
  // from elsewhere) capture what storage actually contained at that moment.
  // Useful for debugging the Android-PWA "logs me out every cold start"
  // issue without needing chrome://inspect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDebug({
      has_access: !!localStorage.getItem("access_token"),
      has_refresh: !!localStorage.getItem("refresh_token"),
      has_auth_storage: !!localStorage.getItem("auth-storage"),
      is_pwa:
        window.matchMedia?.("(display-mode: standalone)").matches ||
        // iOS Safari quirk
        (window.navigator as { standalone?: boolean }).standalone === true,
      user_agent: navigator.userAgent.slice(0, 80),
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await api.post("/auth/login", { email, password });
      const { user, tokens } = response.data;
      setAuth(user, tokens.access_token, tokens.refresh_token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Terjadi kesalahan saat login");
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
          <h1 className="text-3xl font-bold tracking-tight">Selamat Datang</h1>
          <p className="text-muted-foreground">Masuk ke akun Things kamu</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              placeholder="nama@email.com"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" htmlFor="password">
                Password
              </label>
              <a
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-primary underline underline-offset-4"
              >
                Lupa password?
              </a>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md font-medium hover:bg-primary/90 transition-all disabled:opacity-50",
              loading && "cursor-not-allowed"
            )}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Masuk"}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <Link
            href="/register"
            className="text-primary font-medium hover:underline underline-offset-4"
          >
            Daftar gratis
          </Link>
        </p>

        {debug && (
          <details className="text-[10px] font-mono text-muted-foreground border border-border rounded-xl p-3 bg-secondary/20">
            <summary className="cursor-pointer font-sans font-bold text-[11px]">
              Storage debug (kalau bingung kenapa logout)
            </summary>
            <div className="mt-2 space-y-0.5 break-all">
              <p>access_token: {debug.has_access ? "✅ ada" : "❌ kosong"}</p>
              <p>refresh_token: {debug.has_refresh ? "✅ ada" : "❌ kosong"}</p>
              <p>auth-storage: {debug.has_auth_storage ? "✅ ada" : "❌ kosong"}</p>
              <p>mode: {debug.is_pwa ? "PWA (standalone)" : "browser tab"}</p>
              <p className="opacity-60">{debug.user_agent}</p>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
