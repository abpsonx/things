"use client";

import React, { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Layout,
  MessageSquare,
  Calendar,
  Settings,
  ChevronRight,
  Loader2,
  Users,
  FileText,
  Activity,
  BarChart3,
  Megaphone,
  Send,
  X,
  UserPlus,
  Trash2,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import Modal from "@/components/ui/Modal";
import InviteProjectMemberModal from "@/components/project/InviteProjectMemberModal";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  org_id: string;
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id: orgId, projectId } = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [project, setProject] = useState<Project | null>(null);
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [profileMember, setProfileMember] = useState<any | null>(null);

  const fetchMembers = async () => {
    try {
      const res = await api.get(`/organizations/${orgId}/projects/${projectId}/members`);
      setMembers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to refresh members", err);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Keluarkan ${memberName} dari project?`)) return;
    setRemovingId(memberId);
    try {
      await api.delete(`/organizations/${orgId}/projects/${projectId}/members/${memberId}`);
      toast.success(`${memberName} dikeluarkan dari project`);
      fetchMembers();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal mengeluarkan anggota");
    } finally {
      setRemovingId(null);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projRes, orgRes, memRes] = await Promise.all([
          api.get(`/organizations/${orgId}/projects/${projectId}`),
          api.get(`/organizations/${orgId}`),
          api.get(`/organizations/${orgId}/projects/${projectId}/members`),
        ]);
        setProject(projRes.data);
        setOrgName(orgRes.data.name);
        setMembers(Array.isArray(memRes.data) ? memRes.data : []);
      } catch (err) {
        console.error("Failed to fetch project info", err);
      } finally {
        setLoading(false);
      }
    };
    if (orgId && projectId) fetchData();
  }, [orgId, projectId]);

  const tabs = [
    { label: "Board", icon: Layout, href: `/org/${orgId}/project/${projectId}/board` },
    { label: "Chat", icon: MessageSquare, href: `/org/${orgId}/project/${projectId}/chat` },
    { label: "Kalender", icon: Calendar, href: `/org/${orgId}/project/${projectId}/calendar` },
    { label: "Wiki", icon: FileText, href: `/org/${orgId}/project/${projectId}/docs` },
    { label: "Aktivitas", icon: Activity, href: `/org/${orgId}/project/${projectId}/activity` },
    { label: "Laporan", icon: BarChart3, href: `/org/${orgId}/project/${projectId}/reports` },
    { label: "Pengumuman", icon: Megaphone, href: `/org/${orgId}/project/${projectId}/announcements` },
    { label: "Settings", icon: Settings, href: `/org/${orgId}/project/${projectId}/settings` },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
        <ChevronRight className="w-4 h-4" />
        <Link href={`/org/${orgId}`} className="hover:text-foreground transition-colors">{orgName}</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground font-medium">{project?.name}</span>
      </div>

      {/* Project Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <Layout className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{project?.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => setIsMembersOpen(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <Users className="w-3 h-3" />
                {members.length} {members.length === 1 ? "Member" : "Members"}
              </button>
              <span className="w-1 h-1 bg-muted-foreground/30 rounded-full"></span>
              <span className="text-xs text-muted-foreground">Private Project</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsInviteOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 shadow-md shadow-primary/20 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span className="hidden sm:inline">Tambah Anggota</span>
        </button>
      </div>

      {/* Navigation Tabs — overflow-x-auto + whitespace-nowrap supaya
          di mobile bisa swipe ke kanan untuk tab yang tidak muat layar. */}
      <div className="flex items-center gap-1 border-b border-border pb-px overflow-x-auto whitespace-nowrap scrollbar-thin touch-pan-x">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "shrink-0 flex items-center gap-2 px-4 sm:px-6 py-3 text-sm font-medium transition-all relative",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-t-lg"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full animate-in fade-in zoom-in-95 duration-300" />
              )}
            </Link>
          );
        })}
      </div>

      <div className="pt-4">
        {children}
      </div>

      {/* Members modal */}
      <Modal
        isOpen={isMembersOpen}
        onClose={() => setIsMembersOpen(false)}
        title={`Anggota Project (${members.length})`}
      >
        <div className="max-h-[60vh] overflow-y-auto space-y-1.5 p-1">
          {members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Belum ada anggota</div>
          ) : (
            members.map((m) => (
              <div
                key={m.id || m.user_id}
                className="w-full flex items-center gap-3 p-3 rounded-2xl border border-border hover:border-primary/40 hover:bg-secondary/40 transition-all"
              >
                <button
                  type="button"
                  onClick={() => { setProfileMember(m); setIsMembersOpen(false); }}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="w-11 h-11 rounded-2xl bg-secondary border border-border flex items-center justify-center overflow-hidden font-bold text-sm shrink-0">
                    {m.user?.avatar_url
                      ? <img src={m.user.avatar_url} alt={m.user.name} className="w-full h-full object-cover" />
                      : (m.user?.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{m.user?.name || "User"}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{m.user?.email}</p>
                  </div>
                </button>
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0",
                  m.role === "manager" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
                )}>{m.role}</span>
                {m.user_id !== currentUser?.id && m.role !== "manager" && (
                  <button
                    onClick={() => handleRemoveMember(m.id, m.user?.name || "member")}
                    disabled={removingId === m.id}
                    className="p-2 rounded-xl text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-all shrink-0"
                    title="Keluarkan dari project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>

      <InviteProjectMemberModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        orgId={orgId as string}
        projectId={projectId as string}
        existingMembers={members}
        onAdded={fetchMembers}
      />

      {/* Profile detail modal */}
      <Modal
        isOpen={!!profileMember}
        onClose={() => setProfileMember(null)}
        title="Profil Anggota"
      >
        {profileMember && (
          <div className="p-2 flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-3xl bg-secondary border border-border flex items-center justify-center overflow-hidden font-extrabold text-2xl mb-4">
              {profileMember.user?.avatar_url
                ? <img src={profileMember.user.avatar_url} alt={profileMember.user.name} className="w-full h-full object-cover" />
                : (profileMember.user?.name || "?").charAt(0).toUpperCase()}
            </div>
            <h3 className="text-lg font-extrabold mb-0.5">{profileMember.user?.name || "User"}</h3>
            {profileMember.user?.email && (
              <a href={`mailto:${profileMember.user.email}`} className="text-xs text-primary hover:underline mb-3">
                {profileMember.user.email}
              </a>
            )}
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full",
              profileMember.role === "manager" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
            )}>{profileMember.role}</span>
            <div className="w-full mt-5 flex flex-col gap-2">
              {profileMember.user_id !== currentUser?.id && (
                <button
                  onClick={() => {
                    router.push(`/org/${orgId}/dm/${profileMember.user_id}`);
                    setProfileMember(null);
                  }}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-2xl text-xs font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" /> Kirim DM
                </button>
              )}
              <button
                onClick={() => setProfileMember(null)}
                className="w-full py-2.5 bg-secondary rounded-2xl text-xs font-bold hover:bg-secondary/70 transition-colors flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" /> Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
