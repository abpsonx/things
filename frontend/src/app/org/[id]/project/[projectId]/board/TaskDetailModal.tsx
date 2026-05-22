"use client";

import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import CustomSelect from "@/components/ui/Select";
import Popover from "@/components/ui/Popover";
import Reactions, { ReactionBucket } from "@/components/reactions/Reactions";
import MentionTextarea from "@/components/ui/MentionTextarea";
import TaskActivityLog from "@/components/board/TaskActivityLog";
import TaskEditBanner from "@/components/board/TaskEditBanner";
import { useTaskEditAccess } from "@/lib/useTaskEditAccess";
import api from "@/lib/api";
import { 
  Clock, 
  MessageSquare, 
  User as UserIcon, 
  Tag, 
  AlignLeft, 
  CheckSquare, 
  Calendar,
  Loader2,
  Send,
  MoreHorizontal,
  Trash2,
  CheckCircle2,
  Plus,
  AlertCircle,
  Square,
  CheckSquare as CheckedIcon,
  Check,
  Search,
  X,
  Paperclip,
  Download,
  File as FileIcon,
  UploadCloud,
} from "lucide-react";
import { useParams } from "next/navigation";
import { cn, formatDate } from "@/lib/utils";

interface TaskDetailProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  projectId: string;
  onUpdate: () => void;
}

