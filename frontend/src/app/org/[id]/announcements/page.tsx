"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { Megaphone, Plus, Loader2, Trash2, Edit, Clock, User, X, Users, Lock, CalendarClock, CheckSquare, Square } from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { extractMentionIds } from "@/components/ui/mentionSuggestion";
import { useAuthStore } from "@/store/useAuthStore";

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  creator: { name: string; avatar_url: string };
  recipient_ids?: string[]; // empty/missing = broadcast
  expires_at?: string | null;
  is_secret?: boolean;
}

type AudienceMode = "all" | "roles" | "users";
const ROLE_LABELS: Record<string, string> = {
  owner: "Admin",
  manager: "Manager",
  member: "Member",
};

const SUPERUSER_ROLES = ["super_user", "developer"];

export default function WorkspaceAnnouncementsPage() {
  const { id: orgId } = useParams();
  const { user } = useAuthStore();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isSecret, setIsSecret] = useState(false);
  const [expiresAt, setExpiresAt] = useState(""); // datetime-local string, empty = no deadline
  const formRef = useRef<HTMLDivElement>(null);

  // Mention list = teams first (so "@tim" is easy to find), then people.
  const memberOptions = [
    ...teams.map((t: any) => ({ id: `team:${t.id}`, name: `Tim ${t.name}` })),
    ...members
      .filter((m: any) => m.user)
      .map((m: any) => ({ id: m.user_id || m.user.id, name: m.user.name, avatar_url: m.user.avatar_url })),
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [annRes, orgRes, teamsRes] = await Promise.all([
          api.get(`/organizations/${orgId}/announcements`),
          api.get(`/organizations/${orgId}`),
          api.get(`/organizations/${orgId}/teams`).catch(() => ({ data: [] })),
        ]);
        setAnnouncements(annRes.data);
        setTeams(Array.isArray(teamsRes.data) ? teamsRes.data : []);
        const mems = orgRes.data?.members || [];
        setMembers(mems);
        const mine = mems.find((m: any) => m.user_id === user?.id);
        const isSuper = !!user && SUPERUSER_ROLES.includes((user as any).role);
        setCanManage(isSuper || mine?.role === "owner" || mine?.role === "manager");
      } catch (err) {
        console.error("Failed to fetch announcements", err);
      } finally {
        setLoading(false);
      }
    };
    if (orgId) fetchData();
  }, [orgId, user?.id]);

  const handleSubmit = async () => {
    if (!title || !content) return;
    setSubmitting(true);
    try {
      if (isEditing) {
        const payload: any = { title, content };
        payload.expires_at = expiresAt ? new Date(expiresAt).toISOString() : null;
        payload.is_secret = isSecret;
        const res = await api.put(`/organizations/${orgId}/announcements/${isEditing}`, payload);
        setAnnouncements((prev) => prev.map((a) => (a.id === isEditing ? res.data : a)));
      } else {
        const payload: any = {
          title,
          content,
          mention_ids: extractMentionIds(content),
          is_secret: isSecret,
        };
        if (expiresAt) payload.expires_at = new Date(expiresAt).toISOString();
        if (audienceMode === "roles") payload.target_roles = Array.from(selectedRoles);
        if (audienceMode === "users") payload.target_user_ids = Array.from(selectedUserIds);
        const res = await api.post(`/organizations/${orgId}/announcements`, payload);
        setAnnouncements((prev) => [res.data, ...prev]);
      }
      resetForm();
    } catch (err) {
      console.error("Failed to save announcement", err);
      alert("Gagal menyimpan pengumuman. Hanya Manager ke atas yang bisa posting pengumuman workspace.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus pengumuman ini?")) return;
    try {
      await api.delete(`/organizations/${orgId}/announcements/${id}`);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to delete", err);
      alert("Gagal menghapus pengumuman.");
    }
  };

  const resetForm = () => {
    setTitle("");
    setContent("");
    setIsCreating(false);
    setIsEditing(null);
    setAudienceMode("all");
    setSelectedRoles(new Set());
    setSelectedUserIds(new Set());
    setIsSecret(false);
    setExpiresAt("");
  };

  const toggleRole = (r: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r); else next.add(r);
      return next;
    });
  };

  const toggleUserId = (uid: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const audienceSummary = (a: Announcement) => {
    const rids = a.recipient_ids || [];
    // Backend strips recipient_ids for secret announcements when the viewer
    // isn't the creator — so empty + is_secret means "we just can't see".
    if (a.is_secret && rids.length === 0) return "Audiens disembunyikan";
    if (rids.length === 0) return "Untuk semua anggota";
    return `Untuk ${rids.length} orang`;
  };

  const startEdit = (a: Announcement) => {
    setTitle(a.title);
    setContent(a.content);
    setIsEditing(a.id);
    setIsCreating(true);
    setIsSecret(!!a.is_secret);
    // Convert ISO to datetime-local "YYYY-MM-DDTHH:mm" (strip seconds + Z).
    setExpiresAt(a.expires_at ? a.expires_at.slice(0, 16) : "");
  };

  const formatDeadline = (iso?: string | null): { label: string; expired: boolean } | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const expired = d.getTime() < Date.now();
    const label = d.toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    return { label, expired };
  };

  useEffect(() => {
    if (isCreating) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isCreating, isEditing]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="w-8 h-8 text-primary" />
            Pengumuman Workspace
          </h2>
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <Users className="w-4 h-4" /> Broadcast untuk seluruh anggota workspace.
          </p>
        </div>
        {canManage && !isCreating && (
          <button onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
            <Plus className="w-4 h-4" /> Buat Baru
          </button>
        )}
      </div>

      {isCreating && (
        <div ref={formRef} className="bg-card border border-border rounded-3xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4 duration-500 scroll-mt-4">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold">{isEditing ? "Edit Pengumuman" : "Pengumuman Baru"}</h3>
            <button onClick={resetForm} className="p-2 hover:bg-secondary rounded-full"><X className="w-5 h-5" /></button>
          </div>
          <div className="space-y-4">
            <input type="text" placeholder="Judul pengumuman..."
              className="w-full bg-transparent text-2xl font-bold outline-none border-b border-border pb-2 focus:border-primary transition-colors"
              value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="min-h-[300px]">
              <RichTextEditor content={content} onChange={setContent}
                placeholder="Tulis isi pengumuman di sini... ketik @ untuk tag orang" members={memberOptions} />
            </div>

            {/* Audience picker — only on CREATE. Edit form skips it because
                the existing recipients are pinned and changing audience
                mid-flight gets confusing. */}
            {!isEditing && (
              <div className="space-y-3 pt-2 border-t border-border">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Audiens</label>
                <div className="flex gap-2">
                  {(["all", "roles", "users"] as AudienceMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAudienceMode(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        audienceMode === m
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary/30 text-muted-foreground border-border hover:bg-secondary"
                      }`}
                    >
                      {m === "all" ? "Semua" : m === "roles" ? "Per Level" : "Per Orang"}
                    </button>
                  ))}
                </div>

                {audienceMode === "roles" && (
                  <div className="flex flex-wrap gap-2 p-3 rounded-xl border border-border bg-secondary/20">
                    {(["owner", "manager", "member"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleRole(r)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          selectedRoles.has(r)
                            ? "bg-primary/10 text-primary border-primary"
                            : "bg-card text-muted-foreground border-border hover:border-primary/50"
                        }`}
                      >
                        {ROLE_LABELS[r]}
                      </button>
                    ))}
                    {selectedRoles.size === 0 && (
                      <span className="text-[10px] text-muted-foreground/60 self-center ml-2 italic">
                        Pilih minimal satu level
                      </span>
                    )}
                  </div>
                )}

                {audienceMode === "users" && (() => {
                  const eligible = members.filter((m) => m.user_id !== user?.id);
                  const allSelected = eligible.length > 0 && eligible.every((m) => selectedUserIds.has(m.user_id));
                  return (
                  <div className="max-h-56 overflow-y-auto p-2 rounded-xl border border-border bg-secondary/20 space-y-1">
                    {eligible.length === 0 && (
                      <div className="text-[10px] text-muted-foreground italic p-2">Belum ada anggota lain di workspace.</div>
                    )}
                    {eligible.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (allSelected) {
                            setSelectedUserIds(new Set());
                          } else {
                            setSelectedUserIds(new Set(eligible.map((m) => m.user_id)));
                          }
                        }}
                        className="w-full flex items-center justify-between p-2 rounded-lg text-xs font-bold border border-dashed border-border hover:bg-secondary hover:border-primary/50 transition-colors text-foreground"
                      >
                        <div className="flex items-center gap-2">
                          {allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                          {allSelected ? "Batalkan semua" : `Pilih semua (${eligible.length})`}
                        </div>
                      </button>
                    )}
                    {eligible.map((m) => {
                      const uid = m.user_id;
                      const checked = selectedUserIds.has(uid);
                      return (
                        <button
                          key={uid}
                          type="button"
                          onClick={() => toggleUserId(uid)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-xs hover:bg-secondary transition-colors ${
                            checked ? "bg-primary/5" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-bold overflow-hidden">
                              {m.user?.avatar_url ? (
                                <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                m.user?.name?.charAt(0) || "?"
                              )}
                            </div>
                            <span>{m.user?.name}</span>
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                              {ROLE_LABELS[m.role] || m.role}
                            </span>
                          </div>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center ${checked ? "bg-primary border-primary" : "border-border"}`}>
                            {checked && <X className="w-3 h-3 text-primary-foreground rotate-45" />}
                          </span>
                        </button>
                      );
                    })}
                    {selectedUserIds.size > 0 && (
                      <div className="text-[10px] text-muted-foreground italic p-2">{selectedUserIds.size} orang dipilih</div>
                    )}
                  </div>
                  );
                })()}
              </div>
            )}

            {/* Deadline + Secret toggle — boleh di create & edit */}
            <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <CalendarClock className="w-3 h-3" /> Tenggat Waktu (opsional)
                </label>
                <div className="relative">
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  {expiresAt && (
                    <button
                      type="button"
                      onClick={() => setExpiresAt("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Hapus tenggat"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Rahasia
                </label>
                <button
                  type="button"
                  onClick={() => setIsSecret((v) => !v)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                    isSecret
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300"
                      : "bg-secondary/30 border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {isSecret ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    {isSecret ? "Pengumuman rahasia" : "Tandai sebagai rahasia"}
                  </span>
                  <span className="text-[9px] uppercase tracking-widest opacity-70">
                    {isSecret ? "Tersembunyi" : "Biasa"}
                  </span>
                </button>
                {isSecret && (
                  <p className="text-[10px] text-muted-foreground/80 italic px-1">
                    Daftar penerima disembunyikan dari yang lain & notifikasi tanpa preview.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button onClick={resetForm} className="px-6 py-2 rounded-xl font-bold text-muted-foreground hover:bg-secondary transition-colors">Batal</button>
              <button
                onClick={handleSubmit}
                disabled={
                  submitting
                  || !title
                  || !content
                  || (!isEditing && audienceMode === "roles" && selectedRoles.size === 0)
                  || (!isEditing && audienceMode === "users" && selectedUserIds.size === 0)
                }
                className="px-8 py-2 bg-primary text-primary-foreground rounded-xl font-bold disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEditing ? "Update" : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {announcements.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-border rounded-3xl space-y-4">
            <Megaphone className="w-12 h-12 text-muted-foreground mx-auto opacity-20" />
            <h3 className="font-bold text-xl">Belum ada pengumuman</h3>
            <p className="text-muted-foreground">Bagikan info penting untuk seluruh workspace.</p>
          </div>
        ) : (
          announcements.map((a) => {
            const dl = formatDeadline(a.expires_at);
            return (
            <div key={a.id} className={`bg-card border rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow relative group ${
              dl?.expired ? "border-border opacity-70" : a.is_secret ? "border-amber-500/30" : "border-border"
            }`}>
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden">
                    {a.creator?.avatar_url ? <img src={a.creator.avatar_url} alt={a.creator.name} className="w-full h-full object-cover" /> : <User className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <div>
                    <h4 className="font-bold">{a.creator?.name}</h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {new Date(a.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(a)} className="p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-primary"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(a.id)} className="p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {a.is_secret && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-widest bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    <Lock className="w-3 h-3" /> Rahasia
                  </span>
                )}
                {dl && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
                    dl.expired
                      ? "bg-destructive/10 text-destructive border-destructive/30"
                      : "bg-secondary text-muted-foreground border-border"
                  }`}>
                    <CalendarClock className="w-3 h-3" />
                    {dl.expired ? "Kadaluwarsa" : "Tenggat"}: {dl.label}
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-bold mb-2">{a.title}</h3>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-4 flex items-center gap-1.5">
                <Users className="w-3 h-3" /> {audienceSummary(a)}
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: a.content }} />
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
