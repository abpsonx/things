"use client";

import React, { useRef, useState } from "react";
import {
  Search,
  Filter as FilterIcon,
  X,
  Calendar,
  Flag,
  Tag,
  User as UserIcon,
  Bookmark,
  ChevronDown,
  Plus,
  Trash2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BoardFilter,
  EMPTY_FILTER,
  isFilterActive,
  SavedView,
} from "./useBoardFilter";

interface MemberOption {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface LabelOption {
  id: string;
  name: string;
  color: string;
}

interface Props {
  filter: BoardFilter;
  onChange: (f: BoardFilter) => void;
  onReset: () => void;
  members: MemberOption[];
  labels?: LabelOption[];
  savedViews: SavedView[];
  onSaveView: (name: string) => void;
  onApplyView: (v: SavedView) => void;
  onDeleteView: (id: string) => void;
}

const PRIORITY_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "high", label: "HIGH", color: "text-red-500" },
  { value: "medium", label: "MEDIUM", color: "text-amber-500" },
  { value: "low", label: "LOW", color: "text-emerald-500" },
];

const DUE_OPTIONS: { value: BoardFilter["dueRange"]; label: string }[] = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Hari ini" },
  { value: "week", label: "Minggu ini" },
];

function Dropdown({
  label,
  icon,
  children,
  count,
  active,
}: {
  label: string;
  icon: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  count?: number;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
          active
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50",
        )}
      >
        {icon}
        <span>{label}</span>
        {count ? (
          <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
            {count}
          </span>
        ) : null}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute z-40 top-full mt-2 left-0 min-w-[220px] bg-card border border-border rounded-2xl shadow-xl py-2 max-h-72 overflow-y-auto">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export default function BoardFilterBar({
  filter,
  onChange,
  onReset,
  members,
  labels,
  savedViews,
  onSaveView,
  onApplyView,
  onDeleteView,
}: Props) {
  const active = isFilterActive(filter);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [savingName, setSavingName] = useState("");

  const toggleArray = (key: "assigneeIds" | "priorities" | "labelIds", v: string) => {
    const set = new Set(filter[key]);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    onChange({ ...filter, [key]: Array.from(set) });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap py-3">
      {/* Search */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={filter.search}
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          placeholder="Cari di board..."
          className="pl-8 pr-3 py-1.5 rounded-xl bg-card border border-border text-xs font-medium w-52 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* Mine only */}
      <button
        onClick={() => onChange({ ...filter, mineOnly: !filter.mineOnly })}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
          filter.mineOnly
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50",
        )}
      >
        <UserIcon className="w-3.5 h-3.5" />
        Tugas Saya
      </button>

      {/* Assignee */}
      <Dropdown
        label="Assignee"
        icon={<UserIcon className="w-3.5 h-3.5" />}
        count={filter.assigneeIds.length}
        active={filter.assigneeIds.length > 0}
      >
        {() =>
          members.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Belum ada anggota</p>
          ) : (
            members.map((m) => {
              const checked = filter.assigneeIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleArray("assigneeIds", m.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-secondary/50 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        m.name.charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="text-xs font-semibold truncate">{m.name}</span>
                  </span>
                  {checked && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              );
            })
          )
        }
      </Dropdown>

      {/* Priority */}
      <Dropdown
        label="Priority"
        icon={<Flag className="w-3.5 h-3.5" />}
        count={filter.priorities.length}
        active={filter.priorities.length > 0}
      >
        {() =>
          PRIORITY_OPTIONS.map((p) => {
            const checked = filter.priorities.includes(p.value);
            return (
              <button
                key={p.value}
                onClick={() => toggleArray("priorities", p.value)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-secondary/50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Flag className={cn("w-3.5 h-3.5 fill-current", p.color)} />
                  <span className="text-xs font-bold tracking-wider">{p.label}</span>
                </span>
                {checked && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
            );
          })
        }
      </Dropdown>

      {/* Labels (optional) */}
      {labels && labels.length > 0 && (
        <Dropdown
          label="Label"
          icon={<Tag className="w-3.5 h-3.5" />}
          count={filter.labelIds.length}
          active={filter.labelIds.length > 0}
        >
          {() =>
            labels.map((l) => {
              const checked = filter.labelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => toggleArray("labelIds", l.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-secondary/50 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: l.color }} />
                    <span className="text-xs font-semibold truncate">{l.name}</span>
                  </span>
                  {checked && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              );
            })
          }
        </Dropdown>
      )}

      {/* Due range */}
      <Dropdown
        label="Due"
        icon={<Calendar className="w-3.5 h-3.5" />}
        count={filter.dueRange ? 1 : 0}
        active={!!filter.dueRange}
      >
        {(close) =>
          DUE_OPTIONS.map((d) => {
            const checked = filter.dueRange === d.value;
            return (
              <button
                key={d.value || "any"}
                onClick={() => {
                  onChange({ ...filter, dueRange: checked ? null : d.value });
                  close();
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-secondary/50 transition-colors"
              >
                <span className="text-xs font-semibold">{d.label}</span>
                {checked && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
            );
          })
        }
      </Dropdown>

      {/* Saved views */}
      <div className="relative">
        <button
          onClick={() => setViewsOpen((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
            savedViews.length > 0
              ? "bg-card text-foreground border-border hover:bg-secondary/50"
              : "bg-card text-muted-foreground border-border hover:bg-secondary/50",
          )}
        >
          <Bookmark className="w-3.5 h-3.5" />
          View ({savedViews.length})
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {viewsOpen && (
          <div className="absolute z-40 top-full mt-2 left-0 min-w-[260px] bg-card border border-border rounded-2xl shadow-xl py-2">
            {savedViews.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Belum ada view tersimpan</p>
            ) : (
              savedViews.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 transition-colors"
                >
                  <button
                    onClick={() => {
                      onApplyView(v);
                      setViewsOpen(false);
                    }}
                    className="flex-1 text-left text-xs font-semibold truncate"
                  >
                    {v.name}
                  </button>
                  <button
                    onClick={() => onDeleteView(v.id)}
                    className="p-1 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
            {active && (
              <div className="border-t border-border mt-1 pt-2 px-3 pb-2">
                <div className="flex items-center gap-2">
                  <input
                    value={savingName}
                    onChange={(e) => setSavingName(e.target.value)}
                    placeholder="Beri nama view..."
                    className="flex-1 px-2 py-1 rounded-lg border border-border bg-background text-xs"
                  />
                  <button
                    disabled={!savingName.trim()}
                    onClick={() => {
                      onSaveView(savingName.trim());
                      setSavingName("");
                    }}
                    className="p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Simpan kombinasi filter saat ini
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reset */}
      {active && (
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-red-500 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Reset
        </button>
      )}
    </div>
  );
}
