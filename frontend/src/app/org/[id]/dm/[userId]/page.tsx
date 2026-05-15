"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Send, Loader2, User as UserIcon, ShieldCheck, Paperclip,
  Trash2, Edit2, X, Check, CheckCheck, Smile, Wifi, WifiOff,
  FileText, File, Image, Video, Music, Download, Eye, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import FileViewerModal from "@/components/ui/FileViewerModal";

type WsStatus = "connecting" | "connected" | "disconnected";

const EMOJI_GROUPS = [
  { name: "Sering", emojis: ["👍", "❤️", "😂", "🔥", "😊", "🙏", "✅", "🎉", "🚀", "👏"] },
  { name: "Wajah", emojis: ["😊", "😂", "🤣", "🥰", "😍", "😘", "😅", "😁", "🤔", "😢", "😭", "😤", "😡", "🤗", "🙂", "😉", "😎", "🥺", "😴"] },
  { name: "Tangan", emojis: ["👍", "👎", "👏", "🙌", "🤝", "✌️", "🤞", "👊", "✊", "🙏", "💪", "🖐️", "👋", "🤙"] },
  { name: "Lambang", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "🔥", "⭐", "✨", "💥", "🌈", "🎯", "🎉", "🏆", "✅", "❌", "💀"] },
];

const QUICK_REACT = ["👍", "❤️", "😂", "🔥", "😊", "🙏", "🎉", "🚀", "👏", "😢"];

const getFileInfo = (name: string) => {
  const ext = (name || "").toLowerCase().split(".").pop() || "";
  return {
    isImage: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext),
    isVideo: ["mp4", "webm", "mov", "avi", "mkv", "wmv"].includes(ext),
    isAudio: ["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext),
    isPdf: ext === "pdf"
  };
};

