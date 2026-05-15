"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Send,
  Loader2,
  User as UserIcon,
  ShieldCheck,
  Paperclip,
  Trash2,
  Edit2,
  X,
  Check,
  CheckCheck,
  Smile,
  Wifi,
  WifiOff,
  FileText,
  File,
  Image,
  Video,
  Music,
  Download,
  Eye,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import FileViewerModal from "@/components/ui/FileViewerModal";

type WsStatus = "connecting" | "connected" | "disconnected";

type FileInfo = {
  id: string;
  name: string;
  url: string;
  isImage: boolean;
  isVideo: boolean;
  isAudio: boolean;
  isPdf: boolean;
  size?: number;
};

export default function DMChatPage() {
  const params = useParams();
  const orgId = params?.id;
  const targetUserId = params?.userId;
  const { user: currentUser } = useAuthStore();

  const [channel, setChannel] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
  const [viewingFile, setViewingFile] = useState<FileInfo | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingFileName, setUploadingFileName] = useState<string>("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelIdRef = useRef<string | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const emojis = ["😊", "😂", "👍", "🔥", "🙏", "❤️", "🙌", "✅", "🚀", "🤔"];

  // ─── Helper: detect file type from name ─────────────────────────────────
  const getFileInfo = (name: string): { isImage: boolean; isVideo: boolean; isAudio: boolean; isPdf: boolean } => {
    const ext = (name || "").toLowerCase().split(".").pop() || "";
    return {
      isImage: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext),
      isVideo: ["mp4", "webm", "mov", "avi", "mkv", "wmv"].includes(ext),
      isAudio: ["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext),
      isPdf: ext === "pdf",
    };
  };

  const getFileIcon = (name: string) => {
    const info = getFileInfo(name);
    if (info.isImage) return <Image className="w-5 h-5" />;
    if (info.isVideo) return <Video className="w-5 h-5" />;
    if (info.isAudio) return <Music className="w-5 h-5" />;
    if (info.isPdf) return <FileText className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ─── Connect native WebSocket ─────────────────────────────────────────────
  const connectWsRef = useRef<any>(null);

  const connectWs = useCallback((channelId: string) => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.onclose = null;
      wsRef.current.close(1000);
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://dothings.id/api";
    const wsBase = apiUrl.replace(/^http/, "ws").replace(/\/api$/, "");
    const wsUrl = `${wsBase}/api/dm/ws/${channelId}?token=${encodeURIComponent(token)}`;

    setWsStatus("connecting");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    let pongTimeout: ReturnType<typeof setTimeout>;

    ws.onopen = () => {
      setWsStatus("connected");
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
          pongTimeout = setTimeout(() => {
            console.warn("[WS] Pong timeout! Force reconnect...");
            ws.close();
          }, 5000);
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      if (event.data === "pong") {
        clearTimeout(pongTimeout);
        return;
      }

      try {
        const data = JSON.parse(event.data);

        if (data.type === "dm_received") {
          setMessages((prev) => {
            const tempIndex = prev.findIndex(
              (m) => data.message.temp_id && m.id === data.message.temp_id
            );
            if (tempIndex !== -1) {
              const next = [...prev];
              next[tempIndex] = data.message;
              return next;
            }
            if (prev.find((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        } else if (data.type === "dm_edited") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.message.id ? { ...m, content: data.message.content } : m
            )
          );
        } else if (data.type === "dm_deleted") {
          setMessages((prev) => prev.filter((m) => m.id !== data.message_id));
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = (event) => {
      setWsStatus("disconnected");
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

      if (event.code !== 1000 && event.code !== 4001) {
        reconnectTimerRef.current = setTimeout(() => {
          if (channelIdRef.current && connectWsRef.current) {
            connectWsRef.current(channelIdRef.current);
          }
        }, 3000);
      }
    };

    ws.onerror = () => {
      setWsStatus("disconnected");
    };
  }, []);

  useEffect(() => {
    connectWsRef.current = connectWs;
  }, [connectWs]);

  // ─── Init DM ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const initDM = async () => {
      try {
        const res = await api.post("/dm/channels", {
          org_id: orgId === "undefined" ? null : orgId,
          other_user_id: targetUserId,
        });

        if (!mounted) return;

        setChannel(res.data);
        channelIdRef.current = res.data.id;

        connectWs(res.data.id);

        const msgRes = await api.get(`/dm/channels/${res.data.id}/messages`);

        if (!mounted) return;

        setMessages(msgRes.data);
      } catch (err) {
        console.error("Failed to init DM", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (targetUserId) initDM();

    return () => {
      mounted = false;
      channelIdRef.current = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000, "page unmount");
      }
    };
  }, [orgId, targetUserId, connectWs]);

  // ─── Auto scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ─── Send text message ─────────────────────────────────────────────────────
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !channel) return;

    if (editingMessage) {
      handleUpdateMessage();
      return;
    }

    setSending(true);
    const tempId = `optimistic_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const optimistic = {
      id: tempId,
      content: newMessage,
      user_id: currentUser?.id,
      dm_channel_id: channel.id,
      created_at: new Date().toISOString(),
      attachment_url: null,
      attachment_name: null,
      user: { id: currentUser?.id, name: currentUser?.name, avatar_url: currentUser?.avatar_url },
      _optimistic: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    setNewMessage("");

    try {
      const res = await api.post(`/dm/channels/${channel.id}/messages`, {
        content: optimistic.content,
        temp_id: tempId,
      });

      setTimeout(() => {
        setMessages((prev) => {
          const stillOptimistic = prev.find((m) => m.id === tempId);
          if (stillOptimistic) {
            return prev.map((m) => (m.id === tempId ? res.data : m));
          }
          return prev;
        });
      }, 3000);
    } catch (err) {
      console.error("Failed to send message", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(optimistic.content);
    } finally {
      setSending(false);
    }
  };

  const handleUpdateMessage = async () => {
    try {
      const res = await api.put(`/dm/messages/${editingMessage.id}`, {
        content: newMessage,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === editingMessage.id ? { ...m, content: res.data.content } : m))
      );
      setEditingMessage(null);
      setNewMessage("");
    } catch (err) {
      console.error("Failed to update message", err);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    if (!confirm("Hapus pesan ini?")) return;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    try {
      await api.delete(`/dm/messages/${id}`);
    } catch (err) {
      console.error("Failed to delete message", err);
    }
  };

  // ─── Upload file ───────────────────────────────────────────────────────────
  const doUploadFile = async (file: File) => {
    if (!channel) return;

    const tempId = `optimistic_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const fileInfo = getFileInfo(file.name);
    const uploadUrl = URL.createObjectURL(file);

    // Show optimistic message with local preview
    const optimisticMsg = {
      id: tempId,
      content: file.name,
      user_id: currentUser?.id,
      dm_channel_id: channel.id,
      created_at: new Date().toISOString(),
      attachment_url: uploadUrl,
      attachment_name: file.name,
      file_size: file.size,
      is_image: fileInfo.isImage,
      is_video: fileInfo.isVideo,
      is_audio: fileInfo.isAudio,
      is_pdf: fileInfo.isPdf,
      user: { id: currentUser?.id, name: currentUser?.name, avatar_url: currentUser?.avatar_url },
      _optimistic: true,
      _uploading: true,
      _upload_progress: 0,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setUploadingFileName(file.name);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          const next = Math.min((prev || 0) + (Math.random() * 15 + 5), 90);
          setMessages((msgs) =>
            msgs.map((m) =>
              m.id === tempId ? { ...m, _upload_progress: next } : m
            )
          );
          return next;
        });
      }, 300);

      const res = await api.post(`/dm/channels/${channel.id}/attachments`, formData, {
        params: { temp_id: tempId },
        headers: { "Content-Type": "multipart/form-data" },
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Mark as 100% then replace with real data after short delay
      setMessages((msgs) =>
        msgs.map((m) =>
          m.id === tempId ? { ...m, _upload_progress: 100 } : m
        )
      );

      // Replace optimistic message with real one
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                ...res.data,
                id: res.data.id || res.data.message?.id,
                user: { id: currentUser?.id, name: currentUser?.name, avatar_url: currentUser?.avatar_url },
              }
              : m
          )
        );
        URL.revokeObjectURL(uploadUrl);
      }, 500);

      // Fallback: jika WS tidak merespon dalam 5 detik
      setTimeout(() => {
        setMessages((prev) => {
          const stillOpt = prev.find((m) => m.id === tempId && m._optimistic);
          if (stillOpt) {
            return prev.map((m) =>
              m.id === tempId
                ? {
                  ...res.data,
                  id: res.data.id || res.data.message?.id,
                  user: { id: currentUser?.id, name: currentUser?.name, avatar_url: currentUser?.avatar_url },
                }
                : m
            );
          }
          return prev;
        });
      }, 5000);
    } catch (err) {
      console.error("Failed to upload file", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      URL.revokeObjectURL(uploadUrl);
    } finally {
      setUploadProgress(null);
      setUploadingFileName("");
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) doUploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDropFile = (file: File) => {
    doUploadFile(file);
  };

  // ─── Open file viewer ──────────────────────────────────────────────────────
  const openFileViewer = (msg: any) => {
    const name = msg.attachment_name || msg.content || "file";
    const info = msg.is_image !== undefined
      ? { isImage: msg.is_image, isVideo: msg.is_video, isAudio: msg.is_audio, isPdf: msg.is_pdf }
      : getFileInfo(name);

    setViewingFile({
      id: msg.id,
      name: name,
      url: msg.attachment_url,
      ...info,
      size: msg.file_size,
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-160px)]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const otherUser = channel?.user1_id === currentUser?.id ? channel?.user2 : channel?.user1;

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border bg-secondary/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary relative">
            <UserIcon className="w-5 h-5" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" />
          </div>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-1">
              {otherUser?.name || "Chat Pribadi"}
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
            </h2>
            <p className="text-[10px] text-muted-foreground">Aktif sekarang</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {wsStatus === "connected" ? (
            <><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">Live</span></>
          ) : wsStatus === "connecting" ? (
            <><Loader2 className="w-3 h-3 animate-spin" /><span>Connecting...</span></>
          ) : (
            <><WifiOff className="w-3 h-3 text-destructive" /><span className="text-destructive">Offline</span></>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && channel) {
            handleDropFile(file);
          }
        }}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5 bg-secondary/[0.02] relative"
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] z-50 flex items-center justify-center border-2 border-dashed border-primary m-3 rounded-3xl animate-in fade-in zoom-in-95">
            <div className="bg-background px-8 py-6 rounded-2xl shadow-xl flex flex-col items-center gap-3">
              <Paperclip className="w-8 h-8 text-primary animate-bounce" />
              <span className="font-bold text-sm text-foreground">Lepaskan untuk mengirim file</span>
              <span className="text-[10px] text-muted-foreground">ke {otherUser?.name}</span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mb-4">
              <Send className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-bold text-muted-foreground">Belum ada pesan</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Kirim pesan atau file untuk memulai percakapan</p>
          </div>
        )}

        {/* Date separator for today */}
        {messages.length > 0 && (
          <div className="flex items-center justify-center my-3">
            <div className="px-3 py-1 bg-secondary/50 rounded-full text-[10px] text-muted-foreground font-medium">
              Hari ini
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMe = msg.user_id === currentUser?.id;
          const isOptimistic = msg._optimistic === true;
          const isUploading = msg._uploading === true;
          const uploadPct = msg._upload_progress || 0;
          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const isSameSender = prevMsg && prevMsg.user_id === msg.user_id;
          const showAvatar = !isMe && !isSameSender;

          return (
            <div key={msg.id} className={cn("flex group", isMe ? "justify-end" : "justify-start")}>
              <div className={cn("flex gap-1.5 max-w-[80%] md:max-w-[65%]", isMe ? "flex-row-reverse" : "flex-row")}>
                {/* Avatar space for alignment */}
                <div className={cn("w-8 shrink-0", !showAvatar && "invisible")}>
                  {showAvatar && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                      {(otherUser?.name || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                  {/* Sender name for first message */}
                  {showAvatar && !isMe && (
                    <span className="text-[10px] text-muted-foreground font-medium mb-0.5 ml-1">
                      {otherUser?.name}
                    </span>
                  )}

                  {/* Message bubble */}
                  <div className={cn(
                    "relative px-3.5 py-2 text-sm shadow-sm transition-all",
                    isMe
                      ? "bg-primary text-primary-foreground rounded-[18px] rounded-br-[4px]"
                      : "bg-card border border-border rounded-[18px] rounded-bl-[4px] text-foreground",
                    isOptimistic && "opacity-70",
                    isUploading && "min-w-[160px]"
                  )}>
                    {/* Attachment content */}
                    {msg.attachment_url ? (
                      <div className="space-y-1.5">
                        {/* Image preview */}
                        {(msg.is_image || getFileInfo(msg.attachment_name || "").isImage) && !isUploading ? (
                          <div
                            className="relative group/img cursor-pointer rounded-lg overflow-hidden max-w-[240px]"
                            onClick={() => openFileViewer(msg)}
                          >
                            <img
                              src={msg.attachment_url}
                              alt={msg.attachment_name || "Gambar"}
                              className="w-full rounded-lg max-h-[200px] object-cover"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-all flex items-center justify-center">
                              <div className="opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/50 text-white p-1.5 rounded-full">
                                <Eye className="w-4 h-4" />
                              </div>
                            </div>
                          </div>
                        ) : msg.is_video || getFileInfo(msg.attachment_name || "").isVideo ? (
                          <div className="relative rounded-lg overflow-hidden max-w-[240px]">
                            <video
                              src={msg.attachment_url}
                              className="w-full rounded-lg max-h-[200px]"
                              controls
                              preload="metadata"
                            />
                          </div>
                        ) : null}

                        {/* File card for non-image, non-video */}
                        {!msg.is_image && !getFileInfo(msg.attachment_name || "").isImage &&
                          !msg.is_video && !getFileInfo(msg.attachment_name || "").isVideo && (
                            <div className={cn(
                              "flex items-center gap-2.5 p-2.5 rounded-xl",
                              isMe ? "bg-primary-foreground/10" : "bg-secondary/50"
                            )}>
                              <div className={cn(
                                "p-2 rounded-lg shrink-0",
                                isMe ? "bg-primary-foreground/15" : "bg-background"
                              )}>
                                {getFileIcon(msg.attachment_name || "")}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium truncate">{msg.attachment_name || "File"}</p>
                                <p className={cn(
                                  "text-[9px]",
                                  isMe ? "text-primary-foreground/60" : "text-muted-foreground"
                                )}>
                                  {formatFileSize(msg.file_size)}
                                </p>
                              </div>
                              <button
                                onClick={() => openFileViewer(msg)}
                                className={cn(
                                  "p-1.5 rounded-lg shrink-0 transition-colors",
                                  isMe ? "hover:bg-primary-foreground/15" : "hover:bg-secondary"
                                )}
                                title="Lihat file"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <a
                                href={msg.attachment_url}
                                download={msg.attachment_name || "file"}
                                className={cn(
                                  "p-1.5 rounded-lg shrink-0 transition-colors",
                                  isMe ? "hover:bg-primary-foreground/15" : "hover:bg-secondary"
                                )}
                                title="Unduh"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          )}

                        {/* Image clicked to view hint */}
                        {(msg.is_image || getFileInfo(msg.attachment_name || "").isImage) && !isUploading && (
                          <p className={cn(
                            "text-[10px] opacity-60 text-center",
                            isMe ? "text-primary-foreground" : "text-foreground"
                          )}>
                            Ketuk untuk melihat
                          </p>
                        )}
                      </div>
                    ) : (
                      /* Text content with word wrap */
                      <div className="whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content}
                      </div>
                    )}

                    {/* Upload progress bar */}
                    {isUploading && (
                      <div className="mt-2 space-y-1.5">
                        <div className={cn(
                          "flex items-center gap-2",
                          isMe ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          <Clock className="w-3 h-3 animate-pulse" />
                          <span className="text-[10px]">Mengirim file...</span>
                        </div>
                        <div className={cn(
                          "h-1.5 rounded-full overflow-hidden",
                          isMe ? "bg-primary-foreground/20" : "bg-secondary"
                        )}>
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-300 ease-out",
                              isMe ? "bg-primary-foreground/60" : "bg-primary"
                            )}
                            style={{ width: `${uploadPct}%` }}
                          />
                        </div>
                        <p className={cn(
                          "text-[9px] text-right",
                          isMe ? "text-primary-foreground/50" : "text-muted-foreground"
                        )}>
                          {Math.round(uploadPct)}%
                        </p>
                      </div>
                    )}

                    {/* Timestamp + status */}
                    <div className={cn(
                      "flex items-center gap-1 mt-1",
                      isMe ? "justify-end" : "justify-start"
                    )}>
                      {isOptimistic && !isUploading ? (
                        <span className={cn(
                          "text-[9px] flex items-center gap-1",
                          isMe ? "text-primary-foreground/60" : "text-muted-foreground"
                        )}>
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          Mengirim...
                        </span>
                      ) : isUploading ? null : (
                        <span className={cn(
                          "text-[9px]",
                          isMe ? "text-primary-foreground/60" : "text-muted-foreground"
                        )}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {isMe && (msg.is_read ? (
                            <CheckCheck className="w-3 h-3 inline ml-1 text-blue-300" />
                          ) : (
                            <Check className="w-3 h-3 inline ml-1" />
                          ))}
                        </span>
                      )}
                    </div>

                    {/* Edit/Delete actions */}
                    {isMe && !isOptimistic && !isUploading && (
                      <div className={cn(
                        "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1",
                        isMe ? "-left-10" : "-right-10"
                      )}>
                        <button
                          onClick={() => { setEditingMessage(msg); setNewMessage(msg.content); }}
                          className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground bg-background/80 backdrop-blur-sm shadow-sm"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive bg-background/80 backdrop-blur-sm shadow-sm"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="p-3.5 border-t border-border bg-card shrink-0">
        {editingMessage && (
          <div className="mb-2.5 p-2.5 bg-secondary/50 rounded-xl flex items-center justify-between text-xs border border-border">
            <span className="truncate flex items-center gap-1.5 text-muted-foreground">
              <Edit2 className="w-3 h-3 shrink-0" />
              <span className="truncate">Mengedit pesan...</span>
            </span>
            <button
              onClick={() => { setEditingMessage(null); setNewMessage(""); }}
              className="p-1 hover:bg-secondary rounded-lg shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {showEmojis && (
          <div className="mb-2.5 p-2 bg-secondary/30 rounded-xl flex gap-2 overflow-x-auto border border-border shadow-inner">
            {emojis.map((e) => (
              <button
                key={e}
                onClick={() => { setNewMessage((prev) => prev + e); setShowEmojis(false); }}
                className="text-lg hover:scale-125 transition-transform shrink-0"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {/* Upload progress banner */}
        {uploadProgress !== null && (
          <div className="mb-2.5 p-2.5 bg-secondary/30 rounded-xl border border-border flex items-center gap-2.5 text-xs">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Paperclip className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{uploadingFileName}</p>
              <div className="h-1 bg-secondary rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
            <span className="text-muted-foreground font-mono text-[10px] shrink-0">
              {Math.round(uploadProgress)}%
            </span>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            className="hidden"
            accept="*/*"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadProgress !== null}
            className="p-3 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors disabled:opacity-40"
            title="Lampirkan file"
          >
            <Paperclip className="w-5 h-5 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => setShowEmojis(!showEmojis)}
            className="p-3 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors"
          >
            <Smile className="w-5 h-5 text-muted-foreground" />
          </button>

          <div className="flex-1 relative">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Tulis pesan..."
              rows={1}
              className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-2xl focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all text-sm resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={!newMessage.trim() || sending || uploadProgress !== null}
            className="p-3 bg-primary text-primary-foreground rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>

      {/* File Viewer Modal */}
      {viewingFile && (
        <FileViewerModal
          isOpen={!!viewingFile}
          onClose={() => setViewingFile(null)}
          fileUrl={viewingFile.url}
          fileName={viewingFile.name}
          isImage={viewingFile.isImage}
          isVideo={viewingFile.isVideo}
          isAudio={viewingFile.isAudio}
          isPdf={viewingFile.isPdf}
        />
      )}
    </div>
  );
}