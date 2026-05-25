'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Activity, Clock, User as UserIcon, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import TeamNav from '@/components/team/TeamNav';

export default function TeamActivitiesPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;

  const [activities, setActivities] = useState<any[]>([]);
  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const teamRes = await api.get(`/organizations/${orgId}/teams/${teamId}`);
        setTeam(teamRes.data);

        const actRes = await api.get(`/organizations/${orgId}/teams/${teamId}/activities`);
        setActivities(Array.isArray(actRes.data) ? actRes.data : []);
      } catch (error) {
        console.error('Fetch error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [teamId, orgId]);

  if (loading) return <div className="p-10 text-center">Loading aktivitas...</div>;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      {/* Simple Header */}
      <div className="border-b bg-card p-5 flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 hover:bg-secondary rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Aktivitas Tim: {team?.name}</h1>
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="p-8 max-w-3xl mx-auto w-full space-y-4">
        {activities.length > 0 ? (
          activities.map((log) => (
            <div key={log.id} className="bg-card p-4 rounded-2xl border shadow-sm flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                {log.user?.avatar_url ? <img src={log.user.avatar_url} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 text-slate-400" />}
              </div>
              <div>
                <p className="text-sm">
                  <span className="font-bold">{log.user?.name || 'Sistem'}</span>{' '}
                  <span className="text-slate-600">{log.action?.replace(/_/g, ' ')}</span>
                </p>
                <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400 font-bold uppercase">
                  <Clock className="w-3 h-3" />
                  {log.created_at ? new Date(log.created_at).toLocaleString() : 'Baru saja'}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-20 bg-card rounded-3xl border border-dashed">
            <Activity className="w-12 h-12 mx-auto text-slate-200 mb-2" />
            <p className="text-slate-400">Belum ada aktivitas di tim ini</p>
          </div>
        )}
      </div>
    </div>
  );
}
