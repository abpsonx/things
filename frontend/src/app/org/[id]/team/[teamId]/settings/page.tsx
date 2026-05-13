'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Settings, Users, Trash2, ShieldAlert, Save, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import TeamNav from '@/components/team/TeamNav';

export default function TeamSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;

  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    fetchTeam();
  }, [teamId]);

  const fetchTeam = async () => {
    try {
      const res = await api.get(`/organizations/${orgId}/teams/${teamId}`);
      setTeam(res.data);
      setName(res.data.name);
      setDescription(res.data.description || '');
    } catch (error) {
      console.error('Failed to fetch team:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/organizations/${orgId}/teams/${teamId}`, {
        name,
        description
      });
      alert('Team settings updated successfully!');
    } catch (error) {
      alert('Failed to update team settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex-1 flex justify-center items-center h-screen bg-[#fafafa]">
      <div className="animate-pulse text-muted-foreground font-medium">Loading settings...</div>
    </div>
  );

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
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-500/20">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">{team?.name}</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Team Configuration</p>
            </div>
          </div>
        </div>
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="flex-1 p-8 max-w-4xl mx-auto w-full space-y-8">
        {/* General Settings */}
        <div className="bg-white rounded-3xl border border-border shadow-sm overflow-hidden">
          <div className="p-8 border-b border-border bg-slate-50/50">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              General Information
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Update your team's core details and purpose.</p>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground ml-1">Team Name</label>
              <input 
                type="text"
                className="w-full px-4 py-3 rounded-2xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-slate-50/30"
                value={name} 
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Growth Booster" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground ml-1">Description</label>
              <textarea 
                className="w-full px-4 py-3 rounded-2xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-slate-50/30 min-h-[100px]"
                value={description} 
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this team working on?" 
              />
            </div>
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Member Permissions (Preview) */}
        <div className="bg-white rounded-3xl border border-border shadow-sm overflow-hidden opacity-80">
          <div className="p-8 border-b border-border bg-slate-50/50">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              Permissions
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Manage what members can do (Available soon)</p>
          </div>
          <div className="p-8 space-y-4">
            <div className="flex items-center justify-between py-4 border-b border-dashed">
              <div>
                <p className="font-bold text-sm">Allow members to invite others</p>
                <p className="text-xs text-muted-foreground">Collaborators can grow the team independently</p>
              </div>
              <div className="w-12 h-6 bg-slate-200 rounded-full relative cursor-not-allowed">
                <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
              </div>
            </div>
            <div className="flex items-center justify-between py-4">
              <div>
                <p className="font-bold text-sm">Task deletion protection</p>
                <p className="text-xs text-muted-foreground">Only leads can permanently remove tasks</p>
              </div>
              <div className="w-12 h-6 bg-primary/20 rounded-full relative cursor-not-allowed">
                <div className="absolute right-1 top-1 w-4 h-4 bg-primary rounded-full shadow-sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-50/50 rounded-3xl border border-red-100 overflow-hidden">
          <div className="p-8 border-b border-red-100 bg-red-100/30">
            <h2 className="text-xl font-bold flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-5 h-5" />
              Danger Zone
            </h2>
            <p className="text-sm text-red-600/70 mt-1">Actions that cannot be undone.</p>
          </div>
          <div className="p-8 space-y-4">
            <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-red-100">
              <div>
                <h4 className="font-bold text-red-600">Delete Team</h4>
                <p className="text-xs text-muted-foreground">Permanently remove this team and all associated data</p>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all">
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
