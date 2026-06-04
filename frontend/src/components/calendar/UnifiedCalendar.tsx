"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  ChevronLeft, ChevronRight, Clock, Loader2, CheckSquare, Plus,
  Bell, BellOff, Trash2, X, Calendar as CalendarIcon, Lock, Globe, Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import MemberMultiSelect from "@/components/ui/MemberMultiSelect";
import MentionTextarea from "@/components/ui/MentionTextarea";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalendarScope =
  | { type: "global" }
  | { type: "org"; orgId: string }
  | { type: "team"; orgId: string; teamId: string }
  | { type: "project"; orgId: string; projectId: string };

interface ApiEvent {
  id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  category?: string | null;
  visibility?: string | null;
  reminder_minutes?: number | null;
  label_id?: string | null;
  label?: BrandLabel | null;
  created_by: string;
  project_id?: string | null;
  team_id?: string | null;
  org_id?: string | null;
  project?: { id: string; name: string; org_id?: string } | null;
  attendees?: Array<{ user_id: string; user?: { id: string; name: string; avatar_url?: string } }>;
}

interface OrgItem { id: string; name: string }
interface BrandLabel { id: string; name: string; color?: string | null }

// ─── Presets ─────────────────────────────────────────────────────────────────

const REMINDER_OPTIONS = [
  { value: "", label: "Tanpa alarm" },
  { value: "5", label: "5 menit sebelum" },
  { value: "15", label: "15 menit sebelum" },
  { value: "30", label: "30 menit sebelum" },
  { value: "60", label: "1 jam sebelum" },
  { value: "180", label: "3 jam sebelum" },
  { value: "1440", label: "1 hari sebelum" },
];

const CATEGORIES = [
  { value: "event",   label: "Event",   emoji: "📅", color: "bg-blue-100 border-blue-500 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100" },
  { value: "meeting", label: "Meeting", emoji: "🤝", color: "bg-purple-100 border-purple-500 text-purple-900 dark:bg-purple-950/40 dark:text-purple-100" },
  { value: "sale",    label: "Sale",    emoji: "🏷️", color: "bg-amber-100 border-amber-500 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" },
  { value: "promo",   label: "Promo",   emoji: "🎉", color: "bg-rose-100 border-rose-500 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100" },
  { value: "other",   label: "Lainnya", emoji: "📌", color: "bg-secondary border-foreground/30 text-foreground" },
];

const categoryMeta = (c?: string | null) => CATEGORIES.find((x) => x.value === c) || CATEGORIES[0];

