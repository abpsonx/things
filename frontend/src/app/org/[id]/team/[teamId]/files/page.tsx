"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Download,
  Loader2,
  UploadCloud,
  Trash2,
  Plus,
  File as FileIcon,
  BookOpen,
  Paperclip,
  X,
} from "lucide-react";
import api from "@/lib/api";
import TeamNav from "@/components/team/TeamNav";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/lib/utils";

type Tab = "files" | "wiki" | "tasks";

export default function TeamFilesPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;
  const { user } = useAuthStore();

  const [team, setTeam] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("files");
  const [loading, setLoading] = useState(true);

  const [directFiles, setDirectFiles] = useState<any[]>([]);
  const [taskFiles, setTaskFiles] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wiki editor state
  const [editingDoc, setEditingDoc] = useState<any | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [savingDoc, setSavingDoc] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [teamRes, directRes, tasksRes, docsRes] = await Promise.all([
        api.get(`/organizations/${orgId}/teams/${teamId}`),
        api.get(`/organizations/${orgId}/teams/${teamId}/files-direct`),
        api.get(`/organizations/${orgId}/teams/${teamId}/tasks`),
        api.get(`/organizations/${orgId}/teams/${teamId}/docs`),
      ]);
      setTeam(teamRes.data);
      setDirectFiles(directRes.data || []);
      setDocs(docsRes.data || []);
      const tf: any[] = [];
      (tasksRes.data || []).forEach((t: any) => {
        (t.attachments || []).forEach((a: any) => tf.push({ ...a, task_title: t.title, task_id: t.id }));
      });
      setTaskFiles(tf);
    } catch (err) {
      console.error("Failed to fetch team docs", err);
    } finally {
      setLoading(false);
    }
  }, [orgId, teamId]);

  useEffect(() => {
    if (orgId && teamId) fetchAll();
  }, [orgId, teamId, fetchAll]);

  const formatSize = (b?: number) => {
    if (!b) return "—";
    const k = 1024, sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/organizations/${orgId}/teams/${teamId}/files-direct`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await fetchAll();
    } catch (err) {
      console.error("Upload failed", err);
      alert("Gagal upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteFile = async (id: string) => {
    if (!confirm("Hapus file ini?")) return;
    try {
      await api.delete(`/organizations/${orgId}/teams/${teamId}/files-direct/${id}`);
      setDirectFiles((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const openNewDoc = () => {
    setEditingDoc({ id: null });
    setDocTitle("");
    setDocContent("");
  };
  const openEditDoc = (d: any) => {
    setEditingDoc(d);
    setDocTitle(d.title);
    setDocContent(d.content || "");
  };
  const saveDoc = async () => {
    if (!docTitle.trim()) return;
    setSavingDoc(true);
    try {
      if (editingDoc?.id) {
        await api.patch(`/organizations/${orgId}/teams/${teamId}/docs/${editingDoc.id}`, { title: docTitle, content: docContent });
      } else {
        await api.post(`/organizations/${orgId}/teams/${teamId}/docs`, { title: docTitle, content: docContent });
      }
      setEditingDoc(null);
      await fetchAll();
    } catch (err) {
      console.error("Save doc failed", err);
      alert("Gagal menyimpan dokumen");
    } finally {
      setSavingDoc(false);
    }
  };
  const deleteDoc = async (id: string) => {
    if (!confirm("Hapus dokumen ini?")) return;
    try {
      await api.delete(`/organizations/${orgId}/teams/${teamId}/docs/${id}`);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Delete doc failed", err);
    }
  };

  const TABS: { key: Tab; label: string; icon: any; count: number }[] = [
    { key: "files", label: "File Tim", icon: UploadCloud, count: directFiles.length },
    { key: "wiki", label: "Wiki / Catatan", icon: BookOpen, count: docs.length },
    { key: "tasks", label: "Dari Task", icon: Paperclip, count: taskFiles.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background dark:bg-background">
      {/* Header */}
      <div className="border-b border-border px-8 py-5 flex items-center justify-between bg-card/80 dark:bg-card/60 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-500/20">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">{team?.name}</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Dokumen Tim</p>
            </div>
          </div>
        </div>
        {tab === "files" && (
          <label className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            Upload File
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
        {tab === "wiki" && (
          <button onClick={openNewDoc} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all">
            <Plus className="w-4 h-4" /> Catatan Baru
          </button>
        )}
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="flex-1 p-8 max-w-5xl mx-auto w-full space-y-6">
        {/* Sub-tabs */}
        <div className="flex items-center gap-1 bg-secondary/40 p-1 rounded-2xl w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                tab === t.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              <span className="text-[10px] opacity-60">{t.count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* File Tim */}
            {tab === "files" && (
              <div className="space-y-2">
                {directFiles.length === 0 ? (
                  <div className="text-center py-20 border border-dashed border-border rounded-3xl space-y-3">
                    <UploadCloud className="w-10 h-10 text-muted-foreground mx-auto opacity-20" />
                    <p className="text-sm font-medium">Belum ada file. Klik "Upload File" untuk mulai.</p>
                  </div>
                ) : (
                  directFiles.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-2xl group hover:shadow-sm transition-shadow">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <FileIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{f.file_name}</p>
                        <p className="text-[11px] text-muted-foreground">{formatSize(f.file_size)} · {f.uploader?.name}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a href={f.file_url} target="_blank" rel="noreferrer" className="p-2 hover:bg-secondary rounded-xl text-muted-foreground hover:text-primary"><Download className="w-4 h-4" /></a>
                        {(f.uploader?.id === user?.id) && (
                          <button onClick={() => deleteFile(f.id)} className="p-2 hover:bg-red-50 rounded-xl text-muted-foreground hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Wiki */}
            {tab === "wiki" && (
              <div className="space-y-3">
                {docs.length === 0 ? (
                  <div className="text-center py-20 border border-dashed border-border rounded-3xl space-y-3">
                    <BookOpen className="w-10 h-10 text-muted-foreground mx-auto opacity-20" />
                    <p className="text-sm font-medium">Belum ada catatan tim. Bikin yang pertama.</p>
                  </div>
                ) : (
                  docs.map((d) => (
                    <div key={d.id} className="bg-card border border-border rounded-2xl p-5 group hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="text-base font-bold">{d.title}</h3>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => openEditDoc(d)} className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-primary"><FileText className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteDoc(d.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground line-clamp-3" dangerouslySetInnerHTML={{ __html: d.content || "<p class='italic'>Kosong</p>" }} />
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Dari Task */}
            {tab === "tasks" && (
              <div className="space-y-2">
                {taskFiles.length === 0 ? (
                  <div className="text-center py-20 border border-dashed border-border rounded-3xl space-y-3">
                    <Paperclip className="w-10 h-10 text-muted-foreground mx-auto opacity-20" />
                    <p className="text-sm font-medium">Belum ada lampiran dari task.</p>
                  </div>
                ) : (
                  taskFiles.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-2xl group hover:shadow-sm transition-shadow">
                      <div className="w-10 h-10 rounded-xl bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                        <Paperclip className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{f.file_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{formatSize(f.file_size)} · dari task "{f.task_title}"</p>
                      </div>
                      <a
                        href={f.file_path?.startsWith("http") || f.file_path?.startsWith("/") ? f.file_path : `/api/uploads/${f.file_path}`}
                        target="_blank" rel="noreferrer"
                        className="p-2 hover:bg-secondary rounded-xl text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Wiki editor modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingDoc(null)}>
          <div className="bg-card rounded-3xl w-full max-w-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-bold">{editingDoc.id ? "Edit Catatan" : "Catatan Baru"}</h2>
              <button onClick={() => setEditingDoc(null)} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <input
                autoFocus
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Judul catatan..."
                className="w-full bg-transparent text-xl font-bold outline-none border-b border-border pb-2 focus:border-primary transition-colors"
              />
              <div className="min-h-[240px]">
                <RichTextEditor content={docContent} onChange={setDocContent} placeholder="Tulis catatan tim..." />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setEditingDoc(null)} disabled={savingDoc} className="px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50">Batal</button>
              <button onClick={saveDoc} disabled={savingDoc || !docTitle.trim()} className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50">
                {savingDoc && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
