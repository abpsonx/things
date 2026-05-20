"use client";

import React, { useEffect, useState } from "react";
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
} from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { useAuthStore } from "@/store/useAuthStore";
import TeamNav from "@/components/team/TeamNav";

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  creator_id?: string;
  creator: { id?: string; name: string; avatar_url?: string } | null;
}

export default function TeamAnnouncementsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;
  const { user } = useAuthStore();

  const [team, setTeam] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [teamRes, annRes] = await Promise.all([
          api.get(`/organizations/${orgId}/teams/${teamId}`),
          api.get(`/organizations/${orgId}/teams/${teamId}/announcements`),
        ]);
        setTeam(teamRes.data);
        setAnnouncements(annRes.data || []);
      } catch (err) {
        console.error("Failed to fetch team announcements", err);
      } finally {
        setLoading(false);
      }
    };
    if (orgId && teamId) fetchData();
  }, [orgId, teamId]);

  const refresh = async () => {
    const res = await api.get(`/organizations/${orgId}/teams/${teamId}/announcements`);
    setAnnouncements(res.data || []);
  };

  const handleSubmit = async () => {
    if (!title || !content) return;
    setSubmitting(true);
    try {
      if (isEditing) {
        await api.put(`/organizations/${orgId}/teams/${teamId}/announcements/${isEditing}`, { title, content });
      } else {
        await api.post(`/organizations/${orgId}/teams/${teamId}/announcements`, { title, content });
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
    setIsCreating(false);
    setIsEditing(null);
  };

  const startEdit = (a: Announcement) => {
    setTitle(a.title);
    setContent(a.content);
    setIsEditing(a.id);
    setIsCreating(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#fafafa] dark:bg-background">
      {/* Header */}
      <div className="border-b border-border px-8 py-5 flex items-center justify-between bg-white/80 dark:bg-card/60 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
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
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            Buat Baru
          </button>
        )}
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="flex-1 p-8 max-w-4xl mx-auto w-full space-y-8 pb-24">
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Create/Edit form */}
            {isCreating && (
              <div className="bg-card border border-border rounded-3xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">{isEditing ? "Edit Pengumuman" : "Pengumuman Baru"}</h3>
                  <button onClick={resetForm} className="p-2 hover:bg-secondary rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Judul pengumuman..."
                    className="w-full bg-transparent text-2xl font-bold outline-none border-b border-border pb-2 focus:border-primary transition-colors"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <div className="min-h-[260px]">
                    <RichTextEditor content={content} onChange={setContent} placeholder="Tulis isi pengumuman di sini..." />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={resetForm} className="px-6 py-2 rounded-xl font-bold text-muted-foreground hover:bg-secondary transition-colors">
                      Batal
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || !title || !content}
                      className="px-8 py-2 bg-primary text-primary-foreground rounded-xl font-bold disabled:opacity-50 flex items-center gap-2"
                    >
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
                  return (
                    <div key={a.id} className="bg-card border border-border rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow relative group">
                      <div className="flex items-start justify-between mb-6">
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
                              {new Date(a.created_at).toLocaleDateString("id-ID", {
                                day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {mine && (
                            <button onClick={() => startEdit(a)} className="p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-primary">
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => handleDelete(a.id)} className="p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-2xl font-bold mb-4">{a.title}</h3>
                      <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: a.content }} />
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
