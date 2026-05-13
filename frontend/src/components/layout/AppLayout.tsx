"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import Sidebar from "./Sidebar";
import NotificationBell from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { GlobalSearch } from "./GlobalSearch";
import ChatWidget from "./ChatWidget";
import { Loader2 } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for hydration
    setIsReady(true);
    
    if (isReady && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router, isReady]);

  if (!isReady || !isAuthenticated) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Navigation */}
        <header className="h-16 border-b border-border bg-background flex items-center justify-end px-8 shrink-0">
          <div className="flex items-center gap-4">
            <GlobalSearch />
            <div className="flex items-center gap-2 border-l border-border pl-4">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-8 w-full">
            {children}
          </div>
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
