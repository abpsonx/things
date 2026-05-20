"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Check, ChevronDown, X, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MemberOption {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface Props {
  members: MemberOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Text shown when nothing is selected (e.g. "Semua anggota tim"). */
  emptyLabel?: string;
  placeholder?: string;
}

export default function MemberMultiSelect({
  members,
  selectedIds,
  onChange,
  emptyLabel = "Semua anggota",
  placeholder = "Cari anggota...",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q));
  }, [members, query]);

  const selectedMembers = members.filter((m) => selectedIds.includes(m.id));

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl border border-border bg-background hover:bg-secondary/30 transition-colors text-sm"
      >
        <span className="flex items-center gap-2 min-w-0 text-muted-foreground">
          <Users className="w-4 h-4 shrink-0" />
          <span className="truncate">
            {selectedIds.length === 0 ? emptyLabel : `${selectedIds.length} dipilih`}
          </span>
        </span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {/* Selected chips preview */}
      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedMembers.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
              <span className="w-4 h-4 rounded-full bg-secondary border border-border flex items-center justify-center text-[8px] font-bold overflow-hidden shrink-0">
                {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" /> : m.name.charAt(0).toUpperCase()}
              </span>
              <span className="max-w-[120px] truncate">{m.name}</span>
              <button type="button" onClick={() => toggle(m.id)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-40 top-full mt-2 left-0 right-0 bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">Tidak ada yang cocok</p>
            ) : (
              filtered.map((m) => {
                const sel = selectedIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-secondary/50 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                        {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" /> : m.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-xs font-semibold truncate">{m.name}</span>
                    </span>
                    {sel && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
          {members.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border text-[11px]">
              <button type="button" onClick={() => onChange(members.map((m) => m.id))} className="font-semibold text-muted-foreground hover:text-foreground">Pilih semua</button>
              <button type="button" onClick={() => onChange([])} className="font-semibold text-muted-foreground hover:text-foreground">Kosongkan</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
