"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  Send,
  Loader2,
  User as UserIcon,
  Smile,
  Paperclip,
  MoreVertical,
  Edit2,
  Trash2,
  Check,
  CheckCheck,
  X,
  ExternalLink,
  Download,
  Search,
  Reply,
  BarChart3,
} from "lucide-react";
import CreatePollModal from "@/components/poll/CreatePollModal";
import PollBubble, { PollData } from "@/components/poll/PollBubble";
import Reactions, { ReactionBucket } from "@/components/reactions/Reactions";
import VoiceRecorder from "@/components/chat/VoiceRecorder";
import VoiceNotePlayer, { isAudioFile } from "@/components/chat/VoiceNotePlayer";
import api from "@/lib/api";
import { socket } from "@/lib/socket";
import { useTyping } from "@/lib/useTyping";
import TypingIndicator from "@/components/chat/TypingIndicator";
import { useAuthStore } from "@/store/useAuthStore";
import TeamNav from "@/components/team/TeamNav";
import { format } from "date-fns";
import { id } from "date-fns/locale";

interface Message {
  id: string;
  user_id: string;
  user: { name: string; avatar_url?: string };
  content: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  created_at: string;
  edited_at?: string;
  parent_id?: string | null;
  parent?: { id: string; content?: string; user?: { id?: string; name?: string } | null } | null;
  poll?: PollData | null;
  reactions?: ReactionBucket[];
  status?: 'pending' | 'sent' | 'read';
}

