"use client";

import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import CustomSelect from "@/components/ui/Select";
import Popover from "@/components/ui/Popover";
import api from "@/lib/api";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import MentionTextarea from "@/components/ui/MentionTextarea";
import FileViewerModal from "@/components/ui/FileViewerModal";
import TaskLinksSection, { DescriptionLinkChips } from "@/components/board/TaskLinksSection";
import TaskActivityLog from "@/components/board/TaskActivityLog";
import TaskEditBanner from "@/components/board/TaskEditBanner";
import { useTaskEditAccess } from "@/lib/useTaskEditAccess";
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
  Pencil,
  Archive,
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
  Clapperboard,
  Link as LinkIcon,
  ExternalLink,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
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
  const [description, setDescription] = useState("");
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
  const [teamBriefs, setTeamBriefs] = useState<any[]>([]);
  const [previewFile, setPreviewFile] = useState<any | null>(null);
  const [commentMentionIds, setCommentMentionIds] = useState<string[]>([]);
  const [resultUrl, setResultUrl] = useState<string>("");
  const [propDraftName, setPropDraftName] = useState("");
  const [propDraftValue, setPropDraftValue] = useState("");
  const { user: currentUser } = useAuthStore();

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

  // Debounce autosave deskripsi (RichTextEditor cuma punya onChange).
  useEffect(() => {
    if (!task) return;
    if (description === (task.description || "")) return;
    const t = setTimeout(() => updateTask({ description }), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description]);

  const fetchTaskDetail = async () => {
    setLoading(true);
    try {
      const [taskRes, commentsRes, attachmentsRes] = await Promise.all([
        api.get(`/organizations/${orgId}/teams/${teamId}/tasks/${taskId}`),
        api.get(`/tasks/${taskId}/comments`),
        api.get(`/tasks/${taskId}/attachments`)
      ]);
      setTask(taskRes.data);
      setDescription(taskRes.data.description || "");
      setResultUrl(taskRes.data.result_url || "");
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
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      onUpdate();
    } catch (err: any) {
      console.error("Failed to delete attachment", err);
      alert(err?.response?.data?.detail || "Gagal menghapus lampiran. Coba refresh lalu coba lagi.");
    }
  };

  const fetchContextData = async () => {
    try {
      const [membersRes, labelsRes, briefsRes] = await Promise.all([
        api.get(`/organizations/${orgId}/teams/${teamId}/members`),
        api.get(`/organizations/${orgId}/labels`),
        api.get(`/organizations/${orgId}/teams/${teamId}/briefs`).catch(() => ({ data: [] })),
      ]);
      setMembers(membersRes.data);
      setAvailableLabels(labelsRes.data);
      setTeamBriefs(Array.isArray(briefsRes.data) ? briefsRes.data : []);
    } catch (err) {
      console.error("Failed to fetch context data", err);
    }
  };

  const linkedBriefIds: string[] = task?.linked_brief_ids || [];
  const linkedBriefs = teamBriefs.filter((b) => linkedBriefIds.includes(b.id));

  const setLinkedBriefs = async (briefIds: string[]) => {
    try {
      const res = await api.patch(
        `/organizations/${orgId}/teams/${teamId}/tasks/${taskId}/briefs`,
        { brief_ids: briefIds },
      );
      setTask(res.data);
      onUpdate();
    } catch (err) {
      console.error("Failed to update task briefs", err);
    }
  };

  const toggleBriefLink = (briefId: string) => {
    const next = linkedBriefIds.includes(briefId)
      ? linkedBriefIds.filter((id) => id !== briefId)
      : [...linkedBriefIds, briefId];
    setLinkedBriefs(next);
  };

  // Result URL + custom properties — bebas diisi siapa pun anggota tim
  // (gak butuh edit grant). Backend gating: lihat free_only di update_team_task.
  const saveResultUrl = async () => {
    if (!task) return;
    const next = resultUrl.trim();
    if ((task.result_url || "") === next) return;
    try {
      await api.put(`/organizations/${orgId}/teams/${teamId}/tasks/${taskId}`, { result_url: next || null });
      setTask((prev: any) => prev ? { ...prev, result_url: next || null } : prev);
      setLogReload((n) => n + 1);
      onUpdate();
    } catch (err) {
      console.error("Failed to save result_url", err);
      setResultUrl(task.result_url || "");
    }
  };

  const saveCustomProps = async (next: any[]) => {
    setTask((prev: any) => prev ? { ...prev, custom_properties: next } : prev);
    try {
      await api.put(`/organizations/${orgId}/teams/${teamId}/tasks/${taskId}`, { custom_properties: next });
      setLogReload((n) => n + 1);
    } catch (err) {
      console.error("Failed to save custom_properties", err);
      fetchTaskDetail();
    }
  };
  const addCustomProp = () => {
    if (!task || !propDraftName.trim()) return;
    const next = [...(task.custom_properties || []), { name: propDraftName.trim(), value: propDraftValue }];
    setPropDraftName(""); setPropDraftValue("");
    saveCustomProps(next);
  };
  const updateCustomProp = (idx: number, patch: any) => {
    if (!task) return;
    const cur = task.custom_properties || [];
    saveCustomProps(cur.map((p: any, i: number) => i === idx ? { ...p, ...patch } : p));
  };
  const removeCustomProp = (idx: number) => {
    if (!task) return;
    saveCustomProps((task.custom_properties || []).filter((_: any, i: number) => i !== idx));
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      await api.post(`/tasks/${taskId}/comments`, { content: newComment, mention_ids: commentMentionIds });
      setNewComment("");
      setCommentMentionIds([]);
      const res = await api.get(`/tasks/${taskId}/comments`);
      setComments(res.data);
    } catch (err) {
      console.error("Failed to post comment", err);
    } finally {
      setSubmitting(false);
    }
  };

  const updateTask = async (updates: any) => {
    const onlyStatus = Object.keys(updates).every((k) => k === "status" || k === "position");
    if (!onlyStatus && !canEdit) {
      alert("Kamu belum punya izin mengedit task ini. Minta izin ke pembuat task lewat tombol di atas.");
      return;
    }
    try {
      await api.put(`/organizations/${orgId}/teams/${teamId}/tasks/${taskId}`, updates);
      // Re-fetch full detail to get populated relationships (like assignee name)
      fetchTaskDetail();
      setLogReload((n) => n + 1);
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

  const handleCreateLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelName.trim()) return;
    try {
      const res = await api.post(`/organizations/${orgId}/labels`, {
        name: newLabelName,
        color: newLabelColor,
      });
      const createdLabel = res.data;
      setAvailableLabels((prev) => [...prev, createdLabel]);
      setNewLabelName("");
      setIsCreatingLabel(false);
      // Attach directly using the fresh object — don't rely on
      // availableLabels closure (it's still the stale value here).
      if (!task) return;
      try {
        await api.post(`/organizations/${orgId}/labels/${createdLabel.id}/tasks/${taskId}`);
        setTask({ ...task, labels: [...(task.labels || []), createdLabel] });
        onUpdate();
      } catch (err) {
        console.error("Failed to attach new label", err);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Gagal membuat label";
      alert(msg);
      console.error("Failed to create label", err);
    }
  };

  const editLabel = async (labelId: string, currentName: string, currentColor: string) => {
    const name = window.prompt("Nama label baru:", currentName)?.trim();
    if (!name) return;
    const color = window.prompt("Warna baru (hex, mis. #ef4444):", currentColor)?.trim() || currentColor;
    try {
      const res = await api.patch(`/organizations/${orgId}/labels/${labelId}`, { name, color });
      const updated = res.data;
      setAvailableLabels((prev) => prev.map((l) => l.id === labelId ? updated : l));
      if (task?.labels?.some((l: any) => l.id === labelId)) {
        setTask({ ...task, labels: task.labels.map((l: any) => l.id === labelId ? updated : l) });
      }
      onUpdate();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal mengubah label");
    }
  };

  const deleteLabel = async (labelId: string, name: string) => {
    if (!window.confirm(`Hapus label "${name}"? Label akan dilepas dari semua task yang memakainya.`)) return;
    try {
      await api.delete(`/organizations/${orgId}/labels/${labelId}`);
      setAvailableLabels((prev) => prev.filter((l) => l.id !== labelId));
      if (task?.labels?.some((l: any) => l.id === labelId)) {
        setTask({ ...task, labels: task.labels.filter((l: any) => l.id !== labelId) });
      }
      onUpdate();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Gagal menghapus label");
    }
  };

  const deleteTask = async () => {
    if (!confirm("Hapus tugas ini permanen? Pakai 'Arsipkan' kalau cuma mau menyembunyikan.")) return;
    try {
      await api.delete(`/organizations/${orgId}/teams/${teamId}/tasks/${taskId}`);
      onUpdate();
      onClose();
    } catch (err) {
      console.error("Failed to delete task", err);
    }
  };

  const archiveTask = async () => {
    try {
      if (task?.archived_at) {
        await api.post(`/organizations/${orgId}/teams/${teamId}/tasks/${taskId}/restore`);
      } else {
        await api.post(`/organizations/${orgId}/teams/${teamId}/tasks/${taskId}/archive`);
      }
      onUpdate();
      onClose();
    } catch (err) {
      console.error("Failed to archive task", err);
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
      <div className="mb-4">
        <TaskEditBanner access={access} onRequest={requestEdit} onResolve={resolve} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-10 gap-8 max-h-[80vh] overflow-y-auto pr-2 scrollbar-thin">
        {/* Main Content */}
        <div className="md:col-span-7 space-y-8">
          {/* Description */}
          <div className={cn("space-y-3", !canEdit && "pointer-events-none opacity-60")}>
            <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
              <AlignLeft className="w-4 h-4" />
              Deskripsi
            </div>
            {/* Defer mount sampai task ter-load — useEditor read content
                cuma sekali saat mount. Tanpa defer, editor bisa stuck
                kosong. */}
            {task ? (
              <RichTextEditor
                content={description}
                onChange={setDescription}
                placeholder="Tambahkan deskripsi tugas... ketik @ untuk tag orang."
                members={(members || []).filter((m: any) => m.user).map((m: any) => ({ id: m.user_id || m.user.id, name: m.user.name, avatar_url: m.user.avatar_url }))}
              />
            ) : (
              <div className="min-h-[300px] rounded-xl border border-border bg-secondary/20 animate-pulse" />
            )}
            <DescriptionLinkChips text={description} />
          </div>

          {/* Link Hasil Pengerjaan — deliverable URL (live post, deploy preview, Drive). */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
              <LinkIcon className="w-4 h-4" />
              Link Hasil Pengerjaan
            </div>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={resultUrl}
                onChange={(e) => setResultUrl(e.target.value)}
                onBlur={saveResultUrl}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                placeholder="https://… (post live, file Drive, halaman deploy, dst)"
                className="flex-1 text-sm bg-secondary/30 border border-border focus:border-primary focus:bg-background rounded-xl px-3 py-2 transition-all focus:outline-none"
              />
              {resultUrl.trim() && (
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  title="Buka link"
                  className="shrink-0 p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          <TaskLinksSection taskId={taskId} canEdit={canEdit} />

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
              {attachments.map((file) => {
                const url = `/api/${file.file_path}`;
                const ext = (file.file_name || "").toLowerCase().split(".").pop() || "";
                const isImage = ["png","jpg","jpeg","gif","webp","bmp","svg"].includes(ext);
                const isVideo = ["mp4","mov","webm","mkv"].includes(ext);
                const isAudio = ["mp3","wav","ogg","m4a"].includes(ext);
                const isPdf = ext === "pdf";
                return (
                  <button
                    type="button"
                    key={file.id}
                    onClick={() => setPreviewFile({ ...file, url, isImage, isVideo, isAudio, isPdf })}
                    className="group flex items-center gap-3 p-3 bg-secondary/20 border border-border rounded-xl hover:border-primary/40 hover:bg-secondary/40 transition-all text-left w-full"
                  >
                    {isImage ? (
                      <img src={url} alt="" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" />
                    ) : (
                      <div className="w-10 h-10 bg-background rounded-lg flex items-center justify-center border border-border shrink-0">
                        <FileIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{file.file_name}</p>
                      <p className="text-[10px] text-muted-foreground">{(file.file_size / 1024).toFixed(1)} KB · klik untuk lihat</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={url}
                        download={file.file_name}
                        onClick={(e) => e.stopPropagation()}
                        title="Unduh"
                        className="p-1.5 hover:bg-background rounded-md text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteAttachment(file.id); }}
                        title="Hapus"
                        className="p-1.5 hover:bg-background rounded-md text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                );
              })}
              
              {attachments.length === 0 && !isUploading && (
                <div className="col-span-full py-8 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-muted-foreground space-y-2">
                  <UploadCloud className="w-6 h-6 opacity-20" />
                  <p className="text-[10px] font-medium italic italic">Belum ada lampiran</p>
                </div>
              )}
            </div>
          </div>

          {/* Custom Properties — Notion-style ad-hoc rows */}
          <div className="space-y-3 pt-6 border-t border-border">
            <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
              <Tag className="w-4 h-4" />
              Properti Tambahan
            </div>
            {(task?.custom_properties || []).length > 0 && (
              <div className="space-y-1.5">
                {(task?.custom_properties || []).map((p: any, i: number) => (
                  <div key={i} className="group flex items-center gap-1.5">
                    <input
                      value={p.name || ""}
                      onChange={(e) => updateCustomProp(i, { name: e.target.value })}
                      onBlur={() => { if (!(p.name || "").trim()) removeCustomProp(i); }}
                      placeholder="Nama"
                      className="w-32 px-2.5 py-1.5 text-xs font-bold bg-card border border-border rounded-lg outline-none focus:border-primary"
                    />
                    <input
                      value={p.value || ""}
                      onChange={(e) => updateCustomProp(i, { value: e.target.value })}
                      placeholder="Nilai"
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-card border border-border rounded-lg outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => removeCustomProp(i)}
                      title="Hapus"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => { e.preventDefault(); addCustomProp(); }}
              className="flex items-center gap-1.5"
            >
              <input
                value={propDraftName}
                onChange={(e) => setPropDraftName(e.target.value)}
                placeholder="Nama properti"
                className="w-32 px-2.5 py-1.5 text-xs font-bold bg-secondary/30 border border-dashed border-border rounded-lg outline-none focus:border-primary focus:bg-card"
              />
              <input
                value={propDraftValue}
                onChange={(e) => setPropDraftValue(e.target.value)}
                placeholder="Nilai"
                className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-secondary/30 border border-dashed border-border rounded-lg outline-none focus:border-primary focus:bg-card"
              />
              <button
                type="submit"
                disabled={!propDraftName.trim()}
                title="Tambah properti"
                className="p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-30 hover:shadow-md transition-all"
              >
                <Plus className="w-3 h-3" />
              </button>
            </form>
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
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex-shrink-0 flex items-center justify-center font-bold text-[10px]">
                {task?.assignee?.name?.charAt(0) || "U"}
              </div>
              <div className="flex-1 space-y-2">
                <MentionTextarea
                  value={newComment}
                  onChange={setNewComment}
                  onMentionsChange={setCommentMentionIds}
                  members={(members || []).filter((m: any) => m.user).map((m: any) => ({ id: m.user_id || m.user.id, name: m.user.name, avatar_url: m.user.avatar_url }))}
                  placeholder="Tulis komentar... ketik @ untuk tag orang"
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
              <Calendar className="w-3 h-3" /> Due Date
            </label>
            <div className="relative group">
              <input
                type="datetime-local"
                value={task?.due_date ? task.due_date.slice(0, 16) : ""}
                onChange={(e) => {
                  const val = e.target.value;
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

          {(() => {
            const assigneeList: any[] = (task?.assignees && task.assignees.length)
              ? task.assignees
              : (task?.assignee ? [{ id: task.assignee_id, ...task.assignee }] : []);
            const assigneeIds: string[] = assigneeList.map((a) => a.id).filter(Boolean);
            const toggleAssignee = (uid: string) => {
              const set = new Set(assigneeIds);
              if (set.has(uid)) set.delete(uid); else set.add(uid);
              updateTask({ assignee_ids: Array.from(set) });
            };
            return (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <UserIcon className="w-3 h-3" /> Assignee {assigneeIds.length > 1 && <span className="text-primary">({assigneeIds.length})</span>}
            </label>
            <Popover
              align="right"
              trigger={
                <div className="flex items-center gap-2 p-2 bg-background border border-border rounded-md hover:border-primary/30 transition-colors min-h-[36px]">
                  {assigneeList.length > 0 ? (
                    <>
                      <div className="flex -space-x-1.5">
                        {assigneeList.slice(0, 4).map((a) => (
                          <div key={a.id} className="w-5 h-5 rounded-full bg-secondary border border-background flex items-center justify-center text-[8px] font-bold text-muted-foreground overflow-hidden" title={a.name}>
                            {a.avatar_url ? <img src={a.avatar_url} alt={a.name} className="w-full h-full object-cover" /> : a.name?.charAt(0) || "U"}
                          </div>
                        ))}
                      </div>
                      <span className="text-xs font-medium truncate">
                        {assigneeList.length === 1 ? assigneeList[0].name : `${assigneeList.length} orang`}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">Unassigned</span>
                  )}
                </div>
              }
            >
              <div className="p-2 space-y-1">
                <div className="px-2 py-1 text-[10px] text-muted-foreground">Pilih beberapa orang — klik untuk tambah/hapus.</div>
                <div className="max-h-48 overflow-y-auto">
                  {(() => {
                    const allIds = members.map((m: any) => m.user_id).filter(Boolean);
                    const allPicked = allIds.length > 0 && allIds.every((id: string) => assigneeIds.includes(id));
                    return (
                      <button
                        onClick={() => updateTask({ assignee_ids: allPicked ? [] : allIds })}
                        className="w-full flex items-center gap-2 p-2 hover:bg-secondary rounded-md text-xs font-bold text-foreground border-b border-border/50 mb-1"
                      >
                        <div className="w-5 h-5 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                          {allPicked ? <Check className="w-3 h-3 text-primary" /> : <UserIcon className="w-3 h-3 text-primary" />}
                        </div>
                        {allPicked ? "Hapus semua" : `Pilih semua (${allIds.length})`}
                      </button>
                    );
                  })()}
                  {assigneeIds.length > 0 && (
                    <button
                      onClick={() => updateTask({ assignee_ids: [] })}
                      className="w-full flex items-center gap-2 p-2 hover:bg-secondary rounded-md text-xs text-muted-foreground"
                    >
                      <div className="w-5 h-5 rounded-full border border-dashed border-border flex items-center justify-center text-[8px]"><X className="w-2 h-2" /></div>
                      Kosongkan semua
                    </button>
                  )}
                  {members.map((m) => {
                    const selected = assigneeIds.includes(m.user_id);
                    return (
                      <button
                        key={m.user_id}
                        onClick={() => toggleAssignee(m.user_id)}
                        className={cn("w-full flex items-center justify-between p-2 hover:bg-secondary rounded-md text-xs group", selected && "bg-primary/5")}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[8px] font-bold text-primary overflow-hidden">
                            {m.user?.avatar_url ? (
                              <img src={m.user.avatar_url} alt={m.user?.name} className="w-full h-full object-cover" />
                            ) : (
                              m.user?.name?.charAt(0)
                            )}
                          </div>
                          {m.user?.name}
                        </div>
                        {selected && <Check className="w-3 h-3 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Popover>
          </div>
            );
          })()}

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
                    {availableLabels.map((l) => {
                      const attached = task?.labels?.some((tl: any) => tl.id === l.id);
                      return (
                        <div key={l.id} className="group flex items-center gap-1 p-1 hover:bg-secondary rounded-md">
                          <button
                            type="button"
                            onClick={() => toggleLabel(l.id)}
                            className="flex-1 flex items-center justify-between gap-2 px-1.5 py-1 text-left"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: l.color }} />
                              <span className="text-xs truncate">{l.name}</span>
                            </div>
                            {attached && <Check className="w-3 h-3 text-primary shrink-0" />}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); editLabel(l.id, l.name, l.color); }}
                            title="Ubah label"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background/70 text-muted-foreground hover:text-foreground transition-opacity"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteLabel(l.id, l.name); }}
                            title="Hapus label"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
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
          </div>

          {/* Brief Konten Terkait — selalu tampil. Picker hanya menawarkan
              brief yang dibuat oleh user ini (sesuai aturan: hanya pembuat
              brief yang boleh menautkan brief-nya ke task). Tombol lepas
              tautan juga hanya muncul untuk brief milik user sendiri. */}
          <div className="space-y-2 pt-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <Clapperboard className="w-3 h-3" /> Brief Konten Terkait
              {linkedBriefs.length > 0 && (
                <span className="text-primary">({linkedBriefs.length})</span>
              )}
            </label>

            <div className="space-y-1.5">
              {linkedBriefs.map((b) => {
                const isMine = b.creator?.id && currentUser?.id && String(b.creator.id) === String(currentUser.id);
                return (
                  <div key={b.id} className="p-2 rounded-lg border border-border bg-card space-y-1 group">
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={`/org/${orgId}/team/${teamId}/briefs/${b.id}`}
                        className="text-xs font-bold text-foreground hover:text-primary truncate flex-1"
                        title={b.title}
                      >
                        {b.title}
                      </a>
                      {isMine && (
                        <button
                          onClick={() => toggleBriefLink(b.id)}
                          title="Lepas tautan"
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {b.final_url ? (
                      <a
                        href={b.final_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline truncate max-w-full"
                      >
                        🔗 Hasil jadi
                      </a>
                    ) : (
                      <div className="text-[10px] italic text-muted-foreground">Belum ada link hasil jadi</div>
                    )}
                  </div>
                );
              })}

              {(() => {
                const myBriefs = teamBriefs.filter((b) => b.creator?.id && currentUser?.id && String(b.creator.id) === String(currentUser.id));
                if (teamBriefs.length === 0) {
                  return (
                    <a
                      href={`/org/${orgId}/team/${teamId}/briefs`}
                      className="block w-full text-center py-2 text-[10px] font-bold text-muted-foreground rounded-lg border border-dashed border-border hover:border-primary hover:text-primary transition-all"
                    >
                      Belum ada brief di tim ini · Buat brief
                    </a>
                  );
                }
                if (myBriefs.length === 0 && linkedBriefs.length === 0) {
                  return (
                    <div className="text-[10px] italic text-muted-foreground text-center py-2 border border-dashed border-border rounded-lg">
                      Hanya pembuat brief yang bisa menautkan ke task. Buat brief sendiri dulu ya.
                    </div>
                  );
                }
                if (myBriefs.length === 0) {
                  return null; // sudah ada linked (oleh creator), tapi user ini bukan creator → no add button
                }
                return (
                  <Popover
                    align="right"
                    trigger={
                      <button className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold text-muted-foreground rounded-lg border border-dashed border-border hover:border-primary hover:text-primary transition-all">
                        <Plus className="w-3 h-3" /> Taut brief
                      </button>
                    }
                  >
                    <div className="p-2 space-y-1 w-72 max-h-72 overflow-y-auto">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                        Brief buatanmu
                      </div>
                      {myBriefs.map((b) => {
                        const linked = linkedBriefIds.includes(b.id);
                        return (
                          <button
                            key={b.id}
                            onClick={() => toggleBriefLink(b.id)}
                            className={cn(
                              "w-full flex items-center justify-between gap-2 p-2 rounded-md text-left text-xs transition-colors",
                              linked ? "bg-primary/5 text-primary" : "hover:bg-secondary text-foreground",
                            )}
                          >
                            <span className="truncate flex-1">{b.title}</span>
                            {b.final_url && <span className="text-[9px] uppercase tracking-widest text-muted-foreground">link</span>}
                            {linked && <Check className="w-3 h-3 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </Popover>
                );
              })()}
            </div>
          </div>

          <div className="pt-6 border-t border-border mt-4 space-y-2">
            <button
              onClick={archiveTask}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-muted-foreground hover:bg-secondary rounded-xl border border-border transition-all"
            >
              <Archive className="w-3 h-3" />
              {task?.archived_at ? "Pulihkan dari Arsip" : "Arsipkan Tugas"}
            </button>
            {access?.can_approve && (
              <button
                onClick={deleteTask}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-xl border border-transparent hover:border-destructive/20 transition-all"
              >
                <Trash2 className="w-3 h-3" />
                Hapus Permanen
              </button>
            )}
          </div>
        </div>
      </div>
      {previewFile && (
        <FileViewerModal
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
          fileUrl={previewFile.url}
          fileName={previewFile.file_name}
          isImage={previewFile.isImage}
          isVideo={previewFile.isVideo}
          isAudio={previewFile.isAudio}
          isPdf={previewFile.isPdf}
        />
      )}
    </Modal>
  );
}
