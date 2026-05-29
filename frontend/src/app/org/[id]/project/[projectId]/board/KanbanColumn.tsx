"use client";

import React, { useEffect, useRef, useState } from "react";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import TaskCard from "./TaskCard";
import { Plus, MoreHorizontal, Pencil, Trash2, GripVertical } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

const COLUMN_TASK_LIMIT = 10;

interface ColumnProps {
  id: string;          // slug used by tasks.status and as dnd droppable id
  columnId?: string;   // UUID for the BoardColumn row (for rename/delete API calls)
  title: string;
  tasks: any[];
  projectId: string;
  onTaskAdded: () => void;
  /** Quick-create a task in this column and open its detail modal (team-style). */
  onQuickAdd?: () => void;
  onTaskClick: (id: string) => void;
  onRename?: (newTitle: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (taskId: string) => void;
  onTaskDuplicate?: (taskId: string) => void | Promise<void>;
  onTaskArchive?: (taskId: string) => void | Promise<void>;
}

export default function KanbanColumn({
  id,
  title,
  tasks,
  projectId,
  onTaskAdded,
  onQuickAdd,
  onTaskClick,
  onRename,
  onDelete,
  selectMode,
  selectedIds,
  onToggleSelect,
  onTaskDuplicate,
  onTaskArchive,
}: ColumnProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [showAll, setShowAll] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id, data: { type: "Column" } });
  const dragStyle = { transform: CSS.Transform.toString(transform), transition };

  // Keep columns short: show the first 10, with a toggle for the rest.
  const visibleTasks = showAll ? tasks : tasks.slice(0, COLUMN_TASK_LIMIT);

  // close menu on outside click
  useEffect(() => {
    if (!isMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [isMenuOpen]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      await api.post(`/projects/${projectId}/tasks`, {
        title: newTaskTitle,
        status: id,
      });
      setNewTaskTitle("");
      setIsAdding(false);
      onTaskAdded();
    } catch (err) {
      console.error("Failed to create task", err);
    }
  };

  const submitRename = async () => {
    const t = editTitle.trim();
    if (!t || t === title) { setIsRenaming(false); setEditTitle(title); return; }
    if (onRename) await onRename(t);
    setIsRenaming(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={cn(
        "flex flex-col w-[256px] min-w-[256px] bg-card rounded-2xl p-3 border border-border",
        isDragging && "opacity-50 ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <button
            type="button"
            {...attributes}
            {...listeners}
            title="Geser untuk pindah kolom"
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-foreground -ml-1 shrink-0 touch-none"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
          {isRenaming ? (
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submitRename(); }
                if (e.key === "Escape") { setIsRenaming(false); setEditTitle(title); }
              }}
              className="font-bold text-sm tracking-tight bg-card border border-primary/30 rounded px-1.5 py-0.5 min-w-0 flex-1 focus:outline-none"
            />
          ) : (
            <h3 className="font-bold text-sm tracking-tight truncate">{title}</h3>
          )}
          <span className="text-[10px] font-medium text-muted-foreground shrink-0">
            {tasks.length} {tasks.length === 1 ? "Tugas" : "Tugas"}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => (onQuickAdd ? onQuickAdd() : setIsAdding(true))}
            title="Tambah tugas baru"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsMenuOpen((m) => !m); }}
              title="Opsi kolom"
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-background border border-border rounded-xl shadow-xl z-30 p-1 animate-in fade-in slide-in-from-top-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsRenaming(true); setEditTitle(title); }}
                  disabled={!onRename}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-left transition-colors",
                    onRename ? "hover:bg-secondary" : "opacity-40 cursor-not-allowed",
                  )}
                >
                  <Pencil className="w-3.5 h-3.5 opacity-70" /> Ubah Nama
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onDelete?.(); }}
                  disabled={!onDelete}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-left transition-colors",
                    onDelete ? "hover:bg-destructive/10 text-destructive" : "opacity-40 cursor-not-allowed",
                  )}
                >
                  <Trash2 className="w-3.5 h-3.5 opacity-70" /> Hapus Kolom
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-[80px]">
        <SortableContext items={visibleTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {visibleTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task.id)}
              selectMode={selectMode}
              selected={selectedIds?.has(task.id)}
              onToggleSelect={onToggleSelect ? () => onToggleSelect(task.id) : undefined}
              onDuplicate={onTaskDuplicate ? () => onTaskDuplicate(task.id) : undefined}
              onArchive={onTaskArchive ? () => onTaskArchive(task.id) : undefined}
            />
          ))}
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

      {isAdding && (
        <form onSubmit={handleCreateTask} className="mt-2 bg-card p-3 rounded-xl border border-primary/30 shadow-sm space-y-2 animate-in fade-in zoom-in-95 duration-200">
          <textarea
            autoFocus
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Apa yang perlu dikerjakan?"
            className="w-full text-sm bg-transparent border-none focus:ring-0 resize-none p-0 min-h-[60px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleCreateTask(e);
              }
              if (e.key === "Escape") setIsAdding(false);
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 bg-primary text-primary-foreground text-xs font-bold py-1.5 rounded-md hover:bg-primary/90 transition-colors"
            >
              Tambah
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Batal
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
