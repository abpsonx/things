"use client";

import React, { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Calendar as CalendarIcon, Clock, AlignLeft, Trash2, User as UserIcon, Users, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useParams } from "next/navigation";

interface EventDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: any;
  onDelete: (id: string) => void;
  onUpdate?: () => void;
  canManage?: boolean;
}

export default function EventDetailModal({ isOpen, onClose, event, onDelete, onUpdate, canManage }: EventDetailModalProps) {
  const { user } = useAuthStore();
  const { id: orgId } = useParams();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!event) return null;

  const myAttendee = event.attendees?.find((a: any) => a.user_id === user?.id);
  const myStatus = myAttendee?.status;

  const handleRSVP = async (status: "accepted" | "declined") => {
    try {
      setIsSubmitting(true);
      await api.patch(`/organizations/${orgId}/events/${event.id}/rsvp`, { status });
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Failed to RSVP", error);
      alert("Gagal merespon undangan");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detail Meeting">
      <div className="space-y-6 p-1">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-foreground">{event.title}</h3>
            {event.category && event.category !== "meeting" && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{event.category}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <CalendarIcon className="w-3 h-3" />
            <span>{new Date(event.start_at).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-secondary/20 border border-border rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> Mulai</span>
            <div className="text-sm font-medium">{new Date(event.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
          <div className="p-3 bg-secondary/20 border border-border rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> Selesai</span>
            <div className="text-sm font-medium">{event.end_at ? new Date(event.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</div>
          </div>
        </div>

        {event.description && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><AlignLeft className="w-3 h-3" /> Deskripsi</span>
            <div className="p-4 bg-secondary/10 border border-border rounded-2xl text-sm leading-relaxed whitespace-pre-wrap">{event.description}</div>
          </div>
        )}

        {event.attendees && event.attendees.length > 0 && (
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Users className="w-3 h-3" /> Peserta</span>
            <div className="flex flex-wrap gap-2">
              {event.attendees.map((att: any) => (
                <div key={att.id} className={cn("flex items-center gap-2 border rounded-full pl-1 pr-3 py-1",
                  att.status === "accepted" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600" :
                  att.status === "declined" ? "border-red-500/30 bg-red-500/5 text-red-600" : "border-border bg-secondary/10")}>
                  <div className="w-6 h-6 rounded-full bg-background flex items-center justify-center text-[8px] font-bold border border-border/50 overflow-hidden">
                    {att.user?.avatar_url ? <img src={att.user.avatar_url} alt="" className="w-full h-full object-cover" /> : att.user?.name?.charAt(0)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold">{att.user?.name}</span>
                    {att.status === "accepted" && <CheckCircle2 className="w-3 h-3" />}
                    {att.status === "declined" && <XCircle className="w-3 h-3" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RSVP — open to every workspace member */}
        <div className="p-4 border border-border rounded-2xl bg-secondary/10 space-y-3">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">RSVP Kehadiran</span>
          <div className="flex gap-2">
            <button onClick={() => handleRSVP("accepted")} disabled={isSubmitting || myStatus === "accepted"}
              className={cn("flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all border",
                myStatus === "accepted" ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-600" : "bg-background border-border hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/30")}>
              <CheckCircle2 className="w-4 h-4" /> Hadir
            </button>
            <button onClick={() => handleRSVP("declined")} disabled={isSubmitting || myStatus === "declined"}
              className={cn("flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all border",
                myStatus === "declined" ? "bg-red-500/20 border-red-500/30 text-red-600" : "bg-background border-border hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/30")}>
              <XCircle className="w-4 h-4" /> Tidak Hadir
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
              {event.creator?.name?.charAt(0) || <UserIcon className="w-4 h-4" />}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold">{event.creator?.name || "User"}</span>
              <span className="text-[8px] text-muted-foreground">Pembuat Meeting</span>
            </div>
          </div>
          {(user?.id === event.creator?.id || canManage) && (
            <button onClick={() => { if (confirm("Hapus meeting ini?")) onDelete(event.id); }}
              className="flex items-center gap-2 px-4 py-2 text-red-500 hover:bg-red-500/10 rounded-xl text-xs font-bold transition-all">
              <Trash2 className="w-4 h-4" /> Hapus
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
