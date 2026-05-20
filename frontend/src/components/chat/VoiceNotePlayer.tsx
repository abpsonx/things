"use client";

import React from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

/** Detects whether a url/name points to an audio file (incl. our voice notes). */
export function isAudioFile(url?: string | null, name?: string | null): boolean {
  const s = `${url || ""} ${name || ""}`.toLowerCase();
  return /\.(webm|m4a|ogg|mp3|wav|aac)(\?|$)/.test(s) || s.includes("voice-note");
}

export default function VoiceNotePlayer({ url, onDark }: { url: string; onDark?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-2xl px-2.5 py-2 min-w-[220px] max-w-[300px]",
      onDark ? "bg-white/10" : "bg-secondary/40",
    )}>
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
        onDark ? "bg-white/15 text-white" : "bg-primary/10 text-primary",
      )}>
        <Mic className="w-4 h-4" />
      </div>
      <audio controls preload="metadata" src={url} className="h-9 flex-1 min-w-0" />
    </div>
  );
}
