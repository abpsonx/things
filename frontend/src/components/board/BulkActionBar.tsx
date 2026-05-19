"use client";

import React, { useState } from "react";
import { X, Trash2, User as UserIcon, Flag, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MemberOption {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface ColumnOption {
  id: string;
  title: string;
}

interface Props {
  count: number;
  members: MemberOption[];
  columns: ColumnOption[];
  busy?: boolean;
  onClear: () => void;
  onAssign: (assigneeId: string | null) => void;
  onPriority: (priority: "low" | "medium" | "high") => void;
  onMove: (status: string) => void;
  onDelete: () => void;
}

function Menu({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-all"
      >
        {icon}
        {label}
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full mb-2 left-0 min-w-[200px] bg-card border border-border rounded-2xl shadow-2xl py-2 max-h-72 overflow-y-auto">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const PRIORITY_OPTIONS: { value: "low" | "medium" | "high"; label: string; color: string }[] = [
  { value: "high", label: "HIGH", color: "text-red-500" },
  { value: "medium", label: "MEDIUM", color: "text-amber-500" },
  { value: "low", label: "LOW", color: "text-emerald-500" },
];

export default function BulkActionBar({
  count,
  members,
  columns,
  busy,
  onClear,
  onAssign,
  onPriority,
  onMove,
  onDelete,
}: Props) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900 text-white shadow-2xl border border-white/10">
        <span className="text-xs font-bold pr-2 border-r border-white/20">{count} dipilih</span>

        <Menu label="Assign" icon={<UserIcon className="w-3.5 h-3.5" />}>
          {(close) => (
            <>
              <button
                onClick={() => {
                  onAssign(null);
                  close();
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary/50 transition-colors"
              >
                — Unassign —
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    onAssign(m.id);
                    close();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 transition-colors"
                >
                  <span className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      m.name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="text-xs font-semibold truncate">{m.name}</span>
                </button>
              ))}
            </>
          )}
        </Menu>

        <Menu label="Priority" icon={<Flag className="w-3.5 h-3.5" />}>
          {(close) =>
            PRIORITY_OPTIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => {
                  onPriority(p.value);
                  close();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 transition-colors"
              >
                <Flag className={cn("w-3.5 h-3.5 fill-current", p.color)} />
                <span className="text-xs font-bold tracking-wider">{p.label}</span>
              </button>
            ))
          }
        </Menu>

        <Menu label="Pindah" icon={<ChevronDown className="w-3.5 h-3.5" />}>
          {(close) =>
            columns.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onMove(c.id);
                  close();
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-secondary/50 transition-colors"
              >
                {c.title}
              </button>
            ))
          }
        </Menu>

        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-200 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Hapus
        </button>

        <button
          onClick={onClear}
          className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
