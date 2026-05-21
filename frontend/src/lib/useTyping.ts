"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "@/lib/socket";

/**
 * Real-time "X sedang mengetik..." indicator for Socket.IO chat rooms.
 *
 * - `room` is the Socket.IO room name (e.g. "channel_<id>" or "team_<id>").
 * - `me` is the current user; their own typing events are ignored.
 *
 * Returns the list of names currently typing, plus `onInput` to call on every
 * keystroke and `stopTyping` to call when a message is sent.
 */
export function useTyping(room: string | null, me: { id: string; name: string } | null) {
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const expiryRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastEmitRef = useRef(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!room) return;
    const onTyping = (data: any) => {
      if (!data || data.room !== room || !data.user_id) return;
      if (me && data.user_id === me.id) return;
      const name: string = data.name || "Seseorang";
      if (data.typing) {
        setTypingNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
        if (expiryRef.current[data.user_id]) clearTimeout(expiryRef.current[data.user_id]);
        expiryRef.current[data.user_id] = setTimeout(() => {
          setTypingNames((prev) => prev.filter((n) => n !== name));
          delete expiryRef.current[data.user_id];
        }, 4000);
      } else {
        if (expiryRef.current[data.user_id]) {
          clearTimeout(expiryRef.current[data.user_id]);
          delete expiryRef.current[data.user_id];
        }
        setTypingNames((prev) => prev.filter((n) => n !== name));
      }
    };
    socket.on("typing", onTyping);
    return () => {
      socket.off("typing", onTyping);
      Object.values(expiryRef.current).forEach(clearTimeout);
      expiryRef.current = {};
      setTypingNames([]);
    };
  }, [room, me?.id]);

  const onInput = useCallback(() => {
    if (!room || !me) return;
    const now = Date.now();
    if (now - lastEmitRef.current > 1500) {
      lastEmitRef.current = now;
      socket.emit("typing", { room, user_id: me.id, name: me.name, typing: true });
    }
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      socket.emit("typing", { room, user_id: me.id, name: me.name, typing: false });
      lastEmitRef.current = 0;
    }, 2500);
  }, [room, me?.id, me?.name]);

  const stopTyping = useCallback(() => {
    if (!room || !me) return;
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    socket.emit("typing", { room, user_id: me.id, name: me.name, typing: false });
    lastEmitRef.current = 0;
  }, [room, me?.id, me?.name]);

  return { typingNames, onInput, stopTyping };
}
