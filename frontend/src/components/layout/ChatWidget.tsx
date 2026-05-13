"use client";

import React, { useState, useEffect } from "react";
import { MessageSquare, X, Send, Search, Users, Hash, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"dm" | "channels">("dm");
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { id: orgId } = useParams();
  const { user: currentUser } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, orgId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // If we are on a page with orgId, use it. 
      // Otherwise, fetch user's first organization as default.
      let targetOrgId = orgId;
      
      if (!targetOrgId) {
        const orgsRes = await api.get("/organizations");
        if (orgsRes.data.length > 0) {
          targetOrgId = orgsRes.data[0].id;
        }
      }

      if (targetOrgId) {
        const res = await api.get(`/organizations/${targetOrgId}`);
        setMembers(res.data.members.filter((m: any) => m.user_id !== currentUser?.id));
      }
    } catch (err) {
      console.error("Failed to fetch chat data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = (userId: string) => {
    // If no orgId in URL, we need to find which org this user belongs to
    // For simplicity, we use the first one if not in URL
    const targetId = orgId || members[0]?.org_id; 
    router.push(`/org/${targetId}/dm/${userId}`);
    setIsOpen(false);
  };

  // Removed !orgId return null to make it global

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-4">
      {/* Chat Window */}
      {isOpen && (
        <div className="w-[380px] h-[550px] bg-card border border-border rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-300">
          {/* Header */}
          <div className="p-6 bg-primary text-primary-foreground flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold">Chat Tim</h3>
                <p className="text-[10px] opacity-80">Terhubung dengan tim kamu secara instan.</p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border p-2 gap-1">
            <button 
              onClick={() => setActiveTab("dm")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold transition-all",
                activeTab === "dm" ? "bg-secondary text-primary shadow-sm" : "text-muted-foreground hover:bg-secondary/50"
              )}
            >
              <Users className="w-4 h-4" />
              Pesan Privat
            </button>
            <button 
              onClick={() => setActiveTab("channels")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold transition-all",
                activeTab === "channels" ? "bg-secondary text-primary shadow-sm" : "text-muted-foreground hover:bg-secondary/50"
              )}
            >
              <Hash className="w-4 h-4" />
              Grup Proyek
            </button>
          </div>

          {/* Search */}
          <div className="px-6 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Cari orang atau grup..."
                className="w-full pl-10 pr-4 py-3 bg-secondary/30 border border-border rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-50">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs font-medium">Memuat tim...</p>
              </div>
            ) : activeTab === "dm" ? (
              members.length > 0 ? (
                members.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => handleStartChat(member.user_id)}
                    className="w-full flex items-center gap-4 p-3 hover:bg-secondary/50 rounded-2xl transition-all group"
                  >
                    <div className="relative">
                      <div className="w-12 h-12 rounded-2xl bg-secondary border border-border flex items-center justify-center overflow-hidden font-bold text-sm">
                        {member.user.avatar_url ? (
                          <img src={member.user.avatar_url} alt={member.user.name} className="w-full h-full object-cover" />
                        ) : (
                          member.user.name.charAt(0)
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-card shadow-sm" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold group-hover:text-primary transition-colors">{member.user.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{member.role}</p>
                    </div>
                    <div className="p-2 bg-primary/5 text-primary rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                      <Send className="w-4 h-4" />
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-12 opacity-50 space-y-2">
                  <Users className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-xs font-medium">Tidak ada member lain ditemukan.</p>
                </div>
              )
            ) : (
              <div className="text-center py-12 opacity-50 space-y-2">
                <Hash className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-xs font-medium italic">Grup proyek muncul saat proyek dipilih.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 group",
          isOpen ? "bg-card text-foreground rotate-90 border border-border" : "bg-primary text-primary-foreground"
        )}
      >
        {isOpen ? (
          <X className="w-7 h-7" />
        ) : (
          <MessageSquare className="w-7 h-7" />
        )}
      </button>
    </div>
  );
}
