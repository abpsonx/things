"use client";

import React, { useState } from "react";
import { X, Mail, Shield, User, Loader2, CheckCircle2, Plus } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface InviteMemberModalProps {
  orgId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function InviteMemberModal({ orgId, isOpen, onClose, onSuccess }: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");
    try {
      await api.post(`/organizations/${orgId}/invite`, { email, role });
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setEmail("");
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Gagal mengundang member. Pastikan email terdaftar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute right-6 top-6 p-2 rounded-full hover:bg-secondary transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {isSuccess ? (
          <div className="py-12 text-center space-y-4 animate-in zoom-in-95">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-500">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold">Undangan Terkirim!</h2>
            <p className="text-muted-foreground">{email} telah ditambahkan ke tim.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Undang Anggota Tim</h2>
              <p className="text-muted-foreground text-sm">Tambahkan teman ke workspace ini untuk mulai berkolaborasi.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    autoFocus
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    required
                    className="w-full pl-12 pr-4 py-3 bg-secondary/50 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Role / Jabatan</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "member", label: "Member", icon: User, desc: "Bisa edit tugas" },
                    { id: "manager", label: "Manager", icon: Shield, desc: "Bisa undang orang" }
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={cn(
                        "p-4 border rounded-2xl text-left transition-all space-y-1",
                        role === r.id 
                          ? "border-primary bg-primary/5 ring-1 ring-primary" 
                          : "border-border bg-transparent hover:border-primary/50"
                      )}
                    >
                      <r.icon className={cn("w-4 h-4 mb-2", role === r.id ? "text-primary" : "text-muted-foreground")} />
                      <p className="text-xs font-bold">{r.label}</p>
                      <p className="text-[9px] text-muted-foreground">{r.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-[10px] text-destructive font-bold flex items-center gap-2">
                  <X className="w-3 h-3" />
                  {error}
                </div>
              )}

              <button
                disabled={loading}
                className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold hover:shadow-lg hover:shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Kirim Undangan
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
