"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { 
  Settings, 
  Trash2, 
  Save, 
  Loader2, 
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProjectSettingsPage() {
  const { id: orgId, projectId } = useParams();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await api.get(`/organizations/${orgId}/projects/${projectId}`);
        setName(res.data.name);
        setDescription(res.data.description || "");
      } catch (err) {
        console.error("Failed to fetch project", err);
      } finally {
        setLoading(false);
      }
    };
    if (orgId && projectId) fetchProject();
  }, [orgId, projectId]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.put(`/organizations/${orgId}/projects/${projectId}`, { name, description });
      setMessage({ type: "success", text: "Proyek berhasil diperbarui!" });
    } catch (err) {
      setMessage({ type: "error", text: "Gagal memperbarui proyek." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Apakah kamu yakin ingin menghapus proyek ini? Semua data tugas akan hilang selamanya.")) return;
    
    try {
      await api.delete(`/organizations/${orgId}/projects/${projectId}`);
      router.push(`/org/${orgId}`);
    } catch (err) {
      alert("Gagal menghapus proyek.");
    }
  };

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-8">
        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Detail Proyek
          </h2>

          <form onSubmit={handleUpdate} className="space-y-4">
            {message && (
              <div className={cn(
                "p-3 rounded-md text-sm flex items-center gap-2",
                message.type === "success" ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-destructive/10 text-destructive border border-destructive/20"
              )}>
                {message.type === "success" && <CheckCircle2 className="w-4 h-4" />}
                {message.text}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Nama Proyek</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Deskripsi</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring transition-all min-h-[100px]"
                placeholder="Apa tujuan proyek ini?"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan Perubahan
            </button>
          </form>
        </div>

        {/* Danger Zone */}
        <div className="p-6 border border-destructive/20 rounded-2xl bg-destructive/5 space-y-4">
          <div className="flex items-center gap-2 text-destructive font-bold">
            <AlertTriangle className="w-5 h-5" />
            Zona Bahaya
          </div>
          <p className="text-xs text-muted-foreground">
            Menghapus proyek akan menghapus semua data papan kanban, diskusi, dan file yang terkait secara permanen. Tindakan ini tidak dapat dibatalkan.
          </p>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-bold hover:bg-destructive/90 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Hapus Proyek Ini
          </button>
      </div>
    </div>
  );
}
