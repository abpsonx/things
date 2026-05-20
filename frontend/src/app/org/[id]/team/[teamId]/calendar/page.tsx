"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Loader2,
  CheckSquare,
  X,
  Trash2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import TeamNav from "@/components/team/TeamNav";

export default function TeamCalendarPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;

  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", date: "", time: "",
    visibility: "public", category: "meeting", attendeeIds: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [teamRes, eventsRes, tasksRes, memRes] = await Promise.all([
        api.get(`/organizations/${orgId}/teams/${teamId}`),
        api.get(`/organizations/${orgId}/teams/${teamId}/events`),
        api.get(`/organizations/${orgId}/teams/${teamId}/tasks`),
        api.get(`/organizations/${orgId}/teams/${teamId}/members`),
      ]);
      setTeam(teamRes.data);
      setEvents(eventsRes.data || []);
      setTasks((tasksRes.data || []).filter((t: any) => t.due_date && t.status !== "done"));
      setMembers(memRes.data || []);
    } catch (err) {
      console.error("Failed to fetch team calendar", err);
    } finally {
      setLoading(false);
    }
  }, [orgId, teamId]);

  useEffect(() => {
    if (orgId && teamId) fetchData();
  }, [orgId, teamId, fetchData]);

  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const monthName = currentDate.toLocaleString("id-ID", { month: "long" });
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
  const totalDays = [...Array(firstDayOfMonth(year, month)).fill(null), ...days];

  const eventsForDay = (day: number) =>
    events.filter((e) => {
      const d = new Date(e.start_at);
      return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
    });

  const tasksForDay = (day: number) =>
    tasks.filter((t) => {
      const d = new Date(t.due_date);
      return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
    });

  const priorityColor = (p?: string) =>
    p === "high" ? "border-red-500 bg-red-50 text-red-700"
      : p === "medium" ? "border-amber-500 bg-amber-50 text-amber-700"
      : "border-emerald-500 bg-emerald-50 text-emerald-700";

  const openAdd = (day?: number) => {
    const d = day ? new Date(year, month, day) : new Date();
    setForm({
      title: "",
      description: "",
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      time: "09:00",
      visibility: "public",
      category: "meeting",
      attendeeIds: [],
    });
    setIsAdding(true);
  };

  const memberOptions = members
    .filter((m: any) => m.user)
    .map((m: any) => ({ id: m.user_id || m.user.id, name: m.user.name, avatar_url: m.user.avatar_url }));

  const toggleAttendee = (id: string) => {
    setForm((f) => ({ ...f, attendeeIds: f.attendeeIds.includes(id) ? f.attendeeIds.filter((x) => x !== id) : [...f.attendeeIds, id] }));
  };

  const saveEvent = async () => {
    if (!form.title || !form.date) return;
    setSaving(true);
    try {
      const start = `${form.date}T${form.time || "09:00"}:00`;
      await api.post(`/organizations/${orgId}/teams/${teamId}/events`, {
        title: form.title,
        description: form.description,
        start_at: start,
        visibility: form.visibility,
        category: form.category,
        attendee_ids: form.attendeeIds,
      });
      setIsAdding(false);
      await fetchData();
    } catch (err) {
      console.error("Failed to create event", err);
      alert("Gagal membuat jadwal");
    } finally {
      setSaving(false);
    }
  };

  const CATEGORIES = [
    { value: "meeting", label: "Meeting", emoji: "🤝" },
    { value: "event", label: "Event", emoji: "📅" },
    { value: "sale", label: "Sale", emoji: "🏷️" },
    { value: "promo", label: "Promo", emoji: "🎉" },
    { value: "other", label: "Lainnya", emoji: "📌" },
  ];
  const categoryEmoji = (c?: string) => CATEGORIES.find((x) => x.value === c)?.emoji || "📅";

  const deleteEvent = async (id: string) => {
    if (!confirm("Hapus jadwal ini?")) return;
    try {
      await api.delete(`/organizations/${orgId}/teams/${teamId}/events/${id}`);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error("Failed to delete event", err);
    }
  };

  const dayLabels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#fafafa] dark:bg-background">
      {/* Header */}
      <div className="border-b border-border px-8 py-5 flex items-center justify-between bg-white/80 dark:bg-card/60 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-500/20">
              <CalendarIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">{team?.name}</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Jadwal Tim</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => openAdd()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all"
        >
          <Plus className="w-4 h-4" />
          Jadwal Baru
        </button>
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="flex-1 p-8 space-y-6 max-w-6xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 border border-border rounded-xl overflow-hidden bg-card">
                <button onClick={prevMonth} className="p-2.5 hover:bg-secondary transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={goToday} className="px-4 py-2 text-[10px] font-bold border-x border-border hover:bg-secondary transition-colors uppercase tracking-widest">Hari Ini</button>
                <button onClick={nextMonth} className="p-2.5 hover:bg-secondary transition-colors"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <h2 className="text-xl font-bold tracking-tight capitalize">{monthName} {year}</h2>
            </div>

            {/* Grid */}
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-7 border-b border-border bg-secondary/20">
                {dayLabels.map((d) => (
                  <div key={d} className="py-4 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 auto-rows-[120px] md:auto-rows-[150px]">
                {totalDays.map((day, i) => {
                  const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                  const dayEvents = day ? eventsForDay(day) : [];
                  const dayTasks = day ? tasksForDay(day) : [];
                  return (
                    <div key={i} className={cn("border-r border-b border-border p-2 space-y-1.5 hover:bg-secondary/10 transition-colors group relative", (i + 1) % 7 === 0 && "border-r-0", !day && "bg-secondary/5")}>
                      {day && (
                        <>
                          <div className={cn("w-7 h-7 flex items-center justify-center text-xs font-bold rounded-full transition-all", isToday ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground group-hover:text-foreground")}>
                            {day}
                          </div>
                          <div className="space-y-1 overflow-y-auto max-h-[80px] md:max-h-[100px]">
                            {dayEvents.map((e) => (
                              <div key={e.id} className="group/ev px-2 py-1 bg-primary/10 border-l-2 border-primary rounded-r-md text-[9px] font-bold text-primary truncate flex items-center justify-between gap-1" title={`${e.title}${e.visibility === "private" ? " (privat)" : ""}`}>
                                <span className="truncate flex items-center gap-1">
                                  <span className="shrink-0">{categoryEmoji(e.category)}</span>
                                  {e.visibility === "private" && <span className="shrink-0">🔒</span>}
                                  {e.title}
                                </span>
                                <button onClick={() => deleteEvent(e.id)} className="opacity-0 group-hover/ev:opacity-100 shrink-0 hover:text-red-500">
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ))}
                            {dayTasks.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => router.push(`/org/${orgId}/team/${teamId}/board?task=${t.id}`)}
                                className={cn("w-full text-left px-2 py-1 border-l-2 rounded-r-md text-[9px] font-bold truncate hover:opacity-80", priorityColor(t.priority))}
                                title={t.title}
                              >
                                <span className="flex items-center gap-1"><CheckSquare className="w-2.5 h-2.5 shrink-0" /> {t.title}</span>
                              </button>
                            ))}
                          </div>
                          <button onClick={() => openAdd(day)} className="absolute bottom-1.5 right-1.5 p-1 bg-background border border-border rounded-lg opacity-0 group-hover:opacity-100 hover:border-primary transition-all shadow-sm">
                            <Plus className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add event modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsAdding(false)}>
          <div className="bg-card rounded-3xl w-full max-w-md shadow-2xl border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-bold">Jadwal Baru</h2>
              <button onClick={() => setIsAdding(false)} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
              <input
                autoFocus
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Judul jadwal..."
                className="w-full px-3 py-2.5 rounded-2xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="px-3 py-2.5 rounded-2xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="px-3 py-2.5 rounded-2xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>

              {/* Kategori */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Kategori</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm({ ...form, category: c.value })}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                        form.category === c.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary/50",
                      )}
                    >
                      <span>{c.emoji}</span> {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Visibility */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Visibilitas</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm({ ...form, visibility: "public" })} className={cn("flex-1 px-3 py-2 rounded-xl text-xs font-bold border transition-all", form.visibility === "public" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary/50")}>
                    🌐 Umum (semua tim)
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, visibility: "private" })} className={cn("flex-1 px-3 py-2 rounded-xl text-xs font-bold border transition-all", form.visibility === "private" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary/50")}>
                    🔒 Rahasia (peserta saja)
                  </button>
                </div>
              </div>

              {/* Peserta */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Peserta {form.attendeeIds.length === 0 ? (form.visibility === "public" ? "(semua tim)" : "(pilih minimal 1)") : `(${form.attendeeIds.length})`}
                </label>
                <div className="flex flex-wrap gap-2">
                  {memberOptions.map((m: any) => {
                    const sel = form.attendeeIds.includes(m.id);
                    return (
                      <button key={m.id} type="button" onClick={() => toggleAttendee(m.id)} className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all", sel ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary/50")}>
                        {sel && <Check className="w-3 h-3" />}
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Deskripsi (opsional)..."
                className="w-full px-3 py-2.5 rounded-2xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm min-h-[70px] resize-none"
              />
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setIsAdding(false)} disabled={saving} className="px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50">Batal</button>
              <button onClick={saveEvent} disabled={saving || !form.title || !form.date} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 shadow-md shadow-primary/20">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
