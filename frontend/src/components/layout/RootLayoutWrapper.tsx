"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppLayout from "./AppLayout";

export default function RootLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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
