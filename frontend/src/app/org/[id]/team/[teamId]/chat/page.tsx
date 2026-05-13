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
  Paperclip
} from "lucide-react";
import api from "@/lib/api";
import { socket } from "@/lib/socket";
import TeamNav from "@/components/team/TeamNav";

interface Message {
  id: string;
  user_id: string;
  user: { name: string; avatar_url?: string };
  content: string;
  created_at: string;
}

export default function TeamChatPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTeamAndMessages();

    // Join team socket room
    socket.emit("join_team", teamId);

    socket.on("team_message", (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      socket.off("team_message");
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
      setMessages(msgsRes.data);
    } catch (err) {
      console.error("Failed to fetch team chat", err);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      await api.post(`/organizations/${orgId}/teams/${teamId}/chat/messages`, {
        content: newMessage
      });
      setNewMessage("");
    } catch (err) {
      console.error("Failed to send message", err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
      <div className="border-b border-border px-8 py-5 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-30 shrink-0">
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
              <h1 className="text-lg font-bold text-foreground tracking-tight">{team?.name} Chat</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Internal Discussion</p>
            </div>
          </div>
        </div>
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin">
        {messages.length > 0 ? (
          messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center text-sm font-bold overflow-hidden shrink-0 border border-border">
                {msg.user?.avatar_url ? (
                  <img src={msg.user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-1 max-w-[80%]">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-foreground">{msg.user?.name}</span>
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-border shadow-sm text-sm text-foreground leading-relaxed">
                  {msg.content}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-20">
            <Users className="w-12 h-12 opacity-10 mb-4" />
            <p className="text-sm font-medium">Belum ada obrolan. Mulai sapa tim kamu!</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white border-t border-border shrink-0">
        <form onSubmit={sendMessage} className="max-w-4xl mx-auto flex items-center gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Ketik pesan untuk tim..."
              className="w-full pl-6 pr-12 py-4 bg-secondary/50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button type="button" className="p-2 text-muted-foreground hover:text-primary transition-colors">
                <Paperclip className="w-4 h-4" />
              </button>
              <button type="button" className="p-2 text-muted-foreground hover:text-primary transition-colors">
                <Smile className="w-4 h-4" />
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="p-4 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
