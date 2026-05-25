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
  AlertCircle
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
  const [loading, setLoading] = useState(true);
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
    if (orgId) fetchMembers();
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
                const isCreator = !!ownerId && member.user_id === ownerId;
                // Can act on this member: managers handle non-owners; owners
                // handle anyone — but nobody can touch the workspace creator.
                const canActOn = canManage && !isMe && !isCreator && (isOwner || !isTargetOwner);

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
                      {canActOn ? (
                        <select
                          value={member.role}
                          disabled={actionLoading === member.id}
                          onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                          className="bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="member">Member</option>
                          <option value="manager">Manager</option>
                          <option value="owner">Owner</option>
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
                          <span className="text-xs font-bold capitalize">{member.role}</span>
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
                        {canActOn && (
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

      <div className="p-6 bg-secondary/20 rounded-3xl border border-border flex items-start gap-4">
        <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h4 className="font-bold text-sm">Informasi Role</h4>
          <ul className="text-xs text-muted-foreground space-y-2">
            <li><span className="font-bold text-foreground">Owner:</span> Kontrol penuh workspace, termasuk menghapus workspace & ganti role orang lain.</li>
            <li><span className="font-bold text-foreground">Manager:</span> Bisa membuat proyek, mengundang member, dan ganti role (kecuali Owner).</li>
            <li><span className="font-bold text-foreground">Member:</span> Bisa berkontribusi di proyek, chat, dan kelola tugas yang ditugaskan.</li>
          </ul>
        </div>
      </div>

      <InviteMemberModal 
        orgId={orgId as string}
        isOpen={isInviting}
        onClose={() => setIsInviting(false)}
        onSuccess={fetchMembers}
      />
    </div>
  );
}
