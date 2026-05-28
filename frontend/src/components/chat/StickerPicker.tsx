"use client";

import React, { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Search, Loader2, Sticker as StickerIcon } from "lucide-react";

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}
interface GiphyItem {
  id: string;
  title: string;
  images: {
    fixed_height_small?: GiphyImage;
    fixed_height?: GiphyImage;
    original?: GiphyImage;
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the URL to send (full-resolution sticker) when user picks one. */
  onPick: (url: string) => void;
}

const API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || "";
const PAGE = 24;

export default function StickerPicker({ isOpen, onClose, onPick }: Props) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<GiphyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const fetchStickers = async (query: string) => {
    if (!API_KEY) {
      setError("GIPHY API key belum di-set (NEXT_PUBLIC_GIPHY_API_KEY).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const base = query.trim()
        ? `https://api.giphy.com/v1/stickers/search?q=${encodeURIComponent(query.trim())}`
        : "https://api.giphy.com/v1/stickers/trending";
      const url = `${base}${query.trim() ? "&" : "?"}api_key=${API_KEY}&limit=${PAGE}&rating=g`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Giphy ${res.status}`);
      const json = await res.json();
      setItems(json.data || []);
    } catch (e: any) {
      setError(e?.message || "Gagal memuat sticker.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  // Initial load + debounced search.
  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchStickers(q), q ? 300 : 0);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={
      <span className="inline-flex items-center gap-2"><StickerIcon className="w-4 h-4 text-primary" /> Pilih Sticker</span>
    }>
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari sticker... (kosongkan = trending)"
            className="w-full pl-10 pr-3 py-2.5 bg-secondary/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive text-xs rounded-lg">{error}</div>
        )}

        <div className="h-[400px] overflow-y-auto -mr-2 pr-2">
          {loading && items.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : items.length === 0 && !loading ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
              {q ? `Tidak ada sticker untuk "${q}"` : "Mulai cari sticker..."}
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {items.map((it) => {
                const thumb = it.images.fixed_height_small?.url || it.images.fixed_height?.url || it.images.original?.url;
                const full = it.images.fixed_height?.url || it.images.original?.url || thumb;
                if (!thumb || !full) return null;
                return (
                  <button
                    key={it.id}
                    onClick={() => { onPick(full); onClose(); }}
                    className="aspect-square flex items-center justify-center bg-secondary/30 hover:bg-secondary rounded-lg p-1 transition-colors group"
                    title={it.title}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumb}
                      alt={it.title}
                      loading="lazy"
                      className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground text-center">Powered by GIPHY · rating G</p>
      </div>
    </Modal>
  );
}
