"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { usePresenceStore } from "@/store/usePresenceStore";
import { useNotificationsStore } from "@/store/useNotificationsStore";
import { socket } from "@/lib/socket";
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
  Hash,
  Building2,
  ChevronDown,
  Pencil,
  Trash2,
  Pin,
  X,
  Megaphone,
  CalendarDays
} from "lucide-react";
import CreateTeamModal from "@/components/team/CreateTeamModal";
import CreateOrgModal from "@/components/org/CreateOrgModal";

type SidebarProps = {
  isOpen?: boolean;
  onClose?: () => void;
};

// Personal bullet color presets for teams (per-user preference).
const TEAM_COLOR_PRESETS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b",
];

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const orgId = params?.id;
  const projectId = params?.projectId;
  const { user, logout, setAuth } = useAuthStore();
  const [colorPickerTeam, setColorPickerTeam] = useState<string | null>(null);
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
  const [orgs, setOrgs] = useState<any[]>([]);
  const [expandedWs, setExpandedWs] = useState<Record<string, boolean>>({});
  const [wsUnread, setWsUnread] = useState<Record<string, number>>({});
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [isCreateOrgOpen, setIsCreateOrgOpen] = useState(false);
  // DM list — expanded shows ALL members, collapsed shows top N
  // (pinned + unread + recent). Default collapsed agar sidebar gak panjang
  // banget untuk workspace yang anggotanya banyak.
  const [dmExpanded, setDmExpanded] = useState(false);
  const [dmQuery, setDmQuery] = useState("");
  // DM channel metadata keyed by the OTHER user's id, gives us last_message
  // preview + unread_count so we can render "sampai mana terakhir obrolan"
  // di sidebar tanpa fetch per kontak.
  const [dmChannelByUser, setDmChannelByUser] = useState<Record<string, { last_message: any; unread_count: number }>>({});

  const fetchContext = async () => {
    try {
      const orgsRes = await api.get("/organizations");
      // Handle the case where orgsRes.data might not be an array or is empty
      const organizations = Array.isArray(orgsRes.data) ? orgsRes.data : [];
      setOrgs(organizations);

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

        // Fetch DM channels supaya bisa render last_message di sidebar.
        try {
          const dmRes = await api.get(`/dm/channels?org_id=${currentId}`);
          const channels = Array.isArray(dmRes.data) ? dmRes.data : [];
          const map: Record<string, { last_message: any; unread_count: number }> = {};
          for (const ch of channels) {
            const other = ch.user1_id === user?.id ? ch.user2_id : ch.user1_id;
            if (other) {
              map[String(other)] = {
                last_message: ch.last_message || null,
                unread_count: ch.unread_count || 0,
              };
            }
          }
          setDmChannelByUser(map);
        } catch {
          setDmChannelByUser({});
        }
      } else {
        setTeams([]);
        setMembers([]);
        setDmChannelByUser({});
      }
    } catch (err) {
      console.error("Sidebar fetch failed", err);
    }
  };

  useEffect(() => {
    fetchContext();
  }, [orgId, projectId, user?.id]);

  const isSuperUser = (user as any)?.role === "super_user" || (user as any)?.role === "developer";
  const canManageWs = (ws: any) =>
    String(ws.owner_id) === String(user?.id) || isSuperUser;

  const renameWorkspace = async (ws: any) => {
    const name = window.prompt("Nama workspace baru:", ws.name)?.trim();
    if (!name || name === ws.name) return;
    try {
      await api.patch(`/organizations/${ws.id}`, { name });
      setOrgs((prev) => prev.map((o) => (o.id === ws.id ? { ...o, name } : o)));
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal mengubah nama workspace");
    }
  };

  const togglePin = async (kind: "team" | "dm", id: string, pinned: boolean) => {
    try {
      const res = await api.patch("/users/me/pin", { kind, id, pinned });
      if (user) {
        setAuth(
          { ...(user as any), pinned_teams: res.data.pinned_teams, pinned_dms: res.data.pinned_dms },
          localStorage.getItem("access_token") || "",
          localStorage.getItem("refresh_token") || "",
        );
      }
    } catch (err) {
      console.error("Failed to toggle pin", err);
    }
  };

  const pinnedTeamIds: string[] = (user as any)?.pinned_teams || [];
  const pinnedDmIds: string[] = (user as any)?.pinned_dms || [];
  const sortedTeams = [...teams].sort(
    (a, b) => (pinnedTeamIds.includes(a.id) ? 0 : 1) - (pinnedTeamIds.includes(b.id) ? 0 : 1)
  );
  const sortedMembers = useMemo(() => {
    // Sort priority:
    //   1. pinned
    //   2. has unread DM (notification store) — paling penting
    //   3. recent DM activity (last_message dari API channels)
    //   4. alphabetical
    const lastAtFor = (uid: string): number => {
      const sum = dmBySender[uid];
      if (sum) return new Date(sum.lastAt).getTime();
      const ch = dmChannelByUser[uid];
      if (ch?.last_message?.created_at) return new Date(ch.last_message.created_at).getTime();
      return 0;
    };
    return [...members].sort((a, b) => {
      const aPinned = pinnedDmIds.includes(a.user_id) ? 1 : 0;
      const bPinned = pinnedDmIds.includes(b.user_id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aUnread = dmBySender[a.user_id] ? 1 : 0;
      const bUnread = dmBySender[b.user_id] ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const aLast = lastAtFor(a.user_id);
      const bLast = lastAtFor(b.user_id);
      if (aLast !== bLast) return bLast - aLast;
      return (a.user?.name || "").localeCompare(b.user?.name || "");
    });
  }, [members, pinnedDmIds, dmBySender, dmChannelByUser]);

  const DM_COLLAPSED_LIMIT = 6;
  const filteredDmMembers = useMemo(() => {
    const q = dmQuery.trim().toLowerCase();
    if (!q) return sortedMembers;
    return sortedMembers.filter((m) => (m.user?.name || "").toLowerCase().includes(q));
  }, [sortedMembers, dmQuery]);
  // When collapsed (and not searching), show the top N most relevant members
  // — anyone pinned or with unread always makes the cut even past the limit.
  const displayedDmMembers = useMemo(() => {
    if (dmExpanded || dmQuery.trim()) return filteredDmMembers;
    const important = sortedMembers.filter((m) =>
      pinnedDmIds.includes(m.user_id) || !!dmBySender[m.user_id]
    );
    const rest = sortedMembers.filter((m) =>
      !pinnedDmIds.includes(m.user_id) && !dmBySender[m.user_id]
    );
    return [...important, ...rest].slice(0, Math.max(DM_COLLAPSED_LIMIT, important.length));
  }, [sortedMembers, dmExpanded, dmQuery, pinnedDmIds, dmBySender, filteredDmMembers]);

  const setTeamColor = async (teamId: string, color: string | null) => {
    try {
      const res = await api.patch("/users/me/team-colors", { team_id: teamId, color });
      if (user) {
        setAuth(
          { ...(user as any), team_colors: res.data.team_colors },
          localStorage.getItem("access_token") || "",
          localStorage.getItem("refresh_token") || "",
        );
      }
    } catch (err) {
      console.error("Failed to set team color", err);
    } finally {
      setColorPickerTeam(null);
    }
  };

  const deleteWorkspace = async (ws: any) => {
    if (!window.confirm(`Hapus workspace "${ws.name}"? Semua proyek, tugas, chat, dan data di dalamnya ikut terhapus permanen. Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await api.delete(`/organizations/${ws.id}`);
      setOrgs((prev) => prev.filter((o) => o.id !== ws.id));
      if (String(activeOrgId) === String(ws.id)) router.push("/dashboard");
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal menghapus workspace");
    }
  };

  // Per-workspace unread chat counts (refetch on navigation so badges clear
  // after a room is opened + marked read).
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await api.get("/users/me/notifications/workspace-chat-unread");
        if (active) setWsUnread(res.data || {});
      } catch { /* ignore */ }
    };
    load();
    // Refetch right after a workspace room is opened + marked read.
    const onRead = () => load();
    window.addEventListener("ws-chat-read", onRead);
    // Live badge: a new workspace message bumps the count instantly, unless
    // we're already viewing that workspace's chat.
    const onWsUnread = (d: any) => {
      const oid = d?.org_id;
      if (!oid || pathname === `/org/${oid}/chat`) return;
      setWsUnread((prev) => ({ ...prev, [oid]: (prev[oid] || 0) + 1 }));
    };
    socket.on("workspace_chat_unread", onWsUnread);
    return () => {
      active = false;
      window.removeEventListener("ws-chat-read", onRead);
      socket.off("workspace_chat_unread", onWsUnread);
    };
  }, [pathname, user?.id]);

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: CheckSquare, label: "Tugas Saya", href: "/my-tasks" },
    { icon: Briefcase, label: "Proyek", href: "/projects" },
    {
      icon: MessageSquare,
      label: "Chat",
      href: (activeOrgId && activeProjectId) ? `/org/${activeOrgId}/project/${activeProjectId}/chat` : "/chat"
    },
    {
      icon: Calendar,
      label: "Kalender",
      href: (activeOrgId && activeProjectId) ? `/org/${activeOrgId}/project/${activeProjectId}/calendar` : "/calendar"
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
        "w-52 border-r border-border h-screen flex flex-col bg-card z-[50]",
        // Desktop: part of normal flex layout, always visible
        "md:sticky md:top-0 md:translate-x-0",
        // Mobile: fixed slide-out drawer
        "fixed inset-y-0 left-0 transition-transform duration-200 ease-out",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      <div className="px-3 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-base tracking-tighter text-primary">
          <img src="/assets/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
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

      <nav
        className="flex-1 px-2.5 space-y-5 overflow-y-auto"
        onClick={(e) => {
          // Auto-close the mobile drawer when any link inside is tapped.
          // Harmless on desktop (sidebar is sticky/forced visible by md: classes).
          if ((e.target as HTMLElement).closest("a")) onClose?.();
        }}
      >
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
              isActive = (pathname.includes("/chat") && pathname.includes("/project/")) || pathname.includes("/dm/");
            } else if (item.label === "Kalender") {
              isActive = pathname.includes("/calendar");
            } else if (item.label === "Aktivitas") {
              isActive = pathname.includes("/activity");
            } else if (item.label === "Files") {
              isActive = pathname.includes("/files");
            } else if (item.label === "Sosmed") {
              isActive = pathname.includes("/sosmed");
            } else if (item.label === "Dashboard") {
              isActive = pathname === "/dashboard" || (pathname.startsWith("/org/") && !pathname.includes("/project/") && !pathname.includes("/team/") && !pathname.includes("/activity") && !pathname.includes("/files") && !pathname.includes("/members") && !pathname.includes("/sosmed") && !pathname.endsWith("/chat"));
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="space-y-2">
          <h4 className="px-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center justify-between">
            Workspace
            {isSuperUser && (
              <Plus
                onClick={() => setIsCreateOrgOpen(true)}
                className="w-3 h-3 cursor-pointer hover:text-primary transition-colors"
              />
            )}
          </h4>
          <div className="space-y-1">
            {orgs.map((ws) => {
              const expanded = expandedWs[ws.id] ?? (ws.id === activeOrgId);
              const chatActive = pathname === `/org/${ws.id}/chat`;
              const unread = wsUnread[ws.id] || 0;
              return (
                <div key={ws.id}>
                  <div className={cn(
                    "group flex items-center rounded-md transition-colors",
                    ws.id === activeOrgId ? "text-foreground" : "text-muted-foreground hover:bg-secondary"
                  )}>
                    <button
                      onClick={() => setExpandedWs((prev) => ({ ...prev, [ws.id]: !expanded }))}
                      className="flex items-center gap-2 pl-2.5 py-1.5 text-xs font-semibold flex-1 min-w-0"
                    >
                      <Building2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate flex-1 text-left">{ws.name}</span>
                      {unread > 0 && !expanded && (
                        <span className="shrink-0 min-w-[16px] h-[16px] px-1 bg-destructive text-destructive-foreground text-[9px] font-extrabold rounded-full flex items-center justify-center">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                      <ChevronDown className={cn("w-3 h-3 shrink-0 transition-transform", !expanded && "-rotate-90")} />
                    </button>
                    {canManageWs(ws) && (
                      <div className="flex items-center gap-0.5 pr-1.5 pl-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => renameWorkspace(ws)} title="Ubah nama" className="p-1 rounded hover:bg-background/60 hover:text-foreground">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => deleteWorkspace(ws)} title="Hapus workspace" className="p-1 rounded hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {expanded && (
                    <div className="ml-4 pl-2 border-l border-border space-y-1 mt-1">
                      <Link
                        href={`/org/${ws.id}/chat`}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                          chatActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        )}
                      >
                        <Hash className="w-3.5 h-3.5" />
                        <span className="truncate flex-1">Chat</span>
                        {unread > 0 && (
                          <span className="shrink-0 min-w-[16px] h-[16px] px-1 bg-destructive text-destructive-foreground text-[9px] font-extrabold rounded-full flex items-center justify-center">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </Link>
                      <Link
                        href={`/org/${ws.id}/announcements`}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                          pathname === `/org/${ws.id}/announcements`
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        )}
                      >
                        <Megaphone className="w-3.5 h-3.5" />
                        <span className="truncate flex-1">Pengumuman</span>
                      </Link>
                      <Link
                        href={`/org/${ws.id}/calendar`}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                          pathname === `/org/${ws.id}/calendar`
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        )}
                      >
                        <CalendarDays className="w-3.5 h-3.5" />
                        <span className="truncate flex-1">Kalender</span>
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
            {orgs.length === 0 && (
              <p className="px-3 text-[10px] text-muted-foreground/40 italic">Belum ada workspace</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="px-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center justify-between">
            Tim
            <Plus
              onClick={() => activeOrgId ? setIsCreateTeamOpen(true) : setIsCreateOrgOpen(true)}
              className="w-3 h-3 cursor-pointer hover:text-primary transition-colors"
            />
          </h4>
          <div className="space-y-1">
            {sortedTeams.map((team) => {
              const href = `/org/${activeOrgId}/team/${team.id}/board`;
              const isActive = pathname.includes(team.id);
              const color = (user as any)?.team_colors?.[team.id] as string | undefined;
              const pinned = pinnedTeamIds.includes(team.id);
              return (
                <div key={team.id} className="relative group">
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary border-r-2 border-primary rounded-r-none"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setColorPickerTeam(colorPickerTeam === team.id ? null : team.id); }}
                      title="Ubah warna (pribadi)"
                      className="w-3 h-3 rounded-full shrink-0 ring-offset-1 hover:ring-2 hover:ring-border transition-all"
                      style={{ backgroundColor: color || undefined }}
                    >
                      {!color && <span className="block w-2 h-2 m-auto rounded-full bg-primary/40" />}
                    </button>
                    <span className="truncate flex-1">{team.name}</span>
                  </Link>
                  <button
                    onClick={() => togglePin("team", team.id, !pinned)}
                    title={pinned ? "Lepas pin" : "Pin ke atas"}
                    className={cn(
                      "absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-background/70",
                      pinned ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"
                    )}
                  >
                    <Pin className="w-3 h-3" fill={pinned ? "currentColor" : "none"} />
                  </button>

                  {colorPickerTeam === team.id && (
                    <div className="absolute z-50 left-2 top-full mt-1 p-2 rounded-xl border border-border bg-card shadow-lg flex items-center gap-1.5 flex-wrap w-44">
                      {TEAM_COLOR_PRESETS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setTeamColor(team.id, c)}
                          className={cn("w-5 h-5 rounded-full hover:scale-110 transition-transform", color === c && "ring-2 ring-offset-1 ring-foreground")}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      <button
                        onClick={() => setTeamColor(team.id, null)}
                        className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded-md hover:bg-secondary w-full text-left mt-0.5"
                      >
                        Reset default
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {teams.length === 0 && (
              <p className="px-3 text-[10px] text-muted-foreground/40 italic italic italic">Belum ada tim</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="px-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center justify-between">
            <span>Direct Messages</span>
            <button
              type="button"
              onClick={() => { setDmExpanded(true); setTimeout(() => { document.getElementById("dm-search-input")?.focus(); }, 50); }}
              title="Cari semua kontak"
              className="p-0.5 rounded hover:bg-secondary text-muted-foreground/60 hover:text-primary transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </h4>

          {/* Search bar — muncul saat expanded atau saat user mulai mengetik */}
          {dmExpanded && (
            <div className="px-2">
              <input
                id="dm-search-input"
                value={dmQuery}
                onChange={(e) => setDmQuery(e.target.value)}
                placeholder="Cari nama…"
                className="w-full px-2.5 py-1 text-[11px] bg-secondary/50 border border-border rounded-md outline-none focus:border-primary"
              />
            </div>
          )}

          <div className="space-y-1">
            {displayedDmMembers.map((member) => {
              const summary = dmBySender[member.user_id];
              const hasUnread = !!summary;
              const pinned = pinnedDmIds.includes(member.user_id);
              // Preview prioritas: snippet dari unread notif (lebih real-time)
              // → fallback ke last_message dari channel API. Tambah prefix
              // "Kamu:" kalau pesan terakhir dari diri sendiri biar tahu
              // bola ada di pihak lawan.
              const chanMeta = dmChannelByUser[member.user_id];
              const lastMsg = chanMeta?.last_message;
              const fromMe = lastMsg && String(lastMsg.user_id) === String(user?.id);
              const preview = hasUnread
                ? summary!.lastSnippet
                : lastMsg
                  ? `${fromMe ? "Kamu: " : ""}${lastMsg.content || (lastMsg.is_attachment ? "📎 Lampiran" : "")}`
                  : null;
              return (
                <div key={member.id} className="relative group">
                  <Link
                    href={`/org/${activeOrgId}/dm/${member.user_id}`}
                    onClick={() => markDMsFromSenderRead(member.user_id)}
                    className={cn(
                      "flex items-start gap-2.5 px-2.5 py-1.5 rounded-md transition-colors",
                      pathname.includes(member.user_id)
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >
                    <div className="relative shrink-0 mt-0.5">
                      <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden text-[9px] font-bold">
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
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className={cn("text-xs truncate", hasUnread ? "font-extrabold text-foreground" : "font-medium")}>
                          {member.user.name}
                        </span>
                        {hasUnread && (
                          <span className="shrink-0 min-w-[16px] h-[16px] px-1 mr-4 bg-destructive text-destructive-foreground text-[9px] font-extrabold rounded-full flex items-center justify-center">
                            {summary!.count > 9 ? "9+" : summary!.count}
                          </span>
                        )}
                      </div>
                      {preview && (
                        <p className={cn(
                          "text-[10px] truncate leading-tight",
                          hasUnread ? "text-foreground/80 font-semibold" : "text-muted-foreground/70",
                        )}>
                          {preview}
                        </p>
                      )}
                    </div>
                  </Link>
                  <button
                    onClick={() => togglePin("dm", member.user_id, !pinned)}
                    title={pinned ? "Lepas pin" : "Pin ke atas"}
                    className={cn(
                      "absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-background/70",
                      pinned ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"
                    )}
                  >
                    <Pin className="w-3 h-3" fill={pinned ? "currentColor" : "none"} />
                  </button>
                </div>
              );
            })}

            {/* Empty-state hint kalau cari gak ketemu */}
            {dmExpanded && dmQuery.trim() && displayedDmMembers.length === 0 && (
              <p className="px-3 py-2 text-[10px] italic text-muted-foreground/60">
                Tidak ada kontak cocok.
              </p>
            )}

            {/* Footer toggle: lihat semua / tutup */}
            {sortedMembers.length > DM_COLLAPSED_LIMIT && (
              <button
                type="button"
                onClick={() => {
                  if (dmExpanded) { setDmExpanded(false); setDmQuery(""); }
                  else setDmExpanded(true);
                }}
                className="w-full px-3 py-1.5 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:bg-secondary/50 rounded-md transition-colors text-left"
              >
                {dmExpanded
                  ? "▴ Tutup daftar"
                  : `▾ Lihat semua (${sortedMembers.length})`}
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className="p-2.5 border-t border-border mt-auto">
        <div className="flex items-center gap-2.5 px-2.5 py-1.5 mb-1.5">
          <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden">
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
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
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

