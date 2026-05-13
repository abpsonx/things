"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  Loader2,
  PieChart as PieChartIcon,
  TrendingUp,
  Users,
  AlertCircle,
  Activity,
  ChevronDown
} from "lucide-react";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip,
  Legend,
  AreaChart,
  Area,
  CartesianGrid
} from "recharts";
import { cn } from "@/lib/utils";

const COLORS = ['#94a3b8', '#3b82f6', '#22c55e'];
const PRIORITY_COLORS = ['#22c55e', '#f59e0b', '#ef4444'];

export default function ProjectReportsPage() {
  const { id: orgId, projectId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/reports/project/${projectId}?days=${days}`);
        setData(response.data);
      } catch (err) {
        console.error("Failed to fetch report", err);
      } finally {
        setLoading(false);
      }
    };
    if (projectId) fetchReport();
  }, [projectId, days]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-primary" />
            Laporan Kinerja Proyek
          </h2>
          <p className="text-muted-foreground">Analisis mendalam aktivitas dan progres tim.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-secondary/50 p-1 rounded-xl border border-border self-start">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                days === d ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {d} Hari
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Tugas" value={data.summary.total_tasks} icon={<BarChart3 className="w-4 h-4" />} />
        <StatCard title="Selesai" value={data.summary.completed} icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} />
        <StatCard title="Overdue" value={data.summary.overdue} icon={<AlertCircle className="w-4 h-4 text-destructive" />} />
        <StatCard title="Completion Rate" value={`${data.summary.completion_rate}%`} icon={<TrendingUp className="w-4 h-4 text-primary" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Task Status Breakdown */}
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm lg:col-span-1">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-muted-foreground" />
            Status Tugas
          </h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.task_by_status}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.task_by_status.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Completion Trend */}
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
            Tren Penyelesaian (Selesai/Hari)
          </h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.completion_trend}>
                <defs>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <RechartsTooltip />
                <Area type="monotone" dataKey="completed" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCompleted)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Member Performance */}
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-muted-foreground" />
            Produktivitas Tim
          </h3>
          <div className="space-y-4">
            {data.members_performance.length > 0 ? (
              data.members_performance.map((m: any, idx: number) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-muted-foreground">{m.done} selesai dari {m.total}</span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden flex">
                    <div 
                      className="h-full bg-emerald-500" 
                      style={{ width: `${(m.done / m.total) * 100}%` }} 
                    />
                    <div 
                      className="h-full bg-blue-500" 
                      style={{ width: `${(m.in_progress / m.total) * 100}%` }} 
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center py-12 text-muted-foreground italic text-sm">Belum ada data tugas.</p>
            )}
          </div>
        </div>

        {/* Activity Breakdown */}
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-muted-foreground" />
            Distribusi Aktivitas
          </h3>
          <div className="space-y-3">
            {data.activity_breakdown.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl">
                <span className="text-sm font-medium capitalize">{item.action.replace(/_/g, ' ')}</span>
                <span className="bg-background px-3 py-1 rounded-lg text-xs font-bold border border-border">{item.count}</span>
              </div>
            ))}
            {data.activity_breakdown.length === 0 && (
              <p className="text-center py-12 text-muted-foreground italic text-sm">Tidak ada aktivitas dalam periode ini.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: any, icon: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{title}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
