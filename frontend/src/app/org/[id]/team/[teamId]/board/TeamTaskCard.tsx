"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { MessageSquare, Paperclip, Calendar, Flag, MoreHorizontal } from "lucide-react";
import { format, isValid } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: "low" | "medium" | "high";
  due_date?: string;
  created_at: string;
  comments_count?: number;
  attachments_count?: number;
  assignee?: { name: string; avatar_url?: string };
  assignees?: { id?: string; name: string; avatar_url?: string }[];
}

const PRIORITY_META: Record<string, { label: string; flagColor: string; textColor: string } | undefined> = {
  high: { label: "HIGH PRIORITY", flagColor: "text-red-500", textColor: "text-red-500" },
  medium: { label: "MEDIUM PRIORITY", flagColor: "text-amber-500", textColor: "text-amber-500" },
  low: { label: "LOW PRIORITY", flagColor: "text-emerald-500", textColor: "text-emerald-500" },
};

export default function TeamTaskCard({
  task,
  isOverlay,
  onClick,
}: {
  task: Task;
  isOverlay?: boolean;
  onClick?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = { transform: CSS.Translate.toString(transform), transition };

  if (isDragging && !isOverlay) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="h-28 bg-secondary/40 border-2 border-dashed border-border rounded-2xl mb-2"
      />
    );
  }

  const priority = PRIORITY_META[task.priority];
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
      onClick={onClick}
      className={cn(
        "relative p-4 bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all cursor-grab active:cursor-grabbing border border-border/70 mb-3 group",
        isOverlay && "shadow-2xl scale-[1.02] rotate-1",
      )}
    >
      {/* Top row: priority + menu */}
      <div className="flex items-start justify-between mb-2">
        {priority ? (
          <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-wider", priority.textColor)}>
            <Flag className={cn("w-3 h-3 fill-current", priority.flagColor)} />
            {priority.label}
          </span>
        ) : <span />}
        <button
          type="button"
          title="Buka detail"
          onClick={(e) => { e.stopPropagation(); onClick?.(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Title */}
      <h4 className="text-[14px] font-extrabold leading-snug text-foreground mb-2">{task.title}</h4>

      {/* Assignee + due date row */}
      {(() => {
        const people = (task.assignees && task.assignees.length)
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
                    className="w-6 h-6 rounded-full bg-secondary border border-background flex items-center justify-center text-[9px] font-bold overflow-hidden"
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
                  <div className="w-6 h-6 rounded-full bg-secondary border border-background flex items-center justify-center text-[8px] font-bold text-muted-foreground">
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

      {/* Description */}
      {task.description && (
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-3">
          {task.description}
        </p>
      )}

      {/* Footer: files / comments */}
      {(filesCount > 0 || commentsCount > 0) && (
        <div className="flex items-center justify-between pt-3 border-t border-border/60 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            {filesCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> {filesCount} files
              </span>
            )}
            {commentsCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> {commentsCount}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
