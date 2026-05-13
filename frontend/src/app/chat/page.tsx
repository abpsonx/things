"use client";

import React, { useEffect, useState } from "react";
import { MessageSquare, ArrowRight, Loader2, Hash, Building2 } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";

interface Organization {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  org_id: string;
}

export default function GlobalChatPage() {
  const [orgsWithProjects, setOrgsWithProjects] = useState<{org: Organization, projects: Project[]}[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [orgsRes, unreadRes] = await Promise.all([
          api.get("/organizations"),
          api.get("/users/me/notifications/chat-unread")
        ]);
        
        const orgs = orgsRes.data;
        setUnreadCounts(unreadRes.data);
        
        const data = await Promise.all(
          orgs.map(async (org: Organization) => {
            const projRes = await api.get(`/organizations/${org.id}/projects`);
            return { org, projects: projRes.data };
          })
        );
        
        setOrgsWithProjects(data.filter(d => d.projects.length > 0));
      } catch (err) {
        console.error("Failed to fetch chat projects", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAllData();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 border-b border-border pb-6">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
          <MessageSquare className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Diskusi Tim</h1>
          <p className="text-muted-foreground text-sm">Pilih proyek untuk mulai mengobrol dengan tim kamu</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : orgsWithProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 border border-dashed border-border rounded-2xl bg-secondary/20">
          <MessageSquare className="w-12 h-12 text-muted-foreground/50" />
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">Belum Ada Proyek</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Kamu belum bergabung dalam proyek apapun. Buat atau gabung ke proyek terlebih dahulu untuk mulai diskusi.
            </p>
          </div>
          <Link href="/dashboard" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium mt-2">
            Kembali ke Dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {orgsWithProjects.map(({ org, projects }) => (
            <div key={org.id} className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-wider">
                <Building2 className="w-4 h-4" />
                {org.name}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project) => {
                  const unread = unreadCounts[project.id] || 0;
                  return (
                    <Link 
                      key={project.id} 
                      href={`/org/${org.id}/project/${project.id}/chat`}
                      className="group flex flex-col p-4 bg-card border border-border rounded-xl hover:border-primary/50 hover:shadow-md transition-all relative"
                    >
                      {unread > 0 && (
                        <div className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-0.5 rounded-full shadow-sm animate-in zoom-in">
                          {unread > 99 ? '99+' : unread}
                        </div>
                      )}
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary relative">
                          <Hash className="w-5 h-5" />
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0" />
                      </div>
                      <div>
                        <h3 className="font-semibold truncate">{project.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">Masuk ke ruang chat proyek</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