const fmtSize = (b?: number) => { if (!b) return ""; if (b < 1024) return `${b}B`; if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`; return `${(b / 1048576).toFixed(1)}MB`; };

export default function DMChatPage() {
  const params = useParams();
  const orgId = params?.id as string;
  const targetId = params?.userId as string;
  const { user: cu } = useAuthStore();
  const uid = cu?.id;

  const [channel, setChannel] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [editMsg, setEditMsg] = useState<any>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [drag, setDrag] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
  const [viewFile, setViewFile] = useState<any>(null);
  const [upProgress, setUpProgress] = useState<number | null>(null);
  const [upName, setUpName] = useState("");
  const [reactMsg, setReactMsg] = useState<string | null>(null);

  const sc = useRef<HTMLDivElement>(null);
  const ws = useRef<WebSocket | null>(null);
  const fi = useRef<HTMLInputElement>(null);
  const rt = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ci = useRef<string | null>(null);
  const pi = useRef<ReturnType<typeof setInterval> | null>(null);
  const init = useRef(false);
  const mrLock = useRef(false);

  // ─── WS connect ────────────────────────────────────────────────────────
  const connectWs = useCallback((cid: string) => {
    if (ws.current && ws.current.readyState !== WebSocket.CLOSED) { ws.current.onclose = null; ws.current.close(1000); }
    if (pi.current) clearInterval(pi.current);

    const tok = localStorage.getItem("access_token");
    if (!tok) return;

    const base = (process.env.NEXT_PUBLIC_API_URL || "https://dothings.id/api").replace(/^http/, "ws").replace(/\/api$/, "");
    const url = `${base}/api/dm/ws/${cid}?token=${encodeURIComponent(tok)}`;

    setWsStatus("connecting");
    const w = new WebSocket(url);
    ws.current = w;
    let pt: ReturnType<typeof setTimeout>;

    w.onopen = () => {
      setWsStatus("connected");
      pi.current = setInterval(() => {
        if (w.readyState === WebSocket.OPEN) { w.send("ping"); pt = setTimeout(() => w.close(), 5000); }
      }, 25000);
    };

    w.onmessage = (e) => {
      if (e.data === "pong") { clearTimeout(pt); return; }
      try {
        const d = JSON.parse(e.data);
        if (d.type === "dm_received") {
          setMessages(prev => {
            const i = prev.findIndex(m => d.message.temp_id && m.id === d.message.temp_id);
            if (i !== -1) { const n = [...prev]; n[i] = { ...d.message, reactions: d.message.reactions || {} }; return n; }
            if (prev.find(m => m.id === d.message.id)) return prev;
            return [...prev, { ...d.message, reactions: d.message.reactions || {} }];
          });
        } else if (d.type === "dm_edited") {
          setMessages(prev => prev.map(m => m.id === d.message.id ? { ...m, content: d.message.content } : m));
        } else if (d.type === "dm_deleted") {
          setMessages(prev => prev.filter(m => m.id !== d.message_id));
        } else if (d.type === "dm_reacted") {
          setMessages(prev => prev.map(m => m.id === d.message_id ? { ...m, reactions: d.reactions || {} } : m));
        } else if (d.type === "dm_read") {
          setMessages(prev => prev.map(m => d.message_ids?.includes(m.id) ? { ...m, is_read: true, read_at: d.read_at, is_delivered: true } : m));
        }
      } catch { }
    };

    w.onclose = (ev) => {
      setWsStatus("disconnected");
      if (pi.current) clearInterval(pi.current);
      if (ev.code !== 1000 && ev.code !== 4001) {
        rt.current = setTimeout(() => { if (ci.current) connectWs(ci.current); }, 3000);
      }
    };
    w.onerror = () => setWsStatus("disconnected");
  }, []);

  // ─── Mark read ──────────────────────────────────────────────────────────
  const markRead = useCallback(async () => {
    if (!ci.current || mrLock.current) return;
    mrLock.current = true;
    try {
      const tok = localStorage.getItem("access_token");
      await api.post(`/dm/channels/${ci.current}/read`, {}, { headers: { Authorization: `Bearer ${tok}` } });
    } catch { } finally {
      setTimeout(() => { mrLock.current = false; }, 3000);
    }
  }, []);

  // ─── Init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!targetId || init.current) return;
    init.current = true;
    let mounted = true;

    (async () => {
      try {
        const r = await api.post("/dm/channels", { org_id: orgId === "undefined" ? null : orgId, other_user_id: targetId });
        if (!mounted) return;
        setChannel(r.data);
        ci.current = r.data.id;
        connectWs(r.data.id);
        const mr = await api.get(`/dm/channels/${r.data.id}/messages`);
        if (!mounted) return;
        setMessages((mr.data || []).map((m: any) => ({ ...m, reactions: m.reactions || {} })));
        setTimeout(() => { if (mounted) markRead(); }, 2000);
      } catch (e) { console.error("initDM fail", e); init.current = false; }
      finally { if (mounted) setLoading(false); }
    })();

    return () => { mounted = false; ci.current = null; if (rt.current) clearTimeout(rt.current); if (pi.current) clearInterval(pi.current); if (ws.current) { ws.current.onclose = null; ws.current.close(1000, "unmount"); } };
  }, [orgId, targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Scroll ─────────────────────────────────────────────────────────────
  useEffect(() => { if (sc.current) sc.current.scrollTop = sc.current.scrollHeight; }, [messages]);

  // ─── Send ───────────────────────────────────────────────────────────────
  const sendMsg = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() || !channel) return;
    if (editMsg) { updateMsg(); return; }

    setSending(true);
    const tid = `opt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const opt = {
      id: tid, content: text, user_id: uid, dm_channel_id: channel.id, created_at: new Date().toISOString(),
      attachment_url: null, attachment_name: null, is_read: false, is_delivered: false, read_at: null, delivered_at: null, reactions: {},
      user: { id: uid, name: cu?.name, avatar_url: cu?.avatar_url }, _optimistic: true
    };
    setMessages(p => [...p, opt]); setText("");

    try {
      const r = await api.post(`/dm/channels/${channel.id}/messages`, { content: opt.content, temp_id: tid });
      setTimeout(() => { setMessages(p => p.map(m => m.id === tid ? { ...r.data, reactions: r.data.reactions || {} } : m)); }, 3000);
    } catch (err) {
      console.error("send fail", err); setMessages(p => p.filter(m => m.id !== tid)); setText(opt.content);
    } finally { setSending(false); }
  };

  const updateMsg = async () => {
    try {
      const r = await api.put(`/dm/messages/${editMsg.id}`, { content: text });
      setMessages(p => p.map(m => m.id === editMsg.id ? { ...m, content: r.data.content } : m));
      setEditMsg(null); setText("");
    } catch (err) { console.error("update fail", err); }
  };

  const delMsg = async (id: string) => {
    if (!confirm("Hapus pesan ini?")) return;
    setMessages(p => p.filter(m => m.id !== id));
    try { await api.delete(`/dm/messages/${id}`); } catch { }
  };

  // ─── React ──────────────────────────────────────────────────────────────
  const doReact = async (mid: string, emoji: string) => {
    setReactMsg(null);
    try {
      const r = await api.post(`/dm/messages/${mid}/react`, { emoji });
      setMessages(p => p.map(m => m.id === mid ? { ...m, reactions: r.data.reactions || {} } : m));
    } catch { }
  };

  const getRCounts = (rx: Record<string, string>) => {
    const c: Record<string, { count: number; users: string[] }> = {};
    if (!rx) return c;
    Object.entries(rx).forEach(([u, e]) => { if (!c[e]) c[e] = { count: 0, users: [] }; c[e].count++; if (u === uid) c[e].users.push("me"); });
    return c;
  };

  // ─── Upload ─────────────────────────────────────────────────────────────
  const upload = async (file: File) => {
    if (!channel) return;
    const fid = `opt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const fi2 = getFileInfo(file.name);
    const ul = URL.createObjectURL(file);
    const opt = {
      id: fid, content: file.name, user_id: uid, dm_channel_id: channel.id, created_at: new Date().toISOString(),
      attachment_url: ul, attachment_name: file.name, file_size: file.size,
      is_image: fi2.isImage, is_video: fi2.isVideo, is_audio: fi2.isAudio, is_pdf: fi2.isPdf,
      is_read: false, is_delivered: false, reactions: {},
      user: { id: uid, name: cu?.name, avatar_url: cu?.avatar_url },
      _optimistic: true, _uploading: true, _upload_progress: 0
    };
    setMessages(p => [...p, opt]); setUpName(file.name); setUpProgress(0);

    const fd = new FormData();
    fd.append("file", file);
    try {
      const pi2 = setInterval(() => {
        setUpProgress(p => { const n = Math.min((p || 0) + Math.random() * 15 + 5, 90); setMessages(ms => ms.map(m => m.id === fid ? { ...m, _upload_progress: n } : m)); return n; });
      }, 300);
      const r = await api.post(`/dm/channels/${channel.id}/attachments`, fd, { params: { temp_id: fid }, headers: { "Content-Type": "multipart/form-data" } });
      clearInterval(pi2); setUpProgress(100);
      setMessages(ms => ms.map(m => m.id === fid ? { ...m, _upload_progress: 100 } : m));
      const rd = { ...r.data, reactions: r.data.reactions || {}, id: r.data.id || r.data.message?.id, user: { id: uid, name: cu?.name, avatar_url: cu?.avatar_url } };
      setTimeout(() => { setMessages(p => p.map(m => m.id === fid ? rd : m)); URL.revokeObjectURL(ul); }, 500);
      setTimeout(() => { setMessages(p => { if (p.find(m => m.id === fid && m._optimistic)) return p.map(m => m.id === fid ? rd : m); return p; }); }, 5000);
    } catch (err) { console.error("upload fail", err); setMessages(p => p.filter(m => m.id !== fid)); URL.revokeObjectURL(ul); }
    finally { setUpProgress(null); setUpName(""); }
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) upload(f); if (fi.current) fi.current.value = ""; };

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) return <div className="flex flex-col items-center justify-center h-[calc(100vh-160px)]"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  const otherUser = channel?.user1_id === uid ? channel?.user2 : channel?.user1;

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border bg-secondary/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary relative">
            <UserIcon className="w-5 h-5" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" />
          </div>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-1">{otherUser?.name || "Chat Pribadi"} <ShieldCheck className="w-3 h-3 text-emerald-500" /></h2>
            <p className="text-[10px] text-muted-foreground">Aktif sekarang</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {wsStatus === "connected" ? <><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">Live</span></>
            : wsStatus === "connecting" ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Connecting...</span></>
              : <><WifiOff className="w-3 h-3 text-destructive" /><span className="text-destructive">Offline</span></>}
        </div>
      </div>

      {/* Messages */}
      <div ref={sc}
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f && channel) upload(f); }}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-secondary/[0.02] relative"
        onClick={() => setReactMsg(null)}>

        {drag && <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] z-50 flex items-center justify-center border-2 border-dashed border-primary m-3 rounded-3xl">
          <div className="bg-background px-8 py-6 rounded-2xl shadow-xl flex flex-col items-center gap-3">
            <Paperclip className="w-8 h-8 text-primary animate-bounce" />
            <span className="font-bold text-sm">Lepaskan untuk mengirim file</span>
            <span className="text-[10px] text-muted-foreground">ke {otherUser?.name}</span>
          </div>
        </div>}

        {messages.length === 0 && <div className="flex flex-col items-center justify-center h-full text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mb-4"><Send className="w-6 h-6 text-muted-foreground" /></div>
          <p className="text-sm font-bold text-muted-foreground">Belum ada pesan</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">Kirim pesan atau file untuk memulai percakapan</p>
        </div>}

        {messages.map((msg, idx) => {
          const me = msg.user_id === uid, opt = msg._optimistic === true, up = msg._uploading === true, pct = msg._upload_progress || 0;
          const prev = idx > 0 ? messages[idx - 1] : null, same = prev && prev.user_id === msg.user_id;
          const av = !me && !same;
          const rx = msg.reactions || {}, rc = getRCounts(rx), hrx = Object.keys(rc).length > 0, myEmoji = rx[uid || ""] || null;

          return (
            <div key={msg.id} className={cn("flex group relative", me ? "justify-end" : "justify-start")}>
              <div className={cn("flex gap-1.5 max-w-[80%] md:max-w-[65%]", me ? "flex-row-reverse" : "flex-row")}>
                <div className={cn("w-8 shrink-0", !av && "invisible")}>
                  {av && <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{(otherUser?.name || "?").charAt(0).toUpperCase()}</div>}
                </div>
                <div className={cn("flex flex-col", me ? "items-end" : "items-start")}>
                  {av && !me && <span className="text-[10px] text-muted-foreground font-medium mb-0.5 ml-1">{otherUser?.name}</span>}

                  <div className={cn("relative px-3.5 py-2 text-sm shadow-sm transition-all",
                    me ? "bg-primary text-primary-foreground rounded-[18px] rounded-br-[4px]" : "bg-card border border-border rounded-[18px] rounded-bl-[4px] text-foreground",
                    opt && "opacity-70", up && "min-w-[160px]")}>

                    {msg.attachment_url ? (
                      <div className="space-y-1.5">
                        {(msg.is_image || getFileInfo(msg.attachment_name || "").isImage) && !up &&
                          <div className="relative group/img cursor-pointer rounded-lg overflow-hidden max-w-[240px]" onClick={() => setViewFile({ id: msg.id, name: msg.attachment_name || "file", url: msg.attachment_url, ...getFileInfo(msg.attachment_name || ""), size: msg.file_size })}>
                            <img src={msg.attachment_url} alt={msg.attachment_name || "Gambar"} className="w-full rounded-lg max-h-[200px] object-cover" loading="lazy" />
                            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-all flex items-center justify-center">
                              <div className="opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/50 text-white p-1.5 rounded-full"><Eye className="w-4 h-4" /></div>
                            </div>
                          </div>}
                        {(msg.is_video || getFileInfo(msg.attachment_name || "").isVideo) &&
                          <div className="relative rounded-lg overflow-hidden max-w-[240px]"><video src={msg.attachment_url} className="w-full rounded-lg max-h-[200px]" controls preload="metadata" /></div>}
                        {!msg.is_image && !getFileInfo(msg.attachment_name || "").isImage && !msg.is_video && !getFileInfo(msg.attachment_name || "").isVideo &&
                          <div className={cn("flex items-center gap-2 p-2 rounded-xl", me ? "bg-primary-foreground/10" : "bg-secondary/50")}>
                            <div className={cn("p-1.5 rounded-lg shrink-0", me ? "bg-primary-foreground/15" : "bg-background")}>
                              {(() => { const i = getFileInfo(msg.attachment_name || ""); if (i.isImage) return <Image className="w-4 h-4" />; if (i.isVideo) return <Video className="w-4 h-4" />; if (i.isAudio) return <Music className="w-4 h-4" />; if (i.isPdf) return <FileText className="w-4 h-4" />; return <File className="w-4 h-4" />; })()}
                            </div>
                            <div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{msg.attachment_name || "File"}</p><p className={cn("text-[9px]", me ? "text-primary-foreground/60" : "text-muted-foreground")}>{fmtSize(msg.file_size)}</p></div>
                            <button onClick={() => setViewFile({ id: msg.id, name: msg.attachment_name || "file", url: msg.attachment_url, ...getFileInfo(msg.attachment_name || ""), size: msg.file_size })}
                              className={cn("p-1.5 rounded-lg shrink-0 transition-colors", me ? "hover:bg-primary-foreground/15" : "hover:bg-secondary")} title="Lihat"><Eye className="w-3.5 h-3.5" /></button>
                            <a href={msg.attachment_url} download={msg.attachment_name || "file"}
                              className={cn("p-1.5 rounded-lg shrink-0 transition-colors", me ? "hover:bg-primary-foreground/15" : "hover:bg-secondary")} title="Unduh"><Download className="w-3.5 h-3.5" /></a>
                          </div>}
                        {(msg.is_image || getFileInfo(msg.attachment_name || "").isImage) && !up && <p className={cn("text-[9px] opacity-60 text-center", me ? "text-primary-foreground" : "text-foreground")}>Ketuk untuk melihat</p>}
                      </div>
                    ) : <div className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</div>}

                    {up && <div className="mt-2 space-y-1">
                      <div className={cn("flex items-center gap-2", me ? "text-primary-foreground/70" : "text-muted-foreground")}><Clock className="w-3 h-3 animate-pulse" /><span className="text-[10px]">Mengirim file...</span></div>
                      <div className={cn("h-1.5 rounded-full overflow-hidden", me ? "bg-primary-foreground/20" : "bg-secondary")}>
                        <div className={cn("h-full rounded-full transition-all duration-300 ease-out", me ? "bg-primary-foreground/60" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                      <p className={cn("text-[9px] text-right", me ? "text-primary-foreground/50" : "text-muted-foreground")}>{Math.round(pct)}%</p>
                    </div>}

                    <div className={cn("flex items-center gap-0.5 mt-1", me ? "justify-end" : "justify-start")}>
                      {opt && !up ? <span className={cn("text-[9px] flex items-center gap-1", me ? "text-primary-foreground/60" : "text-muted-foreground")}><Loader2 className="w-2.5 h-2.5 animate-spin" /> Mengirim...</span>
                        : up ? null
                          : <span className={cn("text-[9px] flex items-center gap-0.5", me ? "text-primary-foreground/60" : "text-muted-foreground")}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {me && (msg.is_read ? <CheckCheck className="w-3 h-3 text-blue-400" /> : msg.is_delivered ? <CheckCheck className="w-3 h-3 text-muted-foreground/60" /> : <Check className="w-3 h-3" />)}
                          </span>}
                    </div>

                    {me && !opt && !up && <div className={cn("absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1", me ? "-left-10" : "-right-10")}>
                      <button onClick={() => { setEditMsg(msg); setText(msg.content); }} className="p-1 hover:bg-secondary rounded-lg text-muted-foreground bg-background/80 backdrop-blur-sm shadow-sm"><Edit2 className="w-3 h-3" /></button>
                      <button onClick={() => delMsg(msg.id)} className="p-1 hover:bg-destructive/10 rounded-lg text-destructive bg-background/80 backdrop-blur-sm shadow-sm"><Trash2 className="w-3 h-3" /></button>
                    </div>}
                  </div>

                  {hrx && !up && <div className={cn("flex gap-1 mt-0.5", me ? "justify-end" : "justify-start")}>
                    {Object.entries(rc).map(([e, i]) => (
                      <button key={e} onClick={() => doReact(msg.id, e)}
                        className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-all hover:scale-110",
                          i.users.includes("me") ? "bg-primary/10 border-primary/30 text-foreground" : "bg-secondary/30 border-border/50 text-muted-foreground")}>
                        <span className="text-sm">{e}</span><span className="text-[10px] font-medium">{i.count}</span>
                      </button>
                    ))}
                  </div>}

                  {!opt && !up && <div className={cn("opacity-0 group-hover:opacity-100 transition-opacity mt-0.5", me ? "text-right" : "text-left")}>
                    <button onClick={(e) => { e.stopPropagation(); setReactMsg(reactMsg === msg.id ? null : msg.id); }} className="p-0.5 rounded-full hover:bg-secondary transition-colors text-muted-foreground" title="Reaksi">
                      <Smile className="w-3.5 h-3.5" /></button>
                  </div>}

                  {reactMsg === msg.id && <div className={cn("mt-1 p-1.5 bg-background border border-border rounded-xl shadow-xl flex gap-1 flex-wrap max-w-[240px] z-10", me ? "justify-end" : "justify-start")}
                    onClick={e => e.stopPropagation()}>
                    {QUICK_REACT.map(e => (
                      <button key={e} onClick={() => doReact(msg.id, e)}
                        className={cn("text-lg hover:scale-125 transition-transform p-0.5 rounded", myEmoji === e ? "bg-primary/10 scale-110" : "")}>{e}</button>
                    ))}
                  </div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="p-3.5 border-t border-border bg-card shrink-0">
        {editMsg && <div className="mb-2.5 p-2.5 bg-secondary/50 rounded-xl flex items-center justify-between text-xs border border-border">
          <span className="truncate flex items-center gap-1.5 text-muted-foreground"><Edit2 className="w-3 h-3 shrink-0" /><span className="truncate">Mengedit pesan...</span></span>
          <button onClick={() => { setEditMsg(null); setText(""); }} className="p-1 hover:bg-secondary rounded-lg shrink-0"><X className="w-4 h-4" /></button>
        </div>}

        {showEmoji && <div className="mb-2.5 bg-background border border-border rounded-2xl shadow-xl overflow-hidden">
          <div className="flex gap-1 p-1.5 border-b border-border bg-secondary/20 overflow-x-auto">
            {EMOJI_GROUPS.map((g, i) => (
              <button key={g.name} onClick={() => setEmojiTab(i)}
                className={cn("px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors shrink-0", emojiTab === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}>{g.name}</button>
            ))}
          </div>
          <div className="p-2 flex flex-wrap gap-1 max-h-[150px] overflow-y-auto">
            {EMOJI_GROUPS[emojiTab].emojis.map(e => (
              <button key={e} onClick={() => setText(p => p + e)} className="text-xl hover:scale-125 transition-transform p-1 hover:bg-secondary rounded-lg">{e}</button>
            ))}
          </div>
        </div>}

        {upProgress !== null && <div className="mb-2.5 p-2.5 bg-secondary/30 rounded-xl border border-border flex items-center gap-2.5 text-xs">
          <div className="p-1.5 rounded-lg bg-primary/10"><Paperclip className="w-4 h-4 text-primary animate-pulse" /></div>
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium">{upName}</p>
            <div className="h-1 bg-secondary rounded-full mt-1 overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-300 ease-out" style={{ width: `${upProgress}%` }} /></div>
          </div>
          <span className="text-muted-foreground font-mono text-[10px] shrink-0">{Math.round(upProgress)}%</span>
        </div>}

        <form onSubmit={sendMsg} className="flex gap-2 items-end">
          <input type="file" ref={fi} onChange={onFilePick} className="hidden" accept="*/*" />
          <button type="button" onClick={() => fi.current?.click()} disabled={upProgress !== null}
            className="p-3 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors disabled:opacity-40"><Paperclip className="w-5 h-5 text-muted-foreground" /></button>
          <button type="button" onClick={() => setShowEmoji(!showEmoji)}
            className="p-3 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors"><Smile className="w-5 h-5 text-muted-foreground" /></button>
          <div className="flex-1 relative">
            <textarea value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
              placeholder="Tulis pesan..." rows={1}
              className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all text-sm resize-none" />
          </div>
          <button type="submit" disabled={!text.trim() || sending || upProgress !== null}
            className="p-3 bg-primary text-primary-foreground rounded-xl hover:shadow-lg transition-all disabled:opacity-50">
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>

      {viewFile && <FileViewerModal isOpen={!!viewFile} onClose={() => setViewFile(null)}
        fileUrl={viewFile.url} fileName={viewFile.name}
        isImage={viewFile.isImage} isVideo={viewFile.isVideo} isAudio={viewFile.isAudio} isPdf={viewFile.isPdf} />}
    </div>
  );
}