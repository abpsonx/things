"use client";

import React, { useEffect, useState } from "react";
import { Link as LinkIcon, Plus, Trash2, X, Loader2, ExternalLink } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface TaskLink {
  id: string;
  url: string;
  title?: string | null;
}

interface Props {
  taskId: string;
  canEdit: boolean;
}

const prettyHost = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export default function TaskLinksSection({ taskId, canEdit }: Props) {
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchLinks = async () => {
    try {
      const res = await api.get(`/tasks/${taskId}/links`);
      setLinks(res.data || []);
    } catch (err) {
      console.error("Failed to fetch task links", err);
    }
  };

  useEffect(() => {
    if (taskId) fetchLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      await api.post(`/tasks/${taskId}/links`, { url: url.trim(), title: title.trim() || null });
      setUrl("");
      setTitle("");
      setAdding(false);
      await fetchLinks();
    } catch {
      alert("Gagal menambah link.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (linkId: string) => {
    if (!confirm("Hapus link ini?")) return;
    try {
      await api.delete(`/tasks/${taskId}/links/${linkId}`);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch {
      alert("Gagal menghapus link.");
    }
  };

  return (
    // pointer-events-auto so the section stays interactive even if a parent
    // wrapper is read-only (so viewers can still open the links).
    <div className="space-y-2 pointer-events-auto">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <LinkIcon className="w-3 h-3" /> Lampiran Link ({links.length})
        </label>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[10px] font-bold text-primary hover:text-primary/80 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Tambah
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={submit} className="space-y-1.5 p-2 bg-secondary/20 border border-border rounded-xl">
          <input
            autoFocus
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://contoh.com/dokumen"
            className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Judul (opsional)"
            className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex justify-end gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => { setAdding(false); setUrl(""); setTitle(""); }}
              className="px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-secondary rounded-md"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={busy || !url.trim()}
              className="px-3 py-1 text-[11px] font-bold bg-primary text-primary-foreground rounded-md disabled:opacity-50 inline-flex items-center gap-1"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />} Simpan
            </button>
          </div>
        </form>
      )}

      {links.length === 0 && !adding ? (
        <p className="text-[10px] font-medium italic text-muted-foreground py-1">Belum ada link.</p>
      ) : (
        <div className="space-y-1">
          {links.map((l) => (
            <div key={l.id} className="group flex items-center gap-2 px-2.5 py-1.5 bg-secondary/20 border border-border rounded-lg hover:border-primary/30 transition-colors">
              <LinkIcon className="w-3.5 h-3.5 text-primary shrink-0" />
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 text-xs text-primary hover:underline truncate"
                title={l.url}
              >
                {l.title || prettyHost(l.url)}
                {l.title && <span className="text-muted-foreground ml-1">· {prettyHost(l.url)}</span>}
              </a>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                title="Buka di tab baru"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(l.id)}
                  className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                  title="Hapus"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Inline helper: extract URLs from free text → returns array.
const URL_RE = /(https?:\/\/[^\s)]+)/g;
export function extractUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) out.add(m[1].replace(/[.,;!?]+$/, ""));
  return Array.from(out);
}

/** Tiny row of clickable blue chips for any URLs found in plain-text description. */
export function DescriptionLinkChips({ text }: { text: string | null | undefined }) {
  const urls = extractUrls(text);
  if (!urls.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 pointer-events-auto">
      {urls.map((u) => (
        <a
          key={u}
          href={u}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold",
            "bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors max-w-[260px]",
          )}
          title={u}
        >
          <LinkIcon className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{prettyHost(u)}</span>
          <X className="w-2.5 h-2.5 hidden" />
        </a>
      ))}
    </div>
  );
}
