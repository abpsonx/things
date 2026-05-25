"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, Search, UserPlus, Loader2, Check } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

interface OrgMember {
  id: string;
  user_id: string;
  role: string;
  user?: { id: string; name: string; email: string; avatar_url?: string | null };
}

interface ProjectMember {
  id: string;
  user_id: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  projectId: string;
  existingMembers: ProjectMember[];
  onAdded: () => void;
}

export default function InviteProjectMemberModal({
  isOpen,
  onClose,
  orgId,
  projectId,
  existingMembers,
  onAdded,
}: Props) {
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api
      .get(`/organizations/${orgId}`)
      .then((res) => setOrgMembers(res.data.members || []))
      .catch(() => toast.error("Gagal memuat daftar anggota workspace"))
      .finally(() => setLoading(false));
  }, [isOpen, orgId]);

  const existingUserIds = useMemo(
    () => new Set(existingMembers.map((m) => m.user_id)),
    [existingMembers],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orgMembers.filter((m) => {
      if (!m.user) return false;
      if (!q) return true;
      return (
        m.user.name.toLowerCase().includes(q) ||
        m.user.email.toLowerCase().includes(q)
      );
    });
  }, [orgMembers, query]);

  const handleAdd = async (m: OrgMember) => {
    if (!m.user) return;
    setAddingId(m.user_id);
    try {
      await api.post(`/organizations/${orgId}/projects/${projectId}/members`, {
        email: m.user.email,
        role: "member",
      });
      toast.success(`${m.user.name} ditambahkan ke project`);
      onAdded();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menambahkan anggota");
    } finally {
      setAddingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-3xl w-full max-w-md shadow-2xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm">
              <UserPlus className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Tambah Anggota Project</h2>
              <p className="text-[11px] text-muted-foreground">Pilih dari anggota workspace</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama atau email..."
              className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-border bg-secondary/30 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {query ? "Tidak ada yang cocok" : "Belum ada anggota workspace"}
            </div>
          ) : (
            filtered.map((m) => {
              if (!m.user) return null;
              const inProject = existingUserIds.has(m.user_id);
              const isAdding = addingId === m.user_id;
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
                      {m.user.avatar_url ? (
                        <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        m.user.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{m.user.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{m.user.email}</p>
                    </div>
                  </div>
                  {inProject ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 shrink-0 px-2.5 py-1.5 bg-emerald-50 rounded-xl">
                      <Check className="w-3 h-3" /> Anggota
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAdd(m)}
                      disabled={isAdding}
                      className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold hover:bg-primary/90 disabled:opacity-50 shrink-0 transition-all"
                    >
                      {isAdding ? "..." : "Tambah"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
