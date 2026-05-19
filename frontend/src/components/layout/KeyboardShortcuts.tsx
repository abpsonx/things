"use client";

import React, { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Keyboard, X } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

const SHORTCUTS: { key: string; description: string }[] = [
  { key: "⌘ K  /  Ctrl K", description: "Buka pencarian global" },
  { key: "/", description: "Fokus ke pencarian global" },
  { key: "N", description: "Buat tugas baru di kolom pertama (di halaman board)" },
  { key: "G  →  D", description: "Pergi ke Dashboard" },
  { key: "G  →  P", description: "Pergi ke daftar Project" },
  { key: "?", description: "Tampilkan help ini" },
  { key: "Esc", description: "Tutup modal" },
];

export default function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id?: string; projectId?: string; teamId?: string }>();
  const [helpOpen, setHelpOpen] = useState(false);
  const [gPressed, setGPressed] = useState(false);

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      // Always allow these even while typing
      if (e.key === "Escape") {
        setHelpOpen(false);
        setGPressed(false);
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (e.key === "/") {
        // GlobalSearch listens for Cmd/Ctrl+K — synthesize one so the
        // unmodified slash works as a "focus search" shortcut.
        e.preventDefault();
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
        );
        return;
      }

      if (gPressed) {
        if (e.key.toLowerCase() === "d") {
          e.preventDefault();
          router.push("/dashboard");
        } else if (e.key.toLowerCase() === "p") {
          e.preventDefault();
          router.push("/projects");
        }
        setGPressed(false);
        return;
      }

      if (e.key.toLowerCase() === "g") {
        setGPressed(true);
        setTimeout(() => setGPressed(false), 1500);
        return;
      }

      // N = new task — only meaningful on a board page
      if (e.key.toLowerCase() === "n") {
        if (!pathname?.includes("/board")) return;
        e.preventDefault();
        try {
          if (params.projectId) {
            await api.post(`/projects/${params.projectId}/tasks`, {
              title: "Tugas Baru",
              status: "todo",
            });
            toast.success("Tugas baru dibuat");
            window.dispatchEvent(new CustomEvent("things:task-created"));
          } else if (params.teamId && params.id) {
            await api.post(`/organizations/${params.id}/teams/${params.teamId}/tasks`, {
              title: "Tugas Baru",
              status: "todo",
            });
            toast.success("Tugas baru dibuat");
            window.dispatchEvent(new CustomEvent("things:task-created"));
          }
        } catch (err) {
          console.error("Failed to create task via shortcut", err);
          toast.error("Gagal membuat tugas");
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname, params.id, params.projectId, params.teamId, gPressed]);

  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setHelpOpen(false)}
    >
      <div
        className="bg-card border border-border rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold">Keyboard Shortcuts</h2>
              <p className="text-[11px] text-muted-foreground">Tekan ? kapan saja untuk membuka panel ini</p>
            </div>
          </div>
          <button
            onClick={() => setHelpOpen(false)}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-1">
          {SHORTCUTS.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-secondary/50 transition-colors"
            >
              <span className="text-sm text-foreground">{s.description}</span>
              <kbd className="font-mono text-[11px] font-bold px-2 py-1 rounded-lg bg-secondary border border-border">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
