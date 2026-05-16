import { create } from "zustand";
import api from "@/lib/api";
import { socket } from "@/lib/socket";

export interface Notif {
  id: string;
  type?: string;
  title?: string;
  content?: string;
  url?: string;
  ref_id?: string;
  is_read: boolean;
  created_at: string;
}

type NewNotifListener = (n: Notif) => void;

export interface DMSummary {
  senderId: string;
  count: number;
  lastSnippet: string;
  lastAt: string;
}

interface NotificationsState {
  items: Notif[];
  loaded: boolean;
  unreadCount: number;
  unreadDMCount: number;
  unreadByType: (type: string) => number;
  dmSummaryBySender: () => Record<string, DMSummary>;
  fetch: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markDMsFromSenderRead: (senderId: string) => Promise<void>;
  pushIncoming: (n: Notif) => void;
  bindSocket: (userId: string) => void;
  onNew: (cb: NewNotifListener) => () => void;
  _newListeners: Set<NewNotifListener>;
  _socketBound: boolean;
}

function extractSenderIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/\/dm\/([^/?#]+)/);
  return m ? m[1] : null;
}

function deriveCounts(items: Notif[]) {
  const unreadCount = items.reduce((acc, n) => (n.is_read ? acc : acc + 1), 0);
  const unreadDMCount = items.reduce(
    (acc, n) => (!n.is_read && n.type === "dm" ? acc + 1 : acc),
    0,
  );
  return { unreadCount, unreadDMCount };
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  loaded: false,
  unreadCount: 0,
  unreadDMCount: 0,
  _newListeners: new Set<NewNotifListener>(),
  _socketBound: false,

  unreadByType: (type: string) =>
    get().items.reduce((acc, n) => (!n.is_read && n.type === type ? acc + 1 : acc), 0),

  dmSummaryBySender: () => {
    const out: Record<string, DMSummary> = {};
    for (const n of get().items) {
      if (n.is_read || n.type !== "dm") continue;
      const senderId = extractSenderIdFromUrl(n.url);
      if (!senderId) continue;
      const existing = out[senderId];
      if (!existing) {
        out[senderId] = {
          senderId,
          count: 1,
          lastSnippet: n.content || "",
          lastAt: n.created_at,
        };
      } else {
        existing.count += 1;
        if (new Date(n.created_at) > new Date(existing.lastAt)) {
          existing.lastSnippet = n.content || existing.lastSnippet;
          existing.lastAt = n.created_at;
        }
      }
    }
    return out;
  },

  fetch: async () => {
    try {
      const res = await api.get("/users/me/notifications");
      const items: Notif[] = Array.isArray(res.data) ? res.data : [];
      set({ items, loaded: true, ...deriveCounts(items) });
    } catch (err) {
      console.error("[notifications] fetch failed:", err);
      set({ loaded: true });
    }
  },

  markAsRead: async (id: string) => {
    const items = get().items.map((n) => (n.id === id ? { ...n, is_read: true } : n));
    set({ items, ...deriveCounts(items) });
    try {
      await api.patch(`/users/me/notifications/${id}/read`);
    } catch (err) {
      console.error("[notifications] markAsRead failed:", err);
    }
  },

  markAllRead: async () => {
    const items = get().items.map((n) => ({ ...n, is_read: true }));
    set({ items, ...deriveCounts(items) });
    try {
      await api.post("/users/me/notifications/read-all");
    } catch (err) {
      console.error("[notifications] markAllRead failed:", err);
    }
  },

  markDMsFromSenderRead: async (senderId: string) => {
    const toRead = get().items.filter(
      (n) => !n.is_read && n.type === "dm" && extractSenderIdFromUrl(n.url) === senderId,
    );
    if (toRead.length === 0) return;
    const targetIds = new Set(toRead.map((n) => n.id));
    const items = get().items.map((n) =>
      targetIds.has(n.id) ? { ...n, is_read: true } : n,
    );
    set({ items, ...deriveCounts(items) });
    await Promise.allSettled(
      toRead.map((n) =>
        api.patch(`/users/me/notifications/${n.id}/read`).catch((e) => {
          console.error("[notifications] markDMsFromSenderRead failed:", e);
        }),
      ),
    );
  },

  pushIncoming: (n: Notif) => {
    const items = [n, ...get().items.filter((existing) => existing.id !== n.id)];
    set({ items, ...deriveCounts(items) });
    get()._newListeners.forEach((cb) => {
      try {
        cb(n);
      } catch (err) {
        console.error("[notifications] listener error:", err);
      }
    });
  },

  bindSocket: (userId: string) => {
    if (get()._socketBound) return;
    socket.emit("join_user", { user_id: userId });
    socket.on("new_notification", (n: Notif) => {
      get().pushIncoming(n);
    });
    set({ _socketBound: true });
  },

  onNew: (cb: NewNotifListener) => {
    get()._newListeners.add(cb);
    return () => {
      get()._newListeners.delete(cb);
    };
  },
}));
