"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { 
  Users, 
  ChevronLeft, 
  UserPlus, 
  MoreVertical, 
  Shield, 
  ShieldCheck, 
  User as UserIcon,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  RefreshCw,
  Ticket
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/lib/utils";
import InviteMemberModal from "@/components/org/InviteMemberModal";

export default function MembersPage() {
  const { id: orgId } = useParams();
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [members, setMembers] = useState<any[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [codes, setCodes] = useState<any[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCodes = async () => {
    try {
      const res = await api.get(`/organizations/${orgId}/invite-codes`);
      setCodes(res.data || []);
    } catch { /* not allowed (manager/member) — hide section */ }
  };

  const regenCode = async (role: string) => {
    try {
      const res = await api.post(`/organizations/${orgId}/invite-codes/${role}/regenerate`);
      setCodes((prev) => prev.map((c) => (c.role === role ? { ...c, code: res.data.code } : c)));
    } catch {
      alert("Gagal regenerasi kode.");
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };
  const [isInviting, setIsInviting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchMembers = async () => {
    try {
      const res = await api.get(`/organizations/${orgId}`);
      setMembers(res.data.members);
      setOwnerId(res.data.owner_id);
    } catch (err) {
      console.error("Failed to fetch members", err);
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) { fetchMembers(); fetchCodes(); }
  }, [orgId]);

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    setActionLoading(memberId);
    try {
      await api.patch(`/organizations/${orgId}/members/${memberId}`, { role: newRole });
      await fetchMembers();
    } catch (err) {
      alert("Gagal memperbarui role member.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveMember = async (memberId: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin mengeluarkan ${name} dari workspace?`)) return;
    
    setActionLoading(memberId);
    try {
      await api.delete(`/organizations/${orgId}/members/${memberId}`);
      await fetchMembers();
    } catch (err) {
      alert("Gagal menghapus member.");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentUserMember = members.find(m => m.user_id === currentUser?.id);
  const canManage = currentUserMember?.role === "owner" || currentUserMember?.role === "manager";
  const isOwner = currentUserMember?.role === "owner";

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <Link 
          href={`/org/${orgId}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ChevronLeft className="w-4 h-4" />
          Kembali ke Workspace
        </Link>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Manajemen Tim</h1>
              <p className="text-muted-foreground italic text-sm">Total {members.length} member di workspace ini.</p>
            </div>
          </div>
          
          {canManage && (
            <button 
              onClick={() => setIsInviting(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-2xl font-bold hover:shadow-lg hover:shadow-primary/20 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              Undang Member Baru
            </button>
          )}
        </div>
      </div>

      {/* Members List */}
      <div className="border border-border rounded-3xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Member</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Role</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                {canManage && <th className="px-6 py-4 text-right"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((member) => {
                const isMe = member.user_id === currentUser?.id;
                const isTargetOwner = member.role === "owner";
                const isTargetManager = member.role === "manager";
                const isCreator = !!ownerId && member.user_id === ownerId;
                // Removal hierarchy:
                //  - owner can remove anyone (except the workspace creator)
                //  - manager can only remove "member" tier
                // Role editing is owner-only — see roleEditable below.
                const canRemove = canManage && !isMe && !isCreator
                  && (isOwner || (!isTargetOwner && !isTargetManager));
                // Owner is the only role that can promote/demote.
                const roleEditable = isOwner && !isMe && !isCreator;

                return (
                  <tr key={member.id} className="hover:bg-secondary/10 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-sm overflow-hidden">
                          {member.user.avatar_url ? (
                            <img src={member.user.avatar_url} alt={member.user.name} className="w-full h-full object-cover" />
                          ) : (
                            member.user.name.charAt(0)
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-sm flex items-center gap-2">
                            {member.user.name}
                            {isMe && <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] rounded-full">Kamu</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">{member.user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {roleEditable ? (
                        <select
                          value={member.role}
                          disabled={actionLoading === member.id}
                          onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                          className="bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="member">Member</option>
                          <option value="manager">Manager</option>
                          <option value="owner">Admin</option>
                        </select>
                      ) : (
                        <div className="flex items-center gap-2">
                          {member.role === "owner" ? (
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                          ) : member.role === "manager" ? (
                            <Shield className="w-4 h-4 text-primary" />
                          ) : (
                            <UserIcon className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="text-xs font-bold capitalize">{member.role === "owner" ? "Admin" : member.role}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Aktif</span>
                      </div>
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 text-right">
                        {canRemove && (
                          <button
                            onClick={() => handleRemoveMember(member.id, member.user.name)}
                            disabled={actionLoading === member.id}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                            title="Hapus Member"
                          >
                            {actionLoading === member.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {codes.length > 0 && (
        <div className="border border-border rounded-3xl bg-card p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm">Kode Undangan per Level</h4>
              <p className="text-xs text-muted-foreground">Bagikan kode ini ke tim — saat daftar, mereka langsung masuk workspace ini dengan level-nya.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {codes.map((c) => (
              <div key={c.role} className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{c.label}</p>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-bold tracking-wide">{c.code}</code>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => copyCode(c.code)} title="Salin" className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground">
                      {copied === c.code ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => regenCode(c.role)} title="Ganti kode" className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Ganti kode kalau bocor — kode lama langsung nonaktif.</p>
        </div>
      )}

      <div className="p-6 bg-secondary/20 rounded-3xl border border-border flex items-start gap-4">
        <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h4 className="font-bold text-sm">Informasi Role</h4>
          <ul className="text-xs text-muted-foreground space-y-2">
            <li><span className="font-bold text-foreground">Admin:</span> Kelola workspace, anggota, & role (s/d Manager). Tidak bisa menghapus workspace.</li>
            <li><span className="font-bold text-foreground">Manager:</span> Pimpin proyek/tim yang dibuatnya, undang Member baru, & atur task/chat di situ.</li>
            <li><span className="font-bold text-foreground">Member:</span> Berkontribusi di proyek/tim yang diikuti — task, chat, dokumen.</li>
            <li className="opacity-70"><span className="font-bold text-foreground">Super User / Developer:</span> Kontrol penuh semua workspace (termasuk buat & hapus workspace).</li>
          </ul>
        </div>
      </div>

      <InviteMemberModal
        orgId={orgId as string}
        isOpen={isInviting}
        onClose={() => setIsInviting(false)}
        onSuccess={fetchMembers}
        currentRole={currentUserMember?.role}
      />
    </div>
  );
}
