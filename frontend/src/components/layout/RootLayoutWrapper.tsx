"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppLayout from "./AppLayout";

export default function RootLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Fade out + remove the pre-hydration splash injected by layout.tsx
    if (typeof window !== "undefined") {
      const el = document.getElementById("boot-splash");
      if (el) {
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 320);
      }
    }
  }, []);

  // Avoid hydration mismatch
  if (!mounted) {
    return <>{children}</>;
  }

  const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/register") || pathname === "/";
  
  if (isAuthPage) {
    return <>{children}</>;
  }
  
  return <AppLayout>{children}</AppLayout>;
}
