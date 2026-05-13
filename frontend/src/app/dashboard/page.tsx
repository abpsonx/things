"use client";

import React, { useEffect, useState } from "react";

import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { 
  Plus, 
  Building2, 
  ArrowRight, 
  Users, 
  Clock,
  Loader2,
  MoreVertical,
  FolderRoot,
  Activity,
  CheckCircle
} from "lucide-react";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface Organization {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export default function DashboardPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [stats, setStats] = useState<any>(null);

  const fetchOrgs = async () => {
    try {
      const [orgsRes, statsRes] = await Promise.all([
        api.get("/organizations"),
        api.get("/stats/dashboard")
      ]);
      setOrganizations(orgsRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    try {
      setLoading(true);
      await api.post("/organizations", { name: newOrgName });
      setNewOrgName("");
      setIsCreating(false);
      await fetchOrgs();
    } catch (err) {
      console.error("Failed to create org", err);
    }
  };

  return (
    <>
      <div className="space-y-10">
        {/* Welcome & Stats Row */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Selamat Datang!</h1>
                <p className="text-muted-foreground">Ini adalah ringkasan pekerjaan kamu hari ini.</p>
              </div>
              <button 
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
              >
                <Plus className="w-4 h-4" />
                Workspace Baru
              </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Proyek", value: stats?.project_count || 0, icon: FolderRoot, color: "text-blue-500", bg: "bg-blue-500/10" },
                { label: "To Do", value: stats?.task_stats.todo || 0, icon: Clock, color: "text-slate-500", bg: "bg-slate-500/10" },
                { label: "In Progress", value: stats?.task_stats.in_progress || 0, icon: Activity, color: "text-amber-500", bg: "bg-amber-500/10" },
                { label: "Completed", value: stats?.task_stats.completed || 0, icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/10" },
              ].map((s, i) => (
                <div key={i} className="p-4 bg-card border border-border rounded-2xl space-y-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", s.bg)}>
                    <s.icon className={cn("w-5 h-5", s.color)} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 bg-card border border-border rounded-3xl flex flex-col justify-between relative group">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-4">Task Distribution</h3>
            <div className="h-[220px] w-full relative">
              {stats?.chart_data ? (
                <>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-4xl font-black leading-none">{stats.task_stats.total}</span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Total Tasks</span>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.chart_data}
                        innerRadius={70}
                        outerRadius={95}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                        cx="50%"
                        cy="50%"
                        isAnimationActive={false} // Disable animation to prevent stuck states
                        labelLine={false}
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
                          if (!value || value === 0) return null;
                          const RADIAN = Math.PI / 180;
                          const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                          const x = cx + radius * Math.cos(-midAngle * RADIAN);
                          const y = cy + radius * Math.sin(-midAngle * RADIAN);
                          return (
                            <text 
                              x={x} y={y} 
                              fill="white" 
                              textAnchor="middle" 
                              dominantBaseline="central"
                              style={{ fontSize: '12px', fontWeight: 'bold', pointerEvents: 'none' }}
                            >
                              {value}
                            </text>
                          );
                        }}
                      >
                        {stats.chart_data.map((entry: any, index: number) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={index === 0 ? "url(#colorTodo)" : index === 1 ? "url(#colorProgress)" : "url(#colorDone)"} 
                            style={{ outline: 'none' }}
                          />
                        ))}
                      </Pie>
                      <defs>
                        <linearGradient id="colorTodo" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#94a3b8" />
                          <stop offset="95%" stopColor="#64748b" />
                        </linearGradient>
                        <linearGradient id="colorProgress" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" />
                          <stop offset="95%" stopColor="#2563eb" />
                        </linearGradient>
                        <linearGradient id="colorDone" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" />
                          <stop offset="95%" stopColor="#16a34a" />
                        </linearGradient>
                      </defs>
                    </PieChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Loading chart...</div>
              )}
            </div>
            <div className="flex justify-center gap-6 mt-4">
              {[
                { label: "To Do", color: "bg-slate-400" },
                { label: "In Progress", color: "bg-blue-500" },
                { label: "Done", color: "bg-emerald-500" },
              ].map((dot, i) => (
                <div key={i} className="flex items-center gap-2 group/dot">
                  <div className={cn("w-2.5 h-2.5 rounded-full transition-transform group-hover/dot:scale-125", dot.color)}></div>
                  <span className="text-[10px] font-bold text-muted-foreground group-hover/dot:text-foreground transition-colors">{dot.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Create Workspace Inline */}
        {isCreating && (
          <div className="p-6 border border-border rounded-xl bg-secondary/30 space-y-4 animate-in fade-in slide-in-from-top-2">
            <h3 className="font-bold">Buat Workspace Baru</h3>
            <form onSubmit={handleCreateOrg} className="flex gap-3">
              <input
                autoFocus
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Nama Perusahaan atau Tim"
                className="flex-1 px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button 
                type="submit"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90"
              >
                Simpan
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

        {/* Dashboard Bottom Section: Workspaces & Recent Activity */}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold">Workspace Kamu</h2>
              <div className="flex-1 h-px bg-border"></div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : organizations.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-6">
                {organizations.map((org) => (
                  <Link
                    key={org.id}
                    href={`/org/${org.id}`}
                    className="group p-6 border border-border rounded-3xl bg-card hover:border-primary transition-all hover:shadow-xl hover:shadow-primary/5 space-y-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="w-12 h-12 bg-secondary rounded-2xl flex items-center justify-center border border-border group-hover:bg-primary/5 transition-colors">
                        <Building2 className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xl group-hover:text-primary transition-colors">{org.name}</h3>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-medium"><Users className="w-3 h-3" /> Tim Aktif</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-24 border border-dashed border-border rounded-3xl space-y-4">
                <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto">
                  <Building2 className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl">Belum ada workspace</h3>
                  <p className="text-muted-foreground max-w-xs mx-auto">
                    Buat workspace pertama kamu untuk mulai mengelola proyek tim.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Recent Activity Sidebar */}
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold">Aktivitas Terakhir</h2>
              <div className="flex-1 h-px bg-border"></div>
            </div>
            
            <div className="space-y-4">
              {stats?.recent_activities?.length > 0 ? (
                stats.recent_activities.map((log: any) => (
                  <div key={log.id} className="flex gap-4 p-4 rounded-2xl bg-secondary/20 border border-border/50 hover:border-primary/20 transition-all">
                    <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center flex-shrink-0">
                      <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] leading-relaxed">
                        <span className="font-bold">Seseorang</span> {log.action.replace('_', ' ')} pada <span className="font-medium italic">{log.entity_type}</span>
                      </p>
                      <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tighter">
                        {new Date(log.created_at).toLocaleDateString()} • {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center border border-dashed border-border rounded-3xl">
                  <Activity className="w-8 h-8 text-muted-foreground mx-auto opacity-20 mb-2" />
                  <p className="text-[10px] text-muted-foreground">Belum ada aktivitas</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
