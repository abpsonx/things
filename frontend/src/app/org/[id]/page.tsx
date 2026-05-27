"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import api from "@/lib/api";
import {
  Plus,
  FolderRoot,
  ArrowRight,
  Users,
  MoreVertical,
  Layout as LayoutIcon,
  MessageSquare,
  Calendar,
  Loader2,
  ChevronRight,
  UserPlus,
  Settings as SettingsIcon,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import InviteMemberModal from "@/components/org/InviteMemberModal";

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface OrgDetail {
  id: string;
  name: string;
  members: any[];
}

export default function OrgPage() {
  const { id: orgId } = useParams();
  const router = useRouter();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  // ID of the project whose ⋮ menu is currently open (or null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Close the card ⋮ menu on any outside click
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openMenuId]);

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    setOpenMenuId(null);
    if (!confirm(`Hapus project "${projectName}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await api.delete(`/organizations/${orgId}/projects/${projectId}`);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal menghapus project");
    }
  };

  const fetchData = async () => {
    try {
      const [orgRes, projectsRes] = await Promise.all([
        api.get(`/organizations/${orgId}`),
        api.get(`/organizations/${orgId}/projects`)
      ]);
      setOrg(orgRes.data);
      setProjects(projectsRes.data);
    } catch (err) {
      console.error("Failed to fetch org data", err);
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) fetchData();
  }, [orgId]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      setLoading(true);
      await api.post(`/organizations/${orgId}/projects`, { name: newProjectName });
      setNewProjectName("");
      setIsCreating(false);
      await fetchData();
    } catch (err) {
      console.error("Failed to create project", err);
      setLoading(false);
    }
  };

  if (loading && !org) {
    return (
      <>
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-8">
        {/* Breadcrumbs & Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-foreground font-medium">{org?.name}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{org?.name}</h1>
              <p className="text-muted-foreground text-sm mt-1">Kelola proyek dan tim kamu di sini.</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsInviting(true)}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-all"
              >
                <UserPlus className="w-4 h-4" />
                Undang Member
              </button>
              <button 
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Proyek Baru
              </button>
            </div>
          </div>
        </div>

        {/* Create Project Inline */}
        {isCreating && (
          <div className="p-6 border border-border rounded-xl bg-secondary/30 space-y-4 animate-in fade-in slide-in-from-top-2">
            <h3 className="font-bold">Buat Proyek Baru</h3>
            <form onSubmit={handleCreateProject} className="flex gap-3">
              <input
                autoFocus
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Judul Proyek (misal: Redesign Website)"
                className="flex-1 px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button 
                type="submit"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90"
              >
                Buat Proyek
              </button>
              <button 
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 bg-background border border-border rounded-md font-medium hover:bg-secondary"
              >
                Batal
              </button>
            </form>
          </div>
        )}

        {/* Projects Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-6">
          {projects.length > 0 ? (
            projects.map((project) => (
              <Link
                key={project.id}
                href={`/org/${orgId}/project/${project.id}/board`}
                className="group p-6 border border-border rounded-2xl bg-card hover:shadow-lg hover:border-primary/40 transition-all space-y-6 relative block"
              >
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center border border-border group-hover:bg-primary/5 transition-colors">
                    <FolderRoot className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === project.id ? null : project.id);
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                      aria-label="Opsi project"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {openMenuId === project.id && (
                      <div
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        className="absolute right-0 top-full mt-1 w-44 bg-background border border-border rounded-xl shadow-xl z-20 p-1 animate-in fade-in slide-in-from-top-1"
                      >
                        <Link
                          href={`/org/${orgId}/project/${project.id}/settings`}
                          onClick={() => setOpenMenuId(null)}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs hover:bg-secondary transition-colors w-full"
                        >
                          <SettingsIcon className="w-3.5 h-3.5 opacity-70" /> Pengaturan
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteProject(project.id, project.name);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs hover:bg-destructive/10 text-destructive transition-colors text-left"
                        >
                          <Trash2 className="w-3.5 h-3.5 opacity-70" /> Hapus Project
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-xl group-hover:text-primary transition-colors">{project.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {project.description || "Belum ada deskripsi proyek."}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">
                  {[
                    { href: `/org/${orgId}/project/${project.id}/board`, Icon: LayoutIcon, label: "Board" },
                    { href: `/org/${orgId}/project/${project.id}/chat`, Icon: MessageSquare, label: "Chat" },
                    { href: `/org/${orgId}/project/${project.id}/calendar`, Icon: Calendar, label: "Events" },
                  ].map(({ href, Icon, label }) => (
                    <Link
                      key={label}
                      href={href}
                      onClick={(e) => e.stopPropagation()}
                      className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-secondary transition-colors group/tool"
                    >
                      <Icon className="w-4 h-4 text-muted-foreground group-hover/tool:text-primary" />
                      <span className="text-[10px] font-medium">{label}</span>
                    </Link>
                  ))}
                </div>
              </Link>
            ))
          ) : (
            <div className="col-span-full text-center py-24 border border-dashed border-border rounded-3xl space-y-4">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto">
                <FolderRoot className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-xl">Belum ada proyek</h3>
                <p className="text-muted-foreground max-w-xs mx-auto">
                  Mulai proyek pertama kamu di workspace ini.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Members List */}
        <div className="pt-12 border-t border-border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Tim Workspace
            </h2>
            <Link href={`/org/${orgId}/members`} className="text-sm text-primary font-medium hover:underline">
              Lihat Semua
            </Link>
          </div>
          <div className="flex flex-wrap gap-4">
            {org?.members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 p-3 border border-border rounded-xl bg-card min-w-[200px]">
                <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-xs overflow-hidden shrink-0">
                  {member.user?.avatar_url ? (
                    <img src={member.user.avatar_url} alt={member.user.name} className="w-full h-full object-cover" />
                  ) : (
                    member.user?.name?.charAt(0)?.toUpperCase()
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold truncate max-w-[120px]">{member.user.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <InviteMemberModal 
        orgId={orgId as string}
        isOpen={isInviting}
        onClose={() => setIsInviting(false)}
        onSuccess={fetchData}
      />
    </>
  );
}
