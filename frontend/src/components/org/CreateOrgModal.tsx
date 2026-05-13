"use client";

import React, { useState } from "react";
import { X, Building2, Loader2, CheckCircle2, Plus, Type } from "lucide-react";
import api from "@/lib/api";

interface CreateOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (orgId: string) => void;
}

export default function CreateOrgModal({ isOpen, onClose, onSuccess }: CreateOrgModalProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError("");
    try {
      const res = await api.post("/organizations", { name });
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setName("");
        onSuccess(res.data.id);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Gagal membuat workspace.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
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
            <h2 className="text-2xl font-bold">Workspace Siap!</h2>
            <p className="text-muted-foreground">Workspace {name} berhasil dibuat.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary font-bold">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Buat Workspace</h2>
                <p className="text-muted-foreground text-sm italic italic">Ini adalah rumah besar untuk semua proyek dan tim mas.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Nama Workspace / Perusahaan</label>
                <div className="relative">
                  <Type className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    autoFocus
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: PT Maju Jaya, My Business, dsb"
                    required
                    className="w-full pl-12 pr-4 py-3 bg-secondary/50 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-[10px] text-destructive font-bold flex items-center gap-2">
                  <X className="w-3 h-3" />
                  {error}
                </div>
              )}

              <button
                disabled={loading || !name.trim()}
                className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold hover:shadow-lg hover:shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Buat Workspace Sekarang
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
