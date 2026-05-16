import { create } from "zustand";
import api from "@/lib/api";
import { socket } from "@/lib/socket";

interface PresenceState {
  online: Set<string>;
  isOnline: (userId: string | undefined | null) => boolean;
  fetch: () => Promise<void>;
  bindSocket: () => void;
  _bound: boolean;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  online: new Set<string>(),
  _bound: false,

  isOnline: (userId) => (userId ? get().online.has(userId) : false),

  fetch: async () => {
    try {
      const res = await api.get("/users/online");
      const ids: string[] = Array.isArray(res.data?.online) ? res.data.online : [];
      set({ online: new Set(ids) });
    } catch (err) {
      console.error("[presence] fetch failed:", err);
    }
  },

  bindSocket: () => {
    if (get()._bound) return;
    socket.on("presence_update", ({ user_id, online }: { user_id: string; online: boolean }) => {
      set((s) => {
        const next = new Set(s.online);
        if (online) next.add(user_id);
        else next.delete(user_id);
        return { online: next };
      });
    });
    set({ _bound: true });
  },
}));
