"use client";

import React, { useState, useRef, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { MessageSquare, Paperclip, CheckSquare, Calendar, Flag, MoreHorizontal, Check, Edit2, Copy, Archive } from "lucide-react";
import { format, isValid } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import api from "@/lib/api";
import { MarkdownText } from "@/components/ui/Markdown";

interface Label {
  id: string;
  name: string;
  color: string;
}

interface SubTask {
  id: string;
  is_done: boolean;
}

interface User {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: "low" | "medium" | "high";
  due_date?: string;
  created_at: string;
  comments_count?: number;
  attachments_count?: number;
  subtasks?: SubTask[];
  labels?: Label[];
  assignee?: User | null;
  assignees?: { id?: string; name: string; avatar_url?: string }[];
}

const PRIORITY_META: Record<string, { label: string; flagColor: string; textColor: string } | undefined> = {
  high: { label: "HIGH PRIORITY", flagColor: "text-red-500", textColor: "text-red-500" },
  medium: { label: "MEDIUM PRIORITY", flagColor: "text-amber-500", textColor: "text-amber-500" },
  low: { label: "LOW PRIORITY", flagColor: "text-emerald-500", textColor: "text-emerald-500" },
};

export default function TaskCard({
  task,
  isOverlay,
  onClick,
  onDuplicate,
  onArchive,
  selected,
  onToggleSelect,
  selectMode,
}: {
  task: Task;
  isOverlay?: boolean;
  onClick?: () => void;
  onDuplicate?: () => void | Promise<void>;
  onArchive?: () => void | Promise<void>;
  selected?: boolean;
  onToggleSelect?: () => void;
  selectMode?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = { transform: CSS.Translate.toString(transform), transition };

  // All hooks must be called unconditionally before any early return.
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.select();
  }, [isEditingTitle]);

  if (isDragging && !isOverlay) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="h-20 bg-secondary/40 border-2 border-dashed border-border rounded-xl mb-2"
      />
    );
  }

  const saveTitle = async () => {
    const next = editTitle.trim();
    if (!next || next === task.title) {
      setIsEditingTitle(false);
      setEditTitle(task.title);
      return;
    }
    try {
      // The board page passes projectId via the route; we use the API path
      // that exists for project tasks. Team-only cards still get the modal
      // via double-click since title save would need a team route.
      const projectId = (task as any).project_id;
      if (projectId) {
        await api.put(`/projects/${projectId}/tasks/${task.id}`, { title: next });
        (task as any).title = next;
      }
    } catch (err) {
      console.error("Failed to rename task", err);
      setEditTitle(task.title);
    } finally {
      setIsEditingTitle(false);
    }
  };

  const priority = task.priority ? PRIORITY_META[task.priority] : undefined;
  const subtasks = task.subtasks || [];
  const doneCount = subtasks.filter((s) => s.is_done).length;
  const firstLabel = (task.labels || [])[0];
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const dueDateValid = !!dueDate && isValid(dueDate);
  const filesCount = task.attachments_count || 0;
  const commentsCount = task.comments_count || 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (selectMode && onToggleSelect) {
          e.preventDefault();
          onToggleSelect();
          return;
        }
        onClick?.();
      }}
      className={cn(
        "no-native-drag relative p-2.5 bg-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all cursor-grab active:cursor-grabbing border border-border/70 mb-2 group",
        isOverlay && "shadow-2xl scale-[1.02] rotate-1",
        selected && "ring-2 ring-primary border-primary",
      )}
    >
      {/* Selection checkbox — only when in select mode or already selected */}
      {(selectMode || selected) && onToggleSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={cn(
            "absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all border-2",
            selected
              ? "bg-primary border-primary text-white"
              : "bg-card border-border text-transparent hover:border-primary",
          )}
        >
          <Check className="w-3 h-3" />
        </button>
      )}

      {/* Top row: priority + menu */}
      <div className="flex items-start justify-between mb-1">
        {priority ? (
          <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-wider", priority.textColor)}>
            <Flag className={cn("w-3 h-3 fill-current", priority.flagColor)} />
            {priority.label}
          </span>
        ) : <span />}
        <div ref={menuRef} className="relative" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            title="Aksi tugas"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-0.5 -m-0.5"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[150px] bg-card border border-border rounded-xl shadow-xl py-1 animate-in zoom-in-95 duration-100">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onClick?.(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary text-foreground transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
              {onDuplicate && (
                <button
                  type="button"
                  onClick={async (e) => { e.stopPropagation(); setMenuOpen(false); await onDuplicate(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary text-foreground transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" /> Duplikat
                </button>
              )}
              {onArchive && (
                <button
                  type="button"
                  onClick={async (e) => { e.stopPropagation(); setMenuOpen(false); await onArchive(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary text-foreground transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" /> Arsipkan
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Title (double-click to edit) */}
      {isEditingTitle ? (
        <input
          ref={titleInputRef}
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); saveTitle(); }
            if (e.key === "Escape") { setIsEditingTitle(false); setEditTitle(task.title); }
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full text-[12.5px] font-bold leading-snug text-foreground mb-1.5 bg-background border border-primary/40 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      ) : (
        <h4
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditTitle(task.title);
            setIsEditingTitle(true);
          }}
          className="text-[12.5px] font-bold leading-snug text-foreground mb-1.5 cursor-text"
          title="Klik dua kali untuk rename"
        >
          {task.title}
        </h4>
      )}

      {/* Assignee + due date row */}
      {(() => {
        const people: any[] = (task.assignees && task.assignees.length)
          ? task.assignees
          : (task.assignee ? [task.assignee] : []);
        if (!people.length && !dueDateValid) return null;
        return (
        <div className="flex items-center justify-between gap-2 mb-2">
          {people.length > 0 ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex -space-x-1.5 shrink-0">
                {people.slice(0, 3).map((a: any, i: number) => (
                  <div
                    key={a.id || i}
                    className="w-5 h-5 rounded-full bg-secondary border border-background flex items-center justify-center text-[8px] font-bold overflow-hidden"
                    title={a.name}
                  >
                    {a.avatar_url ? (
                      <img src={a.avatar_url} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      (a.name || "?").charAt(0).toUpperCase()
                    )}
                  </div>
                ))}
                {people.length > 3 && (
                  <div className="w-5 h-5 rounded-full bg-secondary border border-background flex items-center justify-center text-[7px] font-bold text-muted-foreground">
                    +{people.length - 3}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-semibold text-foreground/80 truncate">
                {people.length === 1 ? people[0].name : `${people.length} orang`}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground italic">Belum ada assignee</span>
          )}
          {dueDateValid && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
              <Calendar className="w-3 h-3" />
              {format(dueDate!, "d MMM yyyy", { locale: idLocale })}
            </span>
          )}
        </div>
        );
      })()}

      {/* Description (rendered markdown, truncated 2 baris).
          pointer-events-none: anchor <a> di dalam markdown akan trigger
          native HTML5 link-drag yang konflik dengan dnd-kit PointerSensor —
          bikin task kelihatan ke-drag tapi snap back karena drag sebenarnya
          gak ke-aktivasi. Klik card untuk buka detail sudah cukup. */}
      {task.description && (
        <div className="pointer-events-none">
          <MarkdownText
            text={task.description}
            className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-2"
          />
        </div>
      )}

      {/* Footer: files / subtasks / comments / first label */}
      {(filesCount > 0 || commentsCount > 0 || subtasks.length > 0 || firstLabel) && (
        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            {filesCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> {filesCount} files
              </span>
            )}
            {subtasks.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <CheckSquare className="w-3 h-3" /> {doneCount}/{subtasks.length}
              </span>
            )}
            {commentsCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> {commentsCount}
              </span>
            )}
          </div>
          {firstLabel && (
            <span
              className="inline-flex items-center gap-1 font-semibold"
              style={{ color: firstLabel.color }}
              title={firstLabel.name}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: firstLabel.color }} />
              {firstLabel.name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
