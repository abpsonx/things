"use client";

import React, { useState, useEffect, useMemo } from "react";
import { MessageSquare, X, Send, Search, Users, Hash, Loader2, Building2, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useNotificationsStore } from "@/store/useNotificationsStore";
import { usePresenceStore } from "@/store/usePresenceStore";

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"dm" | "channels" | "workspace">("dm");
  const [members, setMembers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [orgName, setOrgName] = useState<string>("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  // DM channel metadata keyed by partner user_id — last_message snippet
  // supaya bisa tampilkan "siapa yang ngomong terakhir" walaupun pesan
  // sudah dibaca (notification store cuma punya snippet untuk unread).
  const [dmChannelByUser, setDmChannelByUser] = useState<Record<string, { last_message: any; unread_count: number }>>({});
  // Resolved org id used for navigation. Equals the URL :id when we're on
  // an /org/:id/* route, otherwise the user's first organization (looked
  // up in fetchData). Without this, opening a DM from non-org pages
  // (/dashboard, /settings, ...) produced /org/undefined/dm/... which the
  // backend rejects with a 422.
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const { id: orgId } = useParams();
  const { user: currentUser } = useAuthStore();
  const router = useRouter();
  const unreadDMCount = useNotificationsStore((s) => s.unreadDMCount);
  const items = useNotificationsStore((s) => s.items);
  const dmSummaryBySender = useNotificationsStore((s) => s.dmSummaryBySender);
  const markDMsFromSenderRead = useNotificationsStore((s) => s.markDMsFromSenderRead);
  const isOnline = usePresenceStore((s) => s.isOnline);
  // Subscribe to the Set so dots re-render on presence_update.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _online = usePresenceStore((s) => s.online);

  // Recompute DM summary whenever the notifications list changes.
  const dmBySender = useMemo(() => dmSummaryBySender(), [items, dmSummaryBySender]);

  // Sort: unread DM first → recent activity (dari last_message) → alfabet.
  const sortedMembers = useMemo(() => {
    const lastAtFor = (uid: string): number => {
      const sum = dmBySender[uid];
      if (sum) return new Date(sum.lastAt).getTime();
      const ch = dmChannelByUser[uid];
      if (ch?.last_message?.created_at) return new Date(ch.last_message.created_at).getTime();
      return 0;
    };
    return [...members].sort((a, b) => {
      const aUnread = dmBySender[a.user_id] ? 1 : 0;
      const bUnread = dmBySender[b.user_id] ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const aLast = lastAtFor(a.user_id);
      const bLast = lastAtFor(b.user_id);
      if (aLast !== bLast) return bLast - aLast;
      return (a.user?.name || "").localeCompare(b.user?.name || "");
    });
  }, [members, dmBySender, dmChannelByUser]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, orgId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let targetOrgId = (orgId as string) || null;
      if (!targetOrgId) {
        const orgsRes = await api.get("/organizations");
        if (Array.isArray(orgsRes.data) && orgsRes.data.length > 0) {
          targetOrgId = orgsRes.data[0].id;
        }
      }
      if (targetOrgId) {
        setActiveOrgId(targetOrgId);
        // Parallel: workspace detail + projects + DM channels (last_message preview).
        const [detailRes, projectsRes, dmRes] = await Promise.all([
          api.get(`/organizations/${targetOrgId}`),
          api.get(`/organizations/${targetOrgId}/projects`).catch(() => ({ data: [] })),
          api.get(`/dm/channels?org_id=${targetOrgId}`).catch(() => ({ data: [] })),
        ]);
        setMembers(detailRes.data.members.filter((m: any) => m.user_id !== currentUser?.id));
        setOrgName(detailRes.data.name || "");
        setProjects(Array.isArray(projectsRes.data) ? projectsRes.data : []);
        const dmChannels = Array.isArray(dmRes.data) ? dmRes.data : [];
        const map: Record<string, { last_message: any; unread_count: number }> = {};
        for (const ch of dmChannels) {
          const other = ch.user1_id === currentUser?.id ? ch.user2_id : ch.user1_id;
          if (other) {
            map[String(other)] = {
              last_message: ch.last_message || null,
              unread_count: ch.unread_count || 0,
            };
          }
        }
        setDmChannelByUser(map);
      }
    } catch (err) {
      console.error("Failed to fetch chat data", err);
    } finally {
      setLoading(false);
    }
  };

  // Filter berdasar query — case-insensitive, jalan di nama (DM & proyek).
  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedMembers;
    return sortedMembers.filter((m) => (m.user?.name || "").toLowerCase().includes(q));
  }, [sortedMembers, query]);
  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => (p.name || "").toLowerCase().includes(q));
  }, [projects, query]);

  const openWorkspaceChat = () => {
    const targetId = (orgId as string) || activeOrgId;
    if (!targetId) return;
    router.push(`/org/${targetId}/chat`);
    setIsOpen(false);
  };
  const openProjectChat = (projectId: string) => {
    const targetId = (orgId as string) || activeOrgId;
    if (!targetId) return;
    router.push(`/org/${targetId}/project/${projectId}/chat`);
    setIsOpen(false);
  };

  const handleStartChat = (userId: string) => {
    // Prefer the URL org id, fall back to whatever fetchData resolved.
    // OrgMemberResponse doesn't include org_id, so the previous fallback
    // `members[0]?.org_id` was always undefined and produced a broken
    // /org/undefined/dm/... URL.
    const targetId = (orgId as string) || activeOrgId;
    if (!targetId) return;
    markDMsFromSenderRead(userId);
    router.push(`/org/${targetId}/dm/${userId}`);
    setIsOpen(false);
  };

  // Removed !orgId return null to make it global

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-4">
      {/* Chat Window */}
      {isOpen && (
        <div className="w-[380px] h-[550px] bg-card border border-border rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-300">
          {/* Header */}
          <div className="p-6 bg-primary text-primary-foreground flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold">Chat Tim</h3>
                <p className="text-[10px] opacity-80">Terhubung dengan tim kamu secara instan.</p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs — 3 mode: DM, Project chat, Workspace chat */}
          <div className="flex border-b border-border p-2 gap-1">
            <button
              onClick={() => setActiveTab("dm")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[11px] font-bold transition-all",
                activeTab === "dm" ? "bg-secondary text-primary shadow-sm" : "text-muted-foreground hover:bg-secondary/50"
              )}
            >
              <Users className="w-3.5 h-3.5" />
              Pesan Privat
            </button>
            <button
              onClick={() => setActiveTab("channels")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[11px] font-bold transition-all",
                activeTab === "channels" ? "bg-secondary text-primary shadow-sm" : "text-muted-foreground hover:bg-secondary/50"
              )}
            >
              <Hash className="w-3.5 h-3.5" />
              Proyek
            </button>
            <button
              onClick={() => setActiveTab("workspace")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[11px] font-bold transition-all",
                activeTab === "workspace" ? "bg-secondary text-primary shadow-sm" : "text-muted-foreground hover:bg-secondary/50"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              Workspace
            </button>
          </div>

          {/* Search — hanya tampil di tab yang punya daftar (dm / channels) */}
          {activeTab !== "workspace" && (
            <div className="px-6 py-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={activeTab === "dm" ? "Cari orang…" : "Cari proyek…"}
                  className="w-full pl-10 pr-4 py-3 bg-secondary/30 border border-border rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-50">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs font-medium">Memuat tim...</p>
              </div>
            ) : activeTab === "dm" ? (
              filteredMembers.length > 0 ? (
                filteredMembers.map((member) => {
                  const summary = dmBySender[member.user_id];
                  const hasUnread = !!summary;
                  // Preview: snippet unread (paling real-time) → fallback
                  // last_message dari channel API. Prefix "Kamu: " kalau
                  // pesan terakhir dari user sendiri biar tau siapa yang
                  // mengakhiri obrolan. Tetap kasih role kalau belum ada
                  // chat sama sekali.
                  const chanMeta = dmChannelByUser[member.user_id];
                  const lastMsg = chanMeta?.last_message;
                  const fromMe = lastMsg && String(lastMsg.user_id) === String(currentUser?.id);
                  const previewText = hasUnread
                    ? summary!.lastSnippet
                    : lastMsg
                      ? `${fromMe ? "Kamu: " : ""}${lastMsg.content || (lastMsg.is_attachment ? "📎 Lampiran" : "")}`
                      : null;
                  const previewTime = summary?.lastAt || lastMsg?.created_at;
                  return (
                    <button
                      key={member.id}
                      onClick={() => handleStartChat(member.user_id)}
                      className={cn(
                        "w-full flex items-center gap-4 p-3 rounded-2xl transition-all group",
                        hasUnread
                          ? "bg-primary/5 hover:bg-primary/10 border border-primary/10"
                          : "hover:bg-secondary/50",
                      )}
                    >
                      <div className="relative">
                        <div className="w-12 h-12 rounded-2xl bg-secondary border border-border flex items-center justify-center overflow-hidden font-bold text-sm">
                          {member.user.avatar_url ? (
                            <img src={member.user.avatar_url} alt={member.user.name} className="w-full h-full object-cover" />
                          ) : (
                            member.user.name.charAt(0)
                          )}
                        </div>
                        {isOnline(member.user_id) && (
                          <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-card shadow-sm" />
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn(
                            "text-sm truncate transition-colors",
                            hasUnread ? "font-extrabold text-foreground" : "font-bold group-hover:text-primary",
                          )}>
                            {member.user.name}
                          </p>
                          {previewTime && (
                            <span className="text-[9px] text-muted-foreground shrink-0">
                              {formatDistanceToNow(new Date(previewTime), { addSuffix: false, locale: idLocale })}
                            </span>
                          )}
                        </div>
                        {previewText ? (
                          <p className={cn(
                            "text-[11px] truncate mt-0.5",
                            hasUnread ? "text-foreground/80 font-semibold" : "text-muted-foreground/80",
                          )}>
                            {previewText}
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground capitalize">{member.role}</p>
                        )}
                      </div>
                      {hasUnread ? (
                        <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 bg-destructive text-destructive-foreground text-[11px] font-extrabold rounded-full flex items-center justify-center shadow-sm">
                          {summary!.count > 9 ? "9+" : summary!.count}
                        </span>
                      ) : (
                        <div className="p-2 bg-primary/5 text-primary rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                          <Send className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="text-center py-12 opacity-50 space-y-2">
                  <Users className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-xs font-medium">
                    {query.trim() ? "Tidak ada hasil pencarian." : "Tidak ada member lain ditemukan."}
                  </p>
                </div>
              )
            ) : activeTab === "channels" ? (
              filteredProjects.length > 0 ? (
                filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => openProjectChat(project.id)}
                    className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-secondary/50 transition-all group text-left"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                      <Hash className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate group-hover:text-primary transition-colors">{project.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {project.description || "Tidak ada deskripsi"}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))
              ) : (
                <div className="text-center py-12 opacity-50 space-y-2">
                  <Hash className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-xs font-medium">
                    {query.trim() ? "Tidak ada proyek cocok." : "Belum ada proyek di workspace ini."}
                  </p>
                </div>
              )
            ) : (
              // Workspace chat — single big card untuk buka chat workspace
              activeOrgId ? (
                <button
                  onClick={openWorkspaceChat}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/20 transition-all group text-left"
                >
                  <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                      {orgName || "Workspace"}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Channel publik untuk seluruh anggota workspace
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                </button>
              ) : (
                <div className="text-center py-12 opacity-50 space-y-2">
                  <Building2 className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-xs font-medium italic">Belum ada workspace aktif.</p>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 group",
          isOpen ? "bg-card text-foreground rotate-90 border border-border" : "bg-primary text-primary-foreground",
        )}
      >
        {isOpen ? (
          <X className="w-7 h-7" />
        ) : (
          <MessageSquare className="w-7 h-7" />
        )}
        {!isOpen && unreadDMCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 bg-destructive text-destructive-foreground text-[11px] font-extrabold rounded-full border-[3px] border-background flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
            {unreadDMCount > 9 ? "9+" : unreadDMCount}
          </span>
        )}
      </button>
    </div>
  );
}
