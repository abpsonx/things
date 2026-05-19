"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import api from "@/lib/api";
import { socket } from "@/lib/socket";
import {
  Send,
  Hash,
  Plus,
  Search,
  MoreVertical,
  Smile,
  Paperclip,
  Loader2,
  Edit2,
  Trash2,
  Reply,
  Check,
  CheckCheck,
  X,
  CornerDownRight,
  MessageSquare,
  Pin,
  Star,
  Image,
  FileText,
  Link2,
  ExternalLink,
  BarChart3,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import CreatePollModal from "@/components/poll/CreatePollModal";
import PollBubble, { PollData } from "@/components/poll/PollBubble";

// Format an edited_at timestamp into "DD/MM HH.MM" Indonesian style.
const fmtEdited = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}.${mi}`;
};

export default function ChatPage() {
  const { id: orgId, projectId } = useParams();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [activeChannel, setActiveChannel] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Advanced Features State
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [readInfo, setReadInfo] = useState<any>(null);

  // Attachments & Emojis
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [isStarredModalOpen, setIsStarredModalOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [profileMember, setProfileMember] = useState<any | null>(null);
  const [mediaTab, setMediaTab] = useState<"media" | "files" | "links">("media");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const EMOJIS = ["😀", "😂", "🤣", "😊", "😍", "🙏", "👍", "🙌", "🔥", "🎉", "✨", "❤️", "💡", "✅", "👀", "🚀"];

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @mention picker state
  const [members, setMembers] = useState<any[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  // Mentions the user explicitly picked this composing session. We display
  // them in the textarea as plain `@Name` (no uuid noise) and only expand
  // them to the full `@[Name](uuid)` token right before sending.
  const pickedMentionsRef = useRef<Map<string, string>>(new Map());

  // Fetch Current User
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get("/auth/me");
        setCurrentUser(res.data);
      } catch (err) {
        console.error("Failed to fetch user", err);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const onConnect = () => {
      console.log("Socket connected!");
      setIsConnected(true);
    };
    const onDisconnect = () => {
      console.log("Socket disconnected!");
      setIsConnected(false);
    };
    const onConnectError = (err: any) => {
      console.error("Socket connection error:", err);
      setIsConnected(false);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    if (!socket.connected) {
      socket.connect();
    } else {
      setIsConnected(true);
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, []);

  // Close menu on click outside
  useEffect(() => {
    if (!showHeaderMenu) return;
    const handleOutsideClick = () => setShowHeaderMenu(false);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [showHeaderMenu]);

  // Fetch project members so the @mention picker has someone to suggest
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    api.get(`/organizations/${orgId}/projects/${projectId}/members`)
      .then((res) => {
        if (cancelled) return;
        setMembers(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => console.error("Failed to fetch project members", err));
    return () => { cancelled = true; };
  }, [orgId, projectId]);

  // Members filtered by what the user typed after @
  const mentionMatches =
    mentionQuery === null
      ? []
      : members
          .filter((m) =>
            (m.user?.name || "")
              .toLowerCase()
              .includes(mentionQuery.toLowerCase()),
          )
          .filter((m) => m.user_id !== currentUser?.id)
          .slice(0, 6);

  const insertMention = (member: any) => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    const cursor = ta.selectionStart ?? newMessage.length;
    const before = newMessage.slice(0, cursor);
    const after = newMessage.slice(cursor);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) return;
    const name = member.user?.name || "user";
    // Track for later expansion. Same name → assume same user (project
    // member list rarely has duplicates; first pick wins).
    pickedMentionsRef.current.set(name, member.user_id);
    const visible = `@${name} `;
    const next = before.slice(0, atIdx) + visible + after;
    setNewMessage(next);
    setMentionQuery(null);
    setMentionHighlight(0);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const pos = atIdx + visible.length;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos);
    });
  };

  // Replace each `@Name` (whole word) that we explicitly inserted via the
  // picker with the full `@[Name](uuid)` token the backend expects.
  const expandMentionsForSend = (text: string) => {
    if (!text || pickedMentionsRef.current.size === 0) return text;
    let out = text;
    // Sort by name length desc so longer names match before substrings
    const names = Array.from(pickedMentionsRef.current.keys()).sort(
      (a, b) => b.length - a.length,
    );
    for (const name of names) {
      const uid = pickedMentionsRef.current.get(name);
      if (!uid) continue;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // \B@Name(?=\s|$) — preceded by anything, followed by space or end
      const re = new RegExp(`@${escaped}(?=\\s|$|[^\\w])`, "g");
      out = out.replace(re, `@[${name}](${uid})`);
    }
    return out;
  };

  const clearChat = async () => {
    if (!activeChannel || !window.confirm("Hapus semua pesan di channel ini?")) return;
    try {
      await api.delete(`/projects/${projectId}/channels/${activeChannel.id}/clear`);
      setShowHeaderMenu(false);
    } catch (err) {
      console.error("Failed to clear chat", err);
    }
  };

  const markAllAsRead = async () => {
    if (!activeChannel || !currentUser) return;
    const unreadIds = messages
      .filter(m => m.user_id !== currentUser.id && (!m.read_by || !m.read_by.some((r: any) => r.id === currentUser.id)))
      .map(m => m.id);

    if (unreadIds.length > 0) {
      try {
        await api.post(`/projects/${projectId}/channels/${activeChannel.id}/messages/read`, {
          message_ids: unreadIds
        });
        setShowHeaderMenu(false);
      } catch (err) {
        console.error("Failed to mark read", err);
      }
    } else {
      setShowHeaderMenu(false);
    }
  };

  const showChannelInfo = () => {
    alert(`Channel: #${activeChannel?.name}\nProject ID: ${projectId}\nMembers: ${messages.reduce((acc: any, m: any) => {
      if (!acc.includes(m.user?.name)) acc.push(m.user?.name);
      return acc;
    }, []).join(", ") || "No messages yet"}`);
    setShowHeaderMenu(false);
  };

  const handleRenameChannel = async () => {
    const newName = window.prompt("Masukkan nama channel baru:", activeChannel?.name);
    if (!newName || newName === activeChannel?.name) return;
    try {
      const res = await api.put(`/projects/${projectId}/channels/${activeChannel.id}`, { name: newName });
      setChannels(channels.map(c => c.id === activeChannel.id ? res.data : c));
      setActiveChannel(res.data);
      setShowHeaderMenu(false);
    } catch (err) {
      console.error("Failed to rename channel", err);
    }
  };

  const handleDeleteChannel = async () => {
    if (channels.length <= 1) {
      alert("Project harus memiliki minimal satu channel.");
      return;
    }
    if (!window.confirm(`Hapus channel #${activeChannel?.name}? Semua pesan akan hilang selamanya.`)) return;
    try {
      await api.delete(`/projects/${projectId}/channels/${activeChannel.id}`);
      const remainingChannels = channels.filter(c => c.id !== activeChannel.id);
      setChannels(remainingChannels);
      setActiveChannel(remainingChannels[0]);
      setShowHeaderMenu(false);
    } catch (err) {
      console.error("Failed to delete channel", err);
    }
  };

  const renderMessageContent = (content: string, onGreen = false) => {
    if (!content) return null;
    // Split on URL OR mention token, keeping the delimiters
    const TOKEN_RE = /(https?:\/\/[^\s]+|@\[[^\]]+\]\([0-9a-fA-F-]{36}\))/g;
    const parts = content.split(TOKEN_RE);
    const MENTION_RE = /^@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)$/;
    const URL_RE = /^https?:\/\//;

    return parts.map((part, i) => {
      if (!part) return null;
      const mentionMatch = part.match(MENTION_RE);
      if (mentionMatch) {
        const [, name, userId] = mentionMatch;
        const isViewer = currentUser?.id === userId;
        return (
          <span
            key={i}
            className={cn(
              "inline-flex items-center px-1 rounded font-extrabold",
              onGreen
                ? "text-white underline underline-offset-2 decoration-white/60"
                : isViewer
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-primary/10 text-primary",
            )}
          >
            @{name}
          </span>
        );
      }
      if (URL_RE.test(part)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "hover:underline break-all",
              onGreen ? "text-white font-semibold underline underline-offset-2" : "text-blue-500",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const togglePin = async (msg: any) => {
    try {
      await api.post(`/projects/${projectId}/channels/${activeChannel?.id}/messages/${msg.id}/pin`);
    } catch (err) {
      console.error("Failed to pin message", err);
    }
  };

  const toggleStar = async (msg: any) => {
    try {
      await api.post(`/projects/${projectId}/channels/${activeChannel?.id}/messages/${msg.id}/star`);
    } catch (err) {
      console.error("Failed to star message", err);
    }
  };
  const fetchChannels = useCallback(async () => {
    try {
      const res = await api.get(`/projects/${projectId}/channels`);
      setChannels(res.data);
      if (res.data.length > 0 && !activeChannel) {
        setActiveChannel(res.data[0]);
      }
    } catch (err) {
      console.error("Failed to fetch channels", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, activeChannel]);

  useEffect(() => {
    if (projectId) fetchChannels();
  }, [projectId, fetchChannels]);

  useEffect(() => {
    if (activeChannel) {
      const fetchMessages = async () => {
        try {
          const res = await api.get(`/projects/${projectId}/channels/${activeChannel.id}/messages`);
          setMessages(res.data);
        } catch (err) {
          console.error("Failed to fetch messages", err);
        }
      };
      fetchMessages();

      const joinRoom = () => {
        if (socket.connected) {
          socket.emit("join_channel", { channel_id: activeChannel.id });
        }
      };

      if (socket.connected) joinRoom();
      else socket.once("connect", joinRoom);

      const handleNewMessage = (message: any) => {
        if (message.channel_id === activeChannel.id) {
          setMessages((prev) => {
            if (prev.find(m => m.id === message.id)) return prev;
            return [...prev, message];
          });
        }
      };

      const handleUpdateMessage = (data: any) => {
        setMessages((prev) => prev.map(m => m.id === data.id ? { ...m, content: data.content, is_edited: true, edited_at: data.edited_at || m.edited_at || new Date().toISOString() } : m));
      };

      const handleDeleteMessage = (data: any) => {
        setMessages((prev) => prev.filter(m => m.id !== data.id));
      };

      const handleMessagesRead = (data: any) => {
        if (data.channel_id === activeChannel.id) {
          setMessages((prev) => prev.map(m => {
            const update = data.updates.find((u: any) => u.message_id === m.id);
            if (update) {
              return { ...m, is_read: true, read_by: update.read_by };
            }
            return m;
          }));
        }
      };

      const handleChannelCleared = (data: any) => {
        if (data.channel_id === activeChannel.id) {
          setMessages([]);
        }
      };

      const handleMessagePinned = (data: any) => {
        setMessages((prev) => prev.map(m => m.id === data.id ? { ...m, is_pinned: data.is_pinned } : m));
      };

      const handleMessageStarred = (data: any) => {
        setMessages((prev) => prev.map(m => m.id === data.id ? { ...m, is_starred: data.is_starred } : m));
      };

      const handlePollUpdated = (poll: any) => {
        setMessages((prev) => prev.map((m) =>
          m.poll && m.poll.id === poll.id ? { ...m, poll } : m
        ));
      };

      socket.on("new_message", handleNewMessage);
      socket.on("message_updated", handleUpdateMessage);
      socket.on("message_deleted", handleDeleteMessage);
      socket.on("messages_read", handleMessagesRead);
      socket.on("channel_cleared", handleChannelCleared);
      socket.on("message_pinned", handleMessagePinned);
      socket.on("message_starred", handleMessageStarred);
      socket.on("poll_updated", handlePollUpdated);

      return () => {
        socket.emit("leave_channel", { channel_id: activeChannel.id });
        socket.off("new_message", handleNewMessage);
        socket.off("message_updated", handleUpdateMessage);
        socket.off("message_deleted", handleDeleteMessage);
        socket.off("messages_read", handleMessagesRead);
        socket.off("channel_cleared", handleChannelCleared);
        socket.off("message_pinned", handleMessagePinned);
        socket.off("message_starred", handleMessageStarred);
        socket.off("poll_updated", handlePollUpdated);
      };
    }
  }, [activeChannel, projectId]);

  // Mark messages as read when they appear
  useEffect(() => {
    if (!activeChannel || !currentUser || messages.length === 0) return;

    const unreadIds = messages
      .filter(m => m.user_id !== currentUser.id && (!m.read_by || !m.read_by.some((r: any) => r.id === currentUser.id)))
      .map(m => m.id);

    if (unreadIds.length > 0) {
      api.post(`/projects/${projectId}/channels/${activeChannel.id}/messages/read`, {
        message_ids: unreadIds
      }).catch(console.error);
    }
  }, [messages, activeChannel, currentUser, projectId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !attachment) || !activeChannel) return;

    setSending(true);
    try {
      let attachmentUrl = null;
      let attachmentName = null;
      
      if (attachment) {
        setUploadingFile(true);
        const formData = new FormData();
        formData.append("file", attachment);
        const uploadRes = await api.post(
          `/projects/${projectId}/channels/${activeChannel.id}/messages/upload`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        attachmentUrl = uploadRes.data.url;
        attachmentName = uploadRes.data.filename;
      }

      const expandedContent = expandMentionsForSend(newMessage);

      if (editingMessage) {
        const res = await api.patch(`/projects/${projectId}/channels/${activeChannel.id}/messages/${editingMessage.id}`, {
          content: expandedContent,
        });
        setMessages(prev => prev.map(m => m.id === editingMessage.id ? res.data : m));
        setEditingMessage(null);
      } else {
        const res = await api.post(`/projects/${projectId}/channels/${activeChannel.id}/messages`, {
          content: expandedContent || (attachment ? `Sent a file: ${attachment.name}` : ""),
          parent_id: replyingTo?.id,
          attachment_url: attachmentUrl,
          attachment_name: attachmentName
        });
        
        // Optimistic update: langsung tambahkan ke state agar tidak perlu refresh
        setMessages(prev => {
          if (prev.find(m => m.id === res.data.id)) return prev;
          return [...prev, res.data];
        });
        setReplyingTo(null);
      }

      setNewMessage("");
      pickedMentionsRef.current.clear();
      setAttachment(null);
      setUploadingFile(false);
    } catch (err) {
      console.error("Failed to send message", err);
      setUploadingFile(false);
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (msgId: string) => {
    if (!confirm("Hapus pesan ini?")) return;
    try {
      await api.delete(`/projects/${projectId}/channels/${activeChannel.id}/messages/${msgId}`);
    } catch (err) {
      console.error("Failed to delete message", err);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    setCreatingChannel(true);
    try {
      const res = await api.post(`/projects/${projectId}/channels`, {
        name: newChannelName.toLowerCase().replace(/\s+/g, '-')
      });
      setChannels([...channels, res.data]);
      setActiveChannel(res.data);
      setNewChannelName("");
      setIsAddingChannel(false);
    } catch (err) {
      console.error("Failed to create channel", err);
    } finally {
      setCreatingChannel(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="flex h-[calc(100vh-200px)] bg-card border border-border rounded-3xl overflow-hidden shadow-2xl">
      {/* Sidebar Channels */}
      <div className="w-64 border-r border-border bg-secondary/10 flex flex-col">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Channels</h3>
          <button onClick={() => setIsAddingChannel(true)} className="p-1.5 hover:bg-secondary rounded-lg text-primary transition-all"><Plus className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => setActiveChannel(channel)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all group",
                activeChannel?.id === channel.id
                  ? "bg-foreground text-background shadow-lg shadow-foreground/10"
                  : "hover:bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <Hash className={cn("w-4 h-4", activeChannel?.id === channel.id ? "opacity-100" : "opacity-40")} />
              {channel.name}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-background relative">
        {activeChannel ? (
          <>
            {/* Header */}
            <div className="p-4 px-8 border-b border-border flex items-center justify-between bg-background/80 backdrop-blur-md z-20">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center text-foreground font-bold border border-border">#</div>
                <div>
                  <h2 className="font-bold text-base tracking-tight">{activeChannel.name}</h2>
                  <div className="flex items-center gap-1.5">
                    <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-red-500 animate-pulse")} />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{isConnected ? "Live" : "Connecting..."}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex items-center bg-secondary/50 rounded-2xl px-3 py-1.5 transition-all duration-300",
                  showSearch ? "w-64 opacity-100" : "w-0 opacity-0 overflow-hidden p-0"
                )}>
                  <Search className="w-3.5 h-3.5 text-muted-foreground mr-2" />
                  <input
                    type="text"
                    placeholder="Cari pesan..."
                    className="bg-transparent border-none focus:outline-none text-[12px] w-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus={showSearch}
                  />
                  <button onClick={() => { setShowSearch(false); setSearchQuery(""); }}><X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" /></button>
                </div>

                {!showSearch && (
                  <button
                    onClick={() => setShowSearch(true)}
                    className="p-2.5 hover:bg-secondary rounded-2xl transition-all"
                  >
                    <Search className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}

                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowHeaderMenu(!showHeaderMenu); }}
                    className={cn(
                      "p-2.5 hover:bg-secondary rounded-2xl transition-all",
                      showHeaderMenu && "bg-secondary"
                    )}
                  >
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>

                  {showHeaderMenu && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-background border border-border rounded-2xl shadow-2xl z-50 p-2 animate-in fade-in slide-in-from-top-2">
                      <button onClick={showChannelInfo} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-secondary transition-all text-left">
                        <Edit2 className="w-4 h-4 opacity-60" /> Info Channel
                      </button>
                      <button onClick={handleRenameChannel} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-secondary transition-all text-left">
                        <Edit2 className="w-4 h-4 opacity-60" /> Ubah Nama Channel
                      </button>
                      <button onClick={markAllAsRead} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-secondary transition-all text-left">
                        <CheckCheck className="w-4 h-4 opacity-60" /> Tandai Terbaca
                      </button>
                      <button onClick={() => { setIsStarredModalOpen(true); setShowHeaderMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-secondary transition-all">
                        <Star className="w-4 h-4 text-yellow-500 opacity-80" /> Pesan Berbintang
                      </button>
                      <button onClick={() => { setIsMediaModalOpen(true); setShowHeaderMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-secondary transition-all">
                        <Image className="w-4 h-4 text-blue-500 opacity-80" /> Media & Lampiran
                      </button>
                      <button onClick={() => { setIsMembersModalOpen(true); setShowHeaderMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-secondary transition-all text-left">
                        <MessageSquare className="w-4 h-4 text-emerald-500 opacity-80" /> Anggota Project ({members.length})
                      </button>
                      <div className="h-px bg-border my-1" />
                      <button onClick={handleDeleteChannel} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-red-500/10 text-red-500 transition-all text-left">
                        <Trash2 className="w-4 h-4 opacity-60" /> Hapus Channel
                      </button>
                      <button onClick={clearChat} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs hover:bg-red-500/10 text-red-500 transition-all text-left">
                        <Trash2 className="w-4 h-4 opacity-60" /> Kosongkan Chat
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pinned Messages Bar */}
            {messages.some(m => m.is_pinned) && (
              <div className="bg-secondary/20 border-b border-border px-8 py-2 flex items-center gap-3 overflow-x-auto no-scrollbar animate-in slide-in-from-top-2">
                <Pin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <div className="flex gap-2 min-w-0">
                  {messages.filter(m => m.is_pinned).map(m => (
                    <button
                      key={m.id}
                      onClick={() => {
                        const el = document.getElementById(`msg-${m.id}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                        el?.classList.add("ring-2", "ring-blue-500/50");
                        setTimeout(() => el?.classList.remove("ring-2", "ring-blue-500/50"), 2000);
                      }}
                      className="flex items-center gap-2 bg-background border border-border px-3 py-1 rounded-full text-[10px] font-medium whitespace-nowrap hover:bg-secondary transition-all shrink-0 max-w-[200px]"
                    >
                      <span className="truncate opacity-80">{m.content || m.attachment_name || "File"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {/* Messages */}
            <div 
              ref={scrollRef} 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) setAttachment(file);
              }}
              className="flex-1 overflow-y-auto p-2 py-4 space-y-0.5 custom-scrollbar relative bg-background"
            >
              {isDragging && (
                <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] z-50 flex items-center justify-center border-2 border-dashed border-primary m-4 rounded-3xl animate-in fade-in zoom-in-95">
                  <div className="bg-background px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3">
                    <Plus className="w-6 h-6 text-primary animate-bounce" />
                    <span className="font-bold text-sm">Lepaskan untuk upload file</span>
                  </div>
                </div>
              )}

              {messages.filter(msg =>
                !searchQuery ||
                msg.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                msg.attachment_name?.toLowerCase().includes(searchQuery.toLowerCase())
              ).map((msg: any) => {
                const isMe = currentUser && msg.user_id === currentUser.id;
                const replyMsg = msg.parent_id ? messages.find((m: any) => m.id === msg.parent_id) : null;

                return (
                  <div key={msg.id} id={`msg-${msg.id}`} className={cn("flex w-full group animate-in fade-in slide-in-from-bottom-1 duration-200", isMe ? "justify-end" : "justify-start")}>
                    {/* Avatar for Others (Left) */}
                    {!isMe && (
                      <div className="w-6 h-6 rounded-full bg-foreground/10 border border-border flex items-center justify-center text-[8px] font-bold text-foreground mr-1.5 mt-auto mb-0.5 shrink-0 shadow-sm overflow-hidden">
                        {msg.user?.avatar_url ? (
                          <img src={msg.user.avatar_url} alt={msg.user.name} className="w-full h-full object-cover" />
                        ) : (
                          msg.user?.name?.charAt(0) || "?"
                        )}
                      </div>
                    )}

                    <div className={cn("max-w-[85%] relative flex flex-col", isMe ? "items-end" : "items-start")}>
                      <div className={cn(
                        "px-3 py-1.5 rounded-2xl shadow-sm text-[13px] relative group/msg transition-all min-w-[40px]",
                        isMe ? "bg-emerald-500 text-white rounded-tr-none" : "bg-card border border-border text-foreground rounded-tl-none",
                        msg.is_pinned && "ring-1 ring-blue-500/30",
                        msg.is_starred && "ring-1 ring-yellow-500/30"
                      )}>
                        {msg.is_pinned && (
                          <div className="absolute -top-2 -right-2 bg-blue-500 text-white p-0.5 rounded-full shadow-sm z-10">
                            <Pin className="w-2 h-2" />
                          </div>
                        )}
                        {msg.is_starred && !msg.is_pinned && (
                          <div className="absolute -top-2 -right-2 bg-yellow-500 text-white p-0.5 rounded-full shadow-sm z-10">
                            <Star className="w-2 h-2 fill-current" />
                          </div>
                        )}
                        {!isMe && (
                          <div className="text-[9px] font-bold text-blue-500 mb-0.5 flex items-center gap-2">
                            <span>{msg.user?.name}</span>
                          </div>
                        )}

                        {replyMsg && (
                          <div className={cn(
                            "text-[10px] p-1 bg-foreground/5 rounded border-l-2 border-foreground/20 mb-1 opacity-70 truncate",
                            isMe ? "text-right" : ""
                          )}>
                            <div className="font-bold flex items-center gap-1 mb-0.5 text-[8px] opacity-60"><CornerDownRight className="w-2.5 h-2.5" /> {replyMsg.user?.name}</div>
                            {replyMsg.content}
                          </div>
                        )}

                        {msg.attachment_url && (
                          <div className={cn("mb-1", !msg.content ? "mb-0" : "")}>
                            {msg.attachment_url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                              <a href={msg.attachment_url} target="_blank" rel="noreferrer">
                                <img src={msg.attachment_url} alt="attachment" className="rounded max-w-full h-auto max-h-[200px] object-cover cursor-pointer hover:opacity-90 transition-opacity border border-border" />
                              </a>
                            ) : (
                              <div className="flex flex-col gap-1 min-w-[160px] p-1 rounded border border-border bg-foreground/5">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 bg-background rounded flex items-center justify-center shrink-0 border border-border">
                                    <Paperclip className="w-3 h-3" />
                                  </div>
                                  <div className="flex-1 min-w-0 text-[10px] font-bold truncate">{msg.attachment_name || "File"}</div>
                                </div>
                                <div className="flex gap-1">
                                  <a href={msg.attachment_url} target="_blank" rel="noreferrer" className="flex-1 text-[8px] font-bold text-center py-1 rounded transition-all tracking-wider uppercase bg-background border border-border hover:bg-secondary">View</a>
                                  <a href={msg.attachment_url} download={msg.attachment_name || "file"} className="flex-1 text-[8px] font-bold text-center py-1 rounded transition-all tracking-wider uppercase shadow-sm bg-foreground text-background hover:bg-foreground/90">Download</a>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {msg.poll && (
                          <div className="mb-2">
                            <PollBubble
                              poll={msg.poll as PollData}
                              currentUserId={currentUser?.id}
                              onUpdate={(next) => {
                                setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, poll: next } : m));
                              }}
                            />
                          </div>
                        )}

                        <div className="flex items-end justify-end gap-x-2">
                          {msg.content && !msg.poll && <p className={cn("flex-1 min-w-[30px] whitespace-pre-wrap leading-snug py-0.5", isMe ? "text-white" : "text-foreground")}>{renderMessageContent(msg.content, isMe)}</p>}
                          <div className={cn("flex items-center gap-0.5 text-[8px] mb-[1px] shrink-0 font-medium select-none", isMe ? "text-white/70" : "text-muted-foreground/60")}>
                            {(msg.edited_at || msg.is_edited) && (
                              <span className="italic mr-0.5" title={msg.edited_at ? `Diedit ${fmtEdited(msg.edited_at)}` : "Diedit"}>
                                {msg.edited_at ? `Diedit ${fmtEdited(msg.edited_at)} ·` : "Diedit ·"}
                              </span>
                            )}
                            <span>{formatTime(msg.created_at)}</span>
                            {isMe && (
                              <button onClick={() => setReadInfo(msg)} className="ml-0.5 transition-colors">
                                {(msg.read_by && msg.read_by.length > 0)
                                  ? <CheckCheck className="w-3 h-3 text-white" />
                                  : <CheckCheck className="w-3 h-3 text-white/40" />
                                }
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Quick Actions (Hover) */}
                        <div className={cn(
                          "absolute top-0 opacity-0 group-hover/msg:opacity-100 transition-all flex gap-0.5 bg-background border border-border p-0.5 rounded shadow-xl z-10",
                          isMe ? "right-full mr-1" : "left-full ml-1"
                        )}>
                          <button onClick={() => toggleStar(msg)} title={msg.is_starred ? "Unstar" : "Star"} className={cn("p-0.5 hover:bg-secondary rounded transition-all", msg.is_starred ? "text-yellow-500" : "text-muted-foreground")}><Star className="w-2.5 h-2.5" /></button>
                          <button onClick={() => togglePin(msg)} title={msg.is_pinned ? "Unpin" : "Pin"} className={cn("p-0.5 hover:bg-secondary rounded transition-all", msg.is_pinned ? "text-blue-500" : "text-muted-foreground")}><Pin className="w-2.5 h-2.5" /></button>
                          <button onClick={() => setReplyingTo(msg)} title="Reply" className="p-0.5 hover:bg-secondary rounded text-muted-foreground transition-all"><Reply className="w-2.5 h-2.5" /></button>
                          {isMe && (
                            <>
                              <button onClick={() => { setEditingMessage(msg); setNewMessage(msg.content); }} title="Edit" className="p-0.5 hover:bg-secondary rounded text-muted-foreground transition-all"><Edit2 className="w-2.5 h-2.5" /></button>
                              <button onClick={() => deleteMessage(msg.id)} title="Delete" className="p-0.5 hover:bg-red-500/10 rounded text-red-500 transition-all"><Trash2 className="w-2.5 h-2.5" /></button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Avatar for Me (Right) */}
                    {isMe && (
                      <div className="w-6 h-6 rounded-full bg-foreground border border-border flex items-center justify-center text-[8px] font-bold text-background ml-1.5 mt-auto mb-0.5 shrink-0 shadow-sm overflow-hidden">
                        {currentUser?.avatar_url ? <img src={currentUser.avatar_url} alt={currentUser.name} className="w-full h-full object-cover" /> : currentUser?.name?.charAt(0) || "?"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Input Area */}
            <div className="p-6 px-8 bg-background border-t border-border z-20">
              {/* Reply Indicator */}
              {replyingTo && (
                <div className="mb-4 p-4 bg-secondary/50 border-l-4 border-foreground rounded-2xl flex items-center justify-between animate-in slide-in-from-bottom-2">
                  <div className="text-xs truncate">
                    <span className="font-bold block mb-1">Membalas {replyingTo.user?.name}</span>
                    <span className="text-muted-foreground italic truncate block max-w-md">{replyingTo.content}</span>
                  </div>
                  <button onClick={() => setReplyingTo(null)} className="p-2 hover:bg-secondary rounded-full transition-all"><X className="w-4 h-4" /></button>
                </div>
              )}
              {/* Edit Indicator */}
              {editingMessage && (
                <div className="mb-4 p-4 bg-foreground/5 border-l-4 border-foreground rounded-2xl flex items-center justify-between">
                  <div className="text-xs">
                    <span className="font-bold block text-foreground uppercase tracking-wider text-[10px]">Mode Edit Pesan</span>
                    <span className="text-muted-foreground italic">Tekan Esc untuk membatalkan</span>
                  </div>
                  <button onClick={() => { setEditingMessage(null); setNewMessage(""); }} className="p-2 hover:bg-secondary rounded-full transition-all"><X className="w-4 h-4" /></button>
                </div>
              )}

              {/* File Preview */}
              {attachment && (
                <div className="mb-4 p-4 bg-secondary/50 border border-border rounded-2xl flex items-center justify-between animate-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-foreground/10 rounded-xl flex items-center justify-center">
                      <Paperclip className="w-5 h-5 text-foreground" />
                    </div>
                    <div className="text-sm">
                      <span className="font-bold block text-foreground truncate max-w-[200px]">{attachment.name}</span>
                      <span className="text-muted-foreground text-xs">{(attachment.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  </div>
                  <button onClick={() => setAttachment(null)} className="p-2 hover:bg-secondary rounded-full transition-all"><X className="w-4 h-4" /></button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="flex items-end gap-4 max-w-[1200px] mx-auto relative">
                <div className="flex-1 relative">
                  {/* Emoji Picker */}
                  {showEmoji && (
                    <div className="absolute bottom-full left-0 mb-4 bg-background border border-border p-3 rounded-2xl shadow-2xl grid grid-cols-8 gap-1 z-50 animate-in slide-in-from-bottom-2">
                      {EMOJIS.map(e => (
                        <button
                          key={e}
                          type="button"
                          className="w-8 h-8 flex items-center justify-center hover:bg-secondary rounded-lg text-lg transition-all"
                          onClick={() => { setNewMessage(prev => prev + e); setShowEmoji(false); }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="bg-secondary/50 border border-transparent focus-within:border-border focus-within:bg-background rounded-[32px] flex items-end pr-2 pl-3 py-1.5 transition-all shadow-sm">
                    <div className="flex items-center gap-1 mb-[5px]">
                      <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="p-2.5 text-muted-foreground hover:text-foreground transition-all"><Smile className="w-5 h-5" /></button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setAttachment(e.target.files[0]);
                          }
                        }}
                      />
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 text-muted-foreground hover:text-foreground transition-all"><Paperclip className="w-5 h-5" /></button>
                      <button
                        type="button"
                        onClick={() => setIsPollModalOpen(true)}
                        className="p-2.5 text-muted-foreground hover:text-foreground transition-all"
                        title="Buat polling"
                      >
                        <BarChart3 className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="relative flex-1">
                      {mentionQuery !== null && mentionMatches.length > 0 && (
                        <div className="absolute bottom-full left-0 right-0 mb-2 bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-30 max-h-[240px] overflow-y-auto">
                          <div className="px-3 py-1.5 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wide bg-secondary/30">
                            Tag anggota
                          </div>
                          {mentionMatches.map((m, i) => (
                            <button
                              key={m.user_id}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                              onMouseEnter={() => setMentionHighlight(i)}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                                i === mentionHighlight ? "bg-primary/10" : "hover:bg-secondary/50",
                              )}
                            >
                              <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden text-xs font-bold shrink-0">
                                {m.user?.avatar_url ? (
                                  <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  (m.user?.name || "?").charAt(0).toUpperCase()
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate">{m.user?.name || "User"}</p>
                                <p className="text-[10px] text-muted-foreground capitalize">{m.role}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      <textarea
                        ref={textareaRef}
                        rows={1}
                        value={newMessage}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewMessage(val);
                          e.target.style.height = 'auto';
                          e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
                          // Detect @ token at caret to open/update the picker
                          const caret = e.target.selectionStart ?? val.length;
                          const upToCaret = val.slice(0, caret);
                          const atIdx = upToCaret.lastIndexOf("@");
                          if (atIdx === -1) { setMentionQuery(null); return; }
                          const charBeforeAt = atIdx === 0 ? " " : upToCaret[atIdx - 1];
                          const isWordBoundary = /[\s\n]/.test(charBeforeAt);
                          const query = upToCaret.slice(atIdx + 1);
                          if (!isWordBoundary || /\s/.test(query)) { setMentionQuery(null); return; }
                          setMentionQuery(query);
                          setMentionHighlight(0);
                        }}
                        onKeyDown={(e) => {
                          if (mentionQuery !== null && mentionMatches.length > 0) {
                            if (e.key === 'ArrowDown') { e.preventDefault(); setMentionHighlight((h) => (h + 1) % mentionMatches.length); return; }
                            if (e.key === 'ArrowUp') { e.preventDefault(); setMentionHighlight((h) => (h - 1 + mentionMatches.length) % mentionMatches.length); return; }
                            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mentionHighlight]); return; }
                            if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
                          }
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); }
                          if (e.key === 'Escape') { setEditingMessage(null); setReplyingTo(null); setNewMessage(""); }
                        }}
                        placeholder={editingMessage ? "Perbaiki pesan..." : "Ketik pesan... (@ untuk tag)"}
                        className="w-full bg-transparent border-none focus:outline-none focus:ring-0 resize-none text-sm px-3 py-3.5 custom-scrollbar min-h-[48px]"
                        style={{ height: '48px' }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={sending || uploadingFile || (!newMessage.trim() && !attachment)}
                  className="shrink-0 h-[56px] w-[56px] bg-foreground text-background flex items-center justify-center rounded-full hover:bg-foreground/90 transition-all shadow-xl active:scale-95 disabled:opacity-50 mb-[1px]"
                >
                  {sending || uploadingFile ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
            <div className="w-24 h-24 bg-secondary/30 rounded-full flex items-center justify-center mb-6">
              <Hash className="w-12 h-12 opacity-20" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Pilih Channel</h3>
            <p className="max-w-xs text-sm">Pilih salah satu channel di sebelah kiri untuk mulai berdiskusi dengan tim kamu.</p>
          </div>
        )}
      </div>
      {/* Starred Messages Modal */ }
  <Modal
    isOpen={isStarredModalOpen}
    onClose={() => setIsStarredModalOpen(false)}
    title="Pesan Berbintang"
  >
    <div className="max-h-[60vh] overflow-y-auto space-y-3 p-1">
      {messages.filter(m => m.is_starred).length > 0 ? (
        messages.filter(m => m.is_starred).map((msg) => (
          <div
            key={msg.id}
            className="p-4 bg-secondary/20 rounded-2xl border border-border group hover:border-primary/30 transition-all cursor-pointer"
            onClick={() => {
              const el = document.getElementById(`msg-${msg.id}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
              el?.classList.add("ring-2", "ring-yellow-500/50");
              setTimeout(() => el?.classList.remove("ring-2", "ring-yellow-500/50"), 2000);
              setIsStarredModalOpen(false);
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center text-[8px] font-bold">
                  {msg.user?.name?.charAt(0)}
                </div>
                <span className="text-[10px] font-bold">{msg.user?.name}</span>
              </div>
              <span className="text-[9px] text-muted-foreground">{formatDate(msg.created_at)}</span>
            </div>
            <p className="text-xs leading-relaxed text-foreground/80 line-clamp-3">{msg.content || (msg.attachment_url ? "📎 Lampiran File" : "")}</p>
            <div className="mt-3 flex justify-end">
              <button onClick={(e) => { e.stopPropagation(); toggleStar(msg); }} className="p-1.5 hover:bg-background rounded-full text-yellow-500">
                <Star className="w-4 h-4 fill-current" />
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="py-12 text-center text-muted-foreground">
          <Star className="w-12 h-12 mx-auto mb-4 opacity-10" />
          <p className="text-sm italic">Belum ada pesan berbintang.</p>
        </div>
      )}
    </div>
  </Modal>

  {/* Media & Links Modal */ }
  <Modal
    isOpen={isMediaModalOpen}
    onClose={() => setIsMediaModalOpen(false)}
    title="Media & Lampiran"
  >
    <div className="flex flex-col h-[70vh]">
      {/* Tabs */}
      <div className="flex border-b border-border mb-4">
        <button
          onClick={() => setMediaTab("media")}
          className={cn("flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2", mediaTab === "media" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground")}
        >
          Gambar
        </button>
        <button
          onClick={() => setMediaTab("files")}
          className={cn("flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2", mediaTab === "files" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground")}
        >
          File
        </button>
        <button
          onClick={() => setMediaTab("links")}
          className={cn("flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2", mediaTab === "links" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground")}
        >
          Tautan
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
        {mediaTab === "media" && (
          <div className="grid grid-cols-3 gap-2">
            {messages.filter(m => m.attachment_url && /\.(jpg|jpeg|png|gif|webp)$/i.test(m.attachment_url)).map(msg => (
              <div key={msg.id} className="aspect-square rounded-xl overflow-hidden border border-border group relative cursor-pointer" onClick={() => window.open(msg.attachment_url, '_blank')}>
                <img src={msg.attachment_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-all" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                  <ExternalLink className="w-5 h-5 text-white" />
                </div>
              </div>
            ))}
            {messages.filter(m => m.attachment_url && /\.(jpg|jpeg|png|gif|webp)$/i.test(m.attachment_url)).length === 0 && (
              <div className="col-span-3 py-12 text-center text-muted-foreground italic text-xs">Belum ada gambar dikirim.</div>
            )}
          </div>
        )}

        {mediaTab === "files" && (
          <div className="space-y-2">
            {messages.filter(m => m.attachment_url && !/\.(jpg|jpeg|png|gif|webp)$/i.test(m.attachment_url)).map(msg => (
              <div key={msg.id} className="p-3 bg-secondary/20 border border-border rounded-xl flex items-center justify-between hover:bg-secondary/40 transition-all cursor-pointer" onClick={() => window.open(msg.attachment_url, '_blank')}>
                <div className="flex items-center gap-3 truncate">
                  <div className="p-2 bg-background rounded-lg border border-border"><FileText className="w-4 h-4" /></div>
                  <div className="truncate">
                    <div className="text-[11px] font-bold truncate">{msg.attachment_name}</div>
                    <div className="text-[9px] text-muted-foreground">{formatDate(msg.created_at)}</div>
                  </div>
                </div>
                <button className="p-2 hover:bg-background rounded-lg transition-all"><ExternalLink className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            {messages.filter(m => m.attachment_url && !/\.(jpg|jpeg|png|gif|webp)$/i.test(m.attachment_url)).length === 0 && (
              <div className="py-12 text-center text-muted-foreground italic text-xs">Belum ada file dikirim.</div>
            )}
          </div>
        )}

        {mediaTab === "links" && (
          <div className="space-y-2">
            {messages.filter(m => m.content && /https?:\/\/[^\s]+/.test(m.content)).map(msg => {
              const links = msg.content.match(/https?:\/\/[^\s]+/g) || [];
              return links.map((link: string, idx: number) => (
                <div key={`${msg.id}-${idx}`} className="p-3 bg-secondary/20 border border-border rounded-xl flex items-center justify-between hover:bg-secondary/40 transition-all cursor-pointer" onClick={() => window.open(link, '_blank')}>
                  <div className="flex items-center gap-3 truncate">
                    <div className="p-2 bg-background rounded-lg border border-border text-blue-500"><Link2 className="w-4 h-4" /></div>
                    <div className="truncate">
                      <div className="text-[11px] font-bold text-blue-500 truncate">{link}</div>
                      <div className="text-[9px] text-muted-foreground">Dikirim oleh {msg.user?.name}</div>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              ));
            })}
            {messages.filter(m => m.content && /https?:\/\/[^\s]+/.test(m.content)).length === 0 && (
              <div className="py-12 text-center text-muted-foreground italic text-xs">Belum ada tautan dikirim.</div>
            )}
          </div>
        )}
      </div>
    </div>
  </Modal>

  {/* Add Channel Modal */ }
  <Modal isOpen={isAddingChannel} onClose={() => setIsAddingChannel(false)} title="Buat Channel Baru">
    <form onSubmit={handleCreateChannel} className="space-y-6 p-2">
      <div className="space-y-3">
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Nama Channel</label>
        <div className="relative">
          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            placeholder="misal: diskusi-desain"
            className="w-full pl-12 pr-4 py-4 bg-secondary/20 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-foreground/5 transition-all text-sm"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <button type="button" onClick={() => setIsAddingChannel(false)} className="px-6 py-3 text-sm font-bold text-muted-foreground hover:bg-secondary rounded-2xl transition-all">Batal</button>
        <button type="submit" disabled={creatingChannel || !newChannelName.trim()} className="bg-foreground text-background px-10 py-3 rounded-2xl text-sm font-bold shadow-xl shadow-foreground/10 disabled:opacity-50">
          {creatingChannel ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buat Channel"}
        </button>
      </div>
    </form>
  </Modal>

  {/* Read Info Modal */ }
  <Modal isOpen={!!readInfo} onClose={() => setReadInfo(null)} title="Info Pesan">
    <div className="space-y-4 p-2">
      <div className="p-4 bg-secondary/30 border border-border rounded-2xl text-sm italic">
        "{readInfo?.content}"
      </div>
      <div>
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Telah Dilihat Oleh</h4>
        <div className="space-y-2">
          {readInfo?.read_by && readInfo.read_by.length > 0 ? (
            readInfo.read_by.map((reader: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-background border border-border rounded-xl">
                <div className="font-medium text-sm">{reader.name}</div>
                <div className="text-xs text-muted-foreground">{formatTime(reader.read_at)}</div>
              </div>
            ))
          ) : (
            <div className="text-center p-4 text-muted-foreground text-sm">Belum ada yang melihat</div>
          )}
        </div>
      </div>
    </div>
  </Modal>

  {/* Project Members Modal */}
  <Modal
    isOpen={isMembersModalOpen}
    onClose={() => setIsMembersModalOpen(false)}
    title={`Anggota Project (${members.length})`}
  >
    <div className="max-h-[60vh] overflow-y-auto space-y-1.5 p-1">
      {members.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Belum ada anggota</div>
      ) : (
        members.map((m) => (
          <button
            key={m.user_id}
            onClick={() => { setProfileMember(m); setIsMembersModalOpen(false); }}
            className="w-full flex items-center gap-3 p-3 rounded-2xl border border-border hover:border-primary/40 hover:bg-secondary/40 transition-all text-left"
          >
            <div className="w-11 h-11 rounded-2xl bg-secondary border border-border flex items-center justify-center overflow-hidden font-bold text-sm shrink-0">
              {m.user?.avatar_url
                ? <img src={m.user.avatar_url} alt={m.user.name} className="w-full h-full object-cover" />
                : (m.user?.name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{m.user?.name || "User"}</p>
              <p className="text-[10px] text-muted-foreground truncate">{m.user?.email}</p>
            </div>
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
              m.role === "manager" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
            )}>{m.role}</span>
          </button>
        ))
      )}
    </div>
  </Modal>

  {/* Profile Detail Modal */}
  <Modal
    isOpen={!!profileMember}
    onClose={() => setProfileMember(null)}
    title="Profil Anggota"
  >
    {profileMember && (
      <div className="p-2 flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-3xl bg-secondary border border-border flex items-center justify-center overflow-hidden font-extrabold text-2xl mb-4">
          {profileMember.user?.avatar_url
            ? <img src={profileMember.user.avatar_url} alt={profileMember.user.name} className="w-full h-full object-cover" />
            : (profileMember.user?.name || "?").charAt(0).toUpperCase()}
        </div>
        <h3 className="text-lg font-extrabold mb-0.5">{profileMember.user?.name || "User"}</h3>
        {profileMember.user?.email && (
          <a href={`mailto:${profileMember.user.email}`} className="text-xs text-primary hover:underline mb-3">
            {profileMember.user.email}
          </a>
        )}
        <span className={cn(
          "text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full",
          profileMember.role === "manager" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
        )}>{profileMember.role}</span>
        <div className="w-full mt-5 flex flex-col gap-2">
          {profileMember.user_id !== currentUser?.id && (
            <button
              onClick={() => {
                router.push(`/org/${orgId}/dm/${profileMember.user_id}`);
                setProfileMember(null);
              }}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-2xl text-xs font-bold hover:opacity-90 transition-opacity"
            >
              Kirim DM
            </button>
          )}
          <button
            onClick={() => setProfileMember(null)}
            className="w-full py-2.5 bg-secondary rounded-2xl text-xs font-bold hover:bg-secondary/70 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    )}
  </Modal>

      <CreatePollModal
        isOpen={isPollModalOpen}
        onClose={() => setIsPollModalOpen(false)}
        channelId={activeChannel?.id}
      />
    </div>
  );
}
