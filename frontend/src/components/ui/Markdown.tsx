"use client";

/**
 * Lightweight markdown helpers — no external deps.
 *
 * Mendukung subset yang biasa dipakai untuk caption / deskripsi task:
 *   **bold** · *italic* · ~~strike~~ · `code` · [text](url)
 *   list ber-bullet ("- " / "* " di awal baris) & ber-nomor ("1. ")
 *
 * Storage tetap plain text — formatting hanya saat render. Berarti
 * @mention dari MentionTextarea, link picker dari DescriptionLinkChips,
 * dan paste ke aplikasi lain semua tetap jalan tanpa perubahan.
 */

import React, { useRef } from "react";
import { Bold, Italic, Strikethrough, List, ListOrdered, Code, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ───────────────────────── Renderer ─────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(line: string): string {
  let s = escapeHtml(line);
  // Inline code first (so its content tidak ke-format lagi).
  s = s.replace(/`([^`\n]+?)`/g, (_, c) => `<code class="px-1 py-0.5 rounded bg-secondary/70 text-[0.85em] font-mono">${c}</code>`);
  // [text](url)
  s = s.replace(/\[([^\]\n]+?)\]\((https?:[^\s)]+)\)/g, (_, t, u) =>
    `<a href="${u}" target="_blank" rel="noreferrer noopener" class="text-primary underline underline-offset-2 hover:opacity-80">${t}</a>`);
  // Bold (**x**) sebelum italic supaya ** tidak tertangkap *
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  // Italic *x* (jangan match ** sisa)
  s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
  // Strikethrough ~~x~~
  s = s.replace(/~~([^~\n]+?)~~/g, "<del>$1</del>");
  return s;
}

export function renderMarkdownToHtml(src: string): string {
  if (!src) return "";
  const lines = src.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul class="list-disc pl-5 space-y-0.5">${items.join("")}</ul>`);
      continue;
    }
    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol class="list-decimal pl-5 space-y-0.5">${items.join("")}</ol>`);
      continue;
    }
    if (line.trim() === "") {
      out.push("<br/>");
      i++;
      continue;
    }
    out.push(`<p>${renderInline(line)}</p>`);
    i++;
  }
  return out.join("");
}

/** Heuristik kasar: kalau string mengandung tag HTML pembuka (mis. `<p>`,
 *  `<strong>`, `<ul>`), perlakukan sebagai HTML mentah (output TipTap).
 *  Kalau tidak, render via markdown converter. */
function looksLikeHtml(s: string): boolean {
  return /<(p|div|span|strong|em|b|i|u|ul|ol|li|h[1-6]|a|br|blockquote|code|pre|hr|img)(\s|>|\/)/i.test(s);
}

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const html = looksLikeHtml(text) ? text : renderMarkdownToHtml(text);
  return (
    <div
      className={cn("whitespace-pre-wrap break-words [&_p]:m-0 [&_p+p]:mt-1", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ───────────────────────── Toolbar ─────────────────────────

interface ToolbarProps {
  taRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

/**
 * Toolbar yang membungkus selection di textarea dengan marker markdown.
 * Tidak punya state — semua dikendalikan oleh value/onChange parent.
 */
export function MarkdownToolbar({ taRef, value, onChange, className }: ToolbarProps) {
  const wrap = (left: string, right: string = left, placeholder: string = "teks") => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const sel = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + left + sel + right + value.slice(end);
    onChange(next);
    // Re-select inserted text supaya user bisa langsung ketik ulang.
    requestAnimationFrame(() => {
      ta.focus();
      const a = start + left.length;
      ta.setSelectionRange(a, a + sel.length);
    });
  };

  // Insert prefix di awal baris terpilih (untuk list).
  const prefixLines = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = (() => {
      const i = value.indexOf("\n", end);
      return i === -1 ? value.length : i;
    })();
    const block = value.slice(lineStart, lineEnd);
    const newBlock = block
      .split("\n")
      .map((l, idx) => {
        if (prefix === "1. ") return `${idx + 1}. ${l}`;
        return `${prefix}${l}`;
      })
      .join("\n");
    onChange(value.slice(0, lineStart) + newBlock + value.slice(lineEnd));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(lineStart, lineStart + newBlock.length);
    });
  };

  const linkIt = () => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const sel = value.slice(start, end) || "teks";
    const url = window.prompt("URL:", "https://") || "";
    if (!url || url === "https://") return;
    const next = value.slice(0, start) + `[${sel}](${url})` + value.slice(end);
    onChange(next);
  };

  type Btn = { icon: any; title: string; action: () => void };
  const btns: Btn[] = [
    { icon: Bold, title: "Bold (**teks**)", action: () => wrap("**") },
    { icon: Italic, title: "Italic (*teks*)", action: () => wrap("*") },
    { icon: Strikethrough, title: "Strikethrough (~~teks~~)", action: () => wrap("~~") },
    { icon: Code, title: "Inline code (`teks`)", action: () => wrap("`") },
    { icon: List, title: "Bullet list", action: () => prefixLines("- ") },
    { icon: ListOrdered, title: "Numbered list", action: () => prefixLines("1. ") },
    { icon: LinkIcon, title: "Link", action: linkIt },
  ];

  return (
    <div className={cn("flex items-center gap-0.5 px-1 py-1 border border-border rounded-lg bg-secondary/30", className)}>
      {btns.map((b) => (
        <button
          key={b.title}
          type="button"
          onClick={b.action}
          // onMouseDown preventDefault — supaya textarea TIDAK kehilangan
          // focus (kalau hilang, selectionStart/End hilang sebelum action).
          onMouseDown={(e) => e.preventDefault()}
          title={b.title}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
        >
          <b.icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