export default function TaskDetailModal({ isOpen, onClose, taskId, projectId, onUpdate }: TaskDetailProps) {
  const { id: orgId } = useParams();
  const [task, setTask] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [description, setDescription] = useState("");
  const [logReload, setLogReload] = useState(0);
  const { access, canEdit, requestEdit, resolve } = useTaskEditAccess(taskId, isOpen);
  
  const [subtasks, setSubtasks] = useState<any[]>([]);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  const [attachments, setAttachments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);


  const [members, setMembers] = useState<any[]>([]);
  const [availableLabels, setAvailableLabels] = useState<any[]>([]);
  const [isCreatingLabel, setIsCreatingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#3b82f6");

  const statusOptions = [
    { value: "todo", label: "To Do" },
    { value: "in_progress", label: "In Progress" },
    { value: "done", label: "Done" },
  ];

  const priorityOptions = [
    { value: "high", label: "High Priority", color: "#ef4444" },
    { value: "medium", label: "Medium Priority", color: "#f59e0b" },
    { value: "low", label: "Low Priority", color: "#22c55e" },
  ];

  useEffect(() => {
    if (isOpen && taskId) {
      fetchTaskDetail();
      fetchContextData();
    }
  }, [isOpen, taskId]);

  const fetchTaskDetail = async () => {
    setLoading(true);
    try {
      const [taskRes, commentsRes, attachmentsRes] = await Promise.all([
        api.get(`/projects/${projectId}/tasks/${taskId}`),
        api.get(`/tasks/${taskId}/comments`),
        api.get(`/tasks/${taskId}/attachments`),
      ]);
      setTask(taskRes.data);
      setDescription(taskRes.data.description || "");
      setComments(commentsRes.data);
      setSubtasks(taskRes.data.subtasks || []);
      setAttachments(attachmentsRes.data);
    } catch (err) {
      console.error("Failed to fetch task detail", err);
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);
    try {
      const res = await api.post(`/tasks/${taskId}/attachments`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAttachments((prev) => [res.data, ...prev]);
      onUpdate();
    } catch (err) {
      console.error("Failed to upload file", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
  };

  const [isDragging, setIsDragging] = useState(false);

  // While this modal is open, swallow all file-drop events on the window so
  // the browser never navigates to the dropped file (which would blank the
  // page). The drop zone overlay handles the actual upload.
  useEffect(() => {
    if (!isOpen) return;
    let dragDepth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      dragDepth += 1;
      setIsDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      dragDepth -= 1;
      if (dragDepth <= 0) {
        dragDepth = 0;
        setIsDragging(false);
      }
    };
    const onDrop = async (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepth = 0;
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      for (const f of files) {
        await uploadFile(f);
      }
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [isOpen, taskId]);

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm("Hapus lampiran ini?")) return;
    try {
      await api.delete(`/tasks/${taskId}/attachments/${attachmentId}`);
      setAttachments(attachments.filter(a => a.id !== attachmentId));
      onUpdate();
    } catch (err) {
      console.error("Failed to delete attachment", err);
    }
  };

  const fetchContextData = async () => {
    try {
      const [membersRes, labelsRes] = await Promise.all([
        api.get(`/organizations/${orgId}/projects/${projectId}/members`),
        api.get(`/projects/${projectId}/labels`)
      ]);
      setMembers(membersRes.data);
      setAvailableLabels(labelsRes.data);
    } catch (err) {
      console.error("Failed to fetch context data", err);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      await api.post(`/tasks/${taskId}/comments`, { content: newComment });
      setNewComment("");
      const res = await api.get(`/tasks/${taskId}/comments`);
      setComments(res.data);
    } catch (err) {
      console.error("Failed to post comment", err);
    } finally {
      setSubmitting(false);
    }
  };

  const updateTask = async (updates: any) => {
    // Status/position changes are free; other edits need permission.
    const onlyStatus = Object.keys(updates).every((k) => k === "status" || k === "position");
    if (!onlyStatus && !canEdit) {
      alert("Kamu belum punya izin mengedit task ini. Minta izin ke pembuat task lewat tombol di atas.");
      return;
    }
    try {
      const res = await api.put(`/projects/${projectId}/tasks/${taskId}`, updates);
      // Use server response — it includes derived fields like `assignee`
      // that don't come from the patch payload (only assignee_id does).
      setTask(res.data ? { ...task, ...res.data } : { ...task, ...updates });
      setLogReload((n) => n + 1);
      onUpdate();
    } catch (err: any) {
      console.error("Failed to update task", err);
      const detail = err.response?.data?.detail;
      const errorMsg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail[0]?.msg : "Gagal memperbarui tugas");
      alert(errorMsg);
      fetchTaskDetail(); // Revert state from server
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    try {
      const res = await api.post(`/tasks/${taskId}/subtasks`, { title: newSubtaskTitle });
      setSubtasks([...subtasks, res.data]);
      setNewSubtaskTitle("");
      setIsAddingSubtask(false);
    } catch (err) {
      console.error("Failed to add subtask", err);
    }
  };

  const toggleSubtask = async (subtaskId: string, isDone: boolean) => {
    try {
      await api.patch(`/tasks/${taskId}/subtasks/${subtaskId}`, { is_done: !isDone });
      setSubtasks(subtasks.map(s => s.id === subtaskId ? { ...s, is_done: !isDone } : s));
    } catch (err) {
      console.error("Failed to toggle subtask", err);
    }
  };

  const deleteSubtask = async (subtaskId: string) => {
    try {
      await api.delete(`/tasks/${taskId}/subtasks/${subtaskId}`);
      setSubtasks(subtasks.filter(s => s.id !== subtaskId));
    } catch (err) {
      console.error("Failed to delete subtask", err);
    }
  };

  const updateSubtaskTitle = async (subtaskId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      await api.patch(`/tasks/${taskId}/subtasks/${subtaskId}`, { title: newTitle });
      setSubtasks(subtasks.map(s => s.id === subtaskId ? { ...s, title: newTitle } : s));
    } catch (err) {
      console.error("Failed to update subtask title", err);
    }
  };

  const toggleLabel = async (labelId: string) => {
    if (!task) return;
    const isAttached = task.labels?.some((l: any) => l.id === labelId) || false;
    try {
      if (isAttached) {
        await api.delete(`/projects/${projectId}/labels/${labelId}/tasks/${taskId}`);
        setTask({ ...task, labels: (task.labels || []).filter((l: any) => l.id !== labelId) });
      } else {
        await api.post(`/projects/${projectId}/labels/${labelId}/tasks/${taskId}`);
        const label = availableLabels.find(l => l.id === labelId);
        setTask({ ...task, labels: [...(task.labels || []), label] });
      }
      onUpdate();
    } catch (err: any) {
      console.error("Failed to toggle label", err);
      alert(err.response?.data?.detail || "Gagal memasang label");
    }
  };

  const handleCreateLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelName.trim()) return;
    try {
      const res = await api.post(`/projects/${projectId}/labels`, { 
        name: newLabelName, 
        color: newLabelColor 
      });
      const createdLabel = res.data;
      setAvailableLabels([...availableLabels, createdLabel]);
      setNewLabelName("");
      setIsCreatingLabel(false);
      
      // Auto attach the new label
      await toggleLabel(createdLabel.id);
    } catch (err: any) {
      console.error("Failed to create label", err);
      alert(err.response?.data?.detail || "Gagal membuat label. Mungkin nama label sudah ada?");
    }
  };

  const deleteTask = async () => {
    if (!confirm("Hapus tugas ini permanen? Pakai 'Arsipkan' kalau cuma mau menyembunyikan sementara.")) return;
    try {
      await api.delete(`/projects/${projectId}/tasks/${taskId}`);
      onUpdate();
      onClose();
    } catch (err) {
      console.error("Failed to delete task", err);
    }
  };

  const archiveTask = async () => {
    try {
      if (task?.archived_at) {
        await api.post(`/projects/${projectId}/tasks/${taskId}/restore`);
      } else {
        await api.post(`/projects/${projectId}/tasks/${taskId}/archive`);
      }
      onUpdate();
      onClose();
    } catch (err) {
      console.error("Failed to archive task", err);
    }
  };

  if (!task && loading) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={task?.title || "Detail Tugas"}>
      <div className="relative">
        {isDragging && (
          <div className="fixed inset-0 z-[60] bg-primary/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="bg-card px-8 py-6 rounded-3xl shadow-2xl border-2 border-dashed border-primary">
              <p className="text-base font-bold text-primary flex items-center gap-3">
                <UploadCloud className="w-6 h-6" />
                Lepaskan file untuk lampirkan ke tugas ini
              </p>
            </div>
          </div>
        )}
      <div className="mb-6">
        <TaskEditBanner access={access} onRequest={requestEdit} onResolve={resolve} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-10 gap-8">
        {/* Main Content */}
        <div className="md:col-span-7 space-y-8">
          {/* Description */}
          <div className={cn("space-y-3", !canEdit && "pointer-events-none opacity-60")}>
            <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
              <AlignLeft className="w-4 h-4" />
              Deskripsi
            </div>
            <MentionTextarea
              value={description}
              onChange={setDescription}
              onBlur={() => { if (description !== (task?.description || "")) updateTask({ description }); }}
              members={(members || []).filter((m: any) => m.user).map((m: any) => ({ id: m.user_id || m.user.id, name: m.user.name, avatar_url: m.user.avatar_url }))}
              placeholder="Tambahkan deskripsi tugas... ketik @ untuk tag orang"
              className="w-full text-sm text-foreground leading-relaxed bg-secondary/20 border border-transparent hover:border-border focus:bg-background focus:border-primary p-3 rounded-xl transition-all min-h-[100px] resize-none focus:outline-none"
            />
          </div>

          {/* Subtasks */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
                <CheckSquare className="w-4 h-4" />
                Sub-tasks ({subtasks.filter(s => s.is_done).length}/{subtasks.length})
              </div>
            </div>

            <div className="space-y-2">
              {subtasks.map((st) => (
                <div key={st.id} className="group flex items-center gap-3 p-2 hover:bg-secondary rounded-lg transition-colors">
                  <button 
                    onClick={() => toggleSubtask(st.id, st.is_done)}
                    className="shrink-0"
                  >
                    {st.is_done ? (
                      <CheckedIcon className="w-4 h-4 text-green-500" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  
                  <input
                    defaultValue={st.title}
                    onBlur={(e) => updateSubtaskTitle(st.id, e.target.value)}
                    className={cn(
                      "flex-1 text-sm bg-transparent border-none focus:outline-none focus:ring-0 p-0",
                      st.is_done && "line-through text-muted-foreground opacity-50"
                    )}
                  />

                  <button 
                    onClick={() => deleteSubtask(st.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-background rounded text-muted-foreground hover:text-destructive transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              
              {isAddingSubtask ? (
                <form onSubmit={handleAddSubtask} className="flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Apa yang perlu dikerjakan?"
                    className="flex-1 text-sm bg-background border border-primary rounded-md px-3 py-1.5 focus:outline-none"
                  />
                  <button type="submit" className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-md">Tambah</button>
                  <button type="button" onClick={() => setIsAddingSubtask(false)} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Batal</button>
                </form>
              ) : (
                <button 
                  onClick={() => setIsAddingSubtask(true)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors p-2"
                >
                  <Plus className="w-3 h-3" /> Tambah sub-task
                </button>
              )}
            </div>
          </div>

          {/* Attachments Section */}
          <div className="space-y-4 pt-6 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
                <Paperclip className="w-4 h-4" />
                Lampiran ({attachments.length})
              </div>
              <label className="cursor-pointer bg-secondary/50 hover:bg-secondary text-[10px] font-bold px-3 py-1.5 rounded-md border border-border transition-all flex items-center gap-2">
                {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <UploadCloud className="w-3 h-3" />}
                Unggah File
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {attachments.map((file) => (
                <div key={file.id} className="group flex items-center gap-3 p-3 bg-secondary/20 border border-border rounded-xl hover:border-primary/30 transition-all">
                  <div className="w-10 h-10 bg-background rounded-lg flex items-center justify-center border border-border shrink-0">
                    <FileIcon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{file.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">{(file.file_size / 1024).toFixed(1)} KB</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a 
                      href={`https://dothings.id/api/uploads/${file.file_path}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 hover:bg-background rounded-md text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button 
                      onClick={() => handleDeleteAttachment(file.id)}
                      className="p-1.5 hover:bg-background rounded-md text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              
              {attachments.length === 0 && !isUploading && (
                <div className="col-span-full py-8 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-muted-foreground space-y-2">
                  <UploadCloud className="w-6 h-6 opacity-20" />
                  <p className="text-[10px] font-medium italic">Belum ada lampiran</p>
                </div>
              )}
            </div>
          </div>

          {/* Activity Log (audit trail) */}
          <TaskActivityLog taskId={taskId} reloadKey={logReload} />

          {/* Comments */}
          <div className="space-y-6 pt-6 border-t border-border">
            <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
              <MessageSquare className="w-4 h-4" />
              Komentar
            </div>

            {/* Comment Form */}
            <form onSubmit={handlePostComment} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex-shrink-0 flex items-center justify-center font-bold text-[10px]">JD</div>
              <div className="flex-1 space-y-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Tulis komentar..."
                  className="w-full text-sm bg-secondary/30 border border-border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px] resize-none transition-all"
                />
                <button
                  type="submit"
                  disabled={submitting || !newComment.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-md hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Kirim Komentar"}
                </button>
              </div>
            </form>

            {/* Comments List */}
            <div className="space-y-6">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3 group/comment">
                  <div className="w-8 h-8 rounded-full bg-secondary border border-border flex-shrink-0 flex items-center justify-center font-bold text-[10px]">
                    {comment.user?.name.charAt(0)}
                  </div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{comment.user?.name}</span>
                      <span className="text-[10px] text-muted-foreground">{formatDate(comment.created_at)}</span>
                    </div>
                    <p className="text-sm text-foreground">{comment.content}</p>
                    <Reactions
                      targetType="comment"
                      targetId={comment.id}
                      reactions={(comment.reactions as ReactionBucket[]) || []}
                      onChange={(next: ReactionBucket[]) =>
                        setComments((prev) => prev.map((c: any) =>
                          c.id === comment.id ? { ...c, reactions: next } : c
                        ))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar info */}
        <div className="md:col-span-3 space-y-6 bg-secondary/10 p-5 rounded-2xl border border-border h-fit">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <Clock className="w-3 h-3" /> Status
            </label>
            <CustomSelect
              options={statusOptions}
              value={task?.status}
              onChange={(status) => updateTask({ status })}
            />
          </div>

          <div className={cn("space-y-6", !canEdit && "pointer-events-none opacity-60")}>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Priority
            </label>
            <CustomSelect
              options={priorityOptions}
              value={task?.priority}
              onChange={(priority) => updateTask({ priority })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <Clock className="w-3 h-3" /> Pengulangan
            </label>
            <CustomSelect
              options={[
                { value: "", label: "Tidak diulang" },
                { value: "daily", label: "Setiap hari" },
                { value: "weekly", label: "Setiap minggu" },
                { value: "monthly", label: "Setiap bulan" },
              ]}
              value={task?.recurrence || ""}
              onChange={(recurrence) => updateTask({ recurrence: recurrence || null })}
            />
            {task?.recurrence && (
              <p className="text-[10px] text-muted-foreground italic">
                Saat ditandai selesai, salinan baru otomatis dibuat dgn deadline berikutnya.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Due Date
            </label>
            <div className="relative group">
              <input
                type="datetime-local"
                value={task?.due_date ? task.due_date.slice(0, 16) : ""}
                onChange={(e) => {
                  const val = e.target.value; // "YYYY-MM-DDTHH:mm"
                  updateTask({ due_date: val ? `${val}:00` : null });
                }}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
              />
              {task?.due_date && (
                <button 
                  onClick={() => updateTask({ due_date: null })}
                  className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <UserIcon className="w-3 h-3" /> Assignee
            </label>
            <Popover
              align="right"
              trigger={
                <div className="flex items-center gap-2 p-2 bg-background border border-border rounded-md hover:border-primary/30 transition-colors">
                  <div className="w-5 h-5 rounded-full bg-secondary border border-border flex items-center justify-center text-[8px] font-bold text-muted-foreground overflow-hidden">
                    {task?.assignee?.avatar_url ? (
                      <img src={task.assignee.avatar_url} alt={task.assignee.name} className="w-full h-full object-cover" />
                    ) : (
                      task?.assignee?.name?.charAt(0) || "U"
                    )}
                  </div>
                  <span className="text-xs font-medium">{task?.assignee?.name || "Unassigned"}</span>
                </div>
              }
            >
              <div className="p-2 space-y-1">
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1.5 w-3 h-3 text-muted-foreground" />
                  <input type="text" placeholder="Cari orang..." className="w-full pl-7 pr-2 py-1 text-[10px] bg-secondary/30 border border-border rounded-md outline-none" />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <button 
                    onClick={() => updateTask({ assignee_id: null })}
                    className="w-full flex items-center gap-2 p-2 hover:bg-secondary rounded-md text-xs"
                  >
                    <div className="w-5 h-5 rounded-full border border-dashed border-border flex items-center justify-center text-[8px]"><X className="w-2 h-2" /></div>
                    Unassigned
                  </button>
                  {members.map((m) => (
                    <button 
                      key={m.user_id}
                      onClick={() => updateTask({ assignee_id: m.user_id })}
                      className="w-full flex items-center justify-between p-2 hover:bg-secondary rounded-md text-xs group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[8px] font-bold text-primary overflow-hidden">
                          {m.user.avatar_url ? (
                            <img src={m.user.avatar_url} alt={m.user.name} className="w-full h-full object-cover" />
                          ) : (
                            m.user.name.charAt(0)
                          )}
                        </div>
                        {m.user.name}
                      </div>
                      {task?.assignee_id === m.user_id && <Check className="w-3 h-3 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            </Popover>
          </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <Tag className="w-3 h-3" /> Labels
            </label>
            <div className="flex flex-wrap gap-1.5">
              {task?.labels?.map((label: any) => (
                <div 
                  key={label.id} 
                  className="px-2 py-0.5 rounded text-[8px] font-bold text-white uppercase tracking-tighter" 
                  style={{ backgroundColor: label.color }}
                >
                  {label.name}
                </div>
              ))}
              
              <Popover
                align="right"
                trigger={
                  <button className="w-6 h-6 rounded bg-background border border-border flex items-center justify-center hover:border-primary/50 text-muted-foreground hover:text-primary transition-all">
                    <Plus className="w-3 h-3" />
                  </button>
                }
              >
                <div className="p-3 space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-1">Labels</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {availableLabels.map((l) => (
                      <button 
                        key={l.id}
                        onClick={() => toggleLabel(l.id)}
                        className="w-full flex items-center justify-between p-2 hover:bg-secondary rounded-md group"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
                          <span className="text-xs">{l.name}</span>
                        </div>
                        {task.labels?.some((tl: any) => tl.id === l.id) && <Check className="w-3 h-3 text-primary" />}
                      </button>
                    ))}
                  </div>
                  
                  {isCreatingLabel ? (
                    <form onSubmit={handleCreateLabel} className="space-y-2 pt-2 border-t border-border">
                      <input 
                        autoFocus
                        value={newLabelName}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        placeholder="Nama label..." 
                        className="w-full px-2 py-1 text-[10px] border border-border rounded outline-none focus:border-primary" 
                      />
                      <div className="flex gap-1">
                        {["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"].map(c => (
                          <button 
                            key={c}
                            type="button"
                            onClick={() => setNewLabelColor(c)}
                            className={cn("w-4 h-4 rounded-full border border-white", newLabelColor === c && "ring-1 ring-primary")}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="flex-1 py-1 bg-primary text-primary-foreground text-[10px] font-bold rounded">Buat</button>
                        <button type="button" onClick={() => setIsCreatingLabel(false)} className="px-2 py-1 text-[10px] text-muted-foreground">Batal</button>
                      </div>
                    </form>
                  ) : (
                    <button 
                      onClick={() => setIsCreatingLabel(true)}
                      className="w-full py-1.5 border border-dashed border-border rounded-md text-[10px] font-bold text-muted-foreground hover:border-primary hover:text-primary transition-all"
                    >
                      Buat Label Baru
                    </button>
                  )}
                </div>
              </Popover>
            </div>
          </div>

          <div className="pt-6 border-t border-border mt-4 space-y-2">
            <button
              onClick={archiveTask}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-muted-foreground hover:bg-secondary rounded-xl border border-border transition-all"
            >
              {task?.archived_at ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  Pulihkan dari Arsip
                </>
              ) : (
                <>
                  <AlignLeft className="w-3 h-3" />
                  Arsipkan Tugas
                </>
              )}
            </button>
            <button
              onClick={deleteTask}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-xl border border-transparent hover:border-destructive/20 transition-all"
            >
              <Trash2 className="w-3 h-3" />
              Hapus Permanen
            </button>
          </div>
        </div>
      </div>
      </div>
    </Modal>
  );
}
