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

interface NotificationsState {
  items: Notif[];
  loaded: boolean;
  unreadCount: number;
  unreadDMCount: number;
  unreadByType: (type: string) => number;
  fetch: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  pushIncoming: (n: Notif) => void;
  bindSocket: (userId: string) => void;
  onNew: (cb: NewNotifListener) => () => void;
  _newListeners: Set<NewNotifListener>;
  _socketBound: boolean;
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
