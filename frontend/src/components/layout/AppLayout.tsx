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
import { Loader2, Menu } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, setAuth } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Authoritative auth check that doesn't depend on zustand persist timing.
  // localStorage is the source of truth for tokens; if a token exists we
  // trust it and (re)hydrate user info via /auth/me when the zustand store
  // is empty (e.g. Android PWA with fresh in-memory state but persisted
  // localStorage). Only kick to /login when there is truly no token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const accessToken = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const refreshToken = typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null;
      if (!accessToken && !refreshToken) {
        router.replace("/login");
        return;
      }
      // If we already have user info in the persisted store, we're done.
      if (user && isAuthenticated) {
        if (!cancelled) setChecking(false);
        return;
      }
      // Token in storage but no user object — rehydrate from /auth/me.
      // axios interceptor will auto-refresh via refresh_token on 401.
      try {
        const { default: api } = await import("@/lib/api");
        const me = await api.get("/auth/me");
        const freshAccess = localStorage.getItem("access_token") || accessToken || "";
        const freshRefresh = localStorage.getItem("refresh_token") || refreshToken || "";
        setAuth(me.data, freshAccess, freshRefresh);
      } catch {
        // /auth/me failed AND refresh failed — token truly invalid.
        // The interceptor already redirected; nothing else to do.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-close mobile sidebar when route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (checking || !isAuthenticated) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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
