"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useNotificationsStore } from "@/store/useNotificationsStore";
import { usePresenceStore } from "@/store/usePresenceStore";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Send, Loader2, User as UserIcon, ShieldCheck, Paperclip,
  Edit2, X, Check, CheckCheck, Smile, Wifi, WifiOff, Reply, CornerDownRight,
  FileText, File, Image, Video, Music, Download, Eye, Clock, Sticker
} from "lucide-react";
import { cn } from "@/lib/utils";
import StickerPicker from "@/components/chat/StickerPicker";
import FileViewerModal from "@/components/ui/FileViewerModal";
import VoiceRecorder from "@/components/chat/VoiceRecorder";
import VoiceNotePlayer from "@/components/chat/VoiceNotePlayer";
import TypingIndicator from "@/components/chat/TypingIndicator";
import EditHistoryBadge from "@/components/chat/EditHistoryBadge";

const GI = (n: string) => { const e = (n || "").toLowerCase().split(".").pop() || ""; return { isImage: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(e), isVideo: ["mp4", "mov", "avi", "mkv", "wmv"].includes(e), isAudio: ["mp3", "wav", "ogg", "aac", "flac", "m4a", "webm"].includes(e) || (n || "").includes("voice-note"), isPdf: e === "pdf" } };

// Format an edited_at timestamp into "DD/MM HH.MM" Indonesian style.
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

