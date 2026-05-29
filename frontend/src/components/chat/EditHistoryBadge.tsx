"use client";

import { useState, useEffect } from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EditHistoryEntry {
  content: string;
  edited_at: string | null;
}

interface Props {
  /** Past versions, oldest first. The current `content` is NOT in this list. */
  history: EditHistoryEntry[];
  /** Timestamp of the latest edit, shown in the inline label. */
  editedAt: string;
  /** True if the message bubble is on a dark background (sender side). */
  onDark?: boolean;
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "diedit";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

export default function EditHistoryBadge({ history, editedAt, onDark }: Props) {
  const [open, setOpen] = useState(false);
  const versions = history || [];
  const hasHistory = versions.length > 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      // Close on outside click — popover is rendered inline so we just close
      // whenever the click target isn't inside our wrapper.
      const target = e.target as HTMLElement;
      if (!target.closest("[data-edit-history-popover]")) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const stamp = formatStamp(editedAt);

  return (
    <span data-edit-history-popover className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (hasHistory) setOpen((v) => !v);
        }}
        className={cn(
          "text-[9px] italic opacity-60 transition-opacity",
          hasHistory && "underline-offset-2 hover:underline hover:opacity-90 cursor-pointer",
          !hasHistory && "cursor-default",
          onDark ? "text-white" : "text-muted-foreground",
        )}
        title={hasHistory ? `Lihat ${versions.length} versi sebelumnya` : "Pesan diedit"}
      >
        Diedit {stamp}
      </button>

      {open && hasHistory && (
        <div
          className={cn(
            "absolute z-[60] mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card text-foreground shadow-xl p-2 not-italic text-left",
            onDark ? "right-0" : "left-0",
          )}
        >
          <div className="flex items-center gap-1.5 px-2 pt-1 pb-2 border-b border-border">
            <History className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Riwayat Edit ({versions.length})
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto py-1 space-y-1">
            {versions.map((v, i) => (
              <div key={i} className="px-2 py-1.5 rounded hover:bg-secondary/50">
                <div className="text-[9px] text-muted-foreground mb-0.5">
                  {v.edited_at ? formatStamp(v.edited_at) : "Versi awal"}
                </div>
                <div className="text-[12px] leading-snug whitespace-pre-wrap break-words">
                  {v.content || <span className="italic text-muted-foreground">(kosong)</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
