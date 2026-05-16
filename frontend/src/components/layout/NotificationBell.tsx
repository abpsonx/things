"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import Popover from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import { socket } from "@/lib/socket";
import { useAuthStore } from "@/store/useAuthStore";

interface Notification {
  id: string;
  title?: string;
  content: string;
  url?: string;
  is_read: boolean;
  created_at: string;
  link?: string;
}

function syncAppBadge(count: number) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) nav.setAppBadge?.(count);
    else nav.clearAppBadge?.();
  } catch {
    /* feature not supported */
  }
}

export default function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const { user } = useAuthStore();

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Keep the PWA app badge in sync with unread count.
  useEffect(() => {
    syncAppBadge(unreadCount);
  }, [unreadCount]);

  const fetchNotifications = async () => {
    try {
      const res = await api.get("/users/me/notifications");
      setNotifications(res.data);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  };

  useEffect(() => {
    fetchNotifications();

    if (user) {
      socket.emit("join_user", { user_id: user.id });
    }

    const handleNewNotif = (notif: Notification) => {
      setNotifications(prev => [notif, ...prev]);

      // In-app toast — clicking it navigates to the notif's target URL.
      toast(notif.title || "Notifikasi baru", {
        description: notif.content,
        action: notif.url
          ? { label: "Lihat", onClick: () => router.push(notif.url!) }
          : undefined,
      });
    };

    socket.on("new_notification", handleNewNotif);

    return () => {
      socket.off("new_notification", handleNewNotif);
    };
  }, [user, router]);

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/users/me/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post(`/users/me/notifications/read-all`);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Popover 
      align="right"
      className="w-[320px] p-0"
      trigger={
        <button className="relative p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-destructive rounded-full border-2 border-card" />
          )}
        </button>
      }
    >
      <div className="flex flex-col w-full text-left">
        <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/20">
          <h4 className="font-bold text-sm">Notifikasi</h4>
          {unreadCount > 0 && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                markAllAsRead();
              }}
              className="text-[10px] flex items-center gap-1 font-bold text-primary hover:text-primary/80 transition-colors"
            >
              <Check className="w-3 h-3" /> Mark all read
            </button>
          )}
        </div>
        
        <div className="max-h-[300px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Belum ada notifikasi
            </div>
          ) : (
            notifications.map((n) => (
              <div 
                key={n.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!n.is_read) markAsRead(n.id);
                }}
                className={cn(
                  "p-4 border-b border-border cursor-pointer transition-colors hover:bg-secondary/50",
                  !n.is_read ? "bg-primary/5" : ""
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full mt-1.5 shrink-0 transition-all",
                    !n.is_read ? "bg-primary" : "bg-transparent"
                  )} />
                  <div className="flex-1 space-y-1">
                    <p className={cn("text-xs leading-relaxed", !n.is_read ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {n.content}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: idLocale })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Popover>
  );
}
