"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import Sidebar from "./Sidebar";
import NotificationBell from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { GlobalSearch } from "./GlobalSearch";
import ChatWidget from "./ChatWidget";
import PushAutoPrompt from "@/components/notifications/PushAutoPrompt";
import { Menu } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setAuth } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Bootstrap: synchronously trust the tokens in localStorage as the
  // source of truth. If they exist, we ARE logged in — even if zustand
  // persist hasn't finished hydrating yet (Android PWA quirk where
  // initial in-memory store is empty while localStorage already has
  // auth-storage). Restore the cached user manually and render
  // immediately; /auth/me fires in the background to refresh details.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const accessToken = localStorage.getItem("access_token");
    const refreshToken = localStorage.getItem("refresh_token");

    if (!accessToken && !refreshToken) {
      router.replace("/login");
      return;
    }

    // Restore user from the persist payload if zustand hasn't done it yet.
    if (!useAuthStore.getState().isAuthenticated) {
      try {
        const raw = localStorage.getItem("auth-storage");
        const parsed = raw ? JSON.parse(raw) : null;
        const cachedUser = parsed?.state?.user;
        if (cachedUser) {
          setAuth(cachedUser, accessToken || "", refreshToken || "");
        }
      } catch {
        // ignore parse errors — /auth/me below will populate it
      }
    }

    setChecking(false);

    // Background refresh of profile (avatar/name/etc). Non-blocking; if
    // /auth/me 401s the interceptor handles refresh+wipe on its own.
    let cancelled = false;
    import("@/lib/api").then(({ default: api }) => {
      api.get("/auth/me")
        .then((res) => {
          if (cancelled) return;
          setAuth(
            res.data,
            localStorage.getItem("access_token") || "",
            localStorage.getItem("refresh_token") || "",
          );
        })
        .catch(() => {
          /* keep cached user; nothing to do */
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watcher: only kick to /login when tokens are truly gone (after logout
  // or after the interceptor wiped them on a real 401/403 from refresh).
  // If isAuthenticated flips false while tokens still exist (e.g. a
  // background /auth/me race), don't bounce — the dashboard stays usable.
  useEffect(() => {
    if (checking) return;
    if (isAuthenticated) return;
    if (typeof window === "undefined") return;
    const hasTokens =
      !!localStorage.getItem("access_token") || !!localStorage.getItem("refresh_token");
    if (!hasTokens) {
      router.replace("/login");
    }
  }, [checking, isAuthenticated, router]);

  // Auto-close mobile sidebar when route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (checking || !isAuthenticated) {
    return (
      <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background gap-6">
        <div className="relative">
          <img
            src="/assets/logo.png"
            alt="Things"
            className="w-16 h-16 rounded-2xl object-contain animate-pulse"
          />
          <div className="absolute -inset-3 rounded-3xl border-2 border-primary/20 border-t-primary animate-spin" />
        </div>
        <p className="text-xs font-medium text-muted-foreground tracking-wide">
          Memuat Things…
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Backdrop overlay for mobile when sidebar is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[45] md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        {/* Top Navigation */}
        <header className="h-16 border-b border-border bg-background flex items-center justify-between gap-2 px-4 md:px-8 shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden -ml-1 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Buka menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 md:gap-4 ml-auto">
            <GlobalSearch />
            <div className="flex items-center gap-2 border-l border-border pl-2 md:pl-4">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-8 w-full">
            {children}
          </div>
        </main>
      </div>
      <ChatWidget />
      <PushAutoPrompt />
    </div>
  );
}