// Render plain text with URLs turned into clickable <a> tags. Matches
// http(s)://… and bare www.… domains. Splits the text in place so we
// don't need dangerouslySetInnerHTML.
const URL_RE = /(\b(?:https?:\/\/|www\.)[^\s<>"')]+)/gi;
const Linkify = ({ text, me }: { text: string; me: boolean }) => {
  if (!text) return null;
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const href = part.startsWith("http") ? part : `https://${part}`;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "underline underline-offset-2 break-all hover:opacity-80",
                me ? "text-white font-semibold" : "text-blue-600",
              )}
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};
const FS = (b?: number) => { if (!b) return ""; if (b < 1024) return `${b}B`; if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`; return `${(b / 1048576).toFixed(1)}MB` };
const EI: [string, string[]][] = [["Sering", ["👍", "❤️", "😂", "🔥", "😊", "🙏", "✅", "🎉", "🚀", "👏"]], ["Wajah", ["😊", "😂", "🤣", "🥰", "😍", "😘", "😅", "😁", "🤔", "😢", "😭", "😤", "😡", "🤗", "🙂", "😉", "😎", "🥺", "😴"]], ["Tangan", ["👍", "👎", "👏", "🙌", "🤝", "✌️", "🤞", "👊", "✊", "🙏", "💪", "🖐️", "👋", "🤙"]], ["Lambang", ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "🔥", "⭐", "✨", "💥", "🌈", "🎯", "🎉", "🏆", "✅", "❌", "💀"]]];
const QR = ["👍", "❤️", "😂", "🔥", "😊", "🙏", "🎉", "🚀", "👏", "😢"];

export default function DMChatPage() {
  const p = useParams();
  const oid = p?.id as string, tid = p?.userId as string;
  const { user: cu } = useAuthStore(); const uid = cu?.id;
  const markDMsFromSenderRead = useNotificationsStore((s) => s.markDMsFromSenderRead);
  // Live presence — subscribe to set so dot re-renders on presence_update.
  const isOnline = usePresenceStore((s) => s.isOnline);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _online = usePresenceStore((s) => s.online);

  // Clear unread DM badges (bell + floating chat + sidebar) for this sender
  // whenever the conversation is open, however it was reached.
  useEffect(() => {
    if (tid) markDMsFromSenderRead(tid);
  }, [tid, markDMsFromSenderRead]);

  const [ch, setCh] = useState<any>(null);
  const [ms, setMs] = useState<any[]>([]);
  const [ld, setLd] = useState(true);
  const [tx, setTx] = useState("");
  const [se, setSe] = useState(false);
  const [em, setEm] = useState<any>(null);
  const [se2, setSe2] = useState(false);
  const [et, setEt] = useState(0);
  const [dr, setDr] = useState(false);
  const [wsS, setWsS] = useState<string>("disconnected");
  const [vf, setVf] = useState<any>(null);
  const [up, setUp] = useState<number | null>(null);
  const [un, setUn] = useState("");
  // When ON, the next image upload is sent as a sticker (resets after upload).
  const [sm, setSm] = useState(false);
  const [spr, setSpr] = useState(false); // GIPHY sticker picker open
  const [rm, setRm] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [tp, setTp] = useState<string | null>(null); // other person's name while they're typing
  const [avatarOpen, setAvatarOpen] = useState(false);

  const sc = useRef<HTMLDivElement>(null);
  const ws = useRef<WebSocket | null>(null);
  const fi = useRef<HTMLInputElement>(null);
  const rt = useRef<any>(null);
  const ci = useRef<string | null>(null);
  const pi = useRef<any>(null);
  const init = useRef(false);
  const connectWsRef = useRef<((cid: string) => void) | null>(null);
  const tpExpiry = useRef<any>(null);   // clears the "typing" indicator after silence
  const tpLastEmit = useRef(0);         // throttle outgoing typing pings
  const tpStop = useRef<any>(null);     // sends typing:false after we stop typing

  // Store uid in ref so WS closure always has latest value
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const scrollDown = () => { setTimeout(() => { if (sc.current) sc.current.scrollTop = sc.current.scrollHeight; }, 50); };

  // ─── WS ──────────────────────────────────────────────────────────────────
  const connectWs = useCallback((cid: string) => {
    if (ws.current && ws.current.readyState !== WebSocket.CLOSED) { ws.current.onclose = null; ws.current.close(1000); }
    if (pi.current) clearInterval(pi.current);
    const tok = localStorage.getItem("access_token"); if (!tok) return;
    const base = (process.env.NEXT_PUBLIC_API_URL || "https://dothings.id/api").replace(/^http/, "ws").replace(/\/api$/, "");
    setWsS("connecting");
    const w = new WebSocket(`${base}/api/dm/ws/${cid}?token=${encodeURIComponent(tok)}`);
    ws.current = w; let pt: any;
    w.onopen = () => { setWsS("connected"); pi.current = setInterval(() => { if (w.readyState === WebSocket.OPEN) { w.send("ping"); pt = setTimeout(() => w.close(), 5000); } }, 25000); };
    w.onmessage = (e) => {
      if (e.data === "pong") { clearTimeout(pt); return; }
      try {
        const d = JSON.parse(e.data);
        if (d.type === "dm_received") {
          // Skip messages from self (HTTP already replaced optimistic)
          if (d.message && d.message.user_id === uidRef.current) return;
          setMs(prev => {
            const i = prev.findIndex(m => d.message.temp_id && m.id === d.message.temp_id);
            if (i !== -1) { const n = [...prev]; n[i] = { ...d.message, reactions: d.message.reactions || {} }; return n; }
            if (prev.find(m => m.id === d.message.id)) return prev;
            return [...prev, { ...d.message, reactions: d.message.reactions || {} }];
          });
        } else if (d.type === "dm_read") {
          setMs(prev => prev.map(m => d.message_ids?.includes(m.id) ? { ...m, is_read: true, read_at: d.read_at, is_delivered: true } : m));
        } else if (d.type === "dm_delivered") {
          // Sender's view: pesan yang baru kita kirim sudah sampai ke
          // device recipient (online). Update is_delivered → bubble dapat ✓✓ abu-abu.
          setMs(prev => prev.map(m => d.message_ids?.includes(m.id) ? { ...m, is_delivered: true, delivered_at: d.delivered_at || m.delivered_at } : m));
        } else if (d.type === "dm_reacted") {
          setMs(prev => prev.map(m => m.id === d.message_id ? { ...m, reactions: d.reactions || {} } : m));
        } else if (d.type === "dm_edited") {
          setMs(prev => prev.map(m => m.id === d.message.id ? { ...m, content: d.message.content, edited_at: d.message.edited_at || m.edited_at, edit_history: d.message.edit_history ?? (m as any).edit_history ?? [] } : m));
        } else if (d.type === "dm_deleted") {
          setMs(prev => prev.filter(m => m.id !== d.message_id));
        } else if (d.type === "dm_typing") {
          if (d.user_id === uidRef.current) return;
          if (d.typing) {
            setTp(d.name || "Mengetik");
            if (tpExpiry.current) clearTimeout(tpExpiry.current);
            tpExpiry.current = setTimeout(() => setTp(null), 4000);
          } else {
            if (tpExpiry.current) clearTimeout(tpExpiry.current);
            setTp(null);
          }
        }
      } catch { }
    };
    w.onclose = (ev) => { setWsS("disconnected"); if (pi.current) clearInterval(pi.current); if (ev.code !== 1000 && ev.code !== 4001) { rt.current = setTimeout(() => { if (ci.current && connectWsRef.current) connectWsRef.current(ci.current); }, 3000); } };
    w.onerror = () => setWsS("disconnected");
  }, []);
  connectWsRef.current = connectWs;

  // ─── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tid || init.current) return; init.current = true; let mounted = true;
    (async () => {
      try {
        const r = await api.post("/dm/channels", { org_id: oid === "undefined" ? null : oid, other_user_id: tid });
        if (!mounted) return; setCh(r.data); ci.current = r.data.id; connectWs(r.data.id);
        const mr = await api.get(`/dm/channels/${r.data.id}/messages`);
        if (!mounted) return; setMs((mr.data || []).map((m: any) => ({ ...m, reactions: m.reactions || {} })));
        scrollDown();
        setTimeout(() => { if (mounted) { api.post(`/dm/channels/${ci.current}/read`, {}, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } }).catch(() => { }); } }, 2000);
      } catch (e) { console.error("init fail", e); init.current = false; }
      finally { if (mounted) setLd(false); }
    })();
    return () => { mounted = false; ci.current = null; if (rt.current) clearTimeout(rt.current); if (pi.current) clearInterval(pi.current); if (ws.current) { ws.current.onclose = null; ws.current.close(1000, "x"); } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oid, tid]);

  // ─── Typing indicator ──────────────────────────────────────────────────────
  const sendTyping = (typing: boolean) => {
    const w = ws.current;
    if (!w || w.readyState !== WebSocket.OPEN) return;
    try { w.send(JSON.stringify({ type: "typing", name: cu?.name, typing })); } catch { }
  };
  const onTypingInput = () => {
    const now = Date.now();
    if (now - tpLastEmit.current > 1500) { tpLastEmit.current = now; sendTyping(true); }
    if (tpStop.current) clearTimeout(tpStop.current);
    tpStop.current = setTimeout(() => { sendTyping(false); tpLastEmit.current = 0; }, 2500);
  };
  const stopTyping = () => {
    if (tpStop.current) clearTimeout(tpStop.current);
    sendTyping(false);
    tpLastEmit.current = 0;
  };

  // ─── Send ────────────────────────────────────────────────────────────────
  const sendMsg = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tx.trim() || !ch) return;
    if (em) { updateMsg(); return; }
    setSe(true);
    const id = `o${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const replyParent = replyTo ? {
      id: replyTo.id,
      content: (replyTo.content || "").slice(0, 120),
      user: replyTo.user ? { id: replyTo.user.id, name: replyTo.user.name } : null,
    } : null;
    const o = { id, content: tx, user_id: uid, dm_channel_id: ch.id, created_at: new Date().toISOString(), attachment_url: null, attachment_name: null, is_read: false, is_delivered: false, reactions: {}, user: { id: uid, name: cu?.name, avatar_url: cu?.avatar_url }, parent_id: replyTo?.id || null, parent: replyParent, _opt: true };
    setMs(p => [...p, o]); setTx(""); stopTyping(); setReplyTo(null); scrollDown();
    try {
      const r = await api.post(`/dm/channels/${ch.id}/messages`, { content: o.content, temp_id: id, parent_id: replyTo?.id || null });
      setMs(prev => prev.map(m => m.id === id ? { ...r.data, reactions: r.data.reactions || {} } : m));
    } catch (err) { setMs(p => p.filter(m => m.id !== id)); setTx(o.content); }
    finally { setSe(false); }
  };

  const updateMsg = async () => {
    try { const r = await api.put(`/dm/messages/${em.id}`, { content: tx }); setMs(p => p.map(m => m.id === em.id ? { ...m, content: r.data.content, edited_at: r.data.edited_at || new Date().toISOString() } : m)); setEm(null); setTx(""); } catch { }
  };

  // ─── React ───────────────────────────────────────────────────────────────
  const doReact = async (mid: string, emoji: string) => {
    setRm(null);
    try { const r = await api.post(`/dm/messages/${mid}/react`, { emoji }); setMs(p => p.map(m => m.id === mid ? { ...m, reactions: r.data.reactions || {} } : m)); } catch { }
  };
  const getRC = (rx: Record<string, string>) => {
    const c: Record<string, { c: number; u: string[] }> = {};
    if (!rx) return c; Object.entries(rx).forEach(([u, e]) => { if (!c[e]) c[e] = { c: 0, u: [] }; c[e].c++; if (u === uid) c[e].u.push("me"); }); return c;
  };

  // ─── Upload ──────────────────────────────────────────────────────────────
  const upload = async (file: File) => {
    if (!ch) return;
    const id = `o${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const fi2 = GI(file.name); const ul = URL.createObjectURL(file);
    const o = { id, content: file.name, user_id: uid, dm_channel_id: ch.id, created_at: new Date().toISOString(), attachment_url: ul, attachment_name: file.name, file_size: file.size, is_image: fi2.isImage, is_video: fi2.isVideo, is_audio: fi2.isAudio, is_pdf: fi2.isPdf, is_read: false, is_delivered: false, reactions: {}, user: { id: uid, name: cu?.name, avatar_url: cu?.avatar_url }, _opt: true, _up: true, _upP: 0 };
    setMs(p => [...p, o]); setUn(file.name); setUp(0); scrollDown();
    const fd = new FormData(); fd.append("file", file);
    try {
      const pi2 = setInterval(() => { setUp(p => { const n = Math.min((p || 0) + Math.random() * 15 + 5, 90); setMs(ms2 => ms2.map(m => m.id === id ? { ...m, _upP: n } : m)); return n; }); }, 300);
      const asStk = sm && fi2.isImage;
      const r = await api.post(`/dm/channels/${ch.id}/attachments`, fd, { params: asStk ? { temp_id: id, is_sticker: true } : { temp_id: id }, headers: { "Content-Type": "multipart/form-data" } });
      if (asStk) setSm(false); // one-shot
      clearInterval(pi2); setUp(100); setMs(ms2 => ms2.map(m => m.id === id ? { ...m, _upP: 100 } : m));
      const rd = { ...r.data, reactions: r.data.reactions || {}, id: r.data.id || r.data.message?.id, user: { id: uid, name: cu?.name, avatar_url: cu?.avatar_url } };
      setTimeout(() => { setMs(p2 => p2.map(m2 => m2.id === id ? rd : m2)); URL.revokeObjectURL(ul); }, 500);
    } catch (err) { setMs(p => p.filter(m => m.id !== id)); URL.revokeObjectURL(ul); }
    finally { setUp(null); setUn(""); }
  };
  const onFP = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) upload(f); if (fi.current) fi.current.value = ""; };

  const sendStickerFromGiphy = async (url: string) => {
    if (!ch) return;
    // Optimistic insert so the sender sees it immediately (mirrors upload flow).
    const id = `o${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const o: any = {
      id, content: "", user_id: uid, dm_channel_id: ch.id,
      created_at: new Date().toISOString(),
      attachment_url: url, attachment_name: "sticker.gif",
      is_sticker: true, is_image: true,
      is_read: false, is_delivered: false, reactions: {},
      user: { id: uid, name: cu?.name, avatar_url: cu?.avatar_url },
      _opt: true,
    };
    setMs(p => [...p, o]); scrollDown();
    try {
      const r = await api.post(`/dm/channels/${ch.id}/messages`, {
        content: "", attachment_url: url, attachment_name: "sticker.gif", is_sticker: true,
      });
      // Preserve sticker fields even if backend response omits them (defense
      // in depth — backend should return them, but don't lose the sticker if not).
      const real = {
        ...r.data,
        user: o.user,
        attachment_url: r.data.attachment_url || url,
        attachment_name: r.data.attachment_name || "sticker.gif",
        is_sticker: true,
        is_image: true,
      };
      setMs(p => p.map(m => m.id === id ? real : m));
    } catch (err) {
      console.error("Failed to send sticker", err);
      setMs(p => p.filter(m => m.id !== id));
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  if (ld) return <div className="flex flex-col items-center justify-center h-[calc(100vh-160px)]"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  const ou = ch?.user1_id === uid ? ch?.user2 : ch?.user1;

  // Presence label: ngetik > online > terakhir online > offline
  const ouOnline = !!(ou?.id && isOnline(String(ou.id)));
  let presenceLabel: string;
  if (tp) {
    presenceLabel = `${tp}…`;
  } else if (ouOnline) {
    presenceLabel = "Online";
  } else if (ou?.last_seen_at) {
    try {
      presenceLabel = `Terakhir online ${formatDistanceToNow(new Date(ou.last_seen_at), { addSuffix: false, locale: idLocale })} lalu`;
    } catch {
      presenceLabel = "Offline";
    }
  } else {
    presenceLabel = "Offline";
  }

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border bg-secondary/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { if (ou?.avatar_url) setAvatarOpen(true); }}
            title={ou?.avatar_url ? "Lihat foto" : ou?.name || "Profil"}
            disabled={!ou?.avatar_url}
            className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary relative overflow-hidden ring-1 ring-border hover:ring-primary/40 transition-all disabled:cursor-default disabled:hover:ring-border"
          >
            {ou?.avatar_url ? (
              <img src={ou.avatar_url} alt={ou?.name || "Avatar"} className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-5 h-5" />
            )}
            {ouOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" />
            )}
          </button>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-1">
              {ou?.name || "Chat"} <ShieldCheck className="w-3 h-3 text-emerald-500" />
            </h2>
            <p className={cn(
              "text-[10px]",
              ouOnline ? "text-emerald-600 font-semibold" : tp ? "text-primary italic" : "text-muted-foreground",
            )}>
              {presenceLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {wsS === "connected" ? <><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">Live</span></> : wsS === "connecting" ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Connecting...</span></> : <><WifiOff className="w-3 h-3 text-destructive" /><span className="text-destructive">Offline</span></>}
        </div>
      </div>

      {/* Messages */}
      <div ref={sc}
        onDragOver={e => { e.preventDefault(); setDr(true); }}
        onDragLeave={() => setDr(false)}
        onDrop={e => { e.preventDefault(); setDr(false); const f = e.dataTransfer.files?.[0]; if (f && ch) upload(f); }}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-secondary/[0.02] relative"
        onClick={() => setRm(null)}>

        {dr && <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] z-50 flex items-center justify-center border-2 border-dashed border-primary m-3 rounded-3xl">
          <div className="bg-background px-8 py-6 rounded-2xl shadow-xl flex flex-col items-center gap-3"><Paperclip className="w-8 h-8 text-primary animate-bounce" /><span className="font-bold text-sm">Lepaskan untuk mengirim file</span><span className="text-[10px] text-muted-foreground">ke {ou?.name}</span></div>
        </div>}

        {ms.length === 0 && <div className="flex flex-col items-center justify-center h-full text-center py-12"><div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mb-4"><Send className="w-6 h-6 text-muted-foreground" /></div><p className="text-sm font-bold text-muted-foreground">Belum ada pesan</p><p className="text-[11px] text-muted-foreground/60 mt-1">Kirim pesan atau file untuk memulai percakapan</p></div>}

        {(() => {
          let lastDate = "";
          return ms.map((msg, idx) => {
            const me = msg.user_id === uid;
            const opt = msg._opt === true;
            const up2 = msg._up === true;
            const pct = msg._upP || 0;
            const prev = idx > 0 ? ms[idx - 1] : null;
            const same = prev && prev.user_id === msg.user_id;
            const av = !me && !same;
            const rx = msg.reactions || {};
            const rc = getRC(rx);
            const hrx = Object.keys(rc).length > 0;
            const myE = rx[uid || ""] || null;
            const d = new Date(msg.created_at);
            const dateStr = d.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
            const showDate = dateStr !== lastDate;
            if (showDate) lastDate = dateStr;
            return (
              <div key={msg.id} id={`dm-msg-${msg.id}`} className="transition-all rounded-[16px]">
                {showDate && <div className="flex justify-center my-3"><span className="text-[10px] text-muted-foreground bg-secondary/50 px-3 py-1 rounded-full border border-border/50">{dateStr}</span></div>}
                <div className={cn("flex group relative", me ? "justify-end" : "justify-start")}>
                  <div className={cn("flex gap-1.5 max-w-[80%] md:max-w-[65%]", me ? "flex-row-reverse" : "flex-row")}>
                    <div className={cn("w-8 shrink-0", !av && "invisible")}>
                      {av && <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{(ou?.name || "?").charAt(0).toUpperCase()}</div>}
                    </div>
                    <div className={cn("flex flex-col", me ? "items-end" : "items-start")}>
                      <div className={cn("relative text-sm transition-all", msg.is_sticker && msg.attachment_url ? "bg-transparent" : cn("px-3 py-1.5 shadow-sm", me ? "bg-[#3D4F6B] text-white rounded-[16px] rounded-br-[4px]" : "bg-card text-foreground border border-border rounded-[16px] rounded-bl-[4px]"), opt && "opacity-70", up2 && "min-w-[160px]")}>
                        {msg.parent && (
                          <div
                            onClick={() => {
                              const el = document.getElementById(`dm-msg-${msg.parent.id}`);
                              if (el) {
                                el.scrollIntoView({ behavior: "smooth", block: "center" });
                                el.classList.add("ring-2", "ring-emerald-500/40");
                                setTimeout(() => el.classList.remove("ring-2", "ring-emerald-500/40"), 1500);
                              }
                            }}
                            className={cn(
                              "mb-1.5 px-2 py-1 rounded-md border-l-2 cursor-pointer text-[10px] leading-tight",
                              me ? "bg-white/15 border-white/60" : "bg-secondary/40 border-primary/40",
                            )}
                          >
                            <div className={cn("flex items-center gap-1 font-bold mb-0.5", me ? "text-white/85" : "text-foreground/80")}>
                              <CornerDownRight className="w-2.5 h-2.5" />
                              {msg.parent.user?.name || "Pesan"}
                            </div>
                            <p className={cn("truncate", me ? "text-white/70" : "text-muted-foreground")}>
                              {msg.parent.content || "(lampiran)"}
                            </p>
                          </div>
                        )}
                        {msg.attachment_url ? (
                          <div className="space-y-1.5">
                            {msg.is_sticker && (msg.is_image || GI(msg.attachment_name || "").isImage) && !up2 && (
                              <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-block">
                                <img src={msg.attachment_url} alt={msg.attachment_name || "sticker"} className="max-h-[150px] w-auto object-contain drop-shadow hover:opacity-90 transition-opacity" loading="lazy" />
                              </a>
                            )}
                            {!msg.is_sticker && (msg.is_image || GI(msg.attachment_name || "").isImage) && !up2 &&
                              <div className="relative group/img cursor-pointer rounded-lg overflow-hidden max-w-[240px]" onClick={() => setVf({ id: msg.id, name: msg.attachment_name || "file", url: msg.attachment_url, ...GI(msg.attachment_name || ""), size: msg.file_size })}>
                                <img src={msg.attachment_url} alt={msg.attachment_name || "img"} className="w-full rounded-lg max-h-[200px] object-cover" loading="lazy" />
                                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-all flex items-center justify-center"><div className="opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/50 text-white p-1.5 rounded-full"><Eye className="w-4 h-4" /></div></div>
                              </div>}
                            {(msg.is_audio || GI(msg.attachment_name || "").isAudio) && !up2 &&
                              <VoiceNotePlayer url={msg.attachment_url} onDark={me} />}
                            {(msg.is_video || GI(msg.attachment_name || "").isVideo) && !(msg.is_audio || GI(msg.attachment_name || "").isAudio) &&
                              <div className="relative rounded-lg overflow-hidden max-w-[240px]"><video src={msg.attachment_url} className="w-full rounded-lg max-h-[200px]" controls preload="metadata" /></div>}
                            {!msg.is_image && !GI(msg.attachment_name || "").isImage && !msg.is_video && !GI(msg.attachment_name || "").isVideo && !msg.is_audio && !GI(msg.attachment_name || "").isAudio &&
                              <div className={cn("flex items-center gap-2 p-2 rounded-xl", me ? "bg-white/15" : "bg-secondary/50")}>
                                <div className={cn("p-1.5 rounded-lg shrink-0", me ? "bg-white/20" : "bg-background")}>{(() => { const i = GI(msg.attachment_name || ""); if (i.isImage) return <Image className="w-4 h-4" />; if (i.isVideo) return <Video className="w-4 h-4" />; if (i.isAudio) return <Music className="w-4 h-4" />; if (i.isPdf) return <FileText className="w-4 h-4" />; return <File className="w-4 h-4" />; })()}</div>
                                <div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{msg.attachment_name || "File"}</p><p className={cn("text-[9px]", me ? "text-white/70" : "text-muted-foreground")}>{FS(msg.file_size)}</p></div>
                                <button onClick={() => setVf({ id: msg.id, name: msg.attachment_name || "file", url: msg.attachment_url, ...GI(msg.attachment_name || ""), size: msg.file_size })} className={cn("p-1.5 rounded-lg shrink-0 transition-colors", me ? "hover:bg-white/20" : "hover:bg-secondary")} title="Lihat"><Eye className="w-3.5 h-3.5" /></button>
                                <a href={msg.attachment_url} download={msg.attachment_name || "file"} className={cn("p-1.5 rounded-lg shrink-0 transition-colors", me ? "hover:bg-white/20" : "hover:bg-secondary")} title="Unduh"><Download className="w-3.5 h-3.5" /></a>
                              </div>}
                            {(msg.is_image || GI(msg.attachment_name || "").isImage) && !up2 && <p className={cn("text-[9px] opacity-70 text-center", me ? "text-white" : "text-foreground")}>Ketuk untuk melihat</p>}
                          </div>
                        ) : <div className="whitespace-pre-wrap break-words leading-snug"><Linkify text={msg.content} me={me} /></div>}
                        {up2 && <div className="mt-2 space-y-1"><div className={cn("flex items-center gap-2", me ? "text-white/80" : "text-muted-foreground")}><Clock className="w-3 h-3 animate-pulse" /><span className="text-[10px]">Mengirim file...</span></div><div className={cn("h-1.5 rounded-full overflow-hidden", me ? "bg-white/20" : "bg-secondary")}><div className={cn("h-full rounded-full transition-all duration-300 ease-out", me ? "bg-white/70" : "bg-primary")} style={{ width: `${pct}%` }} /></div><p className={cn("text-[9px] text-right", me ? "text-white/70" : "text-muted-foreground")}>{Math.round(pct)}%</p></div>}
                        <div className={cn("flex items-center gap-0.5 mt-0.5", me ? "justify-end" : "justify-start")}>
                          {opt && !up2 ? <span className={cn("text-[9px] flex items-center gap-1", me ? "text-white/70" : "text-muted-foreground")}><Loader2 className="w-2.5 h-2.5 animate-spin" /> Kirim...</span>
                            : up2 ? null
                              : <span className={cn("text-[9px] flex items-center gap-0.5", me ? "text-white/70" : "text-muted-foreground")}>
                                {msg.edited_at && (
                                  <span className="mr-1">
                                    <EditHistoryBadge
                                      history={(msg as any).edit_history || []}
                                      editedAt={msg.edited_at}
                                      onDark={me}
                                    />
                                    <span className="opacity-60"> ·</span>
                                  </span>
                                )}
                                {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                {me && (msg.is_read ? <CheckCheck className="w-3 h-3 text-white" /> : msg.is_delivered ? <CheckCheck className="w-3 h-3 text-white/60" /> : <Check className="w-3 h-3" />)}
                              </span>}
                        </div>
                        {!opt && !up2 && (
                          <div className={cn(
                            "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1",
                            me ? "-left-10" : "-right-10",
                          )}>
                            <button
                              onClick={() => { setReplyTo({ id: msg.id, content: msg.content, user: msg.user || (me ? cu : ou) }); setEm(null); }}
                              title="Balas"
                              className="p-1 hover:bg-secondary rounded-lg text-muted-foreground bg-background/80 backdrop-blur-sm shadow-sm"
                            >
                              <Reply className="w-3 h-3" />
                            </button>
                            {me && (
                              <button onClick={() => { setEm(msg); setTx(msg.content); setReplyTo(null); }} className="p-1 hover:bg-secondary rounded-lg text-muted-foreground bg-background/80 backdrop-blur-sm shadow-sm"><Edit2 className="w-3 h-3" /></button>
                            )}
                          </div>
                        )}
                      </div>
                      {hrx && !up2 && <div className={cn("flex gap-1 mt-0.5", me ? "justify-end" : "justify-start")}>{Object.entries(rc).map(([e, i]) => (
                        <button key={e} onClick={() => doReact(msg.id, e)} className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-all hover:scale-110", i.u.includes("me") ? "bg-primary/10 border-primary/30" : "bg-secondary/30 border-border/50")}>
                          <span className="text-sm">{e}</span><span className="text-[10px] font-medium">{i.c}</span></button>
                      ))}</div>}
                      {!opt && !up2 && <div className={cn("opacity-0 group-hover:opacity-100 transition-opacity mt-0.5", me ? "text-right" : "text-left")}>
                        <button onClick={(e) => { e.stopPropagation(); setRm(rm === msg.id ? null : msg.id); }} className="p-0.5 rounded-full hover:bg-secondary transition-colors text-muted-foreground"><Smile className="w-3.5 h-3.5" /></button>
                      </div>}
                      {rm === msg.id && <div className={cn("mt-1 p-1.5 bg-background border border-border rounded-xl shadow-xl flex gap-1 flex-wrap max-w-[240px] z-10", me ? "justify-end" : "justify-start")} onClick={e => e.stopPropagation()}>
                        {QR.map(e => (<button key={e} onClick={() => doReact(msg.id, e)} className={cn("text-lg hover:scale-125 transition-transform p-0.5 rounded", myE === e ? "bg-primary/10 scale-110" : "")}>{e}</button>))}
                      </div>}
                    </div>
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Input */}
      <div className="p-3.5 border-t border-border bg-card shrink-0">
        {em && <div className="mb-2.5 p-2.5 bg-secondary/50 rounded-xl flex items-center justify-between text-xs border border-border">
          <span className="truncate flex items-center gap-1.5 text-muted-foreground"><Edit2 className="w-3 h-3 shrink-0" /><span className="truncate">Mengedit pesan...</span></span>
          <button onClick={() => { setEm(null); setTx(""); }} className="p-1 hover:bg-secondary rounded-lg shrink-0"><X className="w-4 h-4" /></button>
        </div>}
        {replyTo && !em && (
          <div className="mb-2.5 p-2.5 bg-primary/5 rounded-xl flex items-center justify-between text-xs border-l-2 border-primary">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[10px] font-bold text-primary mb-0.5">
                <Reply className="w-3 h-3 shrink-0" />
                Membalas {replyTo.user?.name || "pesan"}
              </p>
              <p className="truncate text-muted-foreground">{(replyTo.content || "(lampiran)").slice(0, 140)}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-secondary rounded-lg shrink-0 ml-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {se2 && <div className="mb-2.5 bg-background border border-border rounded-2xl shadow-xl overflow-hidden">
          <div className="flex gap-1 p-1.5 border-b border-border bg-secondary/20 overflow-x-auto">{EI.map((g, i) => (
            <button key={g[0]} onClick={() => setEt(i)} className={cn("px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors shrink-0", et === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}>{g[0]}</button>
          ))}</div>
          <div className="p-2 flex flex-wrap gap-1 max-h-[150px] overflow-y-auto">{(EI[et][1]).map(e => (
            <button key={e} onClick={() => setTx(p => p + e)} className="text-xl hover:scale-125 transition-transform p-1 hover:bg-secondary rounded-lg">{e}</button>
          ))}</div>
        </div>}
        {up !== null && <div className="mb-2.5 p-2.5 bg-secondary/30 rounded-xl border border-border flex items-center gap-2.5 text-xs">
          <div className="p-1.5 rounded-lg bg-primary/10"><Paperclip className="w-4 h-4 text-primary animate-pulse" /></div>
          <div className="flex-1 min-w-0"><p className="truncate font-medium">{un}</p><div className="h-1 bg-secondary rounded-full mt-1 overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-300 ease-out" style={{ width: `${up}%` }} /></div></div>
          <span className="text-muted-foreground font-mono text-[10px] shrink-0">{Math.round(up)}%</span>
        </div>}
        <div className="h-5"><TypingIndicator names={tp ? [tp] : []} /></div>
        <form onSubmit={sendMsg} className="flex gap-2 items-end">
          <input type="file" ref={fi} onChange={onFP} className="hidden" accept="*/*" />
          <button type="button" onClick={() => fi.current?.click()} disabled={up !== null} title={sm ? "Pilih gambar (akan dikirim sebagai sticker)" : "Lampirkan file"} className="p-3 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors disabled:opacity-40"><Paperclip className="w-5 h-5 text-muted-foreground" /></button>
          <button type="button" onClick={() => setSm(v => !v)} title={sm ? "Mode sticker AKTIF — pilih gambar buat dijadikan sticker" : "Mode sticker (gambar sendiri jadi sticker)"} className={cn("p-3 rounded-xl transition-colors", sm ? "bg-primary text-primary-foreground" : "bg-secondary/50 hover:bg-secondary text-muted-foreground")}><Sticker className="w-5 h-5" /></button>
          <button type="button" onClick={() => setSpr(true)} title="Pilih sticker GIPHY" className="p-3 rounded-xl transition-colors bg-secondary/50 hover:bg-secondary text-muted-foreground"><Image className="w-5 h-5" /></button>
          <div className="bg-secondary/50 rounded-xl flex items-center"><VoiceRecorder onSend={upload} /></div>
          <button type="button" onClick={() => setSe2(!se2)} className="p-3 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors"><Smile className="w-5 h-5 text-muted-foreground" /></button>
          <div className="flex-1 relative">
            <textarea value={tx} onChange={e => { setTx(e.target.value); onTypingInput(); }} onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} placeholder="Tulis pesan..." rows={1} className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all text-sm resize-none" />
          </div>
          <button type="submit" disabled={!tx.trim() || se || up !== null} className="p-3 bg-primary text-primary-foreground rounded-xl hover:shadow-lg transition-all disabled:opacity-50">{se ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}</button>
        </form>
      </div>

      {vf && <FileViewerModal isOpen={!!vf} onClose={() => setVf(null)} fileUrl={vf.url} fileName={vf.name} isImage={vf.isImage} isVideo={vf.isVideo} isAudio={vf.isAudio} isPdf={vf.isPdf} />}
      <StickerPicker isOpen={spr} onClose={() => setSpr(false)} onPick={sendStickerFromGiphy} />

      {/* Avatar lightbox — click backdrop or × to dismiss */}
      {avatarOpen && ou?.avatar_url && (
        <div
          onClick={() => setAvatarOpen(false)}
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-150"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setAvatarOpen(false); }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={ou.avatar_url}
            alt={ou.name || "Foto profil"}
            onClick={(e) => e.stopPropagation()}
            className="max-w-[90vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
}