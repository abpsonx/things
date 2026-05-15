"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Send, Loader2, User as UserIcon, ShieldCheck, Paperclip,
  Trash2, Edit2, X, Check, CheckCheck, Smile, Wifi, WifiOff,
  FileText, File, Image, Video, Music, Download, Eye, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import FileViewerModal from "@/components/ui/FileViewerModal";

const GI = (n: string) => { const e = (n || "").toLowerCase().split(".").pop() || ""; return { isImage: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(e), isVideo: ["mp4", "webm", "mov", "avi", "mkv", "wmv"].includes(e), isAudio: ["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(e), isPdf: e === "pdf" } };
const FS = (b?: number) => { if (!b) return ""; if (b < 1024) return `${b}B`; if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`; return `${(b / 1048576).toFixed(1)}MB` };
const EI: [string, string[]][] = [["Sering", ["👍", "❤️", "😂", "🔥", "😊", "🙏", "✅", "🎉", "🚀", "👏"]], ["Wajah", ["😊", "😂", "🤣", "🥰", "😍", "😘", "😅", "😁", "🤔", "😢", "😭", "😤", "😡", "🤗", "🙂", "😉", "😎", "🥺", "😴"]], ["Tangan", ["👍", "👎", "👏", "🙌", "🤝", "✌️", "🤞", "👊", "✊", "🙏", "💪", "🖐️", "👋", "🤙"]], ["Lambang", ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "🔥", "⭐", "✨", "💥", "🌈", "🎯", "🎉", "🏆", "✅", "❌", "💀"]]];
const QR = ["👍", "❤️", "😂", "🔥", "😊", "🙏", "🎉", "🚀", "👏", "😢"];

export default function DMChatPage() {
  const p = useParams();
  const oid = p?.id as string, tid = p?.userId as string;
  const { user: cu } = useAuthStore(); const uid = cu?.id;

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
  const [rm, setRm] = useState<string | null>(null);

  const sc = useRef<HTMLDivElement>(null);
  const ws = useRef<WebSocket | null>(null);
  const fi = useRef<HTMLInputElement>(null);
  const rt = useRef<any>(null);
  const ci = useRef<string | null>(null);
  const pi = useRef<any>(null);
  const init = useRef(false);
  const scrollDown = useCallback(() => { setTimeout(() => { if (sc.current) sc.current.scrollTop = sc.current.scrollHeight; }, 50); }, []);

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
          setMs(prev => {
            const i = prev.findIndex(m => d.message.temp_id && m.id === d.message.temp_id);
            if (i !== -1) { const n = [...prev]; n[i] = { ...d.message, reactions: d.message.reactions || {} }; return n; }
            if (prev.find(m => m.id === d.message.id)) return prev;
            return [...prev, { ...d.message, reactions: d.message.reactions || {} }];
          });
        } else if (d.type === "dm_read") {
          setMs(prev => prev.map(m => d.message_ids?.includes(m.id) ? { ...m, is_read: true, read_at: d.read_at, is_delivered: true } : m));
        } else if (d.type === "dm_reacted") {
          setMs(prev => prev.map(m => m.id === d.message_id ? { ...m, reactions: d.reactions || {} } : m));
        } else if (d.type === "dm_edited") {
          setMs(prev => prev.map(m => m.id === d.message.id ? { ...m, content: d.message.content } : m));
        } else if (d.type === "dm_deleted") {
          setMs(prev => prev.filter(m => m.id !== d.message_id));
        }
      } catch { }
    };
    w.onclose = (ev) => { setWsS("disconnected"); if (pi.current) clearInterval(pi.current); if (ev.code !== 1000 && ev.code !== 4001) { rt.current = setTimeout(() => { if (ci.current) connectWs(ci.current); }, 3000); } };
    w.onerror = () => setWsS("disconnected");
  }, []);

  // ─── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tid || init.current) return; init.current = true; let mounted = true;
    (async () => {
      try {
        const r = await api.post("/dm/channels", { org_id: oid === "undefined" ? null : oid, other_user_id: tid });
        if (!mounted) return; setCh(r.data); ci.current = r.data.id; connectWs(r.data.id);
        const mr = await api.get(`/dm/channels/${r.data.id}/messages`);
        if (!mounted) return; setMs((mr.data || []).map((m: any) => ({ ...m, reactions: m.reactions || {} })));
        setTimeout(() => { if (mounted) { scrollDown(); api.post(`/dm/channels/${ci.current}/read`, {}, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } }).catch(() => { }); } }, 2000);
      } catch (e) { console.error("init fail", e); init.current = false; }
      finally { if (mounted) setLd(false); }
    })();
    return () => { mounted = false; ci.current = null; if (rt.current) clearTimeout(rt.current); if (pi.current) clearInterval(pi.current); if (ws.current) { ws.current.onclose = null; ws.current.close(1000, "x"); } };
  }, [oid, tid, connectWs, scrollDown]);

  // ─── Send ────────────────────────────────────────────────────────────────
  const sendMsg = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tx.trim() || !ch) return;
    if (em) { updateMsg(); return; }
    setSe(true);
    const id = `o${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const o = { id, content: tx, user_id: uid, dm_channel_id: ch.id, created_at: new Date().toISOString(), attachment_url: null, attachment_name: null, is_read: false, is_delivered: false, reactions: {}, user: { id: uid, name: cu?.name, avatar_url: cu?.avatar_url }, _opt: true };
    setMs(p => [...p, o]); setTx(""); scrollDown();
    try {
      const r = await api.post(`/dm/channels/${ch.id}/messages`, { content: o.content, temp_id: id });
      // Replace optimistic immediately with server response
      setMs(prev => prev.map(m => m.id === id ? { ...r.data, reactions: r.data.reactions || {} } : m));
    } catch (err) { console.error("send fail", err); setMs(p => p.filter(m => m.id !== id)); setTx(o.content); }
    finally { setSe(false); }
  };

  const updateMsg = async () => {
    try { const r = await api.put(`/dm/messages/${em.id}`, { content: tx }); setMs(p => p.map(m => m.id === em.id ? { ...m, content: r.data.content } : m)); setEm(null); setTx(""); } catch { }
  };
  const delMsg = async (id: string) => { if (!confirm("Hapus?")) return; setMs(p => p.filter(m => m.id !== id)); try { await api.delete(`/dm/messages/${id}`); } catch { } };

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
      const r = await api.post(`/dm/channels/${ch.id}/attachments`, fd, { params: { temp_id: id }, headers: { "Content-Type": "multipart/form-data" } });
      clearInterval(pi2); setUp(100); setMs(ms2 => ms2.map(m => m.id === id ? { ...m, _upP: 100 } : m));
      const rd = { ...r.data, reactions: r.data.reactions || {}, id: r.data.id || r.data.message?.id, user: { id: uid, name: cu?.name, avatar_url: cu?.avatar_url } };
      setTimeout(() => { setMs(p2 => p2.map(m2 => m2.id === id ? rd : m2)); URL.revokeObjectURL(ul); }, 500);
    } catch (err) { console.error("upload fail", err); setMs(p => p.filter(m => m.id !== id)); URL.revokeObjectURL(ul); }
    finally { setUp(null); setUn(""); }
  };
  const onFP = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) upload(f); if (fi.current) fi.current.value = ""; };

  // ─── Render ──────────────────────────────────────────────────────────────
  if (ld) return <div className="flex flex-col items-center justify-center h-[calc(100vh-160px)]"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  const ou = ch?.user1_id === uid ? ch?.user2 : ch?.user1;

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-border bg-secondary/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary relative">
            <UserIcon className="w-5 h-5" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" />
          </div>
          <div><h2 className="text-sm font-bold flex items-center gap-1">{ou?.name || "Chat"} <ShieldCheck className="w-3 h-3 text-emerald-500" /></h2><p className="text-[10px] text-muted-foreground">Aktif sekarang</p></div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {wsS === "connected" ? <><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">Live</span></> : wsS === "connecting" ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Connecting...</span></> : <><WifiOff className="w-3 h-3 text-destructive" /><span className="text-destructive">Offline</span></>}
        </div>
      </div>

      <div ref={sc} onDragOver={e => { e.preventDefault(); setDr(true); }} onDragLeave={() => setDr(false)} onDrop={e => { e.preventDefault(); setDr(false); const f = e.dataTransfer.files?.[0]; if (f && ch) upload(f); }}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-secondary/[0.02] relative" onClick={() => setRm(null)}>
        {dr && <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] z-50 flex items-center justify-center border-2 border-dashed border-primary m-3 rounded-3xl">
          <div className="bg-background px-8 py-6 rounded-2xl shadow-xl flex flex-col items-center gap-3"><Paperclip className="w-8 h-8 text-primary animate-bounce" /><span className="font-bold text-sm">Lepaskan untuk mengirim file</span><span className="text-[10px] text-muted-foreground">ke {ou?.name}</span></div>
        </div>}
        {ms.length === 0 && <div className="flex flex-col items-center justify-center h-full text-center py-12"><div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mb-4"><Send className="w-6 h-6 text-muted-foreground" /></div><p className="text-sm font-bold text-muted-foreground">Belum ada pesan</p><p className="text-[11px] text-muted-foreground/60 mt-1">Kirim pesan atau file untuk memulai percakapan</p></div>}
        {ms.map((msg, idx) => {
          const me = msg.user_id === uid, opt = msg._opt === true, up2 = msg._up === true, pct = msg._upP || 0;
          const prev = idx > 0 ? ms[idx - 1] : null, same = prev && prev.user_id === msg.user_id, av = !me && !same;
          const rx = msg.reactions || {}, rc = getRC(rx), hrx = Object.keys(rc).length > 0, myE = rx[uid || ""] || null;
          return (
            <div key={msg.id} className={cn("flex group relative", me ? "justify-end" : "justify-start")}>
              <div className={cn("flex gap-1.5 max-w-[80%] md:max-w-[65%]", me ? "flex-row-reverse" : "flex-row")}>
                <div className={cn("w-8 shrink-0", !av && "invisible")}>{av && <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{(ou?.name || "?").charAt(0).toUpperCase()}</div>}</div>
                <div className={cn("flex flex-col", me ? "items-end" : "items-start")}>
                  {av && !me && <span className="text-[10px] text-muted-foreground font-medium mb-0.5 ml-1">{ou?.name}</span>}
                  <div className={cn("relative px-3.5 py-2 text-sm shadow-sm transition-all", me ? "bg-primary text-primary-foreground rounded-[18px] rounded-br-[4px]" : "bg-card border border-border rounded-[18px] rounded-bl-[4px] text-foreground", opt && "opacity-70", up2 && "min-w-[160px]")}>
                    {msg.attachment_url ? (
                      <div className="space-y-1.5">
                        {(msg.is_image || GI(msg.attachment_name || "").isImage) && !up2 && <div className="relative group/img cursor-pointer rounded-lg overflow-hidden max-w-[240px]" onClick={() => setVf({ id: msg.id, name: msg.attachment_name || "file", url: msg.attachment_url, ...GI(msg.attachment_name || ""), size: msg.file_size })}>
                          <img src={msg.attachment_url} alt={msg.attachment_name || "img"} className="w-full rounded-lg max-h-[200px] object-cover" loading="lazy" />
                          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-all flex items-center justify-center"><div className="opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/50 text-white p-1.5 rounded-full"><Eye className="w-4 h-4" /></div></div>
                        </div>}
                        {(msg.is_video || GI(msg.attachment_name || "").isVideo) && <div className="relative rounded-lg overflow-hidden max-w-[240px]"><video src={msg.attachment_url} className="w-full rounded-lg max-h-[200px]" controls preload="metadata" /></div>}
                        {!msg.is_image && !GI(msg.attachment_name || "").isImage && !msg.is_video && !GI(msg.attachment_name || "").isVideo && <div className={cn("flex items-center gap-2 p-2 rounded-xl", me ? "bg-primary-foreground/10" : "bg-secondary/50")}>
                          <div className={cn("p-1.5 rounded-lg shrink-0", me ? "bg-primary-foreground/15" : "bg-background")}>{(() => { const i = GI(msg.attachment_name || ""); if (i.isImage) return <Image className="w-4 h-4" />; if (i.isVideo) return <Video className="w-4 h-4" />; if (i.isAudio) return <Music className="w-4 h-4" />; if (i.isPdf) return <FileText className="w-4 h-4" />; return <File className="w-4 h-4" />; })()}</div>
                          <div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{msg.attachment_name || "File"}</p><p className={cn("text-[9px]", me ? "text-primary-foreground/60" : "text-muted-foreground")}>{FS(msg.file_size)}</p></div>
                          <button onClick={() => setVf({ id: msg.id, name: msg.attachment_name || "file", url: msg.attachment_url, ...GI(msg.attachment_name || ""), size: msg.file_size })} className={cn("p-1.5 rounded-lg shrink-0 transition-colors", me ? "hover:bg-primary-foreground/15" : "hover:bg-secondary")} title="Lihat"><Eye className="w-3.5 h-3.5" /></button>
                          <a href={msg.attachment_url} download={msg.attachment_name || "file"} className={cn("p-1.5 rounded-lg shrink-0 transition-colors", me ? "hover:bg-primary-foreground/15" : "hover:bg-secondary")} title="Unduh"><Download className="w-3.5 h-3.5" /></a>
                        </div>}
                        {(msg.is_image || GI(msg.attachment_name || "").isImage) && !up2 && <p className={cn("text-[9px] opacity-60 text-center", me ? "text-primary-foreground" : "text-foreground")}>Ketuk untuk melihat</p>}
                      </div>
                    ) : <div className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</div>}
                    {up2 && <div className="mt-2 space-y-1"><div className={cn("flex items-center gap-2", me ? "text-primary-foreground/70" : "text-muted-foreground")}><Clock className="w-3 h-3 animate-pulse" /><span className="text-[10px]">Mengirim file...</span></div><div className={cn("h-1.5 rounded-full overflow-hidden", me ? "bg-primary-foreground/20" : "bg-secondary")}><div className={cn("h-full rounded-full transition-all duration-300 ease-out", me ? "bg-primary-foreground/60" : "bg-primary")} style={{ width: `${pct}%` }} /></div><p className={cn("text-[9px] text-right", me ? "text-primary-foreground/50" : "text-muted-foreground")}>{Math.round(pct)}%</p></div>}
                    <div className={cn("flex items-center gap-0.5 mt-1", me ? "justify-end" : "justify-start")}>
                      {opt && !up2 ? <span className={cn("text-[9px] flex items-center gap-1", me ? "text-primary-foreground/60" : "text-muted-foreground")}><Loader2 className="w-2.5 h-2.5 animate-spin" /> Kirim...</span>
                        : up2 ? null
                          : <span className={cn("text-[9px] flex items-center gap-0.5", me ? "text-primary-foreground/60" : "text-muted-foreground")}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {me && (msg.is_read ? <CheckCheck className="w-3 h-3 text-blue-400" /> : msg.is_delivered ? <CheckCheck className="w-3 h-3 text-muted-foreground/60" /> : <Check className="w-3 h-3" />)}
                          </span>}
                    </div>
                    {me && !opt && !up2 && <div className={cn("absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1", me ? "-left-10" : "-right-10")}>
                      <button onClick={() => { setEm(msg); setTx(msg.content); }} className="p-1 hover:bg-secondary rounded-lg text-muted-foreground bg-background/80 backdrop-blur-sm shadow-sm"><Edit2 className="w-3 h-3" /></button>
                      <button onClick={() => delMsg(msg.id)} className="p-1 hover:bg-destructive/10 rounded-lg text-destructive bg-background/80 backdrop-blur-sm shadow-sm"><Trash2 className="w-3 h-3" /></button>
                    </div>}
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
          );
        })}
      </div>

      <div className="p-3.5 border-t border-border bg-card shrink-0">
        {em && <div className="mb-2.5 p-2.5 bg-secondary/50 rounded-xl flex items-center justify-between text-xs border border-border">
          <span className="truncate flex items-center gap-1.5 text-muted-foreground"><Edit2 className="w-3 h-3 shrink-0" /><span className="truncate">Mengedit pesan...</span></span>
          <button onClick={() => { setEm(null); setTx(""); }} className="p-1 hover:bg-secondary rounded-lg shrink-0"><X className="w-4 h-4" /></button>
        </div>}
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
        <form onSubmit={sendMsg} className="flex gap-2 items-end">
          <input type="file" ref={fi} onChange={onFP} className="hidden" accept="*/*" />
          <button type="button" onClick={() => fi.current?.click()} disabled={up !== null} className="p-3 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors disabled:opacity-40"><Paperclip className="w-5 h-5 text-muted-foreground" /></button>
          <button type="button" onClick={() => setSe2(!se2)} className="p-3 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors"><Smile className="w-5 h-5 text-muted-foreground" /></button>
          <div className="flex-1 relative">
            <textarea value={tx} onChange={e => setTx(e.target.value)} onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} placeholder="Tulis pesan..." rows={1} className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all text-sm resize-none" />
          </div>
          <button type="submit" disabled={!tx.trim() || se || up !== null} className="p-3 bg-primary text-primary-foreground rounded-xl hover:shadow-lg transition-all disabled:opacity-50">{se ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}</button>
        </form>
      </div>

      {vf && <FileViewerModal isOpen={!!vf} onClose={() => setVf(null)} fileUrl={vf.url} fileName={vf.name} isImage={vf.isImage} isVideo={vf.isVideo} isAudio={vf.isAudio} isPdf={vf.isPdf} />}
    </div>
  );
}