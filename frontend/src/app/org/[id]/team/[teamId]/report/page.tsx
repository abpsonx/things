"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Users, 
  BarChart3, 
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  PieChart as PieChartIcon
} from "lucide-react";
import api from "@/lib/api";
import TeamNav from "@/components/team/TeamNav";

export default function TeamReportPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);

  useEffect(() => {
    fetchTeamAndStats();
  }, [teamId]);

  const fetchTeamAndStats = async () => {
    try {
      // Fetch team info
      const teamRes = await api.get(`/organizations/${orgId}/teams/${teamId}`);
      setTeam(teamRes.data);

      // Fetch all tasks for the team to calculate stats
      const tasksRes = await api.get(`/organizations/${orgId}/teams/${teamId}/tasks`);
      const tasks = tasksRes.data;

      const counts = {
        todo: tasks.filter((t: any) => t.status === "todo").length,
        in_progress: tasks.filter((t: any) => t.status === "in_progress").length,
        pending: tasks.filter((t: any) => t.status === "pending").length,
        done: tasks.filter((t: any) => t.status === "done").length,
        total: tasks.length
      };

      setStats(counts);
    } catch (err) {
      console.error("Failed to fetch team stats", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center h-screen bg-[#fafafa]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const completionRate = stats?.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#fafafa]">
      {/* Header */}
      <div className="border-b border-border px-8 py-5 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">{team?.name}</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Performance Insights</p>
            </div>
          </div>
        </div>
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="flex-1 p-8 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <StatCard 
            title="Total Tugas" 
            value={stats.total} 
            icon={<TrendingUp className="w-5 h-5 text-blue-500" />} 
            color="blue"
          />
          <StatCard 
            title="Selesai" 
            value={stats.done} 
            icon={<CheckCircle2 className="w-5 h-5 text-green-500" />} 
            color="green"
            percentage={`${completionRate}% dari total`}
          />
          <StatCard 
            title="Berjalan" 
            value={stats.in_progress} 
            icon={<Clock className="w-5 h-5 text-orange-500" />} 
            color="orange"
          />
          <StatCard 
            title="Pending" 
            value={stats.pending} 
            icon={<AlertCircle className="w-5 h-5 text-red-500" />} 
            color="red"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Status Distribution */}
          <div className="bg-white p-8 rounded-3xl border border-border shadow-sm">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center">
                <PieChartIcon className="w-5 h-5 text-foreground" />
              </div>
              <h2 className="text-lg font-bold">Distribusi Status</h2>
            </div>

            <div className="space-y-6">
              <StatusRow label="Selesai" count={stats.done} total={stats.total} color="bg-green-500" />
              <StatusRow label="Sedang Dikerjakan" count={stats.in_progress} total={stats.total} color="bg-blue-500" />
              <StatusRow label="Pending" count={stats.pending} total={stats.total} color="bg-orange-500" />
              <StatusRow label="Belum Dikerjakan" count={stats.todo} total={stats.total} color="bg-slate-300" />
            </div>
          </div>

          {/* Productivity Summary */}
          <div className="bg-gradient-to-br from-violet-600 to-indigo-700 p-8 rounded-3xl shadow-xl shadow-indigo-500/20 text-white flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-bold mb-2">Ringkasan Tim</h2>
              <p className="text-indigo-100 text-sm opacity-80">Performa penyelesaian tugas sejauh ini.</p>
            </div>

            <div className="py-10 text-center">
              <div className="text-6xl font-black mb-2">{completionRate}%</div>
              <p className="text-indigo-100 font-medium">Task Completion Rate</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
              <p className="text-xs text-indigo-100 leading-relaxed italic text-center">
                "{completionRate >= 80 ? "Performa luar biasa! Tim bekerja sangat efisien." : completionRate >= 50 ? "Performa cukup baik. Terus tingkatkan penyelesaian tugas!" : "Ayo semangat! Fokus pada penyelesaian tugas yang berjalan."}"
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, percentage }: any) {
  const colors: any = {
    blue: "bg-blue-50 border-blue-100",
    green: "bg-green-50 border-green-100",
    orange: "bg-orange-50 border-orange-100",
    red: "bg-red-50 border-red-100",
  };

  return (
    <div className={`p-6 rounded-3xl border ${colors[color]} shadow-sm`}>
      <div className="flex items-center justify-between mb-4">
        <div className="p-2.5 bg-white rounded-xl shadow-sm">
          {icon}
        </div>
        {percentage && <span className="text-[10px] font-bold text-green-600 bg-white px-2 py-1 rounded-full border border-green-100 shadow-sm">{percentage}</span>}
      </div>
      <div className="text-2xl font-black text-foreground mb-1">{value}</div>
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{title}</div>
    </div>
  );
}

function StatusRow({ label, count, total, color }: any) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold text-foreground">{label}</span>
        <span className="text-sm font-black text-foreground">{count} <span className="text-muted-foreground font-medium text-[10px]">TUGAS</span></span>
      </div>
      <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-1000 ease-out`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
