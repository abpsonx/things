"use client";

import React, { useState } from "react";
import Modal from "@/components/ui/Modal";
import api from "@/lib/api";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  AlignLeft, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  Users,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import MentionTextarea from "@/components/ui/MentionTextarea";

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess: () => void;
}

export default function AddEventModal({ isOpen, onClose, projectId, onSuccess }: AddEventModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    const fetchMembers = async () => {
      if (!isOpen || !projectId) return;
      setLoadingMembers(true);
      try {
        // We need orgId, let's get it from current URL if possible, or assume api handles it
        // Actually, we can just use the project members endpoint
        // I'll check the exact path for members. 
        // Based on grep: @router.get("/{project_id}/members", ...) inside projects router
        // Projects router is at /organizations/{org_id}/projects
        const orgId = window.location.pathname.split("/")[2];
        const res = await api.get(`/organizations/${orgId}/projects/${projectId}/members`);
        setMembers(res.data);
      } catch (err) {
        console.error("Failed to fetch members", err);
      } finally {
        setLoadingMembers(false);
      }
    };
    fetchMembers();
  }, [isOpen, projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startAt) return;

    setLoading(true);
    setError(null);
    try {
      await api.post(`/projects/${projectId}/events`, {
        title,
        description,
        start_at: new Date(startAt).toISOString(),
        end_at: endAt ? new Date(endAt).toISOString() : null,
        attendee_ids: attendeeIds,
        mention_ids: mentionIds
      });
      onSuccess();
      onClose();
      // Reset form
      setTitle("");
      setDescription("");
      setStartAt("");
      setEndAt("");
      setAttendeeIds([]);
      setMentionIds([]);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Gagal membuat event.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tambah Event Baru">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Judul Event</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Meeting Koordinasi Tim"
              className="w-full bg-secondary/20 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                <Clock className="w-3 h-3" /> Waktu Mulai
              </label>
              <input
                type="datetime-local"
                required
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full bg-secondary/20 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-xs"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                <Clock className="w-3 h-3" /> Waktu Selesai (Opsional)
              </label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full bg-secondary/20 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-xs"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <Users className="w-3 h-3" /> Assign Ke (Anggota)
            </label>
            <div className="relative">
              <div className="flex flex-wrap gap-2 p-2 bg-secondary/20 border border-border rounded-xl min-h-[50px] focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                {attendeeIds.map(id => {
                  const member = members.find(m => m.user.id === id);
                  return (
                    <div key={id} className="flex items-center gap-2 bg-primary text-primary-foreground rounded-full pl-1 pr-2 py-1 shadow-sm animate-in fade-in zoom-in duration-200">
                       <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[8px] font-bold">
                         {member?.user?.name?.charAt(0)}
                       </div>
                       <span className="text-[10px] font-bold">{member?.user?.name}</span>
                       <button 
                         type="button" 
                         onClick={() => setAttendeeIds(attendeeIds.filter(a => a !== id))}
                         className="p-0.5 hover:bg-white/10 rounded-full transition-colors"
                       >
                         <X className="w-3 h-3" />
                       </button>
                    </div>
                  );
                })}
                <input 
                  type="text"
                  placeholder={attendeeIds.length === 0 ? "Cari dan pilih anggota..." : ""}
                  className="flex-1 bg-transparent border-none outline-none text-sm px-2 min-w-[120px]"
                  onFocus={() => document.getElementById('user-dropdown')?.classList.remove('hidden')}
                  onBlur={() => setTimeout(() => document.getElementById('user-dropdown')?.classList.add('hidden'), 200)}
                  onChange={(e) => {
                    const search = e.target.value.toLowerCase();
                    const items = document.querySelectorAll('.user-item');
                    items.forEach((item: any) => {
                      if (item.innerText.toLowerCase().includes(search)) {
                        item.style.display = 'flex';
                      } else {
                        item.style.display = 'none';
                      }
                    });
                  }}
                />
              </div>

              {/* Custom Dropdown Menu */}
              <div 
                id="user-dropdown"
                className="absolute z-50 left-0 right-0 top-full mt-2 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden hidden animate-in slide-in-from-top-2 duration-200"
              >
                <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                  {members.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground italic">Tidak ada anggota ditemukan</div>
                  ) : (
                    members.map(m => (
                      <div 
                        key={m.user.id} 
                        className={cn(
                          "user-item flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors cursor-pointer",
                          attendeeIds.includes(m.user.id) && "opacity-50 grayscale pointer-events-none"
                        )}
                        onClick={() => {
                          if (!attendeeIds.includes(m.user.id)) {
                            setAttendeeIds([...attendeeIds, m.user.id]);
                          }
                        }}
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {m.user.name?.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold">{m.user.name}</span>
                          <span className="text-[10px] text-muted-foreground">{m.user.email}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <AlignLeft className="w-3 h-3" /> Deskripsi
            </label>
            <MentionTextarea
              value={description}
              onChange={setDescription}
              members={members.filter((m: any) => m.user).map((m: any) => ({ id: m.user.id, name: m.user.name, avatar_url: m.user.avatar_url }))}
              onMentionsChange={setMentionIds}
              placeholder="Tambahkan detail event... ketik @ untuk tag orang"
              className="w-full bg-secondary/20 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[100px] resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:bg-secondary transition-all"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-8 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-md disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buat Event"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
