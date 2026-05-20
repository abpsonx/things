"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  Megaphone,
  Plus,
  Loader2,
  Trash2,
  Edit,
  Clock,
  User,
  X,
  ArrowLeft,
  Users,
  CalendarClock,
  MessageSquare,
  Send,
  Check,
} from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { useAuthStore } from "@/store/useAuthStore";
import TeamNav from "@/components/team/TeamNav";
import MemberMultiSelect from "@/components/ui/MemberMultiSelect";
import { cn } from "@/lib/utils";
import { format, isValid } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface Recipient { id: string; name: string; avatar_url?: string | null; }
interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  expires_at?: string | null;
  is_expired?: boolean;
  creator_id?: string;
  creator: { id?: string; name: string; avatar_url?: string } | null;
  recipients: Recipient[];
  comment_count: number;
}

export default function TeamAnnouncementsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;
  const { user } = useAuthStore();

  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [recipientIds, setRecipientIds] = useState<string[]>([]); // empty = semua
  const [submitting, setSubmitting] = useState(false);

  // Comments
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);

  const refresh = useCallback(async () => {
    const res = await api.get(`/organizations/${orgId}/teams/${teamId}/announcements`);
    setAnnouncements(res.data || []);
  }, [orgId, teamId]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [teamRes, annRes, memRes] = await Promise.all([
          api.get(`/organizations/${orgId}/teams/${teamId}`),
          api.get(`/organizations/${orgId}/teams/${teamId}/announcements`),
          api.get(`/organizations/${orgId}/teams/${teamId}/members`),
        ]);
        setTeam(teamRes.data);
        setAnnouncements(annRes.data || []);
        setMembers(memRes.data || []);
      } catch (err) {
        console.error("Failed to fetch team announcements", err);
      } finally {
        setLoading(false);
      }
    };
    if (orgId && teamId) fetchData();
  }, [orgId, teamId]);

  const memberOptions: Recipient[] = members
    .filter((m: any) => m.user)
    .map((m: any) => ({ id: m.user_id || m.user.id, name: m.user.name, avatar_url: m.user.avatar_url }));

  const handleSubmit = async () => {
    if (!title || !content) return;
    setSubmitting(true);
    try {
      const payload: any = {
        title,
        content,
        expires_at: expiresAt ? `${expiresAt}:00` : null,
        recipient_ids: recipientIds,
      };
      if (isEditing) {
        await api.put(`/organizations/${orgId}/teams/${teamId}/announcements/${isEditing}`, payload);
      } else {
        await api.post(`/organizations/${orgId}/teams/${teamId}/announcements`, payload);
      }
      await refresh();
      resetForm();
    } catch (err) {
      console.error("Failed to save announcement", err);
      alert("Gagal menyimpan pengumuman.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus pengumuman ini?")) return;
    try {
      await api.delete(`/organizations/${orgId}/teams/${teamId}/announcements/${id}`);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  const resetForm = () => {
    setTitle("");
    setContent("");
    setExpiresAt("");
    setRecipientIds([]);
    setIsCreating(false);
    setIsEditing(null);
  };

  const startEdit = (a: Announcement) => {
    setTitle(a.title);
    setContent(a.content);
    setExpiresAt(a.expires_at ? a.expires_at.slice(0, 16) : "");
    setRecipientIds((a.recipients || []).map((r) => r.id));
    setIsEditing(a.id);
    setIsCreating(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleRecipient = (id: string) => {
    setRecipientIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openCommentThread = async (id: string) => {
    if (openComments === id) {
      setOpenComments(null);
      return;
    }
    setOpenComments(id);
    setLoadingComments(true);
    try {
      const res = await api.get(`/organizations/${orgId}/teams/${teamId}/announcements/${id}/comments`);
      setComments(res.data || []);
    } catch (err) {
      console.error("Failed to load comments", err);
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  const postComment = async (id: string) => {
    if (!commentText.trim()) return;
    try {
      const res = await api.post(`/organizations/${orgId}/teams/${teamId}/announcements/${id}/comments`, { content: commentText });
      setComments((prev) => [...prev, res.data]);
      setCommentText("");
      setAnnouncements((prev) => prev.map((a) => a.id === id ? { ...a, comment_count: a.comment_count + 1 } : a));
    } catch (err) {
      console.error("Failed to post comment", err);
    }
  };

  const deleteComment = async (annId: string, commentId: string) => {
    try {
      await api.delete(`/organizations/${orgId}/teams/${teamId}/announcements/${annId}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setAnnouncements((prev) => prev.map((a) => a.id === annId ? { ...a, comment_count: Math.max(0, a.comment_count - 1) } : a));
    } catch (err) {
      console.error("Failed to delete comment", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#fafafa] dark:bg-background">
      {/* Header */}
      <div className="border-b border-border px-8 py-5 flex items-center justify-between bg-white/80 dark:bg-card/60 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-500/20">
              <Megaphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">{team?.name}</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Pengumuman Tim</p>
            </div>
          </div>
        </div>
        {!isCreating && (
          <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all">
            <Plus className="w-4 h-4" />
            Buat Baru
          </button>
        )}
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="flex-1 p-8 max-w-4xl mx-auto w-full space-y-8 pb-24">
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Create/Edit form */}
            {isCreating && (
              <div className="bg-card border border-border rounded-3xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">{isEditing ? "Edit Pengumuman" : "Pengumuman Baru"}</h3>
                  <button onClick={resetForm} className="p-2 hover:bg-secondary rounded-full"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-5">
                  <input
                    type="text"
                    placeholder="Judul pengumuman..."
                    className="w-full bg-transparent text-2xl font-bold outline-none border-b border-border pb-2 focus:border-primary transition-colors"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <div className="min-h-[200px]">
                    <RichTextEditor content={content} onChange={setContent} placeholder="Tulis isi pengumuman..." />
                  </div>

                  {/* Tenggat waktu */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5" /> Tenggat Waktu (opsional)
                    </label>
                    <input
                      type="datetime-local"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {/* Penerima */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Penerima
                    </label>
                    <MemberMultiSelect
                      members={memberOptions}
                      selectedIds={recipientIds}
                      onChange={setRecipientIds}
                      emptyLabel="Semua anggota tim"
                    />
                    {recipientIds.length === 0 && (
                      <p className="text-[10px] text-muted-foreground italic">Kosongkan = dikirim ke semua anggota tim.</p>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={resetForm} className="px-6 py-2 rounded-xl font-bold text-muted-foreground hover:bg-secondary transition-colors">Batal</button>
                    <button onClick={handleSubmit} disabled={submitting || !title || !content} className="px-8 py-2 bg-primary text-primary-foreground rounded-xl font-bold disabled:opacity-50 flex items-center gap-2">
                      {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isEditing ? "Update" : "Publish"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* List */}
            <div className="space-y-6">
              {announcements.length === 0 ? (
                <div className="text-center py-24 border border-dashed border-border rounded-3xl space-y-4">
                  <Megaphone className="w-12 h-12 text-muted-foreground mx-auto opacity-20" />
                  <h3 className="font-bold text-xl">Belum ada pengumuman</h3>
                  <p className="text-muted-foreground">Bagikan info penting untuk anggota tim.</p>
                </div>
              ) : (
                announcements.map((a) => {
                  const mine = a.creator_id === user?.id || a.creator?.id === user?.id;
                  const expDate = a.expires_at ? new Date(a.expires_at) : null;
                  return (
                    <div key={a.id} className={cn("bg-card border rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow relative group", a.is_expired ? "border-border opacity-75" : "border-border")}>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden">
                            {a.creator?.avatar_url ? (
                              <img src={a.creator.avatar_url} alt={a.creator.name} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-6 h-6 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-bold">{a.creator?.name || "User"}</h4>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {new Date(a.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {mine && (
                            <button onClick={() => startEdit(a)} className="p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-primary"><Edit className="w-4 h-4" /></button>
                          )}
                          <button onClick={() => handleDelete(a.id)} className="p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>

                      {/* Meta badges */}
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        {expDate && isValid(expDate) && (
                          <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold", a.is_expired ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700")}>
                            <CalendarClock className="w-3 h-3" />
                            {a.is_expired ? "Berakhir" : "Tenggat"} {format(expDate, "d MMM yyyy HH:mm", { locale: idLocale })}
                          </span>
                        )}
                        {a.recipients && a.recipients.length > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-secondary text-muted-foreground" title={a.recipients.map((r) => r.name).join(", ")}>
                            <Users className="w-3 h-3" /> {a.recipients.length} penerima
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-secondary text-muted-foreground">
                            <Users className="w-3 h-3" /> Semua anggota
                          </span>
                        )}
                      </div>

                      <h3 className="text-2xl font-bold mb-4">{a.title}</h3>
                      <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: a.content }} />

                      {/* Comments toggle */}
                      <button onClick={() => openCommentThread(a.id)} className="mt-6 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary transition-colors">
                        <MessageSquare className="w-4 h-4" />
                        {a.comment_count > 0 ? `${a.comment_count} komentar` : "Tanya / komentar"}
                      </button>

                      {openComments === a.id && (
                        <div className="mt-4 pt-4 border-t border-border space-y-3">
                          {loadingComments ? (
                            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                          ) : (
                            <>
                              {comments.map((c) => (
                                <div key={c.id} className="flex gap-3 group/comment">
                                  <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                                    {c.user?.avatar_url ? <img src={c.user.avatar_url} alt="" className="w-full h-full object-cover" /> : (c.user?.name || "?").charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold">{c.user?.name}</span>
                                      <span className="text-[10px] text-muted-foreground">{c.created_at ? format(new Date(c.created_at), "d MMM HH:mm", { locale: idLocale }) : ""}</span>
                                      {(c.user_id === user?.id) && (
                                        <button onClick={() => deleteComment(a.id, c.id)} className="opacity-0 group-hover/comment:opacity-100 text-muted-foreground hover:text-red-500 transition-all"><Trash2 className="w-3 h-3" /></button>
                                      )}
                                    </div>
                                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">{c.content}</p>
                                  </div>
                                </div>
                              ))}
                              {comments.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Belum ada komentar. Tanyakan sesuatu!</p>}
                              <div className="flex gap-2 pt-2">
                                <input
                                  value={commentText}
                                  onChange={(e) => setCommentText(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(a.id); } }}
                                  placeholder="Tulis komentar / pertanyaan..."
                                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                                <button onClick={() => postComment(a.id)} disabled={!commentText.trim()} className="px-3 py-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-50">
                                  <Send className="w-4 h-4" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
