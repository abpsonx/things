"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
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
import BoardFilterBar from "@/components/board/BoardFilterBar";
import { applyBoardFilter, useBoardFilter } from "@/components/board/useBoardFilter";
import BulkActionBar from "@/components/board/BulkActionBar";
import { useAuthStore } from "@/store/useAuthStore";
import { CheckSquare as CheckSquareIcon } from "lucide-react";
import { toast } from "sonner";

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: "low" | "medium" | "high";
  assignee_id?: string;
  position: number;
  due_date?: string;
  comments_count?: number;
  attachments_count?: number;
}

interface BoardColumnRow {
  id: string;
  slug: string;
  title: string;
  position: number;
}

export default function KanbanBoard() {
  const { id: orgId, projectId } = useParams();
  const searchParams = useSearchParams();
  const { user: currentUser } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<BoardColumnRow[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    filter,
    setFilter,
    resetFilter,
    savedViews,
    saveView,
    applyView,
    deleteView,
  } = useBoardFilter(`project:${projectId}`);

  const memberOptions = useMemo(
    () =>
      members
        .filter((m: any) => m.user)
        .map((m: any) => ({
          id: m.user_id || m.user.id,
          name: m.user.name,
          avatar_url: m.user.avatar_url,
        })),
    [members],
  );

  const filteredTasks = useMemo(
    () => applyBoardFilter(tasks, filter, currentUser?.id),
    [tasks, filter, currentUser?.id],
  );

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleSelect = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);

  const bulkUpdate = async (patch: Record<string, any>) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await api.post(`/projects/${projectId}/tasks/bulk/update`, {
        task_ids: Array.from(selectedIds),
        ...patch,
      });
      toast.success(`${selectedIds.size} tugas diupdate`);
      clearSelection();
      fetchTasks();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal update tugas");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Hapus ${selectedIds.size} tugas? Tindakan ini tidak bisa dibatalkan.`)) return;
    setBulkBusy(true);
    try {
      await api.post(`/projects/${projectId}/tasks/bulk/delete`, {
        task_ids: Array.from(selectedIds),
      });
      toast.success(`${selectedIds.size} tugas dihapus`);
      clearSelection();
      fetchTasks();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal hapus tugas");
    } finally {
      setBulkBusy(false);
    }
  };

  // Open task detail directly when the URL has ?task=<id>
  // (used by the dashboard "Tugasmu" widget to deep-link a task).
  useEffect(() => {
    const t = searchParams?.get("task");
    if (t) {
      setSelectedTaskId(t);
      setIsModalOpen(true);
    }
  }, [searchParams]);
  const [projectNote, setProjectNote] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isNotesVisible, setIsNotesVisible] = useState(true);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");

  const fetchColumns = useCallback(async () => {
    try {
      const r = await api.get(`/projects/${projectId}/columns`);
      setColumns(Array.isArray(r.data) ? r.data : []);
    } catch (err) {
      console.error("Failed to fetch columns", err);
    }
  }, [projectId]);

  const fetchTasks = useCallback(async () => {
    try {
      const [taskRes, projRes, memRes, labelRes] = await Promise.all([
        api.get(`/projects/${projectId}/tasks`),
        api.get(`/organizations/${orgId}/projects/${projectId}`),
        api.get(`/projects/${projectId}/members`).catch(() => ({ data: [] })),
        api.get(`/projects/${projectId}/labels`).catch(() => ({ data: [] })),
      ]);
      setTasks(taskRes.data);
      setMembers(memRes.data || []);
      setLabels(labelRes.data || []);
      if (projRes.data.description) {
        setProjectNote(projRes.data.description);
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setLoading(false);
    }
  }, [orgId, projectId]);

  const createColumn = async () => {
    const title = newColumnTitle.trim();
    if (!title) return;
    try {
      await api.post(`/projects/${projectId}/columns`, { title });
      setNewColumnTitle("");
      setIsAddingColumn(false);
      await fetchColumns();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal membuat kolom");
    }
  };

  const renameColumn = async (columnId: string, newTitle: string) => {
    try {
      await api.patch(`/projects/${projectId}/columns/${columnId}`, { title: newTitle });
      await fetchColumns();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal rename kolom");
    }
  };

  const deleteColumn = async (columnId: string, title: string) => {
    if (!confirm(`Hapus kolom "${title}"? Task di dalamnya akan dipindah ke kolom pertama.`)) return;
    try {
      await api.delete(`/projects/${projectId}/columns/${columnId}`);
      await Promise.all([fetchColumns(), fetchTasks()]);
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal hapus kolom");
    }
  };

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
    fetchColumns();

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

    const onShortcutCreated = () => fetchTasks();
    window.addEventListener("things:task-created", onShortcutCreated);

    return () => {
      socket.emit("leave_project", { project_id: projectId });
      socket.off("task_moved");
      socket.off("task_deleted");
      socket.off("task_created");
      window.removeEventListener("things:task-created", onShortcutCreated);
    };
  }, [fetchTasks, fetchColumns, projectId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) setActiveTask(task);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTask = tasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    // Check if dragging over a column (overId is column.slug) or another task
    const isOverColumn = columns.some((col) => col.slug === overId);

    if (isOverColumn) {
      const newStatus = overId;
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

  const handleDragEnd = async (event: DragEndEvent) => {
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
      const isOverTask = !columns.some((col) => col.slug === overId);
      
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
    <div className="h-[calc(100vh-250px)] flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <BoardFilterBar
          filter={filter}
          onChange={setFilter}
          onReset={resetFilter}
          members={memberOptions}
          labels={labels}
          savedViews={savedViews}
          onSaveView={saveView}
          onApplyView={applyView}
          onDeleteView={deleteView}
        />
        <button
          onClick={() => {
            setSelectMode((v) => !v);
            if (selectMode) setSelectedIds(new Set());
          }}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shrink-0",
            selectMode
              ? "bg-primary text-white border-primary"
              : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50",
          )}
        >
          <CheckSquareIcon className="w-3.5 h-3.5" />
          {selectMode ? "Selesai pilih" : "Pilih banyak"}
        </button>
      </div>
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
            {columns.map((col) => (
              <KanbanColumn
                key={col.id}
                id={col.slug}
                columnId={col.id}
                title={col.title}
                tasks={filteredTasks.filter((t) => t.status === col.slug)}
                projectId={projectId as string}
                onTaskAdded={fetchTasks}
                onTaskClick={(id) => {
                  setSelectedTaskId(id);
                  setIsModalOpen(true);
                }}
                onRename={(newTitle) => renameColumn(col.id, newTitle)}
                onDelete={() => deleteColumn(col.id, col.title)}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            ))}

            {/* "Buat List" — create a new column */}
            <div className="w-[280px] min-w-[280px] shrink-0">
              {isAddingColumn ? (
                <div className="bg-card p-3 rounded-2xl border border-primary/30 shadow-sm space-y-2 animate-in fade-in zoom-in-95 duration-200">
                  <input
                    autoFocus
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); createColumn(); }
                      if (e.key === "Escape") { setIsAddingColumn(false); setNewColumnTitle(""); }
                    }}
                    placeholder="Nama list (mis. Review)"
                    className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-sm font-bold p-1"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={createColumn}
                      className="flex-1 bg-primary text-primary-foreground text-xs font-bold py-1.5 rounded-md hover:bg-primary/90 transition-colors"
                    >
                      Buat
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsAddingColumn(false); setNewColumnTitle(""); }}
                      className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingColumn(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary border border-dashed border-border rounded-2xl transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Buat List
                </button>
              )}
            </div>
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

      <BulkActionBar
        count={selectedIds.size}
        members={memberOptions}
        columns={columns.map((c) => ({ id: c.slug, title: c.title }))}
        busy={bulkBusy}
        onClear={clearSelection}
        onAssign={(assignee_id) => bulkUpdate({ assignee_id })}
        onPriority={(priority) => bulkUpdate({ priority })}
        onMove={(status) => bulkUpdate({ status })}
        onDelete={bulkDelete}
      />
    </div>
  );
}
