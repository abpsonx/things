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
  ExternalLink
} from "lucide-react";
import api from "@/lib/api";
import { socket } from "@/lib/socket";
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
  status?: 'pending' | 'sent' | 'read';
}

export default function TeamChatPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;
  const { user: currentUser } = useAuthStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const emojis = ["😀", "😂", "🥰", "👍", "🔥", "🙏", "🚀", "💡", "✅", "❌", "💯", "🙌"];

  useEffect(() => {
    fetchTeamAndMessages();

    socket.emit("join_team", teamId);

    socket.on("team_message", (message: Message) => {
      setMessages((prev) => {
        // Avoid duplicate if we just sent it
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

    return () => {
      socket.off("team_message");
      socket.off("message_deleted");
      socket.off("message_edited");
      socket.emit("leave_team", teamId);
    };
  }, [teamId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    const pendingMsg: Message = {
      id: tempId,
      user_id: currentUser?.id || "",
      user: { name: currentUser?.name || "Me", avatar_url: currentUser?.avatar_url },
      content: newMessage,
      created_at: new Date().toISOString(),
      status: 'pending'
    };

    setMessages((prev) => [...prev, pendingMsg]);
    const contentToSend = newMessage;
    setNewMessage("");

    try {
      const res = await api.post(`/organizations/${orgId}/teams/${teamId}/chat/messages`, {
        content: contentToSend
      });
      
      setMessages((prev) => prev.map(m => m.id === tempId ? { ...res.data, status: 'sent' } : m));
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

    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.post(`/organizations/${orgId}/teams/${teamId}/chat/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      // Backend will emit via socket
    } catch (err) {
      console.error("Failed to upload file", err);
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
    if (msg.file_url) {
      const isImage = msg.file_type?.startsWith('image/');
      return (
        <div className="flex flex-col gap-2">
          {isImage ? (
            <div className="rounded-xl overflow-hidden border border-black/5 shadow-sm max-w-sm">
              <img src={msg.file_url} alt={msg.file_name} className="w-full h-auto object-cover max-h-60" />
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

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#fafafa] overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-8 py-4 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
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
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 scrollbar-thin bg-dot-pattern">
        {messages.length > 0 ? (
          messages.map((msg) => {
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
                  
                  <div className="flex items-center gap-2 group/bubble">
                    {/* Menu Button (Left for Me) */}
                    {isMe && (
                      <div className="opacity-0 group-hover/bubble:opacity-100 transition-opacity flex items-center">
                        <button 
                          onClick={() => setActiveMenuId(activeMenuId === msg.id ? null : msg.id)}
                          className="p-1 hover:bg-secondary rounded-lg text-muted-foreground"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Bubble */}
                    <div 
                      className={`relative p-4 rounded-2xl shadow-sm text-[14px] leading-relaxed ${
                        isMe 
                        ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-200/50' 
                        : 'bg-gray-100 text-gray-800 border border-gray-200 rounded-tl-none'
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
                          {renderContent(msg, isMe)}
                          {msg.edited_at && <span className={`text-[9px] block mt-1 opacity-50 ${isMe ? 'text-white' : 'text-muted-foreground'}`}>(diedit)</span>}
                        </>
                      )}
                    </div>

                    {/* Menu Button (Right for others) */}
                    {!isMe && (
                      <div className="opacity-0 group-hover/bubble:opacity-100 transition-opacity">
                         {/* others' message actions could go here */}
                      </div>
                    )}
                  </div>

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
            <p className="text-sm font-semibold tracking-wide">Belum ada obrolan di tim ini.</p>
            <p className="text-xs opacity-60">Kirim pesan pertama kamu sekarang!</p>
          </div>
        )}
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
        <form onSubmit={sendMessage} className="max-w-5xl mx-auto flex items-center gap-4">
          <div className="flex-1 relative group">
            <input
              type="text"
              placeholder="Ketik pesan untuk tim..."
              className="w-full pl-6 pr-24 py-4 bg-secondary/40 border border-transparent focus:border-primary/20 focus:bg-white rounded-2xl text-sm focus:ring-4 focus:ring-primary/5 transition-all outline-none"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onFocus={() => setShowEmojiPicker(false)}
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
            className="p-4 bg-primary text-white rounded-2xl shadow-xl shadow-primary/25 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
