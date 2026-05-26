"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import api from "@/lib/api";
import { socket } from "@/lib/socket";
import { useTyping } from "@/lib/useTyping";
import TypingIndicator from "@/components/chat/TypingIndicator";
import {
  Send, Hash, Search, MoreVertical, Smile, Paperclip, Loader2, Edit2, Trash2,
  Reply, CheckCheck, X, CornerDownRight, MessageSquare, Pin, Star, Image,
  FileText, Link2, ExternalLink, BarChart3, Download, Users, Sticker,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import CreatePollModal from "@/components/poll/CreatePollModal";
import PollBubble, { PollData } from "@/components/poll/PollBubble";
import Reactions, { ReactionBucket } from "@/components/reactions/Reactions";
import VoiceRecorder from "@/components/chat/VoiceRecorder";
import VoiceNotePlayer, { isAudioFile } from "@/components/chat/VoiceNotePlayer";

const fmtEdited = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}.${mi}`;
};

export default function WorkspaceChatPage() {
  const { id: orgId } = useParams();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [readInfo, setReadInfo] = useState<any>(null);

  const [attachment, setAttachment] = useState<File | null>(null);
  const [sendAsSticker, setSendAsSticker] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const attachmentIsImage = !!attachment && attachment.type.startsWith("image/");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [isStarredModalOpen, setIsStarredModalOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [profileMember, setProfileMember] = useState<any | null>(null);
  const [mediaTab, setMediaTab] = useState<"media" | "files" | "links">("media");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const EMOJIS = ["😀", "😂", "🤣", "😊", "😍", "🙏", "👍", "🙌", "🔥", "🎉", "✨", "❤️", "💡", "✅", "👀", "🚀"];

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [members, setMembers] = useState<any[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const pickedMentionsRef = useRef<Map<string, string>>(new Map());

  const { typingNames, onInput: onTypingInput, stopTyping } = useTyping(
    channelId ? `channel_${channelId}` : null,
    currentUser ? { id: currentUser.id, name: currentUser.name } : null,
  );

  const base = `/organizations/${orgId}/chat`;

  // Current user
  useEffect(() => {
    api.get("/auth/me").then((res) => setCurrentUser(res.data)).catch((e) => console.error(e));
  }, []);

  // Socket connection lifecycle
  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (!socket.connected) socket.connect();
    else setIsConnected(true);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  // Close header menu on outside click
  useEffect(() => {
    if (!showHeaderMenu) return;
    const h = () => setShowHeaderMenu(false);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [showHeaderMenu]);

  // Workspace members for @mention picker + members modal
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    api.get(`/organizations/${orgId}`)
      .then((res) => { if (!cancelled) setMembers(Array.isArray(res.data?.members) ? res.data.members : []); })
      .catch((e) => console.error("Failed to fetch workspace members", e));
    return () => { cancelled = true; };
  }, [orgId]);

  const mentionMatches =
    mentionQuery === null
      ? []
      : members
          .filter((m) => (m.user?.name || "").toLowerCase().includes(mentionQuery.toLowerCase()))
          .filter((m) => m.user_id !== currentUser?.id)
          .slice(0, 6);

  const insertMention = (member: any) => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    const cursor = ta.selectionStart ?? newMessage.length;
    const before = newMessage.slice(0, cursor);
    const after = newMessage.slice(cursor);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) return;
    const name = member.user?.name || "user";
    pickedMentionsRef.current.set(name, member.user_id);
    const visible = `@${name} `;
    const next = before.slice(0, atIdx) + visible + after;
    setNewMessage(next);
    setMentionQuery(null);
    setMentionHighlight(0);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const pos = atIdx + visible.length;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos);
    });
  };

  const expandMentionsForSend = (textVal: string) => {
    if (!textVal || pickedMentionsRef.current.size === 0) return textVal;
    let out = textVal;
    const names = Array.from(pickedMentionsRef.current.keys()).sort((a, b) => b.length - a.length);
    for (const name of names) {
      const uid = pickedMentionsRef.current.get(name);
      if (!uid) continue;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`@${escaped}(?=\\s|$|[^\\w])`, "g");
      out = out.replace(re, `@[${name}](${uid})`);
    }
    return out;
  };

  const renderMessageContent = (content: string, onGreen = false) => {
    if (!content) return null;
    const TOKEN_RE = /(https?:\/\/[^\s]+|@\[[^\]]+\]\([0-9a-fA-F-]{36}\))/g;
    const parts = content.split(TOKEN_RE);
    const MENTION_RE = /^@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)$/;
    const URL_RE = /^https?:\/\//;
    return parts.map((part, i) => {
      if (!part) return null;
      const mentionMatch = part.match(MENTION_RE);
      if (mentionMatch) {
        const [, name, userId] = mentionMatch;
        const isViewer = currentUser?.id === userId;
        return (
          <span key={i} className={cn("font-extrabold", onGreen ? "text-white" : isViewer ? "text-emerald-700 dark:text-emerald-400" : "text-primary")}>
            @{name}
          </span>
        );
      }
      if (URL_RE.test(part)) {
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            className={cn("hover:underline break-all", onGreen ? "text-white font-semibold underline underline-offset-2" : "text-blue-500")}
            onClick={(e) => e.stopPropagation()}>
            {part}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const togglePin = async (msg: any) => {
    try { await api.post(`${base}/messages/${msg.id}/pin`); } catch (e) { console.error(e); }
  };
  const toggleStar = async (msg: any) => {
    try { await api.post(`${base}/messages/${msg.id}/star`); } catch (e) { console.error(e); }
  };

  const clearChat = async () => {
    if (!window.confirm("Hapus semua pesan di chat workspace?")) return;
    try { await api.delete(`${base}/clear`); setShowHeaderMenu(false); }
    catch { alert("Gagal mengosongkan chat. Hanya Manager ke atas yang bisa."); }
  };

  const markAllAsRead = async () => {
    if (!currentUser) return;
    const unreadIds = messages
      .filter((m) => m.user_id !== currentUser.id && (!m.read_by || !m.read_by.some((r: any) => r.id === currentUser.id)))
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      try { await api.post(`${base}/read`, { message_ids: unreadIds }); } catch (e) { console.error(e); }
    }
    setShowHeaderMenu(false);
  };

  // Load channel + history
  const loadChat = useCallback(async () => {
    if (!orgId) return;
    try {
      const ch = await api.get(base);
      setChannelId(ch.data.id);
      const msgs = await api.get(`${base}/messages`);
      setMessages(msgs.data || []);
      api.post(`${base}/read`).then(() => window.dispatchEvent(new Event("ws-chat-read"))).catch(() => {});
    } catch (e) {
      console.error("Failed to load workspace chat", e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => { loadChat(); }, [loadChat]);

  // Realtime + room
  useEffect(() => {
    if (!channelId) return;
    const join = () => { if (socket.connected) socket.emit("join_channel", { channel_id: channelId }); };
    if (socket.connected) join(); else socket.once("connect", join);

    const onNew = (m: any) => {
      if (m.channel_id !== channelId) return;
      setMessages((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]));
    };
    const onUpd = (d: any) =>
      setMessages((prev) => prev.map((m) => m.id === d.id ? { ...m, content: d.content, is_edited: true, edited_at: d.edited_at || m.edited_at || new Date().toISOString() } : m));
    const onDel = (d: any) => setMessages((prev) => prev.filter((m) => m.id !== d.id));
    const onRead = (d: any) => {
      if (d.channel_id !== channelId) return;
      setMessages((prev) => prev.map((m) => {
        const u = d.updates.find((x: any) => x.message_id === m.id);
        return u ? { ...m, is_read: true, read_by: u.read_by } : m;
      }));
    };
    const onCleared = (d: any) => { if (d.channel_id === channelId) setMessages([]); };
    const onPinned = (d: any) => setMessages((prev) => prev.map((m) => m.id === d.id ? { ...m, is_pinned: d.is_pinned } : m));
    const onStarred = (d: any) => setMessages((prev) => prev.map((m) => m.id === d.id ? { ...m, is_starred: d.is_starred } : m));
    const onPoll = (poll: any) => setMessages((prev) => prev.map((m) => m.poll && m.poll.id === poll.id ? { ...m, poll } : m));
    const onReaction = (p: any) => {
      if (p.target_type !== "message") return;
      setMessages((prev) => prev.map((m) => m.id === p.target_id ? { ...m, reactions: p.reactions } : m));
    };

    socket.on("new_message", onNew);
    socket.on("message_updated", onUpd);
    socket.on("message_deleted", onDel);
    socket.on("messages_read", onRead);
    socket.on("channel_cleared", onCleared);
    socket.on("message_pinned", onPinned);
    socket.on("message_starred", onStarred);
    socket.on("poll_updated", onPoll);
    socket.on("reaction_updated", onReaction);
    return () => {
      socket.emit("leave_channel", { channel_id: channelId });
      socket.off("new_message", onNew);
      socket.off("message_updated", onUpd);
      socket.off("message_deleted", onDel);
      socket.off("messages_read", onRead);
      socket.off("channel_cleared", onCleared);
      socket.off("message_pinned", onPinned);
      socket.off("message_starred", onStarred);
      socket.off("poll_updated", onPoll);
      socket.off("reaction_updated", onReaction);
    };
  }, [channelId]);

  // Mark unread as read when messages change
  useEffect(() => {
    if (!channelId || !currentUser || messages.length === 0) return;
    const unreadIds = messages
      .filter((m) => m.user_id !== currentUser.id && (!m.read_by || !m.read_by.some((r: any) => r.id === currentUser.id)))
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      api.post(`${base}/read`, { message_ids: unreadIds })
        .then(() => window.dispatchEvent(new Event("ws-chat-read")))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, channelId, currentUser]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !attachment) return;
    setSending(true);
    try {
      let attachmentUrl = null;
      let attachmentName = null;
      if (attachment) {
        setUploadingFile(true);
        const fd = new FormData();
        fd.append("file", attachment);
        const up = await api.post(`${base}/messages/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        attachmentUrl = up.data.url;
        attachmentName = up.data.filename;
      }
      const expanded = expandMentionsForSend(newMessage);
      if (editingMessage) {
        const res = await api.patch(`${base}/messages/${editingMessage.id}`, { content: expanded });
        setMessages((prev) => prev.map((m) => m.id === editingMessage.id ? res.data : m));
        setEditingMessage(null);
      } else {
        const res = await api.post(`${base}/messages`, {
          content: expanded || (attachment ? `Sent a file: ${attachment.name}` : ""),
          parent_id: replyingTo?.id,
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
          is_sticker: sendAsSticker && attachmentIsImage,
        });
        setMessages((prev) => (prev.find((m) => m.id === res.data.id) ? prev : [...prev, res.data]));
        setReplyingTo(null);
      }
      setNewMessage("");
      stopTyping();
      pickedMentionsRef.current.clear();
      setAttachment(null);
      setSendAsSticker(false);
      setUploadingFile(false);
    } catch (err) {
      console.error("Failed to send message", err);
      setUploadingFile(false);
    } finally {
      setSending(false);
    }
  };

  const sendVoiceNote = async (file: File) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await api.post(`${base}/messages/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      const res = await api.post(`${base}/messages`, {
        content: "🎤 Voice note",
        attachment_url: up.data.url,
        attachment_name: up.data.filename || file.name,
      });
      setMessages((prev) => (prev.find((m) => m.id === res.data.id) ? prev : [...prev, res.data]));
    } catch (err) {
      console.error("Failed to send voice note", err);
      alert("Gagal mengirim voice note");
    }
  };

  const deleteMessage = async (msgId: string) => {
    if (!confirm("Hapus pesan ini?")) return;
    try { await api.delete(`${base}/messages/${msgId}`); } catch (e) { console.error(e); }
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-[calc(100vh-7rem)] bg-card border border-border rounded-3xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-background/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Hash className="w-5 h-5" /></div>
          <div>
            <h2 className="font-bold text-base tracking-tight">Chat Workspace</h2>
            <div className="flex items-center gap-1.5">
              <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-red-500 animate-pulse")} />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                <Users className="w-3 h-3" /> Semua anggota workspace
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center bg-secondary/50 rounded-2xl px-3 py-1.5 transition-all duration-300", showSearch ? "w-56 opacity-100" : "w-0 opacity-0 overflow-hidden p-0")}>
            <Search className="w-3.5 h-3.5 text-muted-foreground mr-2" />
            <input type="text" placeholder="Cari pesan..." className="bg-transparent border-none focus:outline-none text-[12px] w-full"
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus={showSearch} />
            <button onClick={() => { setShowSearch(false); setSearchQuery(""); }}><X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" /></button>
          </div>
          {!showSearch && (
            <button onClick={() => setShowSearch(true)} className="p-2.5 hover:bg-secondary rounded-2xl transition-all"><Search className="w-4 h-4 text-muted-foreground" /></button>
          )}
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setShowHeaderMenu(!showHeaderMenu); }}
              className={cn("p-2.5 hover:bg-secondary rounded-2xl transition-all", showHeaderMenu && "bg-secondary")}>
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </button>
            {showHeaderMenu && (
              <div className="absolute top-full right-0 mt-2 w-52 bg-background border border-border rounded-2xl shadow-2xl z-50 p-2 animate-in fade-in slide-in-from-top-2">
                <button onClick={markAllAsRead} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-secondary transition-all text-left">
                  <CheckCheck className="w-4 h-4 opacity-60" /> Tandai Terbaca
                </button>
                <button onClick={() => { setIsStarredModalOpen(true); setShowHeaderMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-secondary transition-all text-left">
                  <Star className="w-4 h-4 text-yellow-500 opacity-80" /> Pesan Berbintang
                </button>
                <button onClick={() => { setIsMediaModalOpen(true); setShowHeaderMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-secondary transition-all text-left">
                  <Image className="w-4 h-4 text-blue-500 opacity-80" /> Media & Lampiran
                </button>
                <button onClick={() => { setIsMembersModalOpen(true); setShowHeaderMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-secondary transition-all text-left">
                  <MessageSquare className="w-4 h-4 text-emerald-500 opacity-80" /> Anggota Workspace ({members.length})
                </button>
                <div className="h-px bg-border my-1" />
                <button onClick={clearChat} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-red-500/10 text-red-500 transition-all text-left">
                  <Trash2 className="w-4 h-4 opacity-60" /> Kosongkan Chat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pinned bar */}
      {messages.some((m) => m.is_pinned) && (
        <div className="bg-secondary/20 border-b border-border px-6 py-2 flex items-center gap-3 overflow-x-auto no-scrollbar animate-in slide-in-from-top-2">
          <Pin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <div className="flex gap-2 min-w-0">
            {messages.filter((m) => m.is_pinned).map((m) => (
              <button key={m.id} onClick={() => {
                const el = document.getElementById(`msg-${m.id}`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                el?.classList.add("ring-2", "ring-blue-500/50");
                setTimeout(() => el?.classList.remove("ring-2", "ring-blue-500/50"), 2000);
              }} className="flex items-center gap-2 bg-background border border-border px-3 py-1 rounded-full text-[10px] font-medium whitespace-nowrap hover:bg-secondary transition-all shrink-0 max-w-[200px]">
                <span className="truncate opacity-80">{m.content || m.attachment_name || "File"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) setAttachment(f); }}
        className="flex-1 min-h-0 overflow-y-auto p-2 py-4 space-y-0.5 custom-scrollbar relative bg-background">
        {isDragging && (
          <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] z-50 flex items-center justify-center border-2 border-dashed border-primary m-4 rounded-3xl animate-in fade-in zoom-in-95">
            <div className="bg-background px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3"><Paperclip className="w-6 h-6 text-primary" /><span className="font-bold text-sm">Lepaskan untuk upload file</span></div>
          </div>
        )}
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-12">Belum ada pesan. Mulai obrolan! 👋</p>
        )}
        {messages.filter((msg) =>
          !searchQuery ||
          msg.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          msg.attachment_name?.toLowerCase().includes(searchQuery.toLowerCase())
        ).map((msg: any) => {
          const isMe = currentUser && msg.user_id === currentUser.id;
          const replyMsg = msg.parent_id ? messages.find((m: any) => m.id === msg.parent_id) : null;
          const isSticker = !!(msg.is_sticker && msg.attachment_url);
          return (
            <div key={msg.id} id={`msg-${msg.id}`} className={cn("flex w-full group animate-in fade-in slide-in-from-bottom-1 duration-200", isMe ? "justify-end" : "justify-start")}>
              {!isMe && (
                <div className="w-6 h-6 rounded-full bg-foreground/10 border border-border flex items-center justify-center text-[8px] font-bold text-foreground mr-1.5 mt-auto mb-0.5 shrink-0 shadow-sm overflow-hidden">
                  {msg.user?.avatar_url ? <img src={msg.user.avatar_url} alt={msg.user.name} className="w-full h-full object-cover" /> : (msg.user?.name?.charAt(0) || "?")}
                </div>
              )}
              <div className={cn("max-w-[85%] relative flex flex-col", isMe ? "items-end" : "items-start")}>
                <div className={cn(
                  "text-[13px] relative group/msg transition-all min-w-[40px]",
                  (msg.poll || isSticker) ? "bg-transparent" : isMe
                    ? "px-3 py-1.5 rounded-2xl shadow-sm bg-[#3D4F6B] text-white rounded-tr-none"
                    : "px-3 py-1.5 rounded-2xl shadow-sm bg-card border border-border text-foreground rounded-tl-none",
                  !msg.poll && !isSticker && msg.is_pinned && "ring-1 ring-blue-500/30",
                  !msg.poll && !isSticker && msg.is_starred && "ring-1 ring-yellow-500/30"
                )}>
                  {msg.is_pinned && <div className="absolute -top-2 -right-2 bg-blue-500 text-white p-0.5 rounded-full shadow-sm z-10"><Pin className="w-2 h-2" /></div>}
                  {msg.is_starred && !msg.is_pinned && <div className="absolute -top-2 -right-2 bg-yellow-500 text-white p-0.5 rounded-full shadow-sm z-10"><Star className="w-2 h-2 fill-current" /></div>}
                  {!isMe && (
                    <div className="text-[9px] font-bold text-blue-500 mb-0.5 flex items-center gap-2">
                      <span>{msg.user?.name}</span>
                      {(msg.user as any)?.tagline && <span className="font-normal italic text-muted-foreground">· {(msg.user as any).tagline}</span>}
                    </div>
                  )}
                  {replyMsg && (
                    <div className={cn("text-[10px] p-1.5 rounded border-l-2 mb-1 truncate", isMe ? "bg-white/10 border-white/40 text-white/80" : "bg-foreground/5 border-foreground/20 text-foreground/70", isMe ? "text-right" : "")}>
                      <div className={cn("font-bold flex items-center gap-1 mb-0.5 text-[8px]", isMe ? "text-white/90" : "text-foreground/80")}><CornerDownRight className="w-2.5 h-2.5" /> {replyMsg.user?.name}</div>
                      {replyMsg.content}
                    </div>
                  )}
                  {msg.attachment_url && (
                    <div className={cn("mb-1", !msg.content || msg.content === "🎤 Voice note" ? "mb-0" : "")}>
                      {isAudioFile(msg.attachment_url, msg.attachment_name) ? (
                        <VoiceNotePlayer url={msg.attachment_url} onDark={isMe} />
                      ) : msg.attachment_url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                        <a href={msg.attachment_url} target="_blank" rel="noreferrer">
                          <img src={msg.attachment_url} alt="attachment" className={cn(
                            "h-auto cursor-pointer hover:opacity-90 transition-opacity",
                            isSticker ? "max-h-[150px] w-auto object-contain drop-shadow" : "rounded max-w-full max-h-[200px] object-cover border border-border",
                          )} />
                        </a>
                      ) : (
                        <a href={msg.attachment_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          className={cn("group/file inline-flex items-center gap-2.5 px-2.5 py-2 rounded-xl border min-w-[200px] max-w-[280px] transition-all", isMe ? "bg-white/10 border-white/20 hover:bg-white/15" : "bg-secondary/40 border-border hover:bg-secondary/60")}
                          title={msg.attachment_name || "File"}>
                          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", isMe ? "bg-white/15 text-white" : "bg-primary/10 text-primary")}><Paperclip className="w-4 h-4" /></div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-[12px] font-bold truncate leading-tight", isMe ? "text-white" : "text-foreground")}>{msg.attachment_name || "File"}</p>
                            <p className={cn("text-[10px] mt-0.5 leading-tight", isMe ? "text-white/60" : "text-muted-foreground")}>Klik untuk buka</p>
                          </div>
                          <div className={cn("p-1.5 rounded-lg opacity-0 group-hover/file:opacity-100 transition-opacity", isMe ? "text-white" : "text-primary")}><Download className="w-3.5 h-3.5" /></div>
                        </a>
                      )}
                    </div>
                  )}
                  {msg.poll && (
                    <div className="mb-2">
                      <PollBubble poll={msg.poll as PollData} currentUserId={currentUser?.id}
                        onUpdate={(next) => setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, poll: next } : m))} />
                    </div>
                  )}
                  <div className={cn("flex items-end justify-end gap-x-2", msg.poll && "mt-1 pr-1")}>
                    {msg.content && !msg.poll && !isSticker && !(msg.attachment_url && msg.content === "🎤 Voice note") && (
                      <p className={cn("flex-1 min-w-[30px] whitespace-pre-wrap leading-snug py-0.5", isMe ? "text-white" : "text-foreground")}>{renderMessageContent(msg.content, isMe)}</p>
                    )}
                    <div className={cn("flex items-center gap-0.5 text-[8px] mb-[1px] shrink-0 font-medium select-none", (msg.poll || isSticker) ? "text-muted-foreground/70" : isMe ? "text-white/70" : "text-muted-foreground/60")}>
                      {(msg.edited_at || msg.is_edited) && (
                        <span className="italic mr-0.5" title={msg.edited_at ? `Diedit ${fmtEdited(msg.edited_at)}` : "Diedit"}>
                          {msg.edited_at ? `Diedit ${fmtEdited(msg.edited_at)} ·` : "Diedit ·"}
                        </span>
                      )}
                      <span>{formatTime(msg.created_at)}</span>
                      {isMe && (
                        <button onClick={() => setReadInfo(msg)} className="ml-0.5 transition-colors">
                          <CheckCheck className={cn("w-3 h-3", (msg.read_by && msg.read_by.length > 0) ? ((msg.poll || isSticker) ? "text-muted-foreground" : "text-white") : ((msg.poll || isSticker) ? "text-muted-foreground/40" : "text-white/40"))} />
                        </button>
                      )}
                    </div>
                  </div>
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className={cn("mt-1.5", isMe ? "flex justify-end" : "")}>
                      <Reactions targetType="message" targetId={msg.id} reactions={msg.reactions as ReactionBucket[]}
                        onChange={(next) => setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, reactions: next } : m))}
                        onDark={isMe && !msg.poll} />
                    </div>
                  )}
                  {/* Hover actions */}
                  <div className={cn("absolute top-0 opacity-0 group-hover/msg:opacity-100 transition-all flex gap-0.5 bg-background border border-border p-0.5 rounded shadow-xl z-10", isMe ? "right-full mr-1" : "left-full ml-1")}>
                    <button onClick={async () => {
                      try {
                        const res = await api.post("/reactions", { target_type: "message", target_id: msg.id, emoji: "👍" });
                        setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, reactions: res.data.reactions } : m));
                      } catch (e) { console.error(e); }
                    }} title="Reaksi cepat 👍" className="p-0.5 hover:bg-secondary rounded text-muted-foreground transition-all">👍</button>
                    <button onClick={() => toggleStar(msg)} title={msg.is_starred ? "Unstar" : "Star"} className={cn("p-0.5 hover:bg-secondary rounded transition-all", msg.is_starred ? "text-yellow-500" : "text-muted-foreground")}><Star className="w-2.5 h-2.5" /></button>
                    <button onClick={() => togglePin(msg)} title={msg.is_pinned ? "Unpin" : "Pin"} className={cn("p-0.5 hover:bg-secondary rounded transition-all", msg.is_pinned ? "text-blue-500" : "text-muted-foreground")}><Pin className="w-2.5 h-2.5" /></button>
                    <button onClick={() => setReplyingTo(msg)} title="Reply" className="p-0.5 hover:bg-secondary rounded text-muted-foreground transition-all"><Reply className="w-2.5 h-2.5" /></button>
                    {isMe && (
                      <>
                        <button onClick={() => { setEditingMessage(msg); setNewMessage(msg.content); }} title="Edit" className="p-0.5 hover:bg-secondary rounded text-muted-foreground transition-all"><Edit2 className="w-2.5 h-2.5" /></button>
                        <button onClick={() => deleteMessage(msg.id)} title="Delete" className="p-0.5 hover:bg-red-500/10 rounded text-red-500 transition-all"><Trash2 className="w-2.5 h-2.5" /></button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {isMe && (
                <div className="w-6 h-6 rounded-full bg-foreground border border-border flex items-center justify-center text-[8px] font-bold text-background ml-1.5 mt-auto mb-0.5 shrink-0 shadow-sm overflow-hidden">
                  {currentUser?.avatar_url ? <img src={currentUser.avatar_url} alt={currentUser.name} className="w-full h-full object-cover" /> : currentUser?.name?.charAt(0) || "?"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="p-4 px-6 bg-background border-t border-border z-20">
        {replyingTo && (
          <div className="mb-3 p-3 bg-secondary/50 border-l-4 border-foreground rounded-2xl flex items-center justify-between animate-in slide-in-from-bottom-2">
            <div className="text-xs truncate">
              <span className="font-bold block mb-1">Membalas {replyingTo.user?.name}</span>
              <span className="text-muted-foreground italic truncate block max-w-md">{replyingTo.content}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-2 hover:bg-secondary rounded-full transition-all"><X className="w-4 h-4" /></button>
          </div>
        )}
        {editingMessage && (
          <div className="mb-3 p-3 bg-foreground/5 border-l-4 border-foreground rounded-2xl flex items-center justify-between">
            <div className="text-xs">
              <span className="font-bold block text-foreground uppercase tracking-wider text-[10px]">Mode Edit Pesan</span>
              <span className="text-muted-foreground italic">Tekan Esc untuk membatalkan</span>
            </div>
            <button onClick={() => { setEditingMessage(null); setNewMessage(""); }} className="p-2 hover:bg-secondary rounded-full transition-all"><X className="w-4 h-4" /></button>
          </div>
        )}
        {attachment && (
          <div className="mb-3 p-3 bg-secondary/50 border border-border rounded-2xl flex items-center justify-between gap-2 animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-foreground/10 rounded-xl flex items-center justify-center shrink-0"><Paperclip className="w-5 h-5 text-foreground" /></div>
              <div className="text-sm min-w-0">
                <span className="font-bold block text-foreground truncate max-w-[200px]">{attachment.name}</span>
                <span className="text-muted-foreground text-xs">{(attachment.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {attachmentIsImage && (
                <button type="button" onClick={() => setSendAsSticker((v) => !v)} title="Kirim sebagai sticker (gambar gede, tanpa bubble)"
                  className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all border",
                    sendAsSticker ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground")}>
                  <Sticker className="w-3.5 h-3.5" /> Sticker
                </button>
              )}
              <button onClick={() => { setAttachment(null); setSendAsSticker(false); }} className="p-2 hover:bg-secondary rounded-full transition-all"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}
        <div className="max-w-[1200px] mx-auto h-5"><TypingIndicator names={typingNames} /></div>
        <form onSubmit={handleSendMessage} className="flex items-end gap-3 max-w-[1200px] mx-auto relative">
          <div className="flex-1 relative">
            {showEmoji && (
              <div className="absolute bottom-full left-0 mb-4 bg-background border border-border p-3 rounded-2xl shadow-2xl grid grid-cols-8 gap-1 z-50 animate-in slide-in-from-bottom-2">
                {EMOJIS.map((e) => (
                  <button key={e} type="button" className="w-8 h-8 flex items-center justify-center hover:bg-secondary rounded-lg text-lg transition-all"
                    onClick={() => { setNewMessage((prev) => prev + e); setShowEmoji(false); }}>{e}</button>
                ))}
              </div>
            )}
            <div className="bg-secondary/50 border border-transparent focus-within:border-border focus-within:bg-background rounded-[32px] flex items-end pr-2 pl-3 py-1.5 transition-all shadow-sm">
              <div className="flex items-center gap-1 mb-[5px]">
                <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="p-2.5 text-muted-foreground hover:text-foreground transition-all"><Smile className="w-5 h-5" /></button>
                <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => { if (e.target.files?.[0]) setAttachment(e.target.files[0]); }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 text-muted-foreground hover:text-foreground transition-all"><Paperclip className="w-5 h-5" /></button>
                <button type="button" onClick={() => setIsPollModalOpen(true)} className="p-2.5 text-muted-foreground hover:text-foreground transition-all" title="Buat polling"><BarChart3 className="w-5 h-5" /></button>
                <VoiceRecorder onSend={sendVoiceNote} />
              </div>
              <div className="relative flex-1">
                {mentionQuery !== null && mentionMatches.length > 0 && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-30 max-h-[240px] overflow-y-auto">
                    <div className="px-3 py-1.5 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wide bg-secondary/30">Tag anggota</div>
                    {mentionMatches.map((m, i) => (
                      <button key={m.user_id} type="button" onMouseDown={(e) => { e.preventDefault(); insertMention(m); }} onMouseEnter={() => setMentionHighlight(i)}
                        className={cn("w-full flex items-center gap-3 px-3 py-2 text-left transition-colors", i === mentionHighlight ? "bg-primary/10" : "hover:bg-secondary/50")}>
                        <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden text-xs font-bold shrink-0">
                          {m.user?.avatar_url ? <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" /> : (m.user?.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{m.user?.name || "User"}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{m.role === "owner" ? "Admin" : m.role}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={newMessage}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewMessage(val);
                    onTypingInput();
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
                    const caret = e.target.selectionStart ?? val.length;
                    const upToCaret = val.slice(0, caret);
                    const atIdx = upToCaret.lastIndexOf("@");
                    if (atIdx === -1) { setMentionQuery(null); return; }
                    const charBeforeAt = atIdx === 0 ? " " : upToCaret[atIdx - 1];
                    const isWordBoundary = /[\s\n]/.test(charBeforeAt);
                    const query = upToCaret.slice(atIdx + 1);
                    if (!isWordBoundary || /\s/.test(query)) { setMentionQuery(null); return; }
                    setMentionQuery(query);
                    setMentionHighlight(0);
                  }}
                  onKeyDown={(e) => {
                    if (mentionQuery !== null && mentionMatches.length > 0) {
                      if (e.key === "ArrowDown") { e.preventDefault(); setMentionHighlight((h) => (h + 1) % mentionMatches.length); return; }
                      if (e.key === "ArrowUp") { e.preventDefault(); setMentionHighlight((h) => (h - 1 + mentionMatches.length) % mentionMatches.length); return; }
                      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionMatches[mentionHighlight]); return; }
                      if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
                    }
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); }
                    if (e.key === "Escape") { setEditingMessage(null); setReplyingTo(null); setNewMessage(""); }
                  }}
                  placeholder={editingMessage ? "Perbaiki pesan..." : "Ketik pesan... (@ untuk tag)"}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 resize-none text-sm px-3 py-3.5 custom-scrollbar min-h-[48px]"
                  style={{ height: "48px" }}
                />
              </div>
            </div>
          </div>
          <button type="submit" disabled={sending || uploadingFile || (!newMessage.trim() && !attachment)}
            className="shrink-0 h-[56px] w-[56px] bg-foreground text-background flex items-center justify-center rounded-full hover:bg-foreground/90 transition-all shadow-xl active:scale-95 disabled:opacity-50 mb-[1px]">
            {sending || uploadingFile ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
          </button>
        </form>
      </div>

      {/* Starred Modal */}
      <Modal isOpen={isStarredModalOpen} onClose={() => setIsStarredModalOpen(false)} title="Pesan Berbintang">
        <div className="max-h-[60vh] overflow-y-auto space-y-3 p-1">
          {messages.filter((m) => m.is_starred).length > 0 ? (
            messages.filter((m) => m.is_starred).map((msg) => (
              <div key={msg.id} className="p-4 bg-secondary/20 rounded-2xl border border-border hover:border-primary/30 transition-all cursor-pointer"
                onClick={() => {
                  const el = document.getElementById(`msg-${msg.id}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  el?.classList.add("ring-2", "ring-yellow-500/50");
                  setTimeout(() => el?.classList.remove("ring-2", "ring-yellow-500/50"), 2000);
                  setIsStarredModalOpen(false);
                }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center text-[8px] font-bold">{msg.user?.name?.charAt(0)}</div>
                    <span className="text-[10px] font-bold">{msg.user?.name}</span>
                  </div>
                  <span className="text-[9px] text-muted-foreground">{formatDate(msg.created_at)}</span>
                </div>
                <p className="text-xs leading-relaxed text-foreground/80 line-clamp-3">{msg.content || (msg.attachment_url ? "📎 Lampiran File" : "")}</p>
                <div className="mt-3 flex justify-end">
                  <button onClick={(e) => { e.stopPropagation(); toggleStar(msg); }} className="p-1.5 hover:bg-background rounded-full text-yellow-500"><Star className="w-4 h-4 fill-current" /></button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-muted-foreground"><Star className="w-12 h-12 mx-auto mb-4 opacity-10" /><p className="text-sm italic">Belum ada pesan berbintang.</p></div>
          )}
        </div>
      </Modal>

      {/* Media Modal */}
      <Modal isOpen={isMediaModalOpen} onClose={() => setIsMediaModalOpen(false)} title="Media & Lampiran">
        <div className="flex flex-col h-[70vh]">
          <div className="flex border-b border-border mb-4">
            {(["media", "files", "links"] as const).map((t) => (
              <button key={t} onClick={() => setMediaTab(t)}
                className={cn("flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2", mediaTab === t ? "border-foreground text-foreground" : "border-transparent text-muted-foreground")}>
                {t === "media" ? "Gambar" : t === "files" ? "File" : "Tautan"}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
            {mediaTab === "media" && (
              <div className="grid grid-cols-3 gap-2">
                {messages.filter((m) => m.attachment_url && /\.(jpg|jpeg|png|gif|webp)$/i.test(m.attachment_url)).map((msg) => (
                  <div key={msg.id} className="aspect-square rounded-xl overflow-hidden border border-border group relative cursor-pointer" onClick={() => window.open(msg.attachment_url, "_blank")}>
                    <img src={msg.attachment_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-all" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"><ExternalLink className="w-5 h-5 text-white" /></div>
                  </div>
                ))}
                {messages.filter((m) => m.attachment_url && /\.(jpg|jpeg|png|gif|webp)$/i.test(m.attachment_url)).length === 0 && (
                  <div className="col-span-3 py-12 text-center text-muted-foreground italic text-xs">Belum ada gambar dikirim.</div>
                )}
              </div>
            )}
            {mediaTab === "files" && (
              <div className="space-y-2">
                {messages.filter((m) => m.attachment_url && !/\.(jpg|jpeg|png|gif|webp)$/i.test(m.attachment_url)).map((msg) => (
                  <div key={msg.id} className="p-3 bg-secondary/20 border border-border rounded-xl flex items-center justify-between hover:bg-secondary/40 transition-all cursor-pointer" onClick={() => window.open(msg.attachment_url, "_blank")}>
                    <div className="flex items-center gap-3 truncate">
                      <div className="p-2 bg-background rounded-lg border border-border"><FileText className="w-4 h-4" /></div>
                      <div className="truncate"><div className="text-[11px] font-bold truncate">{msg.attachment_name}</div><div className="text-[9px] text-muted-foreground">{formatDate(msg.created_at)}</div></div>
                    </div>
                    <button className="p-2 hover:bg-background rounded-lg transition-all"><ExternalLink className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {messages.filter((m) => m.attachment_url && !/\.(jpg|jpeg|png|gif|webp)$/i.test(m.attachment_url)).length === 0 && (
                  <div className="py-12 text-center text-muted-foreground italic text-xs">Belum ada file dikirim.</div>
                )}
              </div>
            )}
            {mediaTab === "links" && (
              <div className="space-y-2">
                {messages.filter((m) => m.content && /https?:\/\/[^\s]+/.test(m.content)).map((msg) => {
                  const links = msg.content.match(/https?:\/\/[^\s]+/g) || [];
                  return links.map((link: string, idx: number) => (
                    <div key={`${msg.id}-${idx}`} className="p-3 bg-secondary/20 border border-border rounded-xl flex items-center justify-between hover:bg-secondary/40 transition-all cursor-pointer" onClick={() => window.open(link, "_blank")}>
                      <div className="flex items-center gap-3 truncate">
                        <div className="p-2 bg-background rounded-lg border border-border text-blue-500"><Link2 className="w-4 h-4" /></div>
                        <div className="truncate"><div className="text-[11px] font-bold text-blue-500 truncate">{link}</div><div className="text-[9px] text-muted-foreground">Dikirim oleh {msg.user?.name}</div></div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  ));
                })}
                {messages.filter((m) => m.content && /https?:\/\/[^\s]+/.test(m.content)).length === 0 && (
                  <div className="py-12 text-center text-muted-foreground italic text-xs">Belum ada tautan dikirim.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Read info modal */}
      <Modal isOpen={!!readInfo} onClose={() => setReadInfo(null)} title="Info Pesan">
        <div className="space-y-4 p-2">
          <div className="p-4 bg-secondary/30 border border-border rounded-2xl text-sm italic">"{readInfo?.content}"</div>
          <div>
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Telah Dilihat Oleh</h4>
            <div className="space-y-2">
              {readInfo?.read_by && readInfo.read_by.length > 0 ? (
                readInfo.read_by.map((reader: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-background border border-border rounded-xl">
                    <div className="font-medium text-sm">{reader.name}</div>
                    <div className="text-xs text-muted-foreground">{formatTime(reader.read_at)}</div>
                  </div>
                ))
              ) : (
                <div className="text-center p-4 text-muted-foreground text-sm">Belum ada yang melihat</div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Members modal */}
      <Modal isOpen={isMembersModalOpen} onClose={() => setIsMembersModalOpen(false)} title={`Anggota Workspace (${members.length})`}>
        <div className="max-h-[60vh] overflow-y-auto space-y-1.5 p-1">
          {members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Belum ada anggota</div>
          ) : (
            members.map((m) => (
              <button key={m.user_id} onClick={() => { setProfileMember(m); setIsMembersModalOpen(false); }}
                className="w-full flex items-center gap-3 p-3 rounded-2xl border border-border hover:border-primary/40 hover:bg-secondary/40 transition-all text-left">
                <div className="w-11 h-11 rounded-2xl bg-secondary border border-border flex items-center justify-center overflow-hidden font-bold text-sm shrink-0">
                  {m.user?.avatar_url ? <img src={m.user.avatar_url} alt={m.user.name} className="w-full h-full object-cover" /> : (m.user?.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0"><p className="text-sm font-bold truncate">{m.user?.name || "User"}</p><p className="text-[10px] text-muted-foreground truncate">{m.user?.email}</p></div>
                <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", m.role === "manager" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{m.role === "owner" ? "Admin" : m.role}</span>
              </button>
            ))
          )}
        </div>
      </Modal>

      {/* Profile modal */}
      <Modal isOpen={!!profileMember} onClose={() => setProfileMember(null)} title="Profil Anggota">
        {profileMember && (
          <div className="p-2 flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-3xl bg-secondary border border-border flex items-center justify-center overflow-hidden font-extrabold text-2xl mb-4">
              {profileMember.user?.avatar_url ? <img src={profileMember.user.avatar_url} alt={profileMember.user.name} className="w-full h-full object-cover" /> : (profileMember.user?.name || "?").charAt(0).toUpperCase()}
            </div>
            <h3 className="text-lg font-extrabold mb-0.5">{profileMember.user?.name || "User"}</h3>
            {profileMember.user?.email && <a href={`mailto:${profileMember.user.email}`} className="text-xs text-primary hover:underline mb-3">{profileMember.user.email}</a>}
            <span className={cn("text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full", profileMember.role === "manager" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{profileMember.role === "owner" ? "Admin" : profileMember.role}</span>
            <div className="w-full mt-5 flex flex-col gap-2">
              {profileMember.user_id !== currentUser?.id && (
                <button onClick={() => { router.push(`/org/${orgId}/dm/${profileMember.user_id}`); setProfileMember(null); }}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-2xl text-xs font-bold hover:opacity-90 transition-opacity">Kirim DM</button>
              )}
              <button onClick={() => setProfileMember(null)} className="w-full py-2.5 bg-secondary rounded-2xl text-xs font-bold hover:bg-secondary/70 transition-colors">Tutup</button>
            </div>
          </div>
        )}
      </Modal>

      <CreatePollModal isOpen={isPollModalOpen} onClose={() => setIsPollModalOpen(false)} channelId={channelId || undefined} />
    </div>
  );
}
