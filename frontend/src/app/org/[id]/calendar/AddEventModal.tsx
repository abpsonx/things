"use client";

import React, { useState } from "react";
import Modal from "@/components/ui/Modal";
import api from "@/lib/api";
import { Clock, AlignLeft, Loader2, AlertCircle, Users, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import MentionTextarea from "@/components/ui/MentionTextarea";

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  onSuccess: () => void;
}

const CATEGORIES = [
  { value: "meeting", label: "Meeting" },
  { value: "event", label: "Acara" },
  { value: "other", label: "Lainnya" },
];

export default function AddEventModal({ isOpen, onClose, orgId, onSuccess }: AddEventModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [category, setCategory] = useState("meeting");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    const fetchMembers = async () => {
      if (!isOpen || !orgId) return;
      try {
        const res = await api.get(`/organizations/${orgId}`);
        setMembers(res.data?.members || []);
      } catch (err) {
        console.error("Failed to fetch members", err);
      }
    };
    fetchMembers();
  }, [isOpen, orgId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startAt) return;
    setLoading(true);
    setError(null);
    try {
      await api.post(`/organizations/${orgId}/events`, {
        title,
        description,
        category,
        start_at: new Date(startAt).toISOString(),
        end_at: endAt ? new Date(endAt).toISOString() : null,
        attendee_ids: attendeeIds,
        mention_ids: mentionIds,
      });
      onSuccess();
      onClose();
      setTitle("");
      setDescription("");
      setStartAt("");
      setEndAt("");
      setCategory("meeting");
      setAttendeeIds([]);
      setMentionIds([]);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Gagal membuat meeting.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Meeting Workspace Baru">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Judul</label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Townhall All Staff"
              className="w-full bg-secondary/20 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Tag className="w-3 h-3" /> Kategori</label>
            <div className="flex gap-2">
              {CATEGORIES.map((c) => (
                <button key={c.value} type="button" onClick={() => setCategory(c.value)}
                  className={cn("flex-1 py-2 rounded-xl text-xs font-bold border transition-all", category === c.value ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/20 border-border hover:bg-secondary")}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> Mulai</label>
              <input type="datetime-local" required value={startAt} onChange={(e) => setStartAt(e.target.value)}
                className="w-full bg-secondary/20 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-xs" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> Selesai (Opsional)</label>
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)}
                className="w-full bg-secondary/20 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-xs" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Users className="w-3 h-3" /> Undang Khusus (Opsional)</label>
            <p className="text-[10px] text-muted-foreground">Meeting workspace otomatis terlihat semua anggota. Pilih di sini hanya jika ingin menandai peserta tertentu.</p>
            <div className="flex flex-wrap gap-2 p-2 bg-secondary/20 border border-border rounded-xl min-h-[50px]">
              {attendeeIds.map((id) => {
                const member = members.find((m) => m.user?.id === id);
                return (
                  <div key={id} className="flex items-center gap-2 bg-primary text-primary-foreground rounded-full pl-1 pr-2 py-1 shadow-sm">
                    <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[8px] font-bold">{member?.user?.name?.charAt(0)}</div>
                    <span className="text-[10px] font-bold">{member?.user?.name}</span>
                    <button type="button" onClick={() => setAttendeeIds(attendeeIds.filter((a) => a !== id))} className="p-0.5 hover:bg-white/10 rounded-full"><X className="w-3 h-3" /></button>
                  </div>
                );
              })}
            </div>
            <div className="max-h-[160px] overflow-y-auto custom-scrollbar border border-border rounded-xl divide-y divide-border">
              {members.filter((m) => m.user && !attendeeIds.includes(m.user.id)).map((m) => (
                <button key={m.user.id} type="button" onClick={() => setAttendeeIds([...attendeeIds, m.user.id])}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary transition-colors text-left">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{m.user.name?.charAt(0)}</div>
                  <div className="flex flex-col"><span className="text-sm font-bold">{m.user.name}</span><span className="text-[10px] text-muted-foreground">{m.user.email}</span></div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><AlignLeft className="w-3 h-3" /> Deskripsi</label>
            <MentionTextarea value={description} onChange={setDescription}
              members={members.filter((m: any) => m.user).map((m: any) => ({ id: m.user.id, name: m.user.name, avatar_url: m.user.avatar_url }))}
              onMentionsChange={setMentionIds}
              placeholder="Detail meeting... ketik @ untuk tag orang"
              className="w-full bg-secondary/20 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[100px] resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="px-6 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:bg-secondary transition-all">Batal</button>
          <button type="submit" disabled={loading} className="flex items-center gap-2 bg-primary text-primary-foreground px-8 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-md disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buat Meeting"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
