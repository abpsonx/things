"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { 
  SortableContext, 
  verticalListSortingStrategy 
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import TeamTaskCard from "./TeamTaskCard";

interface ColumnProps {
  id: string;
  title: string;
  tasks: any[];
  color: string;
  badge: string;
  onAddTask: () => void;
  onTaskClick: (task: any) => void;
}

export default function TeamKanbanColumn({ 
  id, 
  title, 
  tasks, 
  color, 
  badge, 
  onAddTask,
  onTaskClick 
}: ColumnProps) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-[320px] flex flex-col rounded-2xl border border-border/50 bg-secondary/5 backdrop-blur-sm border-t-4 min-h-[500px]",
        color
      )}
    >
      <div className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm text-foreground">{title}</h3>
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full text-white", badge)}>
            {tasks.length}
          </span>
        </div>
        <button
          onClick={onAddTask}
          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 px-3 pb-4">
        <SortableContext 
          id={id}
          items={tasks.map(t => t.id)}
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
        
        {tasks.length === 0 && (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground/30 border-2 border-dashed border-border/20 rounded-xl">
            <p className="text-[10px] font-medium italic italic">Belum ada tugas</p>
          </div>
        )}

        <button
          onClick={onAddTask}
          className="w-full mt-2 flex items-center gap-2 px-3 py-3 rounded-xl text-xs font-bold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all"
        >
          <Plus className="w-3 h-3" />
          Buat Tugas
        </button>
      </div>
    </div>
  );
}
