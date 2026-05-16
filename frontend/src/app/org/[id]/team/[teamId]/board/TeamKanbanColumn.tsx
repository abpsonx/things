"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, MoreHorizontal } from "lucide-react";
import TeamTaskCard from "./TeamTaskCard";

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
}

export default function TeamKanbanColumn({
  id,
  title,
  tasks,
  onAddTask,
  onTaskClick,
}: ColumnProps) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col w-[300px] min-w-[300px] bg-card rounded-2xl p-4 border border-border min-h-[500px]"
    >
      <div className="flex items-center justify-between mb-4 px-1">
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
          <button
            type="button"
            title="Opsi kolom"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1">
        <SortableContext
          id={id}
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {tasks.map((task) => (
              <TeamTaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task)}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
