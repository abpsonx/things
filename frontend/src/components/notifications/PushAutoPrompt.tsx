"use client";

import { useEffect } from "react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";

const PROMPT_FLAG = "push_prompted_v1";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

/**
 * Silent component: registers the service worker and prompts the user for
 * push permission once, ~3s after first login. Skips if already subscribed,
 * if previously dismissed, or if the browser doesn't support web push.
 */
export default function PushAutoPrompt() {
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;
    if (localStorage.getItem(PROMPT_FLAG) === "1" && Notification.permission !== "granted") return;

    const timer = setTimeout(async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          // Re-sync with backend in case server lost the subscription
          try {
            await api.post("/users/me/notifications/push-subscribe", existing.toJSON());
          } catch {}
          return;
        }

        if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          localStorage.setItem(PROMPT_FLAG, "1");
          if (permission !== "granted") return;
        }

        if (Notification.permission !== "granted") return;

        const keyRes = await api.get("/users/me/notifications/vapid-public-key");
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyRes.data.publicKey),
        });
        await api.post("/users/me/notifications/push-subscribe", sub.toJSON());
      } catch (err) {
        console.error("[PushAutoPrompt] failed:", err);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, user]);

  return null;
}