export default function TeamChatPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;
  const { user: currentUser } = useAuthStore();

  const { typingNames, onInput: onTypingInput, stopTyping } = useTyping(
    teamId ? `team_${teamId}` : null,
    currentUser ? { id: currentUser.id, name: currentUser.name } : null,
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; content?: string; user?: { id?: string; name?: string } | null } | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<{id: string, file: File, previewUrl?: string}[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentMessageIds = useRef<Set<string>>(new Set());

  const emojis = ["😀", "😂", "🥰", "👍", "🔥", "🙏", "🚀", "💡", "✅", "❌", "💯", "🙌"];

  useEffect(() => {
    fetchTeamAndMessages();

    socket.emit("join_team", teamId);

    socket.on("team_message", (message: Message) => {
      // Skip messages we just sent ourselves (already in state via optimistic update)
      if (sentMessageIds.current.has(message.id)) {
        sentMessageIds.current.delete(message.id);
        return;
      }
      setMessages((prev) => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, { ...message, status: 'sent' }];
      });
    });

    socket.on("message_deleted", (messageId: string) => {
      setMessages((prev) => prev.filter(m => m.id !== messageId));
    });

    socket.on("message_edited", (updatedMsg: Message) => {
      setMessages((prev) => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
    });

    socket.on("poll_updated", (poll: any) => {
      setMessages((prev) => prev.map((m) =>
        m.poll && m.poll.id === poll.id ? { ...m, poll } : m
      ));
    });

    socket.on("reaction_updated", (payload: any) => {
      if (payload.target_type !== "team_message") return;
      setMessages((prev) => prev.map((m) =>
        m.id === payload.target_id ? { ...m, reactions: payload.reactions } : m
      ));
    });

    return () => {
      socket.off("team_message");
      socket.off("message_deleted");
      socket.off("message_edited");
      socket.off("poll_updated");
      socket.off("reaction_updated");
      socket.emit("leave_team", teamId);
    };
  }, [teamId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, uploadingFiles]);

  const fetchTeamAndMessages = async () => {
    try {
      const teamRes = await api.get(`/organizations/${orgId}/teams/${teamId}`);
      setTeam(teamRes.data);

      const msgsRes = await api.get(`/organizations/${orgId}/teams/${teamId}/chat/messages`);
      setMessages(msgsRes.data.map((m: any) => ({ ...m, status: 'sent' })));
    } catch (err) {
      console.error("Failed to fetch team chat", err);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const tempId = `temp-${Date.now()}`;
    const replyParent = replyTo
      ? { id: replyTo.id, content: (replyTo.content || "").slice(0, 120), user: replyTo.user || null }
      : null;
    const pendingMsg: Message = {
      id: tempId,
      user_id: currentUser?.id || "",
      user: { name: currentUser?.name || "Me", avatar_url: currentUser?.avatar_url },
      content: newMessage,
      created_at: new Date().toISOString(),
      parent_id: replyTo?.id || null,
      parent: replyParent,
      status: 'pending',
    };

    setMessages((prev) => [...prev, pendingMsg]);
    const contentToSend = newMessage;
    const parentIdToSend = replyTo?.id || null;
    setNewMessage("");
    stopTyping();
    setReplyTo(null);

    try {
      const res = await api.post(`/organizations/${orgId}/teams/${teamId}/chat/messages`, {
        content: contentToSend,
        parent_id: parentIdToSend,
      });
      
      // Register the real ID so the socket broadcast is ignored (if it arrives after)
      sentMessageIds.current.add(res.data.id);
      
      setMessages((prev) => {
        // Remove any socket-received duplicate with the same real ID (arrived before API response)
        const withoutDuplicate = prev.filter(m => m.id !== res.data.id);
        // Replace the optimistic placeholder with the full message data
        return withoutDuplicate.map(m => m.id === tempId ? { ...res.data, status: 'sent' } : m);
      });
    } catch (err) {
      console.error("Failed to send message", err);
      setMessages((prev) => prev.filter(m => m.id !== tempId));
    }
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("Hapus pesan ini?")) return;
    try {
      await api.delete(`/organizations/${orgId}/teams/${teamId}/chat/messages/${id}`);
      setMessages((prev) => prev.filter(m => m.id !== id));
      setActiveMenuId(null);
    } catch (err) {
      console.error("Failed to delete message", err);
    }
  };

  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
    setActiveMenuId(null);
  };

  const saveEdit = async () => {
    if (!editContent.trim() || !editingId) return;
    try {
      const res = await api.put(`/organizations/${orgId}/teams/${teamId}/chat/messages/${editingId}`, {
        content: editContent
      });
      setMessages((prev) => prev.map(m => m.id === editingId ? res.data : m));
      setEditingId(null);
    } catch (err) {
      console.error("Failed to edit message", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const tempId = `temp_${Date.now()}`;
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    
    setUploadingFiles(prev => [...prev, { id: tempId, file, previewUrl }]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.post(`/organizations/${orgId}/teams/${teamId}/chat/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setUploadingFiles(prev => prev.filter(f => f.id !== tempId));
    } catch (err) {
      console.error("Failed to upload file", err);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setUploadingFiles(prev => prev.filter(f => f.id !== tempId));
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sendVoiceNote = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api.post(`/organizations/${orgId}/teams/${teamId}/chat/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } catch (err) {
      console.error("Failed to send voice note", err);
      alert("Gagal mengirim voice note");
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const renderTextWithLinks = (content: string, isMe: boolean) => {
    if (!content) return "";
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a 
            key={i} 
            href={part} 
            target="_blank" 
            rel="noopener noreferrer" 
            className={`${isMe ? 'text-indigo-100 underline underline-offset-4 hover:text-white' : 'text-indigo-600 underline underline-offset-4 hover:text-indigo-700'} inline-flex items-center gap-1 transition-colors`}
          >
            {part} <ExternalLink className="w-3 h-3" />
          </a>
        );
      }
      return part;
    });
  };

  const renderContent = (msg: Message, isMe: boolean) => {
    if (msg.poll) {
      return (
        <PollBubble
          poll={msg.poll}
          currentUserId={currentUser?.id}
          onUpdate={(next) => {
            setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, poll: next } : m));
          }}
        />
      );
    }
    if (msg.file_url && (isAudioFile(msg.file_url, msg.file_name) || msg.file_type?.startsWith("audio/"))) {
      return <VoiceNotePlayer url={msg.file_url} onDark={isMe} />;
    }
    if (msg.file_url) {
      const isImage = msg.file_type?.startsWith('image/');
      return (
        <div className="flex flex-col gap-2">
          {isImage ? (
            <div className="relative group/img rounded-xl overflow-hidden border border-black/5 shadow-sm max-w-sm">
              <img src={msg.file_url} alt={msg.file_name} className="w-full h-auto object-cover max-h-60" />
              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover/img:opacity-100">
                <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="p-2 bg-white/90 rounded-xl hover:bg-white transition-all hover:scale-105" title="Lihat gambar">
                  <ExternalLink className="w-4 h-4 text-gray-700" />
                </a>
                <a href={msg.file_url} download={msg.file_name} className="p-2 bg-white/90 rounded-xl hover:bg-white transition-all hover:scale-105" title="Download gambar">
                  <Download className="w-4 h-4 text-gray-700" />
                </a>
              </div>
            </div>
          ) : (
            <div className={`flex items-center gap-3 p-3 rounded-2xl border ${isMe ? 'bg-white/10 border-white/20' : 'bg-white border-border shadow-sm'}`}>
              <div className={`p-2.5 rounded-xl ${isMe ? 'bg-white/20' : 'bg-indigo-50'}`}>
                <Paperclip className={`w-5 h-5 ${isMe ? 'text-white' : 'text-indigo-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-bold truncate ${isMe ? 'text-white' : 'text-foreground'}`}>
                  {msg.file_name}
                </p>
                <p className={`text-[11px] font-medium opacity-70 ${isMe ? 'text-white/80' : 'text-muted-foreground'}`}>
                  Attachment
                </p>
              </div>
              <a 
                href={msg.file_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className={`p-2.5 rounded-xl transition-all ${isMe ? 'hover:bg-white/20 text-white' : 'hover:bg-secondary text-indigo-600 hover:scale-105 active:scale-95'}`}
              >
                <Download className="w-4 h-4" />
              </a>
            </div>
          )}
          {msg.content && (
            <p className="text-[14px] whitespace-pre-wrap leading-relaxed mt-1">
              {renderTextWithLinks(msg.content, isMe)}
            </p>
          )}
        </div>
      );
    }

    if (!msg.content) return null;

    return (
      <p className="text-[14px] whitespace-pre-wrap leading-relaxed">
        {renderTextWithLinks(msg.content, isMe)}
      </p>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center h-screen bg-[#fafafa]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const filteredMessages = messages.filter(m => 
    (m.content?.toLowerCase() ?? "").includes(searchQuery.toLowerCase()) || 
    (m.file_name && m.file_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] -m-8 bg-[#fafafa] overflow-hidden relative">
      {/* Sticky Header & Nav Container */}
      <div className="shrink-0 bg-white/90 backdrop-blur-md flex flex-col border-b border-border shadow-sm">
        {/* Header */}
        <div className="px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-500/20">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground tracking-tight">{team?.name}</h1>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active Discussion</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Cari pesan atau file..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-secondary border border-transparent rounded-full text-[13px] outline-none focus:bg-white focus:border-indigo-500/30 focus:ring-4 focus:ring-indigo-500/10 w-[200px] transition-all focus:w-[280px]"
              />
            </div>
          </div>
        </div>

        <TeamNav orgId={orgId} teamId={teamId} />
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 scrollbar-thin bg-dot-pattern">
        {filteredMessages.length > 0 ? (
          filteredMessages.map((msg) => {
            const isMe = msg.user_id === currentUser?.id;
            return (
              <div 
                key={msg.id} 
                className={`flex items-start gap-3 group ${isMe ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-xs font-bold overflow-hidden shrink-0 border border-border shadow-sm">
                  {msg.user?.avatar_url ? (
                    <img src={msg.user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>

                {/* Message Bubble Container */}
                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%] relative`}>
                  {!isMe && <span className="text-[11px] font-bold text-muted-foreground mb-1 ml-1">{msg.user?.name}</span>}
                  
                  <div className="flex items-center gap-2 group/bubble" id={`team-msg-${msg.id}`}>
                    {/* Action buttons (Left for Me) */}
                    {isMe && (
                      <div className="opacity-0 group-hover/bubble:opacity-100 transition-opacity flex items-center gap-1">
                        <button
                          onClick={() => setReplyTo({ id: msg.id, content: msg.content, user: msg.user ? { name: msg.user.name } : null })}
                          title="Balas"
                          className="p-1 hover:bg-secondary rounded-lg text-muted-foreground"
                        >
                          <Reply className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === msg.id ? null : msg.id)}
                          className="p-1 hover:bg-secondary rounded-lg text-muted-foreground"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Bubble — transparent wrapper for polls so PollBubble owns its styling */}
                    <div
                      className={`relative text-[14px] leading-relaxed ${
                        msg.poll
                          ? 'bg-transparent'
                          : isMe
                            ? 'p-4 rounded-2xl shadow-sm bg-[#3D4F6B] text-white rounded-tr-none shadow-slate-300/50'
                            : 'p-4 rounded-2xl shadow-sm bg-card text-foreground border border-border rounded-tl-none'
                      }`}
                    >
                      {editingId === msg.id ? (
                        <div className="space-y-2 min-w-[200px]">
                          <textarea 
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full bg-white/10 border border-white/20 rounded-lg p-2 text-white outline-none"
                            autoFocus
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setEditingId(null)} className="p-1 hover:bg-white/10 rounded"><X className="w-4 h-4" /></button>
                            <button onClick={saveEdit} className="p-1 hover:bg-white/10 rounded"><Check className="w-4 h-4" /></button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {msg.parent && (
                            <div
                              onClick={() => {
                                const el = document.getElementById(`team-msg-${msg.parent?.id}`);
                                if (el) {
                                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                                  el.classList.add("ring-2", "ring-indigo-300/60");
                                  setTimeout(() => el.classList.remove("ring-2", "ring-indigo-300/60"), 1500);
                                }
                              }}
                              className={`mb-2 px-2 py-1 rounded-md border-l-2 cursor-pointer text-[11px] leading-tight ${
                                isMe ? 'bg-white/15 border-white/60 text-white' : 'bg-white border-indigo-400/50 text-gray-700'
                              }`}
                            >
                              <p className={`font-bold flex items-center gap-1 text-[10px] ${isMe ? 'text-white/90' : 'text-gray-900'}`}>
                                ↪ {msg.parent.user?.name || "Pesan"}
                              </p>
                              <p className={`truncate ${isMe ? 'text-white/80' : 'text-gray-600'}`}>
                                {msg.parent.content || "(lampiran)"}
                              </p>
                            </div>
                          )}
                          {renderContent(msg, isMe)}
                          {msg.edited_at && (() => {
                            const dd = new Date(msg.edited_at);
                            const stamp = isNaN(dd.getTime())
                              ? "diedit"
                              : `Diedit ${String(dd.getDate()).padStart(2, "0")}/${String(dd.getMonth() + 1).padStart(2, "0")} ${String(dd.getHours()).padStart(2, "0")}.${String(dd.getMinutes()).padStart(2, "0")}`;
                            return <span className={`text-[9px] block mt-1 italic opacity-60 ${isMe ? 'text-white' : 'text-muted-foreground'}`}>{stamp}</span>;
                          })()}
                        </>
                      )}
                    </div>

                    {/* Action Button (Right for others) */}
                    {!isMe && (
                      <div className="opacity-0 group-hover/bubble:opacity-100 transition-opacity flex items-center gap-0.5">
                        <button
                          onClick={async () => {
                            try {
                              const res = await api.post("/reactions", { target_type: "team_message", target_id: msg.id, emoji: "👍" });
                              setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, reactions: res.data.reactions } : m));
                            } catch (err) { console.error(err); }
                          }}
                          title="Reaksi cepat 👍"
                          className="p-1 hover:bg-secondary rounded-lg text-muted-foreground text-sm"
                        >
                          👍
                        </button>
                        <button
                          onClick={() => setReplyTo({ id: msg.id, content: msg.content, user: msg.user ? { name: msg.user.name } : null })}
                          title="Balas"
                          className="p-1 hover:bg-secondary rounded-lg text-muted-foreground"
                        >
                          <Reply className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className={`mt-1 px-1 flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <Reactions
                        targetType="team_message"
                        targetId={msg.id}
                        reactions={msg.reactions}
                        onChange={(next) =>
                          setMessages((prev) => prev.map((m) =>
                            m.id === msg.id ? { ...m, reactions: next } : m
                          ))
                        }
                      />
                    </div>
                  )}

                  {/* Timestamp & Status */}
                  <div className={`flex items-center gap-1.5 mt-1 px-1`}>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {(() => {
                        try {
                          const date = new Date(msg.created_at);
                          return isNaN(date.getTime()) ? "--:--" : format(date, 'HH:mm');
                        } catch (e) {
                          return "--:--";
                        }
                      })()}
                    </span>
                    {isMe && (
                      <span className="text-muted-foreground">
                        {msg.status === 'pending' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : msg.status === 'read' ? (
                          <CheckCheck className="w-3 h-3 text-blue-500" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                      </span>
                    )}
                  </div>

                  {/* Context Menu Popup */}
                  {activeMenuId === msg.id && (
                    <div className={`absolute top-full ${isMe ? 'right-0' : 'left-0'} z-50 mt-1 bg-white border border-border rounded-xl shadow-xl p-1 min-w-[120px] animate-in zoom-in-95 duration-200`}>
                      <button 
                        onClick={() => startEdit(msg)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary rounded-lg transition-colors text-foreground"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Edit Pesan
                      </button>
                      <button 
                        onClick={() => deleteMessage(msg.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Hapus Pesan
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-20">
            <Users className="w-16 h-16 opacity-10 mb-4" />
            {searchQuery ? (
              <>
                <p className="text-sm font-semibold tracking-wide">Pesan tidak ditemukan.</p>
                <p className="text-xs opacity-60">Coba kata kunci lain.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold tracking-wide">Belum ada obrolan di tim ini.</p>
                <p className="text-xs opacity-60">Kirim pesan pertama kamu sekarang!</p>
              </>
            )}
          </div>
        )}
        
        {/* Uploading Status Bubbles */}
        {uploadingFiles.map((upload) => (
          <div 
            key={upload.id} 
            className="flex items-start gap-3 group flex-row-reverse animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-xs font-bold overflow-hidden shrink-0 border border-border shadow-sm">
              {currentUser?.avatar_url ? (
                <img src={currentUser.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-4 h-4 text-muted-foreground" />
              )}
            </div>

            <div className="flex flex-col items-end max-w-[75%] relative">
              <div className="flex items-center gap-2 group/bubble flex-row-reverse">
                <div className="relative p-4 rounded-2xl shadow-sm text-[14px] leading-relaxed bg-indigo-600 text-white rounded-tr-none shadow-indigo-200/50 opacity-80">
                  <div className="flex flex-col gap-2">
                    {upload.previewUrl ? (
                      <div className="rounded-xl overflow-hidden border border-black/5 shadow-sm max-w-sm relative">
                        <img src={upload.previewUrl} alt="uploading" className="w-full h-auto object-cover max-h-60 opacity-60" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-white animate-spin drop-shadow-md" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3 rounded-2xl border bg-white/10 border-white/20">
                        <div className="p-2.5 rounded-xl bg-white/20 relative">
                          <Paperclip className="w-5 h-5 text-white opacity-40" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 pr-6">
                          <p className="text-[13px] font-bold truncate text-white">{upload.file.name}</p>
                          <p className="text-[11px] font-medium text-white/80">Mengunggah file...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-28 right-8 z-50 bg-white border border-border rounded-2xl shadow-2xl p-4 grid grid-cols-4 gap-2 animate-in slide-in-from-bottom-4 duration-300">
          {emojis.map(emoji => (
            <button 
              key={emoji} 
              onClick={() => {
                setNewMessage(prev => prev + emoji);
                setShowEmojiPicker(false);
              }}
              className="text-xl p-2 hover:bg-secondary rounded-xl transition-all hover:scale-110 active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="p-6 bg-white border-t border-border shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
        {replyTo && (
          <div className="max-w-5xl mx-auto mb-3 p-2.5 bg-indigo-50 border-l-2 border-indigo-500 rounded-xl flex items-center justify-between text-xs">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 mb-0.5">
                <Reply className="w-3 h-3 shrink-0" />
                Membalas {replyTo.user?.name || "pesan"}
              </p>
              <p className="truncate text-muted-foreground">{(replyTo.content || "(lampiran)").slice(0, 140)}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-indigo-100 rounded-lg shrink-0 ml-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="max-w-5xl mx-auto h-5">
          <TypingIndicator names={typingNames} />
        </div>
        <form onSubmit={sendMessage} className="max-w-5xl mx-auto flex items-end gap-4">
          <div className="flex-1 relative group">
            <textarea
              rows={1}
              placeholder="Ketik pesan untuk tim..."
              className="w-full pl-6 pr-24 py-4 bg-secondary/40 border border-transparent focus:border-primary/20 focus:bg-white rounded-2xl text-sm focus:ring-4 focus:ring-primary/5 transition-all outline-none resize-none overflow-hidden"
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                onTypingInput();
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onFocus={() => setShowEmojiPicker(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (newMessage.trim()) sendMessage(e as any);
                }
              }}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <input 
                type="file" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setIsPollModalOpen(true)}
                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                title="Buat polling"
              >
                <BarChart3 className="w-5 h-5" />
              </button>
              <VoiceRecorder onSend={sendVoiceNote} />
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`p-2 transition-all rounded-xl ${showEmojiPicker ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
              >
                <Smile className="w-5 h-5" />
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="p-4 bg-primary text-white rounded-2xl shadow-xl shadow-primary/25 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100 shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>

      <CreatePollModal
        isOpen={isPollModalOpen}
        onClose={() => setIsPollModalOpen(false)}
        teamId={teamId}
      />
    </div>
  );
}
