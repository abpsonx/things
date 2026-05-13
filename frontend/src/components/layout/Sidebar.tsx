"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
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
  Folder
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const params = useParams();
  const orgId = params?.id;
  const projectId = params?.projectId;
  const { user, logout } = useAuthStore();
  const [members, setMembers] = useState<any[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  useEffect(() => {
    const fetchContext = async () => {
      try {
        const orgsRes = await api.get("/organizations");
        const fallbackId = orgsRes.data.length > 0 ? orgsRes.data[0].id : null;
        const currentId = orgId && orgId !== "undefined" ? (orgId as string) : fallbackId;
        
        setActiveOrgId(currentId);

        if (currentId) {
          const res = await api.get(`/organizations/${currentId}`);
          if (res.data && res.data.members) {
            setMembers(res.data.members.filter((m: any) => m.user_id !== user?.id));
          }
        }
      } catch (err) {
        console.error("Sidebar fetch failed", err);
      }
    };
    fetchContext();
  }, [orgId, user?.id]);

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: Briefcase, label: "Proyek", href: "/projects" },
    { 
      icon: MessageSquare, 
      label: "Chat", 
      href: (activeOrgId && projectId) ? `/org/${activeOrgId}/project/${projectId}/chat` : "#" 
    },
    { 
      icon: Calendar, 
      label: "Kalender", 
      href: (activeOrgId && projectId) ? `/org/${activeOrgId}/project/${projectId}/calendar` : "#" 
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
    }
  ];

  return (
    <aside className="w-64 border-r border-border h-screen flex flex-col bg-card sticky top-0">
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl tracking-tighter text-primary">
          <img src="/assets/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
          <span>Things</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-8 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
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
            Direct Messages
            <Plus className="w-3 h-3 cursor-pointer hover:text-primary transition-colors" />
          </h4>
          <div className="space-y-1">
            {members.map((member) => (
              <Link
                key={member.id}
                href={`/org/${activeOrgId}/dm/${member.user_id}`}
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
                  <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border-2 border-card" />
                </div>
                <span className="truncate">{member.user.name}</span>
              </Link>
            ))}
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
    </aside>
  );
}

