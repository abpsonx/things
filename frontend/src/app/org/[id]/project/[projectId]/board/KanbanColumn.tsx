"use client";

import React, { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import TaskCard from "./TaskCard";
import { Plus, MoreHorizontal } from "lucide-react";
import api from "@/lib/api";

interface ColumnProps {
  id: string;
  title: string;
  tasks: any[];
  projectId: string;
  onTaskAdded: () => void;
  onTaskClick: (id: string) => void;
}

export default function KanbanColumn({ id, title, tasks, projectId, onTaskAdded, onTaskClick }: ColumnProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const { setNodeRef } = useDroppable({ id });

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      await api.post(`/projects/${projectId}/tasks`, {
        title: newTaskTitle,
        status: id
      });
      setNewTaskTitle("");
      setIsAdding(false);
      onTaskAdded();
    } catch (err) {
      console.error("Failed to create task", err);
    }
  };

  return (
    <div className="flex flex-col w-[300px] min-w-[300px] bg-secondary/30 rounded-2xl p-4 border border-border/50">
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm tracking-tight">{title}</h3>
          <span className="text-[10px] font-bold bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full border border-border">
            {tasks.length}
          </span>
        </div>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div ref={setNodeRef} className="flex-1 overflow-y-auto min-h-[100px]">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
          ))}
        </SortableContext>
      </div>

      <div className="mt-2">
        {isAdding ? (
          <form onSubmit={handleCreateTask} className="bg-card p-3 rounded-xl border border-primary/30 shadow-sm space-y-2 animate-in fade-in zoom-in-95 duration-200">
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
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-all group"
          >
            <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
            Tambah Tugas
          </button>
        )}
      </div>
    </div>
  );
}
