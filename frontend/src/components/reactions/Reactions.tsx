"use client";

import React, { useEffect, useRef, useState } from "react";
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
        <button
          key={r.emoji}
          type="button"
          onClick={() => toggle(r.emoji)}
          title={r.users.map((u) => u.name).join(", ")}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all",
            r.me
              ? "bg-primary/10 border-primary/40 text-primary"
              : onDark
                ? "bg-white/10 border-white/20 text-white/85 hover:bg-white/15"
                : "bg-secondary/60 border-border text-foreground/80 hover:bg-secondary",
          )}
        >
          <span className="text-[12px] leading-none">{r.emoji}</span>
          <span className="leading-none">{r.count}</span>
        </button>
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
