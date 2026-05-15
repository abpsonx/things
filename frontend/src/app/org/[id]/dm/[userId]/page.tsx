"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Send,
  Loader2,
  User as UserIcon,
  ShieldCheck,
  Paperclip,
  Trash2,
  Edit2,
  X,
  Check,
  CheckCheck,
  Smile,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

type WsStatus = "connecting" | "connected" | "disconnected";

export default function DMChatPage() {
  const params = useParams();
  const orgId = params?.id;
  const targetUserId = params?.userId;
  const { user: currentUser } = useAuthStore();

  const [channel, setChannel] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");

  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelIdRef = useRef<string | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const emojis = ["😊", "😂", "👍", "🔥", "🙏", "❤️", "🙌", "✅", "🚀", "🤔"];

  // ─── Connect native WebSocket ─────────────────────────────────────────────
  const connectWsRef = useRef<any>(null);

  const connectWs = useCallback((channelId: string) => {
    // Close any existing connection with code 1000 so it doesn't auto-reconnect
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.onclose = null; // Prevent onclose from firing
      wsRef.current.close(1000);
    }
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://dothings.id/api";
    // Convert http(s):// → ws(s)://
    const wsBase = apiUrl.replace(/^http/, "ws").replace(/\/api$/, "");
    const wsUrl = `${wsBase}/api/dm/ws/${channelId}?token=${encodeURIComponent(token)}`;

    setWsStatus("connecting");
    const ws = new WebSocket(wsUrl);
    console.log('[WS] new WebSocket created, channelId:', channelId);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      // Send ping every 25s to keep connection alive
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      console.log('[WS] message received, ws instance:', ws === wsRef.current);
      // Ignore pong responses
      if (event.data === "pong") return;

      try {
        const data = JSON.parse(event.data);

        if (data.type === "dm_received") {
          setMessages((prev) => {
            // Replace optimistic message if it exists
            const tempIndex = prev.findIndex(
              (m) => data.message.temp_id && m.id === data.message.temp_id
            );
            if (tempIndex !== -1) {
              const next = [...prev];
              next[tempIndex] = data.message;
              return next;
            }
            // Dedup by message ID
            if (prev.find((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        } else if (data.type === "dm_edited") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.message.id ? { ...m, content: data.message.content } : m
            )
          );
        } else if (data.type === "dm_deleted") {
          setMessages((prev) => prev.filter((m) => m.id !== data.message_id));
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      setWsStatus("disconnected");
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

      // Auto-reconnect after 3s unless intentionally closed (code 1000 or 4001)
      if (event.code !== 1000 && event.code !== 4001) {
        reconnectTimerRef.current = setTimeout(() => {
          if (channelIdRef.current && connectWsRef.current) {
            connectWsRef.current(channelIdRef.current);
          }
        }, 3000);
      }
    };

    ws.onerror = () => {
      setWsStatus("disconnected");
    };
  }, []);

  useEffect(() => {
    connectWsRef.current = connectWs;
  }, [connectWs]);

  // ─── Init DM ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const initDM = async () => {
      console.log('[DM] initDM called, targetUserId:', targetUserId);
      try {
        const res = await api.post("/dm/channels", {
          org_id: orgId === "undefined" ? null : orgId,
          other_user_id: targetUserId,
        });
        
        if (!mounted) return;
        
        setChannel(res.data);
        channelIdRef.current = res.data.id;

        // ✅ Connect WS DULU, sebelum fetch history agar tidak ada blind-spot pesan masuk
        connectWs(res.data.id);
        console.log('[DM] connectWs called, channelId:', res.data.id);

        const msgRes = await api.get(`/dm/channels/${res.data.id}/messages`);
        
        if (!mounted) return;
        
        setMessages(msgRes.data);
      } catch (err) {
        console.error("Failed to init DM", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (targetUserId) initDM();

    return () => {
      mounted = false;
      channelIdRef.current = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000, "page unmount");
      }
    };
  }, [orgId, targetUserId, connectWs]);

  // ─── Auto scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ─── Send ─────────────────────────────────────────────────────────────────
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !channel) return;

    if (editingMessage) {
      handleUpdateMessage();
      return;
    }

    setSending(true);
    const tempId = `optimistic_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const optimistic = {
      id: tempId,
      content: newMessage,
      user_id: currentUser?.id,
      dm_channel_id: channel.id,
      created_at: new Date().toISOString(),
      attachment_url: null,
      attachment_name: null,
      user: { id: currentUser?.id, name: currentUser?.name, avatar_url: currentUser?.avatar_url },
      _optimistic: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    setNewMessage("");

    try {
      const res = await api.post(`/dm/channels/${channel.id}/messages`, {
        content: optimistic.content,
        temp_id: tempId,
      });
      // Do NOT replace the optimistic message here immediately!
      // Let the Native WebSocket (ws.onmessage) handle the replacement 
      // when it receives the "dm_received" broadcast from the backend.
      
      // Fallback: jika WS telat atau gagal merespon dalam 3 detik, 
      // lakukan fallback replacement manual dari response HTTP.
      setTimeout(() => {
        setMessages((prev) => {
          const stillOptimistic = prev.find((m) => m.id === tempId);
          if (stillOptimistic) {
            return prev.map((m) => (m.id === tempId ? res.data : m));
          }
          return prev;
        });
      }, 3000);
    } catch (err) {
      console.error("Failed to send message", err);
      // Remove failed optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(optimistic.content); // restore text
    } finally {
      setSending(false);
    }
  };

  const handleUpdateMessage = async () => {
    try {
      const res = await api.put(`/dm/messages/${editingMessage.id}`, {
        content: newMessage,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === editingMessage.id ? { ...m, content: res.data.content } : m))
      );
      setEditingMessage(null);
      setNewMessage("");
    } catch (err) {
      console.error("Failed to update message", err);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    if (!confirm("Hapus pesan ini?")) return;
    // Optimistic delete
    setMessages((prev) => prev.filter((m) => m.id !== id));
    try {
      await api.delete(`/dm/messages/${id}`);
    } catch (err) {
      console.error("Failed to delete message", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !channel) return;

    const formData = new FormData();
    formData.append("file", file);

    setSending(true);
    try {
      const res = await api.post(`/dm/channels/${channel.id}/attachments`, formData);
      setMessages((prev) => {
        if (prev.find((m) => m.id === res.data.id)) return prev;
        return [...prev, res.data];
      });
    } catch (err) {
      console.error("Failed to upload file", err);
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-160px)]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const otherUser = channel?.user1_id === currentUser?.id ? channel?.user2 : channel?.user1;

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-border bg-secondary/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary relative">
            <UserIcon className="w-5 h-5" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" />
          </div>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-1">
              {otherUser?.name || "Chat Pribadi"}
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
            </h2>
            <p className="text-[10px] text-muted-foreground">Aktif sekarang</p>
          </div>
        </div>

        {/* WS Status indicator */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {wsStatus === "connected" ? (
            <><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">Live</span></>
          ) : wsStatus === "connecting" ? (
            <><Loader2 className="w-3 h-3 animate-spin" /><span>Connecting...</span></>
          ) : (
            <><WifiOff className="w-3 h-3 text-destructive" /><span className="text-destructive">Offline</span></>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && channel) {
            const mockEvent = { target: { files: [file] } } as any;
            handleFileUpload(mockEvent);
          }
        }}
        className="flex-1 overflow-y-auto p-6 space-y-4 bg-secondary/[0.02] relative"
      >
        {isDragging && (
          <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] z-50 flex items-center justify-center border-2 border-dashed border-primary m-4 rounded-3xl animate-in fade-in zoom-in-95">
            <div className="bg-background px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3">
              <Paperclip className="w-6 h-6 text-primary animate-bounce" />
              <span className="font-bold text-sm text-foreground">Lepaskan untuk kirim ke {otherUser?.name}</span>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.user_id === currentUser?.id;
          const isOptimistic = msg._optimistic === true;
          return (
            <div key={msg.id} className={cn("flex group", isMe ? "justify-end" : "justify-start")}>
              <div className={cn("flex gap-2 max-w-[80%]", isMe ? "flex-row-reverse" : "flex-row")}>
                <div className={cn(
                  "relative px-4 py-2 rounded-2xl text-sm shadow-sm transition-opacity",
                  isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-card border border-border rounded-tl-none text-foreground",
                  isOptimistic && "opacity-60"
                )}>
                  {msg.attachment_url ? (
                    <div className="space-y-2">
                      {msg.attachment_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <img src={msg.attachment_url} className="max-w-full rounded-lg" alt="attachment" />
                      ) : (
                        <div className="flex items-center gap-2 p-2 bg-black/10 rounded-lg">
                          <Paperclip className="w-4 h-4" />
                          <a href={msg.attachment_url} target="_blank" className="underline truncate max-w-[150px]">{msg.attachment_name}</a>
                        </div>
                      )}
                    </div>
                  ) : (
                    msg.content
                  )}

                  <div className={cn("flex items-center gap-1 mt-1 text-[9px] opacity-70", isMe ? "justify-end" : "justify-start")}>
                    {isOptimistic ? (
                      <span>Mengirim...</span>
                    ) : (
                      <>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {isMe && (msg.is_read ? <CheckCheck className="w-3 h-3 text-blue-300" /> : <Check className="w-3 h-3" />)}
                      </>
                    )}
                  </div>

                  {/* Actions Menu */}
                  {isMe && !isOptimistic && (
                    <div className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                      <button
                        onClick={() => { setEditingMessage(msg); setNewMessage(msg.content); }}
                        className="p-1 hover:bg-secondary rounded text-muted-foreground"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="p-1 hover:bg-destructive/10 rounded text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-card">
        {editingMessage && (
          <div className="mb-2 p-2 bg-secondary/50 rounded-lg flex items-center justify-between text-xs">
            <span className="truncate flex items-center gap-1 text-muted-foreground">
              <Edit2 className="w-3 h-3" /> Mengedit pesan...
            </span>
            <button onClick={() => { setEditingMessage(null); setNewMessage(""); }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {showEmojis && (
          <div className="mb-2 p-2 bg-secondary/30 rounded-xl flex gap-2 overflow-x-auto border border-border shadow-inner">
            {emojis.map((e) => (
              <button
                key={e}
                onClick={() => { setNewMessage((prev) => prev + e); setShowEmojis(false); }}
                className="text-lg hover:scale-125 transition-transform"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors"
          >
            <Paperclip className="w-5 h-5 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => setShowEmojis(!showEmojis)}
            className="p-3 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors"
          >
            <Smile className="w-5 h-5 text-muted-foreground" />
          </button>

          <div className="flex-1 relative">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                // Ignore Enter if the user is using an IME or emoji picker
                if (e.nativeEvent.isComposing) return;
                
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Tulis pesan..."
              rows={1}
              className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all text-sm resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-3 bg-primary text-primary-foreground rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
