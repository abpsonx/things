"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import Popover from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { useNotificationsStore, type Notif } from "@/store/useNotificationsStore";
import NotificationToastContent, { notifStyle } from "@/components/notifications/NotificationToastContent";

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
  const { user } = useAuthStore();
  const items = useNotificationsStore((s) => s.items);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const fetchNotifs = useNotificationsStore((s) => s.fetch);
  const markAsRead = useNotificationsStore((s) => s.markAsRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const bindSocket = useNotificationsStore((s) => s.bindSocket);
  const onNew = useNotificationsStore((s) => s.onNew);

  // Keep PWA app badge in sync
  useEffect(() => {
    syncAppBadge(unreadCount);
  }, [unreadCount]);

  // Boot: fetch + bind socket
  useEffect(() => {
    if (!user) return;
    fetchNotifs();
    bindSocket(user.id);
  }, [user, fetchNotifs, bindSocket]);

  // Subscribe to new-notif events for toast
  useEffect(() => {
    return onNew((n) => {
      toast.custom(
        (toastId) => (
          <div className="bg-card border border-border rounded-2xl shadow-xl p-4 w-[min(380px,calc(100vw-2rem))]">
            <NotificationToastContent
              notif={n}
              onAction={() => {
                toast.dismiss(toastId);
                if (n.url) router.push(n.url);
                if (!n.is_read) markAsRead(n.id);
              }}
            />
          </div>
        ),
        { duration: 5500 },
      );
    });
  }, [onNew, router, markAsRead]);

  const handleItemClick = (n: Notif) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.url) router.push(n.url);
  };

  return (
    <Popover
      align="right"
      className="w-[360px] p-0"
      trigger={
        <button className="relative p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full border-2 border-card flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
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
                markAllRead();
              }}
              className="text-[10px] flex items-center gap-1 font-bold text-primary hover:text-primary/80 transition-colors"
            >
              <Check className="w-3 h-3" /> Tandai semua dibaca
            </button>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Belum ada notifikasi
            </div>
          ) : (
            items.map((n) => {
              const style = notifStyle(n.type);
              const Icon = style.icon;
              return (
                <button
                  key={n.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleItemClick(n);
                  }}
                  className={cn(
                    "w-full text-left p-3 border-b border-border cursor-pointer transition-colors hover:bg-secondary/50 flex items-start gap-3",
                    !n.is_read && "bg-primary/5",
                  )}
                >
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", style.bg, style.fg)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {n.title && (
                      <p className={cn("text-xs font-bold truncate", !n.is_read ? "text-foreground" : "text-muted-foreground")}>
                        {n.title}
                      </p>
                    )}
                    {n.content && (
                      <p className={cn("text-xs leading-relaxed line-clamp-2", !n.is_read ? "text-foreground/80" : "text-muted-foreground/80")}>
                        {n.content}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/70 pt-0.5">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: idLocale })}
                    </p>
                  </div>
                  {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </Popover>
  );
}
