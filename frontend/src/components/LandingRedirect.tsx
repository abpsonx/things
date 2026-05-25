"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Drop-in guard for the public landing page: if the visitor already has auth
 * tokens (e.g. an installed PWA relaunching at "/"), send them straight to the
 * dashboard instead of showing the marketing page.
 */
export default function LandingRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasTokens =
      !!localStorage.getItem("access_token") || !!localStorage.getItem("refresh_token");
    if (hasTokens) router.replace("/dashboard");
  }, [router]);
  return null;
}
