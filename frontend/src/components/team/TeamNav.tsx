"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  BarChart3,
  Activity,
  FileText,
  Megaphone,
  Calendar,
  Settings,
  Clapperboard,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamNavProps {
  orgId: string;
  teamId: string;
}

export default function TeamNav({ orgId, teamId }: TeamNavProps) {
  const pathname = usePathname();

  const navItems = [
    { name: "Ringkasan", href: `/org/${orgId}/team/${teamId}/summary`, icon: LayoutDashboard },
    { name: "Board", href: `/org/${orgId}/team/${teamId}/board`, icon: LayoutGrid },
    { name: "Chat", href: `/org/${orgId}/team/${teamId}/chat`, icon: MessageSquare },
    { name: "Jadwal", href: `/org/${orgId}/team/${teamId}/calendar`, icon: Calendar },
    { name: "Laporan", href: `/org/${orgId}/team/${teamId}/report`, icon: BarChart3 },
    { name: "Pengumuman", href: `/org/${orgId}/team/${teamId}/announcements`, icon: Megaphone },
    { name: "Aktivitas", href: `/org/${orgId}/team/${teamId}/activities`, icon: Activity },
    { name: "Dokumen", href: `/org/${orgId}/team/${teamId}/files`, icon: FileText },
    { name: "Brief Konten", href: `/org/${orgId}/team/${teamId}/briefs`, icon: Clapperboard },
    { name: "Brief Design", href: `/org/${orgId}/team/${teamId}/design-briefs`, icon: ImageIcon },
    { name: "Settings", href: `/org/${orgId}/team/${teamId}/settings`, icon: Settings },
  ];

  return (
    // overflow-x-auto + nowrap supaya di mobile (yg gak muat 11 tab) bisa
    // swipe horizontal. Tiap link shrink-0 supaya tidak ke-compress.
    // touch-pan-x = browser handle scroll horizontal native (gak nyangkut).
    <div className="flex items-center space-x-1 border-b border-border bg-card/50 backdrop-blur-sm px-3 sm:px-6 overflow-x-auto whitespace-nowrap scrollbar-thin touch-pan-x">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "shrink-0 flex items-center gap-2 px-3 sm:px-4 py-4 text-sm font-medium transition-all relative",
              isActive
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.name}
          </Link>
        );
      })}
    </div>
  );
}
