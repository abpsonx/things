"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, X, Loader2, MessageSquare, Layout, CheckSquare, Hash, ArrowRight } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    } else {
      setQuery("");
      setResults(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const search = async () => {
      if (query.length < 2) {
        setResults(null);
        return;
      }
      setLoading(true);
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(query)}`);
        setResults(res.data);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(search, 300);
    return () => clearTimeout(debounce);
  }, [query]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 hover:bg-secondary border border-border rounded-lg text-muted-foreground hover:text-foreground transition-all group"
      >
        <Search className="w-4 h-4" />
        <span className="text-xs font-medium">Cari...</span>
        <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium opacity-100 ml-4">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border flex items-center gap-3">
              <Search className="w-5 h-5 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari proyek, tugas, atau pesan..."
                className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
              />
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-secondary rounded-md">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {results ? (
                <div className="space-y-4 p-2">
                  {/* Projects */}
                  {results.projects.length > 0 && (
                    <div className="space-y-1">
                      <h3 className="px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Proyek</h3>
                      {results.projects.map((p: any) => (
                        <Link
                          key={p.id}
                          href={`/org/${p.org_id}/project/${p.id}/board`}
                          onClick={() => setIsOpen(false)}
                          className="flex items-center gap-3 p-2 hover:bg-secondary rounded-xl transition-all group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                            <Layout className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-medium">{p.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Tasks */}
                  {results.tasks.length > 0 && (
                    <div className="space-y-1 pt-2">
                      <h3 className="px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Tugas</h3>
                      {results.tasks.map((t: any) => (
                        <Link
                          key={t.id}
                          href={`/org/${t.org_id}/project/${t.project_id}/board`}
                          onClick={() => setIsOpen(false)}
                          className="flex items-center justify-between p-2 hover:bg-secondary rounded-xl transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground group-hover:scale-110 transition-transform">
                              <CheckSquare className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium">{t.title}</span>
                          </div>
                          <div className="px-2 py-0.5 rounded-full bg-primary/10 text-[9px] font-bold text-primary uppercase">{t.status}</div>
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Messages */}
                  {results.messages.length > 0 && (
                    <div className="space-y-1 pt-2">
                      <h3 className="px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Pesan Chat</h3>
                      {results.messages.map((m: any) => (
                        <Link
                          key={m.id}
                          href={`/org/${m.org_id}/project/${m.project_id}/chat`}
                          onClick={() => setIsOpen(false)}
                          className="flex flex-col p-3 hover:bg-secondary rounded-xl transition-all group"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[8px] font-bold">
                              {m.user.charAt(0)}
                            </div>
                            <span className="text-[10px] font-bold">{m.user}</span>
                            <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                              {new Date(m.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">{m.content}</p>
                        </Link>
                      ))}
                    </div>
                  )}

                  {results.projects.length === 0 && results.tasks.length === 0 && results.messages.length === 0 && (
                    <div className="py-12 text-center text-muted-foreground">
                      <p className="text-sm">Tidak ada hasil ditemukan untuk "{query}"</p>
                    </div>
                  )}
                </div>
              ) : query.length > 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <p className="text-sm italic">Mengetik...</p>
                </div>
              ) : (
                <div className="py-12 text-center space-y-4">
                  <div className="w-12 h-12 bg-secondary rounded-2xl flex items-center justify-center mx-auto text-muted-foreground">
                    <Search className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Cari apa saja...</p>
                    <p className="text-[10px] text-muted-foreground">Ketik minimal 2 karakter untuk mulai mencari</p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <div className="px-2 py-1 bg-secondary rounded text-[10px] border border-border">Proyek</div>
                    <div className="px-2 py-1 bg-secondary rounded text-[10px] border border-border">Tugas</div>
                    <div className="px-2 py-1 bg-secondary rounded text-[10px] border border-border">Chat</div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-secondary/30 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground font-medium">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <kbd className="px-1 border rounded bg-background">ESC</kbd> Batal
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-1 border rounded bg-background">ENTER</kbd> Pilih
                </div>
              </div>
              <div className="flex items-center gap-1 text-primary">
                <ArrowRight className="w-3 h-3" /> Things Search
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
