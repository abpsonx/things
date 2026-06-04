"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

import api from "@/lib/api";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  CheckSquare,
  Plus,
  Bell,
  BellOff,
  Trash2,
  X,
  Calendar as CalendarIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type View = "month" | "week";

interface ApiEvent {
  id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  category?: string | null;
  reminder_minutes?: number | null;
  created_by: string;
  project_id?: string | null;
  team_id?: string | null;
  org_id?: string | null;
  project?: { id: string; name: string; org_id?: string } | null;
}

interface OrgItem { id: string; name: string }

const REMINDER_OPTIONS = [
  { value: "", label: "Tanpa alarm" },
  { value: "5", label: "5 menit sebelum" },
  { value: "15", label: "15 menit sebelum" },
  { value: "30", label: "30 menit sebelum" },
  { value: "60", label: "1 jam sebelum" },
  { value: "180", label: "3 jam sebelum" },
  { value: "1440", label: "1 hari sebelum" },
];

const CATEGORY_OPTIONS = [
  { value: "event", label: "Event" },
  { value: "meeting", label: "Meeting" },
  { value: "sale", label: "Sale" },
  { value: "promo", label: "Promo" },
  { value: "other", label: "Lainnya" },
];

const CATEGORY_COLOR: Record<string, string> = {
  event:   "bg-blue-100 border-blue-500 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100",
  meeting: "bg-purple-100 border-purple-500 text-purple-900 dark:bg-purple-950/40 dark:text-purple-100",
  sale:    "bg-amber-100 border-amber-500 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  promo:   "bg-rose-100 border-rose-500 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
  other:   "bg-secondary border-foreground/30 text-foreground",
};

