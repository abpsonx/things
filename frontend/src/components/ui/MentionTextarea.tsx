"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MarkdownToolbar } from "./Markdown";

export interface MentionMember {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  members: MentionMember[];
  placeholder?: string;
  className?: string;
  /** Called with the list of mentioned member ids whenever the text changes. */
  onMentionsChange?: (ids: string[]) => void;
  /** Tampilkan toolbar formatting markdown (Bold/Italic/list/dll) di atas textarea. */
  withToolbar?: boolean;
}

/**
 * A textarea with @mention autocomplete. Mentions are stored inline as
 * plain "@Name" text (human-readable). The set of matched member ids is
 * surfaced via onMentionsChange so the caller can notify them on save.
 */
export default function MentionTextarea({
  value,
  onChange,
  onBlur,
  members,
  placeholder,
  className,
  onMentionsChange,
  withToolbar,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  // Auto-grow: expand to fit content so long descriptions don't force the
  // user to scroll inside a tiny box while writing. Caps at ~60vh, then
  // scrolls internally.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const cap = Math.round(window.innerHeight * 0.6);
    ta.style.height = Math.min(ta.scrollHeight, cap) + "px";
    ta.style.overflowY = ta.scrollHeight > cap ? "auto" : "hidden";
  }, [value]);

  const matches =
    query === null
      ? []
      : members
          .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6);

  const reportMentions = (text: string) => {
    if (!onMentionsChange) return;
    const ids = members.filter((m) => text.includes(`@${m.name}`)).map((m) => m.id);
    onMentionsChange(Array.from(new Set(ids)));
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    reportMentions(v);
    const caret = e.target.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at === -1) { setQuery(null); return; }
    const charBefore = at === 0 ? " " : before[at - 1];
    const q = before.slice(at + 1);
    if (!/[\s\n]/.test(charBefore) || /\s/.test(q)) { setQuery(null); return; }
    setQuery(q);
    setHighlight(0);
  };

  const insert = (m: MentionMember) => {
    const ta = taRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const at = before.lastIndexOf("@");
    const next = `${before.slice(0, at)}@${m.name} ${after}`;
    onChange(next);
    reportMentions(next);
    setQuery(null);
    setTimeout(() => {
      if (!taRef.current) return;
      taRef.current.focus();
      const pos = at + m.name.length + 2;
      taRef.current.setSelectionRange(pos, pos);
    }, 0);
  };

  return (
    <div className="relative space-y-1.5">
      {withToolbar && (
        <MarkdownToolbar taRef={taRef} value={value} onChange={(v) => { onChange(v); reportMentions(v); }} />
      )}
      {query !== null && matches.length > 0 && (
        <div className="absolute top-full left-0 mt-1 min-w-[220px] bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-50 max-h-[220px] overflow-y-auto">
          <div className="px-3 py-1.5 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wide bg-secondary/30">Tag orang</div>
          {matches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insert(m); }}
              onMouseEnter={() => setHighlight(i)}
              className={cn("w-full flex items-center gap-2 px-3 py-2 text-left transition-colors", i === highlight ? "bg-primary/10" : "hover:bg-secondary/50")}
            >
              <span className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-[9px] font-bold overflow-hidden shrink-0">
                {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" /> : m.name.charAt(0).toUpperCase()}
              </span>
              <span className="text-xs font-semibold truncate">{m.name}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (query !== null && matches.length > 0) {
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % matches.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + matches.length) % matches.length); }
            else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insert(matches[highlight]); }
            else if (e.key === "Escape") { setQuery(null); }
          }
        }}
        placeholder={placeholder}
        className={className}
      />
    </div>
  );
}
