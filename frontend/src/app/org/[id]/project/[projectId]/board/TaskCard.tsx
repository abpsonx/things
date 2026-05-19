"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { MessageSquare, Paperclip, CheckSquare, Calendar } from "lucide-react";
import { format, isValid } from "date-fns";
import { id as idLocale } from "date-fns/locale";

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
}

// Lighten a hex color so dark background turns into a soft chip.
// Falls back to a neutral chip if the color is invalid.
function chipStyle(hex: string): React.CSSProperties {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return { background: "var(--secondary)", color: "var(--muted-foreground)" };
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return {
    background: `rgba(${r}, ${g}, ${b}, 0.12)`,
    color: `rgb(${Math.max(r - 20, 0)}, ${Math.max(g - 20, 0)}, ${Math.max(b - 20, 0)})`,
  };
}

export default function TaskCard({
  task,
  isOverlay,
  onClick,
}: {
  task: Task;
  isOverlay?: boolean;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = { transform: CSS.Translate.toString(transform), transition };

  if (isDragging && !isOverlay) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="h-24 bg-secondary/40 border-2 border-dashed border-border rounded-xl mb-2"
      />
    );
  }

  const subtasks = task.subtasks || [];
  const doneCount = subtasks.filter((s) => s.is_done).length;
  const labels = (task.labels || []).slice(0, 3);
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const dueDateValid = !!dueDate && isValid(dueDate);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "p-3 bg-card border border-border rounded-xl mb-2 hover:border-primary/40 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing",
        isOverlay && "shadow-xl border-primary scale-[1.02] rotate-1",
      )}
    >
      {/* Title */}
      <h4 className="text-[13px] font-bold leading-snug text-foreground">{task.title}</h4>

      {/* Description */}
      {task.description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed mt-1">
          {task.description}
        </p>
      )}

      {/* Labels */}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {labels.map((l) => (
            <span
              key={l.id}
              style={chipStyle(l.color)}
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
            >
              <span className="w-1 h-1 rounded-full" style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
      )}

      {/* Due date + subtask progress */}
      {(dueDateValid || subtasks.length > 0) && (
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          {dueDateValid && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {format(dueDate!, "d MMM yyyy", { locale: idLocale })}
            </span>
          )}
          {subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="w-3 h-3" />
              {doneCount}/{subtasks.length}
            </span>
          )}
        </div>
      )}

      {/* Footer: assignee + meta */}
      {(task.assignee || (task.comments_count || 0) > 0 || (task.attachments_count || 0) > 0) && (
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/60">
          {task.assignee ? (
            <div
              className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-[9px] font-bold overflow-hidden shrink-0"
              title={task.assignee.name}
            >
              {task.assignee.avatar_url ? (
                <img src={task.assignee.avatar_url} alt={task.assignee.name} className="w-full h-full object-cover" />
              ) : (
                (task.assignee.name || "?").charAt(0).toUpperCase()
              )}
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full border border-dashed border-border" title="Belum ada assignee" />
          )}

          <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
            {(task.attachments_count || 0) > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Paperclip className="w-3 h-3" />
                {task.attachments_count}
              </span>
            )}
            {(task.comments_count || 0) > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="w-3 h-3" />
                {task.comments_count}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
