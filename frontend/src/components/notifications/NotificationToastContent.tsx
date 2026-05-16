"use client";

import { MessageSquare, Bell, Megaphone, CheckSquare, UserPlus, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Notif } from "@/store/useNotificationsStore";

const TYPE_STYLES: Record<string, { icon: React.ElementType; bg: string; fg: string }> = {
  dm: { icon: MessageSquare, bg: "bg-sky-500/10", fg: "text-sky-500" },
  announcement: { icon: Megaphone, bg: "bg-amber-500/10", fg: "text-amber-500" },
  task_assigned: { icon: CheckSquare, bg: "bg-emerald-500/10", fg: "text-emerald-500" },
  comment_added: { icon: MessageSquare, bg: "bg-violet-500/10", fg: "text-violet-500" },
  org_invite: { icon: UserPlus, bg: "bg-primary/10", fg: "text-primary" },
  project_invite: { icon: UserPlus, bg: "bg-primary/10", fg: "text-primary" },
  team_invite: { icon: UserPlus, bg: "bg-primary/10", fg: "text-primary" },
  deadline: { icon: Calendar, bg: "bg-destructive/10", fg: "text-destructive" },
  event_reminder: { icon: Calendar, bg: "bg-amber-500/10", fg: "text-amber-500" },
};

const DEFAULT_STYLE = { icon: Bell, bg: "bg-secondary", fg: "text-foreground" };

export function notifStyle(type?: string) {
  if (!type) return DEFAULT_STYLE;
  return TYPE_STYLES[type] ?? DEFAULT_STYLE;
}

export default function NotificationToastContent({
  notif,
  onAction,
}: {
  notif: Notif;
  onAction?: () => void;
}) {
  const style = notifStyle(notif.type);
  const Icon = style.icon;

  return (
    <div className="flex items-start gap-3 w-full">
      <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0", style.bg, style.fg)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        {notif.title && (
          <p className="text-sm font-bold text-foreground truncate">{notif.title}</p>
        )}
        {notif.content && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">
            {notif.content}
          </p>
        )}
      </div>
      {notif.url && (
        <button
          onClick={onAction}
          className="shrink-0 self-center px-3 py-1.5 bg-primary text-primary-foreground text-[11px] font-bold rounded-xl hover:opacity-90 transition-opacity"
        >
          Lihat
        </button>
      )}
    </div>
  );
}
