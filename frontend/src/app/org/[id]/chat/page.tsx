"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { socket } from "@/lib/socket";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/lib/utils";
import {
  Send, Loader2, Hash, Paperclip, X, Reply, Trash2, Edit2, Check, Users,
} from "lucide-react";

interface Msg {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  parent_id?: string | null;
  is_edited?: boolean;
  attachment_url?: string | null;
  attachment_name?: string | null;
  created_at: string;
  user?: { id: string; name: string; avatar_url?: string | null } | null;
}

const isImg = (n?: string | null) =>
  !!n && ["jpg", "jpeg", "png", "gif", "webp"].includes((n.split(".").pop() || "").toLowerCase());

export default function WorkspaceChatPage() {
  const { id: orgId } = useParams();
  const { user } = useAuthStore();
  const uid = user?.id;

  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scrollDown = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  // Load channel + history
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      try {
        const ch = await api.get(`/organizations/${orgId}/chat`);
        setChannelId(ch.data.id);
        const msgs = await api.get(`/organizations/${orgId}/chat/messages`);
        setMessages(msgs.data || []);
        scrollDown();
        // Mark everything read so the sidebar unread badge clears.
        api.post(`/organizations/${orgId}/chat/read`)
          .then(() => window.dispatchEvent(new Event("ws-chat-read")))
          .catch(() => {});
      } catch (e) {
        console.error("Failed to load workspace chat", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId, scrollDown]);

  // Realtime
  useEffect(() => {
    if (!channelId) return;
    const join = () => socket.connected && socket.emit("join_channel", { channel_id: channelId });
    if (!socket.connected) socket.connect();
    if (socket.connected) join();
    else socket.once("connect", join);

    const onNew = (m: Msg) => {
      if (m.channel_id !== channelId) return;
      setMessages((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]));
      scrollDown();
    };
    const onUpd = (d: any) =>
      setMessages((prev) => prev.map((m) => (m.id === d.id ? { ...m, content: d.content, is_edited: true } : m)));
    const onDel = (d: any) => setMessages((prev) => prev.filter((m) => m.id !== d.id));

    socket.on("new_message", onNew);
    socket.on("message_updated", onUpd);
    socket.on("message_deleted", onDel);
    return () => {
      socket.emit("leave_channel", { channel_id: channelId });
      socket.off("new_message", onNew);
      socket.off("message_updated", onUpd);
      socket.off("message_deleted", onDel);
    };
  }, [channelId, scrollDown]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      if (editing) {
        const res = await api.patch(`/organizations/${orgId}/chat/messages/${editing.id}`, { content: body });
        setMessages((prev) => prev.map((m) => (m.id === res.data.id ? { ...m, ...res.data } : m)));
        setEditing(null);
      } else {
        const res = await api.post(`/organizations/${orgId}/chat/messages`, { content: body, parent_id: replyTo?.id || null });
        // Show immediately from the response; the socket echo is de-duped by id.
        setMessages((prev) => (prev.find((m) => m.id === res.data.id) ? prev : [...prev, res.data]));
        scrollDown();
        setReplyTo(null);
      }
      setText("");
    } catch (e) {
      console.error("send failed", e);
      alert("Gagal mengirim pesan.");
    } finally {
      setSending(false);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await api.post(`/organizations/${orgId}/chat/messages/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const res = await api.post(`/organizations/${orgId}/chat/messages`, {
        content: file.name,
        attachment_url: up.data.url,
        attachment_name: file.name,
        parent_id: replyTo?.id || null,
      });
      setMessages((prev) => (prev.find((m) => m.id === res.data.id) ? prev : [...prev, res.data]));
      scrollDown();
      setReplyTo(null);
    } catch (err) {
      console.error("upload failed", err);
      alert("Gagal mengunggah file.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const del = async (m: Msg) => {
    if (!confirm("Hapus pesan ini?")) return;
    try {
      await api.delete(`/organizations/${orgId}/chat/messages/${m.id}`);
    } catch (e) {
      alert("Gagal menghapus.");
    }
  };

  const startEdit = (m: Msg) => {
    setEditing(m);
    setReplyTo(null);
    setText(m.content);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-[calc(100vh-6rem)] md:h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Hash className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold flex items-center gap-2">Chat Workspace</h2>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Users className="w-3 h-3" /> Semua anggota workspace ada di sini
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-12">Belum ada pesan. Mulai obrolan! 👋</p>
        )}
        {messages.map((m) => {
          const me = m.user_id === uid;
          const parent = m.parent_id ? messages.find((x) => x.id === m.parent_id) : null;
          return (
            <div key={m.id} className={cn("flex gap-2 group", me && "flex-row-reverse")}>
              <div className="w-8 h-8 rounded-full bg-secondary border border-border shrink-0 flex items-center justify-center overflow-hidden text-[10px] font-bold">
                {m.user?.avatar_url ? <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" /> : (m.user?.name || "?").charAt(0)}
              </div>
              <div className={cn("max-w-[75%] min-w-0", me && "items-end flex flex-col")}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-bold">{me ? "Kamu" : m.user?.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className={cn(
                  "rounded-2xl px-3 py-2 text-sm break-words",
                  me ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-secondary rounded-tl-sm",
                )}>
                  {parent && (
                    <div className={cn("text-[10px] mb-1 pl-2 border-l-2 opacity-80 truncate", me ? "border-white/40" : "border-primary/40")}>
                      ↩ {parent.user?.name}: {parent.content?.slice(0, 60)}
                    </div>
                  )}
                  {m.attachment_url ? (
                    isImg(m.attachment_name) ? (
                      <a href={m.attachment_url} target="_blank" rel="noopener noreferrer">
                        <img src={m.attachment_url} alt={m.attachment_name || ""} className="rounded-lg max-h-60 mb-1" />
                      </a>
                    ) : (
                      <a href={m.attachment_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline">
                        <Paperclip className="w-3.5 h-3.5" /> {m.attachment_name}
                      </a>
                    )
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                  {m.is_edited && <span className="text-[9px] opacity-60 ml-1">(diedit)</span>}
                </div>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity self-center">
                <button onClick={() => { setReplyTo(m); setEditing(null); }} title="Balas" className="p-1 rounded hover:bg-secondary text-muted-foreground">
                  <Reply className="w-3.5 h-3.5" />
                </button>
                {me && !m.attachment_url && (
                  <button onClick={() => startEdit(m)} title="Edit" className="p-1 rounded hover:bg-secondary text-muted-foreground">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {me && (
                  <button onClick={() => del(m)} title="Hapus" className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-border pt-3">
        {(replyTo || editing) && (
          <div className="flex items-center justify-between text-[11px] bg-secondary/50 rounded-lg px-3 py-1.5 mb-2">
            <span className="truncate text-muted-foreground">
              {editing ? "Mengedit pesan" : `Membalas ${replyTo?.user?.name}: ${replyTo?.content?.slice(0, 50)}`}
            </span>
            <button onClick={() => { setReplyTo(null); setEditing(null); setText(""); }}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !!editing}
            className="p-2.5 rounded-xl border border-border hover:bg-secondary text-muted-foreground disabled:opacity-50 shrink-0"
            title="Lampirkan file"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Tulis pesan… (Enter kirim, Shift+Enter baris baru)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 max-h-32"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
          >
            {editing ? <Check className="w-4 h-4" /> : sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
