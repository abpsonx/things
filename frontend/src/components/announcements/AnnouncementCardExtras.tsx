"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Eye, Smile, Loader2, Send, Trash2, X, Check, Clock } from "lucide-react";
import Modal from "@/components/ui/Modal";
import MentionTextarea from "@/components/ui/MentionTextarea";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Bottom strip of an announcement card: reactions row + read count + comments toggle.
 * Auto-marks the announcement as read after `markReadAfterMs` (default 1.2s)
 * when the card has been in viewport — like marking an email as read after
 * a brief dwell time.
 */

const QUICK_EMOJIS = ["👍", "❤️", "🎉", "😂", "😮", "👏"];

export interface ReactionBucket {
  emoji: string;
  count: number;
  mine: boolean;
  users: { id: string; name: string }[];
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user: { id: string; name: string; avatar_url?: string | null } | null;
}

interface Props {
  orgId: string;
  announcementId: string;
  initialReadCount: number;
  initialCommentCount: number;
  hasReadInitial: boolean;
  // true → user adalah pembuat, boleh lihat daftar pembaca
  isCreator: boolean;
  currentUserId: string | undefined;
  // Optional onChange ke parent (kalau perlu re-sort/list update)
  onUpdate?: () => void;
}

export default function AnnouncementCardExtras({
  orgId,
  announcementId,
  initialReadCount,
  initialCommentCount,
  hasReadInitial,
  isCreator,
  currentUserId,
  onUpdate,
}: Props) {
  const [reactions, setReactions] = useState<ReactionBucket[]>([]);
  const [readCount, setReadCount] = useState(initialReadCount);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [readersOpen, setReadersOpen] = useState(false);
  const [readers, setReaders] = useState<any[]>([]);
  const [unreaders, setUnreaders] = useState<any[]>([]);
  const [readersLoading, setReadersLoading] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [members, setMembers] = useState<{ id: string; name: string; avatar_url?: string | null }[]>([]);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const markedRead = useRef(hasReadInitial);
  const base = `/organizations/${orgId}/announcements/${announcementId}`;

  // 1. Auto-mark read setelah 1.2 detik in-viewport
  useEffect(() => {
    if (markedRead.current || !cardRef.current) return;
    const node = cardRef.current;
    let timer: any;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !markedRead.current) {
          timer = setTimeout(async () => {
            if (markedRead.current) return;
            markedRead.current = true;
            try {
              await api.post(`${base}/read`);
              setReadCount((n) => n + (hasReadInitial ? 0 : 1));
              onUpdate?.();
            } catch {
              markedRead.current = false; // allow retry
            }
          }, 1200);
        } else {
          if (timer) clearTimeout(timer);
        }
      }
    }, { threshold: 0.4 });
    obs.observe(node);
    return () => { obs.disconnect(); if (timer) clearTimeout(timer); };
  }, [announcementId, base, hasReadInitial, onUpdate]);

  // 2. Initial fetch reaksi
  useEffect(() => {
    api.get(`${base}/reactions`).then((res) => setReactions(res.data || [])).catch(() => {});
  }, [base]);

  const toggleReaction = async (emoji: string) => {
    // Optimistic toggle
    setReactions((prev) => {
      const idx = prev.findIndex((r) => r.emoji === emoji);
      if (idx >= 0) {
        const cur = prev[idx];
        const nextCount = cur.mine ? cur.count - 1 : cur.count + 1;
        if (nextCount <= 0) return prev.filter((_, i) => i !== idx);
        const updated = [...prev];
        updated[idx] = { ...cur, count: nextCount, mine: !cur.mine };
        return updated;
      }
      return [...prev, { emoji, count: 1, mine: true, users: [] }];
    });
    setPickerOpen(false);
    try {
      await api.post(`${base}/reactions/${encodeURIComponent(emoji)}`);
      const res = await api.get(`${base}/reactions`);
      setReactions(res.data || []);
    } catch {
      // Refetch on error to revert
      try {
        const res = await api.get(`${base}/reactions`);
        setReactions(res.data || []);
      } catch { /* ignore */ }
    }
  };

  const openComments = async () => {
    setCommentsOpen((v) => !v);
    if (!commentsOpen) {
      // Comments + members — lazy load: cuma di-fetch waktu user buka panel,
      // gak setiap card mount (kalau N pengumuman = N request, mahal).
      if (comments.length === 0) {
        try {
          const res = await api.get(`${base}/comments`);
          setComments(res.data || []);
        } catch { /* ignore */ }
      }
      if (members.length === 0) {
        try {
          const res = await api.get(`/organizations/${orgId}/members`);
          setMembers(
            (res.data || [])
              .filter((m: any) => m.user)
              .map((m: any) => ({ id: m.user_id || m.user.id, name: m.user.name, avatar_url: m.user.avatar_url })),
          );
        } catch { /* ignore */ }
      }
    }
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setPosting(true);
    try {
      const res = await api.post(`${base}/comments`, { content: commentText.trim(), mention_ids: mentionIds });
      setComments((p) => [...p, res.data]);
      setCommentText("");
      setMentionIds([]);
      setCommentCount((n) => n + 1);
    } catch { /* ignore */ } finally {
      setPosting(false);
    }
  };

  const deleteComment = async (id: string) => {
    if (!confirm("Hapus komentar ini?")) return;
    try {
      await api.delete(`${base}/comments/${id}`);
      setComments((p) => p.filter((c) => c.id !== id));
      setCommentCount((n) => Math.max(0, n - 1));
    } catch { /* ignore */ }
  };

  const openReaders = async () => {
    setReadersOpen(true);
    setReadersLoading(true);
    try {
      const res = await api.get(`${base}/read-status`);
      setReaders(res.data?.readers || []);
      setUnreaders(res.data?.unreaders || []);
    } catch {
      // fallback ke endpoint lama kalau read-status belum di-deploy
      try {
        const r = await api.get(`${base}/readers`);
        setReaders(r.data || []);
        setUnreaders([]);
      } catch { /* ignore */ }
    } finally {
      setReadersLoading(false);
    }
  };

  return (
    <div ref={cardRef} className="mt-6 pt-4 border-t border-border space-y-3">
      {/* Reaction row + counters */}
      <div className="flex flex-wrap items-center gap-2">
        {reactions.map((r) => (
          <button
            key={r.emoji}
            onClick={() => toggleReaction(r.emoji)}
            title={r.users.map((u) => u.name).join(", ")}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border transition-all",
              r.mine
                ? "bg-primary/10 border-primary text-primary"
                : "bg-secondary/30 border-border hover:border-primary/40",
            )}
          >
            <span className="text-sm">{r.emoji}</span>
            <span>{r.count}</span>
          </button>
        ))}
        {/* Picker emoji cepat */}
        <div className="relative">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-secondary/30 border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
          >
            <Smile className="w-3.5 h-3.5" />
            Reaksi
          </button>
          {pickerOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute left-0 top-full mt-1 z-10 p-2 rounded-xl border border-border bg-card shadow-lg flex gap-1"
            >
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => toggleReaction(e)}
                  className="w-8 h-8 rounded-md hover:bg-secondary transition-colors text-base"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          {/* Read receipt */}
          {isCreator ? (
            <button onClick={openReaders} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
              <Eye className="w-3 h-3" /> {readCount} dibaca
            </button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Eye className="w-3 h-3" /> {readCount} dibaca
            </span>
          )}
          {/* Comments toggle */}
          <button onClick={openComments} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
            <MessageCircle className="w-3 h-3" /> {commentCount} komentar
          </button>
        </div>
      </div>

      {/* Readers modal (creator only) — dua kolom: sudah baca + belum */}
      {readersOpen && isCreator && (
        <Modal isOpen={readersOpen} onClose={() => setReadersOpen(false)} title="Status Baca Pengumuman">
          {readersLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
              {/* Sudah baca */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600">
                  <Check className="w-3.5 h-3.5" />
                  Sudah Baca ({readers.length})
                </div>
                {readers.length === 0 ? (
                  <p className="text-[11px] italic text-muted-foreground p-3 border border-dashed border-border rounded-xl">
                    Belum ada yang baca.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {readers.map((u) => (
                      <div key={u.id} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                        <span className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                          {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.name || "?").charAt(0)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{u.name}</p>
                          {u.read_at && (
                            <p className="text-[9px] text-muted-foreground">
                              {(() => {
                                try { return formatDistanceToNow(new Date(u.read_at), { addSuffix: true, locale: idLocale }); }
                                catch { return ""; }
                              })()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Belum baca */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  Belum Baca ({unreaders.length})
                </div>
                {unreaders.length === 0 ? (
                  <p className="text-[11px] italic text-emerald-600 p-3 border border-dashed border-emerald-500/30 rounded-xl bg-emerald-500/5">
                    Semua sudah baca 🎉
                  </p>
                ) : (
                  <div className="space-y-1">
                    {unreaders.map((u) => (
                      <div key={u.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 border border-border">
                        <span className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                          {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.name || "?").charAt(0)}
                        </span>
                        <p className="text-xs font-bold truncate flex-1">{u.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Comments thread */}
      {commentsOpen && (
        <div className="rounded-xl border border-border bg-secondary/10 p-3 space-y-3">
          {comments.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {comments.map((c) => {
                const isMine = currentUserId && c.user?.id === currentUserId;
                const canDelete = isMine || isCreator;
                return (
                  <div key={c.id} className="flex items-start gap-2 group">
                    <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                      {c.user?.avatar_url ? (
                        <img src={c.user.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (c.user?.name || "?").charAt(0)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="bg-card border border-border rounded-xl rounded-tl-sm px-3 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold">{c.user?.name || "Anonim"}</span>
                          <span className="text-[9px] text-muted-foreground">
                            {(() => { try { return formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: idLocale }); } catch { return ""; } })()}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
                      </div>
                    </div>
                    {canDelete && (
                      <button
                        onClick={() => deleteComment(c.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                        title="Hapus"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <form onSubmit={submitComment} className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <MentionTextarea
                value={commentText}
                onChange={setCommentText}
                onMentionsChange={setMentionIds}
                members={members}
                placeholder="Tulis komentar… ketik @ untuk tag orang"
                className="w-full px-3 py-2 text-xs bg-card border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none min-h-[36px]"
              />
            </div>
            <button
              type="submit"
              disabled={posting || !commentText.trim()}
              className="p-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 hover:shadow-md transition-all"
            >
              {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
