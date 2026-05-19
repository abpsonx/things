"use client";

import React, { useState } from "react";
import { X, BarChart3, Plus, Trash2, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Either channelId (project chat) or teamId (team chat) must be provided. */
  channelId?: string;
  teamId?: string;
  onCreated?: () => void;
}

export default function CreatePollModal({ isOpen, onClose, channelId, teamId, onCreated }: Props) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowMulti, setAllowMulti] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
    setAllowMulti(false);
    setBusy(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const addOption = () => {
    if (options.length >= 10) return;
    setOptions([...options, ""]);
  };

  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) {
      toast.error("Pertanyaan poll wajib diisi");
      return;
    }
    if (cleanOptions.length < 2) {
      toast.error("Minimal 2 opsi");
      return;
    }
    setBusy(true);
    try {
      const url = channelId
        ? `/polls/channel/${channelId}`
        : `/polls/team/${teamId}`;
      await api.post(url, {
        question: question.trim(),
        options: cleanOptions,
        allow_multi: allowMulti,
      });
      toast.success("Poll dibuat");
      reset();
      onClose();
      onCreated?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal membuat poll");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-card rounded-3xl w-full max-w-md shadow-2xl border border-border overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Buat Polling</h2>
              <p className="text-[11px] text-muted-foreground">Hasil di-share otomatis di chat</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Pertanyaan
            </label>
            <input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Contoh: Pilih nama brand"
              className="w-full px-3 py-2.5 rounded-2xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Opsi ({options.length})
            </label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                    {idx + 1}
                  </span>
                  <input
                    value={opt}
                    onChange={(e) => {
                      const next = [...options];
                      next[idx] = e.target.value;
                      setOptions(next);
                    }}
                    placeholder={`Opsi ${idx + 1}`}
                    className="flex-1 px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(idx)}
                      className="p-2 rounded-xl text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <button
                  type="button"
                  onClick={addOption}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah opsi
                </button>
              )}
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-2xl bg-secondary/30 border border-border">
            <input
              type="checkbox"
              checked={allowMulti}
              onChange={(e) => setAllowMulti(e.target.checked)}
              className="accent-primary"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">Pilihan ganda</p>
              <p className="text-[10px] text-muted-foreground">User bisa pilih lebih dari satu opsi</p>
            </div>
          </label>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={handleClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md shadow-primary/20"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart3 className="w-3.5 h-3.5" />}
            Kirim Polling
          </button>
        </div>
      </div>
    </div>
  );
}
