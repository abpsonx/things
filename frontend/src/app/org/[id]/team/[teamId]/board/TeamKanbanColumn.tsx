"use client";

import React, { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import TeamTaskCard from "./TeamTaskCard";

const COLUMN_TASK_LIMIT = 10;

interface ColumnProps {
  id: string;
  title: string;
  tasks: any[];
  // legacy color/badge props are accepted but ignored — we use the clean
  // monochrome look that matches the project board.
  color?: string;
  badge?: string;
  onAddTask: () => void;
  onTaskClick: (task: any) => void;
  onRename?: () => void;
  onDelete?: () => void;
}

export default function TeamKanbanColumn({
  id,
  title,
  tasks,
  onAddTask,
  onTaskClick,
  onRename,
  onDelete,
}: ColumnProps) {
  const { setNodeRef } = useDroppable({ id });
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visibleTasks = showAll ? tasks : tasks.slice(0, COLUMN_TASK_LIMIT);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col w-[256px] min-w-[256px] bg-card rounded-2xl p-3 border border-border min-h-[340px]"
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm tracking-tight">{title}</h3>
          <span className="text-[10px] font-medium bg-secondary/60 text-muted-foreground px-1.5 py-0.5 rounded-full shrink-0">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onAddTask}
            title="Tambah tugas baru"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          {(onRename || onDelete) && (
            <div className="relative">
              <button
                type="button"
                title="Opsi kolom"
                onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute top-full right-0 mt-1 w-40 bg-background border border-border rounded-xl shadow-2xl z-50 p-1 animate-in fade-in slide-in-from-top-1">
                  {onRename && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRename(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-secondary transition-colors text-left">
                      <Pencil className="w-3.5 h-3.5 opacity-60" /> Ubah nama
                    </button>
                  )}
                  {onDelete && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-red-500/10 text-red-500 transition-colors text-left">
                      <Trash2 className="w-3.5 h-3.5 opacity-60" /> Hapus kolom
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1">
        <SortableContext
          id={id}
          items={visibleTasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {visibleTasks.map((task) => (
              <TeamTaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task)}
              />
            ))}
          </div>
        </SortableContext>
        {tasks.length > COLUMN_TASK_LIMIT && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="w-full mt-1 py-1.5 rounded-lg text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            {showAll ? "Ciutkan" : `Tampilkan ${tasks.length - COLUMN_TASK_LIMIT} lagi`}
          </button>
        )}
      </div>
    </div>
  );
}
