"use client";

import React, { useEffect, useState } from "react";

import api from "@/lib/api";
import { Briefcase, Building2, ChevronRight, FolderRoot, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import CreateProjectModal from "@/components/project/CreateProjectModal";

interface GlobalProject {
  id: string;
  name: string;
  org_id: string;
  org_name: string;
}

export default function GlobalProjectsPage() {
  const [projects, setProjects] = useState<GlobalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const fetchAllProjects = async () => {
      try {
        // Fetch all orgs first
        const orgsRes = await api.get("/organizations");
        const orgs = orgsRes.data;
        
        // Fetch projects for each org
        const projectPromises = orgs.map(async (org: any) => {
          const res = await api.get(`/organizations/${org.id}/projects`);
          return res.data.map((p: any) => ({ ...p, org_name: org.name }));
        });
        
        const results = await Promise.all(projectPromises);
        setProjects(results.flat());
      } catch (err) {
        console.error("Failed to fetch global projects", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAllProjects();
  }, []);

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Briefcase className="w-8 h-8 text-primary" />
              Semua Proyek
            </h1>
            <p className="text-muted-foreground">Daftar semua proyek di seluruh workspace kamu.</p>
          </div>
          <button 
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-2xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-5 h-5" />
            Proyek Baru
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/org/${project.org_id}/project/${project.id}/board`}
                className="group p-6 border border-border rounded-2xl bg-card hover:border-primary transition-all space-y-4"
              >
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  <Building2 className="w-3 h-3" />
                  {project.org_name}
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center border border-border group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <FolderRoot className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold group-hover:text-primary transition-colors">{project.name}</h3>
                </div>
                <div className="flex justify-end pt-2 border-t border-border mt-2">
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 border border-dashed border-border rounded-3xl space-y-4">
            <Briefcase className="w-12 h-12 text-muted-foreground mx-auto opacity-20" />
            <h3 className="font-bold text-xl">Belum ada proyek</h3>
            <p className="text-muted-foreground">Buka dashboard untuk membuat workspace dan proyek baru.</p>
          </div>
        )}
      </div>

      <CreateProjectModal 
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        onSuccess={() => {
          // Re-fetch projects to show the new one
          const fetchAllProjects = async () => {
            try {
              const orgsRes = await api.get("/organizations");
              const orgs = orgsRes.data;
              const projectPromises = orgs.map(async (org: any) => {
                const res = await api.get(`/organizations/${org.id}/projects`);
                return res.data.map((p: any) => ({ ...p, org_name: org.name }));
              });
              const results = await Promise.all(projectPromises);
              setProjects(results.flat());
            } catch (err) {
              console.error("Failed to fetch global projects", err);
            }
          };
          fetchAllProjects();
        }}
      />
    </>
  );
}
