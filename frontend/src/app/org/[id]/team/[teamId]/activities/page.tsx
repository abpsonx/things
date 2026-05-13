"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Users, 
  Activity, 
  Loader2,
  Clock,
  User as UserIcon,
  Circle
} from "lucide-react";
import api from "@/lib/api";
import TeamNav from "@/components/team/TeamNav";

interface ActivityLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  user: { name: string; avatar_url?: string };
  metadata: any;
  created_at: string;
}

export default function TeamActivitiesPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;

  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);

  useEffect(() => {
    fetchTeamAndActivities();
  }, [teamId]);

  const fetchTeamAndActivities = async () => {
    try {
      // Fetch team info
      const teamRes = await api.get(`/organizations/${orgId}/teams/${teamId}`);
      setTeam(teamRes.data);

      // Fetch activities filtered by team_id
      const res = await api.get(`/organizations/${orgId}/teams/${teamId}/activities`);
      setActivities(res.data);
    } catch (err) {
      console.error("Failed to fetch team activities", err);
    } finally {
      setLoading(false);
    }
  };

  const formatAction = (action: string, metadata: any) => {
    switch (action) {
      case "task_created": return `membuat tugas baru: "${metadata.title || 'Tanpa Judul'}"`;
      case "task_moved": return `memindahkan tugas ke "${metadata.new_status}"`;
      case "task_updated": return `memperbarui tugas "${metadata.title || 'Tugas'}"`;
      case "member_added_to_team": return `menambahkan ${metadata.email} ke tim`;
      case "attachment_uploaded": return `mengunggah lampiran: "${metadata.filename}"`;
      case "comment_added": return `mengomentari tugas: "${metadata.task_title || 'Tugas'}"`;
      case "task_deleted": return `menghapus tugas`;
      default: return action.replace(/_/g, ' ');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center h-screen bg-[#fafafa]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Team Activity Log</p>
            </div>
          </div>
        </div>
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="flex-1 p-8 max-w-4xl mx-auto w-full">
        <div className="space-y-6">
          {activities.length > 0 ? (
            activities.map((log, index) => (
              <div key={log.id} className="relative pl-8 group">
                {/* Timeline Line */}
                {index !== activities.length - 1 && (
                  <div className="absolute left-[11px] top-8 bottom-[-24px] w-0.5 bg-border group-hover:bg-primary/20 transition-colors" />
                )}
                
                {/* Timeline Dot */}
                <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-white border-2 border-border flex items-center justify-center group-hover:border-primary transition-colors z-10">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground group-hover:bg-primary" />
                </div>

                <div className="bg-white p-5 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold overflow-hidden border border-border">
                        {log.user?.avatar_url ? (
                          <img src={log.user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <UserIcon className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm">
                          <span className="font-bold text-foreground">{log.user?.name || 'Sistem'}</span>
                          {" "}
                          <span className="text-muted-foreground">{formatAction(log.action, log.metadata)}</span>
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                          <Clock className="w-3 h-3" />
                          {log.created_at ? (
                            new Date(log.created_at).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
                          ) : 'Waktu tidak diketahui'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-border">
              <Activity className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground font-medium">Belum ada aktivitas di tim ini</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
