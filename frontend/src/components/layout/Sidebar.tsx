"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { usePresenceStore } from "@/store/usePresenceStore";
import { useNotificationsStore } from "@/store/useNotificationsStore";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import {
  LayoutDashboard,
  Briefcase,
  MessageSquare,
  Calendar,
  Settings,
  LogOut,
  User,
  Plus,
  Activity,
  Folder,
  Users,
  CheckSquare,
  Share2,
  X
} from "lucide-react";
import CreateTeamModal from "@/components/team/CreateTeamModal";
import CreateOrgModal from "@/components/org/CreateOrgModal";

type SidebarProps = {
  isOpen?: boolean;
  onClose?: () => void;
};

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const params = useParams();
  const orgId = params?.id;
  const projectId = params?.projectId;
  const { user, logout } = useAuthStore();
  const isOnline = usePresenceStore((s) => s.isOnline);
  // Subscribe to the Set so the dots re-render on presence_update.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _online = usePresenceStore((s) => s.online);
  // Unread DM badges, shared with the bell + floating chat via the same store
  // so opening a DM anywhere clears the badge here in sync.
  const notifItems = useNotificationsStore((s) => s.items);
  const dmSummaryBySender = useNotificationsStore((s) => s.dmSummaryBySender);
  const markDMsFromSenderRead = useNotificationsStore((s) => s.markDMsFromSenderRead);
  const dmBySender = useMemo(() => dmSummaryBySender(), [notifItems, dmSummaryBySender]);
  const [members, setMembers] = useState<any[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [isCreateOrgOpen, setIsCreateOrgOpen] = useState(false);

  const fetchContext = async () => {
    try {
      const orgsRes = await api.get("/organizations");
      // Handle the case where orgsRes.data might not be an array or is empty
      const organizations = Array.isArray(orgsRes.data) ? orgsRes.data : [];
      
      const fallbackId = organizations.length > 0 ? organizations[0].id : null;
      const currentId = (orgId && orgId !== "undefined" && orgId !== "null") ? (orgId as string) : fallbackId;
      
      setActiveOrgId(currentId);

      if (currentId) {
        // Fetch projects for this org to find a fallback
        const projectsRes = await api.get(`/organizations/${currentId}/projects`);
        const projects = Array.isArray(projectsRes.data) ? projectsRes.data : [];
        const fallbackProjId = projects.length > 0 ? projects[0].id : null;
        setActiveProjectId(projectId ? (projectId as string) : fallbackProjId);

        const res = await api.get(`/organizations/${currentId}`);
        if (res.data && res.data.members) {
          setMembers(res.data.members.filter((m: any) => m.user_id !== user?.id));
        }

        // Fetch teams
        const teamsRes = await api.get(`/organizations/${currentId}/teams`);
        setTeams(Array.isArray(teamsRes.data) ? teamsRes.data : []);
      } else {
        setTeams([]);
        setMembers([]);
      }
    } catch (err) {
      console.error("Sidebar fetch failed", err);
    }
  };

  useEffect(() => {
    fetchContext();
  }, [orgId, projectId, user?.id]);

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: CheckSquare, label: "Tugas Saya", href: "/my-tasks" },
    { icon: Briefcase, label: "Proyek", href: "/projects" },
    { 
      icon: MessageSquare, 
      label: "Chat", 
      href: (activeOrgId && activeProjectId) ? `/org/${activeOrgId}/project/${activeProjectId}/chat` : "#" 
    },
    { 
      icon: Calendar, 
      label: "Kalender", 
      href: (activeOrgId && activeProjectId) ? `/org/${activeOrgId}/project/${activeProjectId}/calendar` : "#" 
    },
    {
      icon: Folder,
      label: "Files",
      href: activeOrgId ? `/org/${activeOrgId}/files` : "#"
    },
    {
      icon: Activity,
      label: "Aktivitas",
      href: activeOrgId ? `/org/${activeOrgId}/activity` : "#"
    },
    {
      icon: Share2,
      label: "Sosmed",
      href: activeOrgId ? `/org/${activeOrgId}/sosmed` : "#"
    }
  ];

  return (
    <aside
      className={cn(
        "w-64 border-r border-border h-screen flex flex-col bg-card z-[50]",
        // Desktop: part of normal flex layout, always visible
        "md:sticky md:top-0 md:translate-x-0",
        // Mobile: fixed slide-out drawer
        "fixed inset-y-0 left-0 transition-transform duration-200 ease-out",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      <div className="p-6 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl tracking-tighter text-primary">
          <img src="/assets/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
          <span>Things</span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label="Tutup menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 px-4 space-y-8 overflow-y-auto">
        {!activeOrgId && (
          <div className="px-3 py-5 bg-primary/5 border-2 border-dashed border-primary/20 rounded-3xl space-y-4 animate-pulse">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mx-auto text-primary">
              <Users className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-[11px] font-bold text-primary uppercase tracking-tight">Belum Ada Workspace</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed px-2">
                Buatlah organisasi/workspace dulu untuk mulai berkolaborasi.
              </p>
            </div>
            <button
              onClick={() => setIsCreateOrgOpen(true)}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-2xl text-[10px] font-black hover:shadow-xl hover:shadow-primary/30 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              BUAT WORKSPACE
            </button>
          </div>
        )}

        <div className="space-y-1">
          {navItems.map((item) => {
            let isActive = pathname === item.href;
            
            // Logika pintar buat deteksi rute aktif
            if (item.label === "Proyek") {
              isActive = pathname === "/projects" || pathname.includes("/project/");
            } else if (item.label === "Chat") {
              isActive = pathname.includes("/chat") || pathname.includes("/dm/");
            } else if (item.label === "Kalender") {
              isActive = pathname.includes("/calendar");
            } else if (item.label === "Aktivitas") {
              isActive = pathname.includes("/activity");
            } else if (item.label === "Files") {
              isActive = pathname.includes("/files");
            } else if (item.label === "Sosmed") {
              isActive = pathname.includes("/sosmed");
            } else if (item.label === "Dashboard") {
              isActive = pathname === "/dashboard" || (pathname.startsWith("/org/") && !pathname.includes("/project/") && !pathname.includes("/team/") && !pathname.includes("/activity") && !pathname.includes("/files") && !pathname.includes("/members") && !pathname.includes("/sosmed"));
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="space-y-4">
          <h4 className="px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center justify-between">
            Tim
            <Plus 
              onClick={() => activeOrgId ? setIsCreateTeamOpen(true) : setIsCreateOrgOpen(true)}
              className="w-3 h-3 cursor-pointer hover:text-primary transition-colors" 
            />
          </h4>
          <div className="space-y-1">
            {teams.map((team) => {
              const href = `/org/${activeOrgId}/team/${team.id}/board`;
              const isActive = pathname.includes(team.id);
              return (
                <Link
                  key={team.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary border-r-2 border-primary rounded-r-none"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <div className="w-2 h-2 rounded-full bg-primary/40" />
                  <span className="truncate">{team.name}</span>
                </Link>
              );
            })}
            {teams.length === 0 && (
              <p className="px-3 text-[10px] text-muted-foreground/40 italic italic italic">Belum ada tim</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center justify-between">
            Direct Messages
            <Plus className="w-3 h-3 cursor-pointer hover:text-primary transition-colors" />
          </h4>
          <div className="space-y-1">
            {members.map((member) => {
              const summary = dmBySender[member.user_id];
              const hasUnread = !!summary;
              return (
                <Link
                  key={member.id}
                  href={`/org/${activeOrgId}/dm/${member.user_id}`}
                  onClick={() => markDMsFromSenderRead(member.user_id)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    pathname.includes(member.user_id)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <div className="relative">
                    <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden text-[8px] font-bold">
                      {member.user.avatar_url ? (
                        <img src={member.user.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        member.user.name.charAt(0)
                      )}
                    </div>
                    {isOnline(member.user_id) && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border-2 border-card" />
                    )}
                  </div>
                  <span className={cn("truncate flex-1", hasUnread && "font-bold text-foreground")}>{member.user.name}</span>
                  {hasUnread && (
                    <span className="shrink-0 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-extrabold rounded-full flex items-center justify-center">
                      {summary.count > 9 ? "9+" : summary.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="p-4 border-t border-border mt-auto">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user?.name}</p>
          </div>
        </div>

        <div className="space-y-1">
          <Link
            href="/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </div>
      </div>

      <CreateTeamModal 
        orgId={activeOrgId || ""}
        isOpen={isCreateTeamOpen}
        onClose={() => setIsCreateTeamOpen(false)}
        onSuccess={fetchContext}
      />

      <CreateOrgModal 
        isOpen={isCreateOrgOpen}
        onClose={() => setIsCreateOrgOpen(false)}
        onSuccess={(id) => {
          fetchContext();
          // Optionally redirect to the new org dashboard
        }}
      />
    </aside>
  );
}

