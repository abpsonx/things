'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Settings, Users, Trash2, ShieldAlert } from 'lucide-react';

export default function TeamSettingsPage() {
  const params = useParams();
  const { toast } = useToast();
  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    fetchTeam();
  }, [params.teamId]);

  const fetchTeam = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/teams/${params.teamId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setTeam(data);
      setName(data.name);
      setDescription(data.description || '');
    } catch (error) {
      console.error('Failed to fetch team:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/teams/${params.teamId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ name, description })
      });

      if (res.ok) {
        toast({ title: 'Success', description: 'Team settings updated successfully' });
      } else {
        throw new Error('Failed to update settings');
      }
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'Failed to update team settings',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading settings...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/10 rounded-lg text-primary">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Team Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your team configuration and preferences</p>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>General Information</CardTitle>
            <CardDescription>Update your team name and description</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Team Name</Label>
              <Input 
                id="name" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Creative Design" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input 
                id="description" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this team do?" 
              />
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              Member Permissions
            </CardTitle>
            <CardDescription>Control what members can do within the team</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b">
              <div className="space-y-0.5">
                <Label>Allow members to invite others</Label>
                <p className="text-xs text-muted-foreground">Members can add new collaborators to the team</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <div className="space-y-0.5">
                <Label>Allow members to delete tasks</Label>
                <p className="text-xs text-muted-foreground">Allow non-admin members to permanently remove tasks</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-5 h-5" />
              Danger Zone
            </CardTitle>
            <CardDescription className="text-red-600/80">Irreversible actions for this team</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-red-100 shadow-sm">
              <div>
                <h4 className="font-semibold text-red-600">Archive Team</h4>
                <p className="text-sm text-muted-foreground">Make the team read-only and hide it from sidebar</p>
              </div>
              <Button variant="outline" className="text-red-600 hover:bg-red-50 border-red-200">Archive</Button>
            </div>
            <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-red-100 shadow-sm">
              <div>
                <h4 className="font-semibold text-red-600">Delete Team</h4>
                <p className="text-sm text-muted-foreground">Permanently delete this team and all its data</p>
              </div>
              <Button variant="destructive" className="bg-red-600 hover:bg-red-700">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Team
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
