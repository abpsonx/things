"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import api from "@/lib/api";
import { 
  FileText, Plus, Search, MoreVertical, Edit, Trash2, 
  Save, X, Loader2, FileIcon
} from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { cn } from "@/lib/utils";

export default function DocsPage() {
  const { id: orgId, projectId } = useParams();
  const { user } = useAuthStore();
  
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeDoc, setActiveDoc] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchDocs();
  }, [projectId]);

  const fetchDocs = async () => {
    try {
      const res = await api.get(`/projects/${projectId}/docs`);
      setDocs(res.data);
      if (res.data.length > 0 && !activeDoc) {
        setActiveDoc(res.data[0]);
      }
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await api.post(`/projects/${projectId}/docs`, {
        title: "Dokumen Tanpa Judul",
        content: ""
      });
      setDocs([res.data, ...docs]);
      setActiveDoc(res.data);
      handleEdit(res.data);
    } catch (err) {
      console.error(err);
      alert("Gagal membuat dokumen baru");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!activeDoc || !editTitle.trim()) return;
    setSaving(true);
    try {
      const res = await api.patch(`/projects/${projectId}/docs/${activeDoc.id}`, {
        title: editTitle,
        content: editContent
      });
      
      setDocs(docs.map(d => d.id === res.data.id ? res.data : d));
      setActiveDoc(res.data);
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan dokumen");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Hapus dokumen ini secara permanen?")) return;
    
    try {
      await api.delete(`/projects/${projectId}/docs/${docId}`);
      const newDocs = docs.filter(d => d.id !== docId);
      setDocs(newDocs);
      if (activeDoc?.id === docId) {
        setActiveDoc(newDocs.length > 0 ? newDocs[0] : null);
        setIsEditing(false);
      }
    } catch (err) {
      console.error(err);
      alert("Gagal menghapus dokumen");
    }
  };

  const handleEdit = (doc: any) => {
    setEditTitle(doc.title);
    setEditContent(doc.content || "");
    setIsEditing(true);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filteredDocs = docs.filter(d => 
    d.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar: Document List */}
      <div className="w-80 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Wiki / Docs
            </h2>
            <button 
              onClick={handleCreate}
              disabled={saving}
              className="p-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari dokumen..." 
              className="w-full bg-secondary/50 border border-border pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredDocs.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-xs">
              {searchQuery ? "Tidak ada dokumen yang cocok." : "Belum ada dokumen."}
            </div>
          ) : (
            filteredDocs.map(doc => (
              <div
                key={doc.id}
                onClick={() => {
                  if (isEditing && activeDoc?.id !== doc.id) {
                    if(!confirm("Buang perubahan yang belum disimpan?")) return;
                  }
                  setActiveDoc(doc);
                  setIsEditing(false);
                }}
                className={cn(
                  "w-full flex flex-col items-start gap-2 p-3 rounded-xl transition-all text-left cursor-pointer group",
                  activeDoc?.id === doc.id 
                    ? "bg-primary/10 border border-primary/20" 
                    : "hover:bg-secondary border border-transparent"
                )}
              >
                <div className="flex items-start justify-between w-full gap-2">
                  <span className={cn(
                    "text-sm font-semibold truncate",
                    activeDoc?.id === doc.id ? "text-primary" : ""
                  )}>{doc.title}</span>
                  
                  {/* Quick Actions (visible on hover) */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDoc(doc);
                        handleEdit(doc);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(doc.id);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1 w-full text-[10px] text-muted-foreground">
                  <div className="flex items-center justify-between w-full">
                    <span className="flex items-center gap-1 truncate">
                      <div className="w-4 h-4 rounded-full bg-secondary border border-border flex items-center justify-center text-[7px] font-bold text-foreground">
                        {doc.creator?.name?.charAt(0) || '?'}
                      </div>
                      {doc.creator?.name || 'Unknown'}
                    </span>
                    <span>{new Date(doc.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                  <span className="opacity-80">
                    {new Date(doc.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content: Viewer/Editor */}
      <div className="flex-1 flex flex-col bg-background overflow-hidden relative">
        {activeDoc ? (
          isEditing ? (
            <div className="flex-1 flex flex-col p-6 lg:p-12 overflow-y-auto max-w-4xl mx-auto w-full">
              <div className="flex items-center justify-between mb-8">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Judul Dokumen..."
                  className="text-3xl lg:text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/50 w-full flex-1"
                />
                <div className="flex items-center gap-2 ml-4">
                  <button 
                    onClick={() => {
                      setIsEditing(false);
                      // If it's a new empty doc and canceled, maybe we should delete it. 
                      // But for simplicity just cancel edit.
                    }}
                    className="p-2 text-muted-foreground hover:bg-secondary rounded-xl transition-all"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={saving || !editTitle.trim()}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Simpan
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <RichTextEditor 
                  content={editContent} 
                  onChange={setEditContent} 
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-6 lg:p-12 overflow-y-auto max-w-4xl mx-auto w-full">
              <div className="flex items-center justify-between mb-6 group">
                <h1 className="text-3xl lg:text-4xl font-bold">{activeDoc.title}</h1>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleEdit(activeDoc)}
                    className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(activeDoc.id)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-3 mb-10 pb-6 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold">
                    {activeDoc.creator?.name?.charAt(0) || '?'}
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {activeDoc.creator?.name || 'Unknown'}
                  </span>
                </div>
                <div className="w-1 h-1 rounded-full bg-border" />
                <span className="text-xs text-muted-foreground">
                  Diperbarui {new Date(activeDoc.updated_at).toLocaleString()}
                </span>
              </div>

              {activeDoc.content ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <RichTextEditor 
                    content={activeDoc.content} 
                    onChange={() => {}} 
                    readOnly={true} 
                  />
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <FileIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>Dokumen ini masih kosong.</p>
                  <button 
                    onClick={() => handleEdit(activeDoc)}
                    className="mt-4 text-primary text-sm font-bold hover:underline"
                  >
                    Mulai menulis
                  </button>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-secondary/10">
            <div className="w-16 h-16 bg-card rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-border">
              <FileText className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Wiki Project</h3>
            <p className="text-sm mt-1 max-w-sm text-center">
              Buat dokumentasi, panduan, atau catatan meeting untuk dibagikan dengan tim.
            </p>
            <button 
              onClick={handleCreate}
              className="mt-6 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Buat Dokumen Pertama
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
