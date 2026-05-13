"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { 
  Megaphone, 
  Plus, 
  Loader2, 
  Trash2, 
  Edit,
  Clock,
  User,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { useAuthStore } from "@/store/useAuthStore";

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  creator: { name: string; avatar_url: string };
}

export default function AnnouncementsPage() {
  const { id: orgId, projectId } = useParams();
  const { user } = useAuthStore();
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
        const res = await api.get(`/projects/${projectId}/announcements`);
        setAnnouncements(res.data);
      } catch (err) {
        console.error("Failed to fetch announcements", err);
      } finally {
        setLoading(false);
      }
    };
    if (projectId) fetchData();
  }, [projectId]);

  const handleSubmit = async () => {
    if (!title || !content) return;
    setSubmitting(true);
    try {
      if (isEditing) {
        const res = await api.put(`/projects/${projectId}/announcements/${isEditing}`, { title, content });
        setAnnouncements(prev => prev.map(a => a.id === isEditing ? res.data : a));
      } else {
        const res = await api.post(`/projects/${projectId}/announcements`, { title, content });
        setAnnouncements(prev => [res.data, ...prev]);
      }
      resetForm();
    } catch (err) {
      console.error("Failed to save announcement", err);
      alert("Gagal menyimpan pengumuman. Pastikan Anda adalah manager di project ini.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus pengumuman ini?")) return;
    try {
      await api.delete(`/projects/${projectId}/announcements/${id}`);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="w-8 h-8 text-primary" />
            Pengumuman
          </h2>
          <p className="text-muted-foreground">Berbagi berita dan info penting untuk seluruh anggota tim.</p>
        </div>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
          >
            <Plus className="w-4 h-4" />
            Buat Baru
          </button>
        )}
      </div>

      {/* Create/Edit Form */}
      {isCreating && (
        <div className="bg-card border border-border rounded-3xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
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
            <div className="min-h-[300px]">
              <RichTextEditor
                content={content}
                onChange={setContent}
                placeholder="Tulis isi pengumuman di sini..."
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={resetForm}
                className="px-6 py-2 rounded-xl font-bold text-muted-foreground hover:bg-secondary transition-colors"
              >
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
            <p className="text-muted-foreground">Bagikan info penting untuk memulai diskusi.</p>
          </div>
        ) : (
          announcements.map((a) => (
            <div key={a.id} className="bg-card border border-border rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow relative group">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden">
                    {a.creator.avatar_url ? (
                      <img src={a.creator.avatar_url} alt={a.creator.name} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold">{a.creator.name}</h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {new Date(a.created_at).toLocaleDateString("id-ID", { 
                        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(a)} className="p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-primary">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(a.id)} className="p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-2xl font-bold mb-4">{a.title}</h3>
              <div 
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: a.content }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
