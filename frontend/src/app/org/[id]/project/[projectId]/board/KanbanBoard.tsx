"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import ProjectLayout from "@/components/layout/ProjectLayout";
import api from "@/lib/api";
import { socket } from "@/lib/socket";
import { cn } from "@/lib/utils";
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragStart,
  DragOver,
  DragEnd,
  defaultDropAnimationSideEffects
} from "@dnd-kit/core";
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy 
} from "@dnd-kit/sortable";
import { 
  Plus, 
  MoreHorizontal, 
  Clock, 
  MessageSquare, 
  Paperclip,
  Loader2,
  Calendar,
  Save,
  StickyNote,
  ChevronRight,
  ChevronLeft
} from "lucide-react";
import TaskCard from "./TaskCard";
import KanbanColumn from "./KanbanColumn";
import TaskDetailModal from "./TaskDetailModal";

interface Task {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "pending" | "done";
  priority: "low" | "medium" | "high";
  assignee_id?: string;
  position: number;
  due_date?: string;
  comments_count?: number;
  attachments_count?: number;
}

const COLUMNS = [
  { id: "todo", title: "To Do" },
  { id: "in_progress", title: "In Progress" },
  { id: "pending", title: "Pending" },
  { id: "done", title: "Done" },
];

export default function KanbanBoard() {
  const { id: orgId, projectId } = useParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectNote, setProjectNote] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isNotesVisible, setIsNotesVisible] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await api.get(`/projects/${projectId}/tasks`);
      setTasks(response.data);
      
      const projResponse = await api.get(`/organizations/${orgId}/projects/${projectId}`);
      if (projResponse.data.description) {
        setProjectNote(projResponse.data.description);
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setLoading(false);
    }
  }, [orgId, projectId]);

  const saveNote = async (noteContent: string) => {
    setIsSavingNote(true);
    try {
      await api.put(`/organizations/${orgId}/projects/${projectId}`, { description: noteContent });
    } catch (err) {
      console.error("Failed to save note", err);
    } finally {
      setIsSavingNote(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    
    // Join project room
    socket.emit("join_project", { project_id: projectId });

    socket.on("task_moved", (data) => {
      setTasks(prev => prev.map(t => 
        t.id === data.id ? { ...t, status: data.status, position: data.position } : t
      ));
    });

    socket.on("task_deleted", (data) => {
      setTasks(prev => prev.filter(t => t.id !== data.id));
    });

    socket.on("task_created", () => {
      fetchTasks();
    });

    return () => {
      socket.emit("leave_project", { project_id: projectId });
      socket.off("task_moved");
      socket.off("task_deleted");
      socket.off("task_created");
    };
  }, [fetchTasks, projectId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStart) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) setActiveTask(task);
  };

  const handleDragOver = (event: DragOver) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTask = tasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    // Check if dragging over a column or another task
    const isOverColumn = COLUMNS.some(col => col.id === overId);
    
    if (isOverColumn) {
      const newStatus = overId as any;
      if (activeTask.status !== newStatus) {
        setTasks(prev => prev.map(t => 
          t.id === activeId ? { ...t, status: newStatus } : t
        ));
      }
      return;
    }

    const overTask = tasks.find(t => t.id === overId);
    if (overTask && activeTask.status !== overTask.status) {
      setTasks(prev => prev.map(t => 
        t.id === activeId ? { ...t, status: overTask.status } : t
      ));
    }
  };

  const handleDragEnd = async (event: DragEnd) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const finalTask = tasks.find(t => t.id === activeId);
    if (!finalTask) return;

    try {
      // Find new index in the specific status list
      const columnTasks = tasks.filter(t => t.status === finalTask.status);
      const oldIndex = columnTasks.findIndex(t => t.id === activeId);
      const isOverTask = !COLUMNS.some(col => col.id === overId);
      
      let newIndex = oldIndex;
      if (isOverTask) {
        newIndex = columnTasks.findIndex(t => t.id === overId);
      } else {
        newIndex = columnTasks.length - 1;
      }

      // Sync with backend
      await api.patch(`/projects/${projectId}/tasks/${activeId}/move`, {
        status: finalTask.status,
        position: newIndex
      });
    } catch (err) {
      console.error("Failed to move task", err);
      fetchTasks(); // Revert on failure
    }
  };

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="h-[calc(100vh-250px)]">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-6 h-full w-full">
          {/* Columns */}
          <div className="flex-1 flex gap-6 overflow-x-auto pb-4 scrollbar-hide">
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                id={col.id}
                title={col.title}
                tasks={tasks.filter((t) => t.status === col.id)}
                projectId={projectId as string}
                onTaskAdded={fetchTasks}
                onTaskClick={(id) => {
                  setSelectedTaskId(id);
                  setIsModalOpen(true);
                }}
              />
            ))}
          </div>

          {/* Notes Sidebar */}
          {isNotesVisible ? (
            <div className="w-[300px] shrink-0 h-full flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm transition-all duration-300">
              <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/30">
                <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                  <StickyNote className="w-4 h-4 text-primary" />
                  Board Notes
                </div>
                <div className="flex items-center gap-2">
                  {isSavingNote ? (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  ) : (
                    <Save className="w-3 h-3 text-muted-foreground opacity-50" />
                  )}
                  <button 
                    onClick={() => setIsNotesVisible(false)}
                    className="p-1 hover:bg-secondary rounded text-muted-foreground ml-1"
                    title="Sembunyikan Catatan"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <textarea
                value={projectNote}
                onChange={(e) => setProjectNote(e.target.value)}
                onBlur={(e) => saveNote(e.target.value)}
                placeholder="Tuliskan catatan, referensi link, atau info penting untuk project ini..."
                className="flex-1 w-full p-4 resize-none bg-transparent border-none focus:outline-none focus:ring-0 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
          ) : (
            <div className="shrink-0 h-full flex flex-col items-center pt-4">
              <button
                onClick={() => setIsNotesVisible(true)}
                className="p-3 bg-card border border-border rounded-xl shadow-sm hover:border-primary/50 hover:bg-secondary/50 transition-all text-muted-foreground hover:text-foreground flex flex-col items-center gap-3"
                title="Tampilkan Catatan"
              >
                <ChevronLeft className="w-4 h-4" />
                <div style={{ writingMode: "vertical-rl" }} className="text-xs font-bold tracking-widest uppercase mt-2 opacity-70">
                  Notes
                </div>
              </button>
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: "0.5" } }
          })
        }}>
          {activeTask ? (
            <div className="w-[300px]">
              <TaskCard task={activeTask} isOverlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDetailModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        taskId={selectedTaskId || ""}
        projectId={projectId as string}
        onUpdate={fetchTasks}
      />
    </div>
  );
}