function pad(n: number) { return String(n).padStart(2, "0"); }
function toInputDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toInputDateTime(d: Date) { return `${toInputDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

export default function GlobalCalendarPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgItem[]>([]);

  // Modal state — buat tambah & edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApiEvent | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    start_at: "",
    end_at: "",
    category: "event",
    reminder_minutes: "",
    org_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, tasksRes, meRes, orgsRes] = await Promise.all([
        api.get("/projects/any/events/me"),
        api.get("/stats/my-tasks"),
        api.get("/auth/me"),
        api.get("/organizations").catch(() => ({ data: [] })),
      ]);
      setEvents(eventsRes.data || []);
      setTasks((tasksRes.data || []).filter((t: any) => t.due_date));
      setCurrentUserId(meRes.data?.id || null);
      setOrgs(orgsRes.data || []);
    } catch (err) {
      console.error("Failed to fetch global calendar data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openTask = (t: any) => {
    if (t.project) router.push(`/org/${t.project.org_id}/project/${t.project.id}/board?task=${t.id}`);
    else if (t.team) router.push(`/org/${t.team.org_id}/team/${t.team.id}/board?task=${t.id}`);
  };

  const openCreate = (atDate?: Date) => {
    const d = atDate ? new Date(atDate) : new Date();
    if (atDate) {
      // default jam 9 pagi kalau klik dari cell (tanpa jam).
      d.setHours(9, 0, 0, 0);
    } else {
      // Default +1 jam dari sekarang, rounded ke 15 menit.
      d.setHours(d.getHours() + 1);
      d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    }
    const endDefault = new Date(d.getTime() + 60 * 60 * 1000);
    setEditing(null);
    setForm({
      title: "",
      description: "",
      start_at: toInputDateTime(d),
      end_at: toInputDateTime(endDefault),
      category: "event",
      reminder_minutes: "60",
      org_id: orgs[0]?.id || "",
    });
    setModalOpen(true);
  };

  const openEdit = (ev: ApiEvent) => {
    if (!currentUserId || ev.created_by !== currentUserId) {
      // Bukan creator — tetep buka tapi readonly. Untuk sekarang skip ke read-only mode.
      // Simple approach: redirect ke project calendar kalau memang ada project.
      if (ev.project) router.push(`/org/${ev.project.org_id}/project/${ev.project.id}/calendar`);
      return;
    }
    setEditing(ev);
    setForm({
      title: ev.title,
      description: ev.description || "",
      start_at: toInputDateTime(new Date(ev.start_at)),
      end_at: ev.end_at ? toInputDateTime(new Date(ev.end_at)) : "",
      category: ev.category || "event",
      reminder_minutes: ev.reminder_minutes != null ? String(ev.reminder_minutes) : "",
      org_id: ev.org_id || "",
    });
    setModalOpen(true);
  };

  const submitForm = async () => {
    if (!form.title.trim()) { alert("Judul wajib"); return; }
    if (!form.start_at) { alert("Tanggal mulai wajib"); return; }
    const start = new Date(form.start_at);
    const end = form.end_at ? new Date(form.end_at) : null;
    if (end && end <= start) { alert("Tanggal selesai harus setelah mulai"); return; }

    setSaving(true);
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description || null,
        start_at: start.toISOString(),
        end_at: end ? end.toISOString() : null,
        category: form.category,
        reminder_minutes: form.reminder_minutes ? parseInt(form.reminder_minutes, 10) : null,
      };
      if (editing) {
        if (!form.reminder_minutes) payload.clear_reminder = true;
        const res = await api.patch(`/me/events/${editing.id}`, payload);
        setEvents((prev) => prev.map((e) => (e.id === editing.id ? { ...e, ...res.data } : e)));
      } else {
        if (!form.org_id) { alert("Pilih workspace"); setSaving(false); return; }
        payload.org_id = form.org_id;
        const res = await api.post(`/me/events`, payload);
        setEvents((prev) => [...prev, res.data]);
      }
      setModalOpen(false);
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal menyimpan event");
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async () => {
    if (!editing) return;
    if (!confirm(`Hapus event "${editing.title}"?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/me/events/${editing.id}`);
      setEvents((prev) => prev.filter((e) => e.id !== editing.id));
      setModalOpen(false);
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal menghapus");
    } finally {
      setDeleting(false);
    }
  };

  // ─── Date helpers ─────────────────────────────────────────────────────────
  const monthName = currentDate.toLocaleString("id-ID", { month: "long" });
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevPeriod = () => {
    if (view === "month") setCurrentDate(new Date(year, month - 1, 1));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
  };
  const nextPeriod = () => {
    if (view === "month") setCurrentDate(new Date(year, month + 1, 1));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));
  };
  const goToToday = () => setCurrentDate(new Date());

  // Compute week start (Minggu) untuk weekly view
  const weekStart = useMemo(() => {
    const d = new Date(currentDate);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }, [currentDate]);
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const getEventsForDate = (date: Date) => {
    return events.filter((event) => {
      const start = new Date(event.start_at);
      const end = event.end_at ? new Date(event.end_at) : start;
      // Event muncul di semua tanggal dari start ke end (range support).
      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
      return start <= dayEnd && end >= dayStart;
    });
  };

  const getTasksForDate = (date: Date) => {
    return tasks.filter((t) => {
      const d = new Date(t.due_date);
      return d.getDate() === date.getDate() && d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
    });
  };

  const priorityColor = (priority?: string) => {
    if (priority === "high") return "border-red-500 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100";
    if (priority === "medium") return "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100";
    if (priority === "low") return "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100";
    return "border-slate-400 bg-secondary text-foreground";
  };

  const dayLabels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  // ─── Month grid build ─────────────────────────────────────────────────────
  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();
  const monthDays = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
  const paddingDays = firstDayOfMonth(year, month);
  const totalCells = [...Array(paddingDays).fill(null), ...monthDays];

  // Render shared bits
  const EventChip = ({ ev }: { ev: ApiEvent }) => {
    const color = CATEGORY_COLOR[ev.category || "event"] || CATEGORY_COLOR.event;
    const startD = new Date(ev.start_at);
    const isRange = ev.end_at && new Date(ev.end_at).toDateString() !== startD.toDateString();
    return (
      <button
        onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
        className={cn(
          "w-full text-left px-2 py-1.5 border-l-2 rounded-r-md text-[11px] font-bold transition-all hover:opacity-80 shadow-sm group/event truncate",
          color,
        )}
        title={`${ev.title}${ev.description ? ` — ${ev.description}` : ""}`}
      >
        <div className="flex items-center gap-1 text-[9px] opacity-80 mb-0.5">
          <Clock className="w-2.5 h-2.5 shrink-0" />
          {startD.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
          {ev.reminder_minutes != null && <Bell className="w-2.5 h-2.5 ml-0.5 shrink-0" />}
          {isRange && <span className="ml-1 italic">multi-day</span>}
        </div>
        <span className="block leading-tight">{ev.title}</span>
      </button>
    );
  };

  const TaskChip = ({ t }: { t: any }) => (
    <button
      onClick={(e) => { e.stopPropagation(); openTask(t); }}
      className={cn(
        "w-full text-left px-2 py-1.5 border-l-2 rounded-r-md text-[11px] font-bold transition-all cursor-pointer truncate shadow-sm hover:opacity-80",
        priorityColor(t.priority),
      )}
      title={`${t.title}${t.project?.name ? ` — ${t.project.name}` : ""}`}
    >
      <div className="flex items-center gap-1 text-[9px] opacity-80 mb-0.5">
        <CheckSquare className="w-2.5 h-2.5 shrink-0" />
        {t.is_overdue ? "OVERDUE" : "TASK"}
      </div>
      <span className="block leading-tight">{t.title}</span>
    </button>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Kalender Global</h1>
          <p className="text-muted-foreground">Semua agenda kamu — event, deadline tugas, periode pengerjaan.</p>
        </div>

        {/* Calendar Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 border border-border rounded-2xl shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 border border-border rounded-xl overflow-hidden bg-background">
              <button onClick={prevPeriod} className="p-2.5 hover:bg-secondary transition-colors"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={goToToday} className="px-4 py-2 text-[10px] font-bold border-x border-border hover:bg-secondary transition-colors uppercase tracking-widest">Hari Ini</button>
              <button onClick={nextPeriod} className="p-2.5 hover:bg-secondary transition-colors"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <h2 className="text-xl font-bold tracking-tight">
              {view === "month"
                ? `${monthName} ${year}`
                : `${weekDays[0].toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 border border-border rounded-xl overflow-hidden bg-background">
              <button
                onClick={() => setView("month")}
                className={cn("px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors", view === "month" ? "bg-foreground text-background" : "hover:bg-secondary")}
              >
                Bulan
              </button>
              <button
                onClick={() => setView("week")}
                className={cn("px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors", view === "week" ? "bg-foreground text-background" : "hover:bg-secondary")}
              >
                Minggu
              </button>
            </div>
            <button
              onClick={() => openCreate()}
              disabled={orgs.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 disabled:opacity-40 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" /> Tambah Event
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-xl">
          <div className="grid grid-cols-7 border-b border-border bg-secondary/20">
            {dayLabels.map((day) => (
              <div key={day} className="py-4 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{day}</div>
            ))}
          </div>

          {loading ? (
            <div className="h-[600px] flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : view === "month" ? (
            <div className="grid grid-cols-7 auto-rows-[140px] md:auto-rows-[180px]">
              {totalCells.map((day, i) => {
                const cellDate = day ? new Date(year, month, day) : null;
                const isToday = cellDate &&
                  cellDate.getDate() === new Date().getDate() &&
                  cellDate.getMonth() === new Date().getMonth() &&
                  cellDate.getFullYear() === new Date().getFullYear();
                const dayEvents = cellDate ? getEventsForDate(cellDate) : [];
                const dayTasks = cellDate ? getTasksForDate(cellDate) : [];

                return (
                  <div
                    key={i}
                    onClick={() => cellDate && openCreate(cellDate)}
                    className={cn(
                      "border-r border-b border-border p-2 space-y-1.5 hover:bg-secondary/10 transition-colors group relative",
                      (i + 1) % 7 === 0 && "border-r-0",
                      !day && "bg-secondary/5",
                      day && "cursor-pointer"
                    )}
                  >
                    {day && (
                      <>
                        <div className={cn(
                          "w-7 h-7 flex items-center justify-center text-xs font-bold rounded-full transition-all",
                          isToday ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground group-hover:text-foreground"
                        )}>
                          {day}
                        </div>
                        <div className="space-y-1 overflow-y-auto max-h-[100px] md:max-h-[140px] custom-scrollbar">
                          {dayEvents.map((ev) => <EventChip key={ev.id} ev={ev} />)}
                          {dayTasks.map((t) => <TaskChip key={t.id} t={t} />)}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // ─── Weekly view: 7-col, kolom lebih tinggi biar event detail kebaca ────
            <div className="grid grid-cols-7 min-h-[600px]">
              {weekDays.map((d, i) => {
                const isToday =
                  d.getDate() === new Date().getDate() &&
                  d.getMonth() === new Date().getMonth() &&
                  d.getFullYear() === new Date().getFullYear();
                const dayEvents = getEventsForDate(d);
                const dayTasks = getTasksForDate(d);
                return (
                  <div
                    key={i}
                    onClick={() => openCreate(d)}
                    className={cn(
                      "border-r border-border p-3 space-y-2 hover:bg-secondary/10 transition-colors cursor-pointer group",
                      i === 6 && "border-r-0",
                      isToday && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-baseline justify-between">
                      <div className={cn(
                        "text-[10px] font-bold uppercase tracking-widest",
                        isToday ? "text-primary" : "text-muted-foreground",
                      )}>
                        {dayLabels[i]}
                      </div>
                      <div className={cn(
                        "w-8 h-8 flex items-center justify-center text-sm font-bold rounded-full",
                        isToday ? "bg-primary text-primary-foreground shadow" : "text-foreground"
                      )}>
                        {d.getDate()}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {dayEvents.length === 0 && dayTasks.length === 0 && (
                        <p className="text-[10px] text-muted-foreground italic text-center py-4 opacity-60 group-hover:opacity-100">
                          + tambah
                        </p>
                      )}
                      {dayEvents.map((ev) => <EventChip key={ev.id} ev={ev} />)}
                      {dayTasks.map((t) => <TaskChip key={t.id} t={t} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal Tambah/Edit Event */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !saving && !deleting && setModalOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              <h3 className="font-extrabold text-base flex-1">
                {editing ? "Edit Event" : "Tambah Event Baru"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Title */}
            <div>
              <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Judul *</label>
              <input
                autoFocus={!editing}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Misal: Brief meeting tim ads"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Deskripsi</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Detail event, agenda, lokasi…"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
              />
            </div>

            {/* Periode pengerjaan */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Mulai *</label>
                <input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Selesai</label>
                <input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => setForm({ ...form, end_at: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic -mt-2">
              Periode pengerjaan: isi "Selesai" untuk event multi-hari (mis. shoot 3 hari).
            </p>

            {/* Reminder + Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground flex items-center gap-1">
                  {form.reminder_minutes ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />} Alarm
                </label>
                <select
                  value={form.reminder_minutes}
                  onChange={(e) => setForm({ ...form, reminder_minutes: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                >
                  {REMINDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Kategori</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Org picker — cuma waktu CREATE */}
            {!editing && (
              <div>
                <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Workspace</label>
                <select
                  value={form.org_id}
                  onChange={(e) => setForm({ ...form, org_id: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              {editing ? (
                <button
                  onClick={deleteEvent}
                  disabled={deleting || saving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-destructive hover:bg-destructive/10 transition-all disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Hapus
                </button>
              ) : <div />}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-muted-foreground hover:bg-secondary transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={submitForm}
                  disabled={saving || !form.title.trim() || !form.start_at}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 hover:opacity-90 transition-all"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarIcon className="w-3.5 h-3.5" />}
                  {editing ? "Simpan Perubahan" : "Tambah Event"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
