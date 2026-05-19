"use client";

import React, { useState } from "react";
import { Check, Lock, BarChart3 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface PollData {
  id: string;
  question: string;
  options: { text: string; count: number }[];
  allow_multi: boolean;
  closed_at: string | null;
  created_by: string;
  total_votes: number;
  unique_voters: number;
  my_votes: number[];
}

interface Props {
  poll: PollData;
  currentUserId?: string;
  onUpdate: (next: PollData) => void;
}

export default function PollBubble({ poll, currentUserId, onUpdate }: Props) {
  const [busy, setBusy] = useState<number | null>(null);

  const isClosed = !!poll.closed_at;
  const isOwner = currentUserId === poll.created_by;
  const total = poll.total_votes || 0;

  const handleVote = async (idx: number) => {
    if (isClosed) return;
    const alreadyVoted = poll.my_votes.includes(idx);
    setBusy(idx);
    try {
      let res;
      if (alreadyVoted && poll.allow_multi) {
        // multi-choice unvote
        res = await api.delete(`/polls/${poll.id}/vote`, { params: { option_index: idx } });
      } else if (alreadyVoted && !poll.allow_multi) {
        // single-choice toggle off
        res = await api.delete(`/polls/${poll.id}/vote`, { params: { option_index: idx } });
      } else {
        res = await api.post(`/polls/${poll.id}/vote`, { option_index: idx });
      }
      onUpdate(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal voting");
    } finally {
      setBusy(null);
    }
  };

  const close = async () => {
    if (!confirm("Tutup poll ini? Tidak bisa dibuka lagi.")) return;
    try {
      const res = await api.post(`/polls/${poll.id}/close`);
      onUpdate(res.data);
      toast.success("Poll ditutup");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menutup poll");
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-secondary/20 p-4 max-w-md space-y-3">
      <div className="flex items-start gap-2">
        <BarChart3 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground leading-snug">{poll.question}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {poll.allow_multi ? "Pilihan ganda" : "Pilih satu"}
            {isClosed && " · DITUTUP"}
          </p>
        </div>
        {isClosed && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
      </div>

      <div className="space-y-1.5">
        {poll.options.map((opt, idx) => {
          const pct = total === 0 ? 0 : Math.round((opt.count / total) * 100);
          const voted = poll.my_votes.includes(idx);
          const leading = total > 0 && opt.count === Math.max(...poll.options.map((o) => o.count));
          return (
            <button
              key={idx}
              onClick={() => handleVote(idx)}
              disabled={isClosed || busy !== null}
              className={cn(
                "relative w-full text-left rounded-xl border transition-all overflow-hidden",
                voted
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40",
                (isClosed || busy !== null) && "cursor-default",
              )}
            >
              <div
                className={cn(
                  "absolute inset-y-0 left-0 transition-all",
                  voted ? "bg-primary/15" : leading && total > 0 ? "bg-secondary" : "bg-secondary/60",
                )}
                style={{ width: `${pct}%` }}
              />
              <div className="relative px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {voted && (
                    <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                  <span className={cn("text-xs font-semibold truncate", voted && "text-primary")}>
                    {opt.text}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[11px] font-bold text-muted-foreground">
                  <span>{opt.count}</span>
                  <span className="opacity-70">·</span>
                  <span>{pct}%</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-border/60 text-[10px] text-muted-foreground">
        <span className="font-semibold">
          {poll.unique_voters} {poll.unique_voters === 1 ? "voter" : "voters"} · {total} suara
        </span>
        {isOwner && !isClosed && (
          <button
            onClick={close}
            className="font-bold text-muted-foreground hover:text-red-600 transition-colors"
          >
            Tutup poll
          </button>
        )}
      </div>
    </div>
  );
}
