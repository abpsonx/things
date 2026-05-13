"use client";

import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { 
  Clock, 
  MessageSquare, 
  Paperclip,
  CheckCircle2,
  Circle,
  AlertCircle,
  Calendar
} from "lucide-react";
import { format } from "date-fns";

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: "low" | "medium" | "high";
  due_date?: string;
  created_at: string;
  comments_count?: number;
  attachments_count?: number;
}

export default function TaskCard({ task, isOverlay, onClick }: { task: Task, isOverlay?: boolean, onClick?: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const priorityColors = {
    high: "bg-priority-high",
    medium: "bg-priority-medium",
    low: "bg-priority-low",
  };

  if (isDragging && !isOverlay) {
    return (
      <div 
        ref={setNodeRef}
        style={style}
        className="h-32 bg-secondary/50 border-2 border-dashed border-border rounded-xl mb-3"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "p-4 bg-card border border-border rounded-xl mb-3 hover:border-primary/30 hover:shadow-sm transition-all group cursor-grab active:cursor-grabbing",
        isOverlay && "shadow-xl border-primary scale-105 rotate-2"
      )}
    >
      <div className="space-y-3">
        {/* Labels & Priority */}
        <div className="flex items-center gap-2">
          <div className={cn("w-1.5 h-1.5 rounded-full", priorityColors[task.priority])} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {task.priority}
          </span>
        </div>

        <h4 className="text-sm font-bold leading-snug group-hover:text-primary transition-colors">
          {task.title}
        </h4>

        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {task.description}
          </p>
        )}

        {/* Footer info */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
            {/* Created At */}
            <div className="flex items-center gap-1 text-[9px] opacity-70" title="Dibuat pada">
              <Calendar className="w-2.5 h-2.5" />
              {format(new Date(task.created_at), "d MMM")}
            </div>

            {/* Due Date */}
            {task.due_date && (
              <div className="flex items-center gap-1 text-[9px] font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded" title="Deadline">
                <Clock className="w-2.5 h-2.5" />
                {format(new Date(task.due_date), "d MMM")}
              </div>
            )}

            {/* Comments Count */}
            {(task.comments_count || 0) > 0 && (
              <div className="flex items-center gap-1 text-[9px]" title="Komentar">
                <MessageSquare className="w-2.5 h-2.5" />
                {task.comments_count}
              </div>
            )}

            {/* Attachments Count */}
            {(task.attachments_count || 0) > 0 && (
              <div className="flex items-center gap-1 text-[9px] text-blue-500 font-bold" title="Lampiran">
                <Paperclip className="w-2.5 h-2.5" />
                {task.attachments_count}
              </div>
            )}
          </div>
          
          <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm">
            JD
          </div>
        </div>
      </div>
    </div>
  );
}
