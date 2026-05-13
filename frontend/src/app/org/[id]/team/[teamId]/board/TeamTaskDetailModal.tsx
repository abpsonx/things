"use client";

import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import CustomSelect from "@/components/ui/Select";
import Popover from "@/components/ui/Popover";
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
  UploadCloud
} from "lucide-react";
import { useParams } from "next/navigation";
import { cn, formatDate } from "@/lib/utils";

interface TeamTaskDetailProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  teamId: string;
  onUpdate: () => void;
}

export default function TeamTaskDetailModal({ isOpen, onClose, taskId, teamId, onUpdate }: TeamTaskDetailProps) {
  const { id: orgId } = useParams();
  const [task, setTask] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
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
    { value: "pending", label: "Pending" },
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
        api.get(`/organizations/${orgId}/teams/${teamId}/tasks/${taskId}`),
        api.get(`/tasks/${taskId}/comments`),
        api.get(`/tasks/${taskId}/attachments`)
      ]);
      setTask(taskRes.data);
      setComments(commentsRes.data);
      setSubtasks(taskRes.data.subtasks || []);
      setAttachments(attachmentsRes.data);
    } catch (err) {
      console.error("Failed to fetch task detail", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);
    try {
      const res = await api.post(`/tasks/${taskId}/attachments`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setAttachments([res.data, ...attachments]);
      onUpdate();
    } catch (err) {
      console.error("Failed to upload file", err);
    } finally {
      setIsUploading(false);
    }
  };

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
      // Use team members instead of project members
      const [membersRes, labelsRes] = await Promise.all([
        api.get(`/organizations/${orgId}/teams/${teamId}/members`),
        api.get(`/organizations/${orgId}/labels`) // Assuming global or org labels
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
    try {
      await api.put(`/organizations/${orgId}/teams/${teamId}/tasks/${taskId}`, updates);
      // Re-fetch full detail to get populated relationships (like assignee name)
      fetchTaskDetail();
      onUpdate();
    } catch (err: any) {
      console.error("Failed to update task", err);
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
        await api.delete(`/organizations/${orgId}/labels/${labelId}/tasks/${taskId}`);
        setTask({ ...task, labels: (task.labels || []).filter((l: any) => l.id !== labelId) });
      } else {
        await api.post(`/organizations/${orgId}/labels/${labelId}/tasks/${taskId}`);
        const label = availableLabels.find(l => l.id === labelId);
        setTask({ ...task, labels: [...(task.labels || []), label] });
      }
      onUpdate();
    } catch (err: any) {
      console.error("Failed to toggle label", err);
    }
  };

  const deleteTask = async () => {
    if (!confirm("Hapus tugas ini?")) return;
    try {
      await api.delete(`/organizations/${orgId}/teams/${teamId}/tasks/${taskId}`);
      onUpdate();
      onClose();
    } catch (err) {
      console.error("Failed to delete task", err);
    }
  };

  if (!task && loading) return null;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={
        <input
          defaultValue={task?.title}
          onBlur={(e) => updateTask({ title: e.target.value })}
          className="bg-transparent border-none focus:outline-none focus:ring-0 w-full font-bold text-xl p-0"
          placeholder="Judul Tugas..."
        />
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-10 gap-8 max-h-[80vh] overflow-y-auto pr-2 scrollbar-thin">
        {/* Main Content */}
        <div className="md:col-span-7 space-y-8">
          {/* Description */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
              <AlignLeft className="w-4 h-4" />
              Deskripsi
            </div>
            <textarea
              defaultValue={task?.description}
              onBlur={(e) => updateTask({ description: e.target.value })}
              placeholder="Tambahkan deskripsi tugas..."
              className="w-full text-sm text-foreground leading-relaxed bg-secondary/20 border border-transparent hover:border-border focus:bg-background focus:border-primary p-3 rounded-xl transition-all min-h-[100px] resize-none"
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
                  <p className="text-[10px] font-medium italic italic">Belum ada lampiran</p>
                </div>
              )}
            </div>
          </div>

          {/* Activity / Comments */}
          <div className="space-y-6 pt-6 border-t border-border">
            <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
              <MessageSquare className="w-4 h-4" />
              Aktivitas & Komentar
            </div>

            {/* Comment Form */}
            <form onSubmit={handlePostComment} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex-shrink-0 flex items-center justify-center font-bold text-[10px]">
                {task?.assignee?.name?.charAt(0) || "U"}
              </div>
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
                <div key={comment.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary border border-border flex-shrink-0 flex items-center justify-center font-bold text-[10px]">
                    {comment.user?.name?.charAt(0)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{comment.user?.name}</span>
                      <span className="text-[10px] text-muted-foreground">{formatDate(comment.created_at)}</span>
                    </div>
                    <p className="text-sm text-foreground">{comment.content}</p>
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
              <Calendar className="w-3 h-3" /> Due Date
            </label>
            <div className="relative group">
              <input 
                type="date"
                value={task?.due_date ? task.due_date.split('T')[0] : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  updateTask({ due_date: val ? `${val}T00:00:00Z` : null });
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
                  <div className="w-5 h-5 rounded-full bg-secondary border border-border flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                    {task?.assignee?.name?.charAt(0) || "U"}
                  </div>
                  <span className="text-xs font-medium">{task?.assignee?.name || "Unassigned"}</span>
                </div>
              }
            >
              <div className="p-2 space-y-1">
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
                        <div className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">
                          {m.user?.name?.charAt(0)}
                        </div>
                        {m.user?.name}
                      </div>
                      {task?.assignee_id === m.user_id && <Check className="w-3 h-3 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            </Popover>
          </div>

          <div className="pt-6 border-t border-border mt-4">
            <button 
              onClick={deleteTask}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-xl border border-transparent hover:border-destructive/20 transition-all"
            >
              <Trash2 className="w-3 h-3" />
              Hapus Tugas
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