function pad(n: number) { return String(n).padStart(2, "0"); }
function toInputDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toInputDateTime(d: Date) { return `${toInputDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

// ─── Endpoint mapping per scope ──────────────────────────────────────────────

function listEventsUrl(scope: CalendarScope): string {
  switch (scope.type) {
    case "global":  return "/projects/any/events/me";
    case "org":     return `/organizations/${scope.orgId}/events`;
    case "team":    return `/organizations/${scope.orgId}/teams/${scope.teamId}/events`;
    case "project": return `/projects/${scope.projectId}/events`;
  }
}

function listTasksUrl(scope: CalendarScope): string | null {
  switch (scope.type) {
    case "global":  return "/stats/my-tasks";
    case "org":     return null;
    case "team":    return `/organizations/${scope.orgId}/teams/${scope.teamId}/tasks`;
    case "project": return `/projects/${scope.projectId}/tasks`;
  }
}

function listMembersUrl(scope: CalendarScope): string | null {
  switch (scope.type) {
    case "global":  return null;
    case "org":     return `/organizations/${scope.orgId}`;
    case "team":    return `/organizations/${scope.orgId}/teams/${scope.teamId}/members`;
    case "project": return `/organizations/${scope.orgId}/projects/${scope.projectId}/members`;
  }
}

// CRUD selalu lewat /me/events — supports semua scope di backend.
const CRUD_BASE = "/me/events";

// Brands endpoint per scope. Untuk team scope pakai endpoint team
// (yg ngembaliin brand team itu). Untuk yg lain pakai endpoint org-level
// yg ngembaliin union org-level + semua team user.
function brandsListUrl(scope: CalendarScope): string | null {
  switch (scope.type) {
    case "global":  return null;  // perlu org_id; nanti di-pick dari orgs[0]
    case "org":     return `/organizations/${scope.orgId}/brands`;
    case "team":    return `/organizations/${scope.orgId}/teams/${scope.teamId}/briefs/_brands`;
    case "project": return `/organizations/${scope.orgId}/brands`;
  }
}
function brandsCreateUrl(scope: CalendarScope, fallbackOrgId?: string): string | null {
  switch (scope.type) {
    case "global":  return fallbackOrgId ? `/organizations/${fallbackOrgId}/brands` : null;
    case "org":     return `/organizations/${scope.orgId}/brands`;
    case "team":    return `/organizations/${scope.orgId}/teams/${scope.teamId}/briefs/_brands`;
    case "project": return `/organizations/${scope.orgId}/brands`;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function UnifiedCalendar({
  scope,
  title = "Kalender",
  subtitle,
}: {
  scope: CalendarScope;
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<"month" | "week">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<Array<{ id: string; name: string; avatar_url?: string }>>([]);
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [labels, setLabels] = useState<BrandLabel[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Inline create new brand label
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("");
  const [creatingLabel, setCreatingLabel] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApiEvent | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    start_at: "",
    end_at: "",
    category: "event",
    visibility: "public",
    reminder_minutes: "60",
    label_id: "",  // "" = tanpa label
    org_id: "",
    attendee_ids: [] as string[],
    mention_ids: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ─── Data fetch ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const eventsP = api.get(listEventsUrl(scope)).then((r) => r.data || []).catch(() => []);
      const taskUrl = listTasksUrl(scope);
      const tasksP = taskUrl ? api.get(taskUrl).then((r) => r.data || []).catch(() => []) : Promise.resolve([]);
      const memberUrl = listMembersUrl(scope);
      const membersP = memberUrl ? api.get(memberUrl).then((r) => r.data).catch(() => null) : Promise.resolve(null);
      const meP = api.get("/auth/me").then((r) => r.data).catch(() => null);
      // Orgs cuma kepake buat scope global (pilih workspace di modal create).
      const orgsP = scope.type === "global" ? api.get("/organizations").then((r) => r.data || []).catch(() => []) : Promise.resolve([]);
      const brandUrl = brandsListUrl(scope);
      const brandsP = brandUrl ? api.get(brandUrl).then((r) => r.data || []).catch(() => []) : Promise.resolve([]);

      const [evs, tks, memData, me, orgsList, brandsList] = await Promise.all([eventsP, tasksP, membersP, meP, orgsP, brandsP]);
      setEvents(evs);
      setTasks((tks || []).filter((t: any) => t.due_date && t.status !== "done"));
      setCurrentUserId(me?.id || null);
      setOrgs(orgsList);
      setLabels(brandsList);

      // Normalize member list shape (org uses {members:[]}, team/project return list of {user_id, user})
      let normalized: Array<{ id: string; name: string; avatar_url?: string }> = [];
      if (memData) {
        const raw = Array.isArray(memData) ? memData : (memData.members || []);
        normalized = raw
          .filter((m: any) => m.user)
          .map((m: any) => ({
            id: m.user_id || m.user.id,
            name: m.user.name,
            avatar_url: m.user.avatar_url,
          }));
      }
      setMembers(normalized);
    } catch (err) {
      console.error("Calendar fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Modal open helpers ─────────────────────────────────────────────────
  const openCreate = (atDate?: Date) => {
    const d = atDate ? new Date(atDate) : new Date();
    if (atDate) d.setHours(9, 0, 0, 0);
    else {
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
      visibility: "public",
      reminder_minutes: "60",
      label_id: "",
      org_id: scope.type === "global" ? (orgs[0]?.id || "") : (scope as any).orgId || "",
      attendee_ids: [],
      mention_ids: [],
    });
    setNewLabelName(""); setNewLabelColor("");
    setModalOpen(true);
  };

  const openEdit = (ev: ApiEvent) => {
    if (!currentUserId || ev.created_by !== currentUserId) {
      // Non-creator → redirect ke project calendar kalau ada, else toast
      if (ev.project) {
        router.push(`/org/${ev.project.org_id}/project/${ev.project.id}/calendar`);
      }
      return;
    }
    setEditing(ev);
    setForm({
      title: ev.title,
      description: ev.description || "",
      start_at: toInputDateTime(new Date(ev.start_at)),
      end_at: ev.end_at ? toInputDateTime(new Date(ev.end_at)) : "",
      category: ev.category || "event",
      visibility: ev.visibility || "public",
      reminder_minutes: ev.reminder_minutes != null ? String(ev.reminder_minutes) : "",
      label_id: ev.label_id || "",
      org_id: ev.org_id || "",
      attendee_ids: (ev.attendees || []).map((a) => a.user_id),
      mention_ids: [],
    });
    setNewLabelName(""); setNewLabelColor("");
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
        visibility: form.visibility,
        reminder_minutes: form.reminder_minutes ? parseInt(form.reminder_minutes, 10) : null,
        label_id: form.label_id || null,
        attendee_ids: form.attendee_ids,
      };
      if (editing) {
        if (!form.reminder_minutes) payload.clear_reminder = true;
        if (!form.label_id) payload.clear_label = true;
        const res = await api.patch(`${CRUD_BASE}/${editing.id}`, payload);
        setEvents((prev) => prev.map((e) => (e.id === editing.id ? res.data : e)));
      } else {
        // Scope info untuk create
        if (scope.type === "global") {
          if (!form.org_id) { alert("Pilih workspace"); setSaving(false); return; }
          payload.org_id = form.org_id;
        } else if (scope.type === "org") {
          payload.org_id = scope.orgId;
        } else if (scope.type === "team") {
          payload.team_id = scope.teamId;
        } else if (scope.type === "project") {
          payload.project_id = scope.projectId;
        }
        const res = await api.post(CRUD_BASE, payload);
        setEvents((prev) => [...prev, res.data]);
      }
      setModalOpen(false);
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async () => {
    if (!editing) return;
    if (!confirm(`Hapus event "${editing.title}"?`)) return;
    setDeleting(true);
    try {
      await api.delete(`${CRUD_BASE}/${editing.id}`);
      setEvents((prev) => prev.filter((e) => e.id !== editing.id));
      setModalOpen(false);
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal menghapus");
    } finally {
      setDeleting(false);
    }
  };

  // Inline create brand label. Untuk scope global pakai org yang lagi
  // dipilih di form (form.org_id). Untuk yang lain pakai scope-nya sendiri.
  const createLabel = async () => {
    const name = newLabelName.trim();
    if (!name) return;
    const fallback = scope.type === "global" ? form.org_id : undefined;
    const url = brandsCreateUrl(scope, fallback);
    if (!url) { alert("Pilih workspace dulu sebelum bikin label"); return; }
    setCreatingLabel(true);
    try {
      const res = await api.post(url, { name, color: newLabelColor || null });
      const created: BrandLabel = res.data;
      setLabels((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((f) => ({ ...f, label_id: created.id }));
      setNewLabelName(""); setNewLabelColor("");
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal bikin label");
    } finally {
      setCreatingLabel(false);
    }
  };

  // ─── Date helpers ───────────────────────────────────────────────────────
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

  const weekStart = useMemo(() => {
    const d = new Date(currentDate); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d;
  }, [currentDate]);
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }),
    [weekStart]);

  const getEventsForDate = (date: Date) =>
    events.filter((ev) => {
      const start = new Date(ev.start_at);
      const end = ev.end_at ? new Date(ev.end_at) : start;
      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
      return start <= dayEnd && end >= dayStart;
    });

  const getTasksForDate = (date: Date) =>
    tasks.filter((t) => {
      const d = new Date(t.due_date);
      return d.getDate() === date.getDate() && d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
    });

  const priorityColor = (p?: string) =>
    p === "high" ? "border-red-500 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100"
    : p === "medium" ? "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
    : p === "low" ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
    : "border-slate-400 bg-secondary text-foreground";

  const openTask = (t: any) => {
    if (t.project) router.push(`/org/${t.project.org_id}/project/${t.project.id}/board?task=${t.id}`);
    else if (t.team) router.push(`/org/${t.team.org_id}/team/${t.team.id}/board?task=${t.id}`);
  };

  const dayLabels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();
  const monthDays = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
  const paddingDays = firstDayOfMonth(year, month);
  const totalCells = [...Array(paddingDays).fill(null), ...monthDays];

  // ─── Chips ──────────────────────────────────────────────────────────────
  const EventChip = ({ ev }: { ev: ApiEvent }) => {
    const meta = categoryMeta(ev.category);
    const startD = new Date(ev.start_at);
    const isRange = ev.end_at && new Date(ev.end_at).toDateString() !== startD.toDateString();
    const isPrivate = ev.visibility === "private";
    return (
      <button
        onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
        className={cn(
          "w-full text-left px-2 py-1.5 border-l-2 rounded-r-md text-[11px] font-bold transition-all hover:opacity-80 shadow-sm truncate",
          meta.color,
        )}
        title={`${ev.title}${ev.description ? ` — ${ev.description}` : ""}${isPrivate ? " (privat)" : ""}`}
      >
        <div className="flex items-center gap-1 text-[9px] opacity-80 mb-0.5">
          <Clock className="w-2.5 h-2.5 shrink-0" />
          <span>{startD.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
          {ev.reminder_minutes != null && <Bell className="w-2.5 h-2.5 shrink-0" />}
          {isPrivate && <Lock className="w-2.5 h-2.5 shrink-0" />}
          {isRange && <span className="italic">· multi-hari</span>}
        </div>
        <span className="flex items-center gap-1 leading-tight">
          <span className="shrink-0">{meta.emoji}</span>
          <span className="truncate">{ev.title}</span>
        </span>
        {ev.label && (
          <span
            className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider"
            style={{
              backgroundColor: ev.label.color ? `${ev.label.color}30` : undefined,
              color: ev.label.color || undefined,
              border: `1px solid ${ev.label.color || "currentColor"}`,
            }}
          >
            <Tag className="w-2 h-2" /> {ev.label.name}
          </span>
        )}
      </button>
    );
  };

  const TaskChip = ({ t }: { t: any }) => (
    <button
      onClick={(e) => { e.stopPropagation(); openTask(t); }}
      className={cn(
        "w-full text-left px-2 py-1.5 border-l-2 rounded-r-md text-[11px] font-bold transition-all hover:opacity-80 shadow-sm truncate",
        priorityColor(t.priority),
      )}
      title={`${t.title}${t.project?.name ? ` — ${t.project.name}` : ""}${t.team?.name ? ` — ${t.team.name}` : ""}`}
    >
      <div className="flex items-center gap-1 text-[9px] opacity-80 mb-0.5">
        <CheckSquare className="w-2.5 h-2.5 shrink-0" />
        {t.is_overdue ? "OVERDUE" : "TUGAS"}
      </div>
      <span className="block leading-tight truncate">{t.title}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      {(title || subtitle) && (
        <div className="flex flex-col gap-2">
          {title && <h1 className="text-3xl font-bold tracking-tight">{title}</h1>}
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 border border-border rounded-2xl shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 border border-border rounded-xl overflow-hidden bg-background">
            <button onClick={prevPeriod} className="p-2.5 hover:bg-secondary transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={goToToday} className="px-4 py-2 text-[10px] font-bold border-x border-border hover:bg-secondary transition-colors uppercase tracking-widest">Hari Ini</button>
            <button onClick={nextPeriod} className="p-2.5 hover:bg-secondary transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <h2 className="text-xl font-bold tracking-tight capitalize">
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
            >Bulan</button>
            <button
              onClick={() => setView("week")}
              className={cn("px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors", view === "week" ? "bg-foreground text-background" : "hover:bg-secondary")}
            >Minggu</button>
          </div>
          <button
            onClick={() => openCreate()}
            disabled={scope.type === "global" && orgs.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 disabled:opacity-40 transition-all shadow-md"
          >
            <Plus className="w-4 h-4" /> Tambah Event
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-xl">
        <div className="grid grid-cols-7 border-b border-border bg-secondary/20">
          {dayLabels.map((d) => (
            <div key={d} className="py-4 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{d}</div>
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
              const isToday = !!cellDate &&
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
                      )}>{day}</div>
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
          <div className="grid grid-cols-7 min-h-[600px]">
            {weekDays.map((d, i) => {
              const isToday = d.getDate() === new Date().getDate() && d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
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
                    <div className={cn("text-[10px] font-bold uppercase tracking-widest", isToday ? "text-primary" : "text-muted-foreground")}>
                      {dayLabels[i]}
                    </div>
                    <div className={cn("w-8 h-8 flex items-center justify-center text-sm font-bold rounded-full", isToday ? "bg-primary text-primary-foreground shadow" : "text-foreground")}>
                      {d.getDate()}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {dayEvents.length === 0 && dayTasks.length === 0 && (
                      <p className="text-[10px] text-muted-foreground italic text-center py-4 opacity-60 group-hover:opacity-100">+ tambah</p>
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

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && !deleting && setModalOpen(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              <h3 className="font-extrabold text-base flex-1">{editing ? "Edit Event" : "Tambah Event Baru"}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>

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

            {/* Periode */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Mulai *</label>
                <input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Selesai</label>
                <input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic -mt-2">Isi "Selesai" untuk event multi-hari (mis. shoot 3 hari).</p>

            {/* Reminder */}
            <div>
              <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground flex items-center gap-1">
                {form.reminder_minutes ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />} Alarm
              </label>
              <select value={form.reminder_minutes} onChange={(e) => setForm({ ...form, reminder_minutes: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm">
                {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Label brand */}
            <div>
              <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground flex items-center gap-1">
                <Tag className="w-3 h-3" /> Label
              </label>
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={form.label_id}
                  onChange={(e) => setForm({ ...form, label_id: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="">— Tanpa label —</option>
                  {labels.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                {form.label_id && (() => {
                  const sel = labels.find((l) => l.id === form.label_id);
                  return sel?.color ? (
                    <span
                      className="inline-block w-5 h-5 rounded-full border border-border shrink-0"
                      style={{ backgroundColor: sel.color }}
                      title={sel.color}
                    />
                  ) : null;
                })()}
              </div>
              {/* Inline create */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <input
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createLabel(); } }}
                  placeholder="+ Brand baru…"
                  className="flex-1 px-2.5 py-1.5 text-xs bg-secondary/30 border border-dashed border-border rounded-lg outline-none focus:border-primary focus:bg-card"
                />
                <input
                  type="color"
                  value={newLabelColor || "#3b82f6"}
                  onChange={(e) => setNewLabelColor(e.target.value)}
                  className="w-8 h-8 rounded-lg border border-border cursor-pointer"
                  title="Warna label"
                />
                <button
                  type="button"
                  onClick={createLabel}
                  disabled={creatingLabel || !newLabelName.trim()}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40"
                >
                  {creatingLabel ? <Loader2 className="w-3 h-3 animate-spin" /> : "Buat"}
                </button>
              </div>
            </div>

            {/* Kategori */}
            <div>
              <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Kategori</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm({ ...form, category: c.value })}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all",
                      form.category === c.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary/50",
                    )}
                  ><span>{c.emoji}</span> {c.label}</button>
                ))}
              </div>
            </div>

            {/* Visibility */}
            <div>
              <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Visibilitas</label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, visibility: "public" })}
                  className={cn("flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all",
                    form.visibility === "public" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary/50")}
                ><Globe className="w-3.5 h-3.5" /> Umum</button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, visibility: "private" })}
                  className={cn("flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all",
                    form.visibility === "private" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary/50")}
                ><Lock className="w-3.5 h-3.5" /> Privat</button>
              </div>
            </div>

            {/* Peserta (kalau ada member yg bisa di-pick) */}
            {members.length > 0 && (
              <div>
                <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">
                  Peserta {form.visibility === "private" && form.attendee_ids.length === 0 ? "(pilih minimal 1)" : ""}
                </label>
                <div className="mt-1">
                  <MemberMultiSelect
                    members={members}
                    selectedIds={form.attendee_ids}
                    onChange={(ids) => setForm((f) => ({ ...f, attendee_ids: ids }))}
                    emptyLabel={form.visibility === "public" ? "Semua anggota" : "Pilih peserta"}
                  />
                </div>
              </div>
            )}

            {/* Deskripsi + mention */}
            <div>
              <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Deskripsi</label>
              <div className="mt-1">
                {members.length > 0 ? (
                  <MentionTextarea
                    value={form.description}
                    onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                    members={members}
                    onMentionsChange={(ids) => setForm((f) => ({ ...f, mention_ids: ids }))}
                    placeholder="Detail event… ketik @ untuk tag orang"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm min-h-[80px] resize-none"
                  />
                ) : (
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    placeholder="Detail event, agenda, lokasi…"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
                  />
                )}
              </div>
            </div>

            {/* Workspace picker — cuma create + global */}
            {!editing && scope.type === "global" && orgs.length > 1 && (
              <div>
                <label className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground">Workspace</label>
                <select
                  value={form.org_id}
                  onChange={(e) => setForm({ ...form, org_id: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                >
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
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
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Hapus
                </button>
              ) : <div />}
              <div className="flex items-center gap-2">
                <button onClick={() => setModalOpen(false)} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold text-muted-foreground hover:bg-secondary transition-all">Batal</button>
                <button
                  onClick={submitForm}
                  disabled={saving || !form.title.trim() || !form.start_at}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 hover:opacity-90 transition-all"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarIcon className="w-3.5 h-3.5" />}
                  {editing ? "Simpan" : "Tambah"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
