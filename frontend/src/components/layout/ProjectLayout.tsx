"use client";

import React, { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
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
  Megaphone
} from "lucide-react";
import AppLayout from "./AppLayout";

interface Project {
  id: string;
  name: string;
  org_id: string;
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id: orgId, projectId } = useParams();
  const pathname = usePathname();
  const [project, setProject] = useState<Project | null>(null);
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projRes, orgRes] = await Promise.all([
          api.get(`/organizations/${orgId}/projects/${projectId}`),
          api.get(`/organizations/${orgId}`)
        ]);
        setProject(projRes.data);
        setOrgName(orgRes.data.name);
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
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                8 Members
              </span>
              <span className="w-1 h-1 bg-muted-foreground/30 rounded-full"></span>
              <span className="text-xs text-muted-foreground">Private Project</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-px">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all relative",
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
    </div>
  );
}
