'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Settings, Users, Trash2, ShieldAlert, Save, ArrowLeft, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import TeamNav from '@/components/team/TeamNav';
import InviteTeamMemberModal from '@/components/team/InviteTeamMemberModal';

export default function TeamSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;

  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [allowInvite, setAllowInvite] = useState(true);
  const [allowDeleteTask, setAllowDeleteTask] = useState(false);

  useEffect(() => {
    fetchTeam();
    fetchMembers();
  }, [teamId]);

  const fetchTeam = async () => {
    try {
      const res = await api.get(`/organizations/${orgId}/teams/${teamId}`);
      setTeam(res.data);
      setName(res.data.name);
      setDescription(res.data.description || '');
      setAllowInvite(res.data.allow_invite);
      setAllowDeleteTask(res.data.allow_delete_task);
    } catch (error) {
      console.error('Failed to fetch team:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    try {
      const res = await api.get(`/organizations/${orgId}/teams/${teamId}/members`);
      setMembers(res.data);
    } catch (error) {
      console.error('Failed to fetch members:', error);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Keluarkan ${memberName} dari tim?`)) return;
    setRemovingId(memberId);
    try {
      await api.delete(`/organizations/${orgId}/teams/${teamId}/members/${memberId}`);
      toast.success(`${memberName} dikeluarkan dari tim`);
      fetchMembers();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Gagal mengeluarkan anggota');
    } finally {
      setRemovingId(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/organizations/${orgId}/teams/${teamId}`, {
        name,
        description,
        allow_invite: allowInvite,
        allow_delete_task: allowDeleteTask
      });
      alert('Team settings updated successfully!');
    } catch (error) {
      alert('Failed to update team settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex-1 flex justify-center items-center h-screen bg-background">
      <div className="animate-pulse text-muted-foreground font-medium">Loading settings...</div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border px-8 py-5 flex items-center justify-between bg-card/80 backdrop-blur-md sticky top-0 z-30">
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
        <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
          <div className="p-8 border-b border-border bg-secondary/50/50">
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
                className="w-full px-4 py-3 rounded-2xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-secondary/50/30"
                value={name} 
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Growth Booster" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground ml-1">Description</label>
              <textarea 
                className="w-full px-4 py-3 rounded-2xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-secondary/50/30 min-h-[100px]"
                value={description} 
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this team working on?" 
              />
            </div>
          </div>
        </div>

        {/* Members */}
        <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
          <div className="p-8 border-b border-border bg-secondary/50/50 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-500" />
                Anggota Tim
                <span className="ml-2 text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  {members.length}
                </span>
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Kelola siapa saja yang ada di tim ini.</p>
            </div>
            <button
              onClick={() => setIsInviteOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-primary/90 shadow-md shadow-primary/20 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              Tambah
            </button>
          </div>
          <div className="p-4">
            {members.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Belum ada anggota
              </div>
            ) : (
              <div className="space-y-1">
                {members.map((m: any) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center text-sm font-bold overflow-hidden shrink-0">
                        {m.user?.avatar_url ? (
                          <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          m.user?.name?.charAt(0)?.toUpperCase() || '?'
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{m.user?.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{m.user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                          m.role === 'lead'
                            ? 'bg-violet-50 text-violet-600'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {m.role}
                      </span>
                      {m.role !== 'lead' && (
                        <button
                          onClick={() => handleRemoveMember(m.id, m.user?.name || 'member')}
                          disabled={removingId === m.id}
                          className="p-2 rounded-xl text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-all"
                          title="Keluarkan dari tim"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Member Permissions */}
        <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
          <div className="p-8 border-b border-border bg-secondary/50/50">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              Permissions
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Manage what members can do within this team.</p>
          </div>
          <div className="p-8 space-y-4">
            <div className="flex items-center justify-between py-4 border-b border-dashed">
              <div>
                <p className="font-bold text-sm">Allow members to invite others</p>
                <p className="text-xs text-muted-foreground">Collaborators can grow the team independently</p>
              </div>
              <button 
                onClick={() => setAllowInvite(!allowInvite)}
                className={`w-12 h-6 rounded-full relative transition-all ${allowInvite ? 'bg-primary' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-card rounded-full shadow-sm transition-all ${allowInvite ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between py-4">
              <div>
                <p className="font-bold text-sm">Task deletion protection</p>
                <p className="text-xs text-muted-foreground">Only leads can permanently remove tasks</p>
              </div>
              <button 
                onClick={() => setAllowDeleteTask(!allowDeleteTask)}
                className={`w-12 h-6 rounded-full relative transition-all ${allowDeleteTask ? 'bg-primary' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-card rounded-full shadow-sm transition-all ${allowDeleteTask ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Save Button Sticky Bar */}
        <div className="flex justify-end pt-4">
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-10 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-xl shadow-primary/30"
          >
            <Save className="w-5 h-5" />
            {saving ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>

        <InviteTeamMemberModal
          isOpen={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          orgId={orgId}
          teamId={teamId}
          existingMembers={members}
          onAdded={fetchMembers}
        />

        {/* Danger Zone */}
        <div className="bg-red-50/50 rounded-3xl border border-red-100 overflow-hidden mt-12">
          <div className="p-8 border-b border-red-100 bg-red-100/30">
            <h2 className="text-xl font-bold flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-5 h-5" />
              Danger Zone
            </h2>
            <p className="text-sm text-red-600/70 mt-1">Actions that cannot be undone.</p>
          </div>
          <div className="p-8 space-y-4">
            <div className="flex items-center justify-between p-4 bg-card rounded-2xl border border-red-100">
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
