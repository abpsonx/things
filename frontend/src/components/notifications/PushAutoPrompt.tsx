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

        // Fetch the canonical VAPID key from the backend up front.
        const keyRes = await api.get("/users/me/notifications/vapid-public-key");
        const rawKey = (keyRes.data?.publicKey || "").trim();
        const serverKey = urlBase64ToUint8Array(rawKey);
        console.log("[PushAutoPrompt] VAPID key length:", serverKey.length, "(expected 65)");
        if (serverKey.length !== 65) {
          console.error(
            "[PushAutoPrompt] backend returned malformed VAPID key:",
            JSON.stringify(rawKey.slice(0, 20)) + "...",
            "len=" + rawKey.length,
          );
          return;
        }

        // If there's an existing subscription, only keep it when its
        // applicationServerKey matches the current backend key. Otherwise
        // Chrome will throw InvalidAccessError on a fresh subscribe().
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          const existingKey = existing.options?.applicationServerKey;
          const matches =
            existingKey && new Uint8Array(existingKey).every((b, i) => b === serverKey[i]) &&
            (existingKey as ArrayBuffer).byteLength === serverKey.length;
          if (matches) {
            try {
              await api.post("/users/me/notifications/push-subscribe", existing.toJSON());
            } catch {}
            return;
          }
          console.warn("[PushAutoPrompt] existing subscription has stale key — unsubscribing");
          await existing.unsubscribe();
        }

        if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          localStorage.setItem(PROMPT_FLAG, "1");
          if (permission !== "granted") return;
        }

        if (Notification.permission !== "granted") return;

        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: serverKey,
        });
        await api.post("/users/me/notifications/push-subscribe", sub.toJSON());
        console.log("[PushAutoPrompt] subscribed OK");
      } catch (err) {
        console.error("[PushAutoPrompt] failed:", err);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, user]);

  return null;
}
