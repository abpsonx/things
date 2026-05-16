"use client";

import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Bell, BellOff, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type TestResult = {
  status: string;
  message: string;
  diag?: Record<string, unknown>;
  outcomes?: { endpoint: string; outcome: string; detail?: string }[];
};

export default function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingNotif, setTestingNotif] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const checkSubscription = async () => {
    try {
      if (!navigator.serviceWorker) {
        setLoading(false);
        return;
      }
      
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      setSubscription(sub);
    } catch (err) {
      console.error("Error checking push subscription:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      setTimeout(() => setIsSupported(true), 0);
      checkSubscription();
    } else {
      setTimeout(() => setLoading(false), 0);
    }
  }, []);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribe = async () => {
    setLoading(true);
    setError("");
    try {
      // 1. Get VAPID key
      const res = await api.get("/users/me/notifications/vapid-public-key");
      const vapidPublicKey = res.data.publicKey;

      // 2. Request permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Izin notifikasi ditolak");
      }

      // 3. Register service worker if not already
      const registration = await navigator.serviceWorker.register("/sw.js");
      
      // Wait for service worker to be ready/active
      await navigator.serviceWorker.ready;
      
      // 4. Subscribe
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      // 5. Save to backend
      await api.post("/users/me/notifications/push-subscribe", sub.toJSON());
      
      setSubscription(sub);
    } catch (err: any) {
      console.error("Failed to subscribe", err);
      setError(err.message || "Gagal mengaktifkan notifikasi");
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      if (subscription) {
        await subscription.unsubscribe();
        setSubscription(null);
        // We could also call backend to remove it, but it will fail on next send anyway
      }
    } catch (err) {
      console.error("Failed to unsubscribe", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isSupported) return null;

  return (
    <div className="p-6 border border-border rounded-3xl bg-card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-2xl flex items-center justify-center transition-colors",
            subscription ? "bg-emerald-500/10 text-emerald-500" : "bg-primary/10 text-primary"
          )}>
            {subscription ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-bold">Notifikasi Desktop</h3>
            <p className="text-xs text-muted-foreground">Dapatkan update tugas & chat secara real-time.</p>
          </div>
        </div>

        {subscription ? (
          <div className="flex items-center gap-2">
            <button
              disabled={testingNotif}
              onClick={async () => {
                setTestingNotif(true);
                setError("");
                setTestResult(null);
                try {
                  const res = await api.post("/users/me/notifications/test-push");
                  setTestResult(res.data as TestResult);
                } catch(e: any) {
                  console.error(e);
                  setError(e?.response?.data?.detail || "Gagal mengirim notifikasi tes");
                } finally {
                  setTestingNotif(false);
                }
              }}
              className="px-4 py-2 text-xs font-bold bg-secondary hover:bg-secondary/80 rounded-xl transition-all flex items-center gap-2"
            >
              {testingNotif && <Loader2 className="w-3 h-3 animate-spin" />}
              Tes Notif
            </button>
            <button 
              onClick={unsubscribe}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-xl transition-colors disabled:opacity-50"
            >
              Matikan
            </button>
          </div>
        ) : (
          <button 
            onClick={subscribe}
            disabled={loading}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-primary/20 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Aktifkan
          </button>
        )}
      </div>
      {error && <p className="text-[10px] text-destructive font-bold ml-1">{error}</p>}

      {testResult && (
        <div
          className={cn(
            "rounded-2xl p-4 text-[11px] font-mono space-y-2 mt-2 border",
            testResult.status === "ok"
              ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/5 border-destructive/20 text-destructive",
          )}
        >
          <p className="font-sans font-bold text-xs">
            {testResult.status === "ok" ? "✅" : "❌"} {testResult.message}
          </p>
          {testResult.diag && (
            <div className="space-y-0.5 opacity-80">
              <p>vapid_public_key_len: {String(testResult.diag.vapid_public_key_len)}</p>
              <p>vapid_private_key_len: {String(testResult.diag.vapid_private_key_len)}</p>
              <p>vapid_email: {String(testResult.diag.vapid_email)}</p>
              <p>subscription_count: {String(testResult.diag.subscription_count)}</p>
            </div>
          )}
          {testResult.outcomes && testResult.outcomes.length > 0 && (
            <div className="space-y-1 opacity-80 pt-1 border-t border-current/10">
              {testResult.outcomes.map((o, i) => (
                <div key={i}>
                  <p>[{o.outcome}] {o.endpoint}</p>
                  {o.detail && <p className="pl-4 opacity-70">→ {o.detail}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
