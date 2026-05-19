"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SmilePlus } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

export type TargetType = "comment" | "message" | "team_message";

export interface ReactionBucket {
  emoji: string;
  count: number;
  me: boolean;
  users: { id: string; name: string }[];
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "💯", "✅", "👀"];

function ChipWithPopover({
  bucket,
  onClick,
  onDark,
}: {
  bucket: ReactionBucket;
  onClick: () => void;
  onDark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !chipRef.current) return;
    const rect = chipRef.current.getBoundingClientRect();
    // Anchor popover above the chip, horizontally centered, then clamp to
    // viewport so it never spills off-screen.
    const POPOVER_W = 240;
    const desiredLeft = rect.left + rect.width / 2 - POPOVER_W / 2;
    const left = Math.max(8, Math.min(window.innerWidth - POPOVER_W - 8, desiredLeft));
    setCoords({ top: rect.top - 8, left });
  }, [open]);

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        onClick={onClick}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all",
          bucket.me
            ? "bg-primary/10 border-primary/40 text-primary"
            : onDark
              ? "bg-white/10 border-white/20 text-white/85 hover:bg-white/15"
              : "bg-secondary/60 border-border text-foreground/80 hover:bg-secondary",
        )}
      >
        <span className="text-[12px] leading-none">{bucket.emoji}</span>
        <span className="leading-none">{bucket.count}</span>
      </button>
      {mounted && open && bucket.users.length > 0 && coords && createPortal(
        <div
          className="fixed z-[200] -translate-y-full bg-slate-900 text-white rounded-xl shadow-xl px-3 py-2 text-[11px] font-medium pointer-events-none"
          style={{ top: coords.top, left: coords.left, width: 240 }}
        >
          <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider opacity-70">
            <span>{bucket.emoji}</span>
            <span>·</span>
            <span>{bucket.count} reaksi</span>
          </div>
          <div className="space-y-0.5">
            {bucket.users.slice(0, 12).map((u) => (
              <div key={u.id} className="truncate">{u.name}</div>
            ))}
            {bucket.users.length > 12 && (
              <div className="opacity-60">+{bucket.users.length - 12} lainnya</div>
            )}
          </div>
          {bucket.me && (
            <div className="text-[10px] opacity-60 mt-1 pt-1 border-t border-white/15">
              Klik untuk hapus reaksimu
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

interface Props {
  targetType: TargetType;
  targetId: string;
  reactions: ReactionBucket[];
  onChange?: (next: ReactionBucket[]) => void;
  /** Render hint: when bubble is dark (sender), force lighter chip styling */
  onDark?: boolean;
}

export default function Reactions({ targetType, targetId, reactions, onChange, onDark }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerOpen]);

  const toggle = async (emoji: string) => {
    const existing = reactions.find((r) => r.emoji === emoji);
    try {
      let res;
      if (existing?.me) {
        res = await api.delete("/reactions", {
          params: { target_type: targetType, target_id: targetId, emoji },
        });
      } else {
        res = await api.post("/reactions", {
          target_type: targetType,
          target_id: targetId,
          emoji,
        });
      }
      onChange?.(res.data.reactions || []);
    } catch (err) {
      console.error("Failed to toggle reaction", err);
    } finally {
      setPickerOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {reactions.map((r) => (
        <ChipWithPopover
          key={r.emoji}
          bucket={r}
          onDark={onDark}
          onClick={() => toggle(r.emoji)}
        />
      ))}

      <div className="relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className={cn(
            "p-1 rounded-full transition-all opacity-60 hover:opacity-100",
            onDark
              ? "text-white/70 hover:bg-white/15"
              : "text-muted-foreground hover:bg-secondary",
          )}
          title="Beri reaksi"
        >
          <SmilePlus className="w-3.5 h-3.5" />
        </button>
        {pickerOpen && (
          <div className="absolute z-40 bottom-full mb-1 left-0 bg-card border border-border rounded-xl shadow-xl p-1 flex gap-0.5">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => toggle(e)}
                className="w-7 h-7 rounded-lg hover:bg-secondary flex items-center justify-center text-base"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
