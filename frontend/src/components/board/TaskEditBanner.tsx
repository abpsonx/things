"use client";

import React, { useState } from "react";
import { Lock, Check, X, Clock } from "lucide-react";
import type { EditAccess } from "@/lib/useTaskEditAccess";

interface Props {
  access: EditAccess | null;
  onRequest: () => Promise<void>;
  onResolve: (requestId: string, action: "approve" | "reject") => Promise<void>;
}

export default function TaskEditBanner({ access, onRequest, onResolve }: Props) {
  const [busy, setBusy] = useState(false);
  if (!access) return null;

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {/* Approver view: requests waiting for me */}
      {access.can_approve && access.pending_requests.length > 0 && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-2">
          <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Permintaan izin edit</p>
          {access.pending_requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground truncate">
                {r.requester?.name || "Seseorang"} minta izin edit
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  disabled={busy}
                  onClick={() => wrap(() => onResolve(r.id, "approve"))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="w-3 h-3" /> Setuju
                </button>
                <button
                  disabled={busy}
                  onClick={() => wrap(() => onResolve(r.id, "reject"))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary text-foreground text-[11px] font-bold hover:bg-secondary/70 disabled:opacity-50"
                >
                  <X className="w-3 h-3" /> Tolak
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Non-editor view: locked + request access */}
      {!access.can_edit && (
        <div className="rounded-2xl border border-border bg-secondary/40 p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">
              Kamu hanya bisa mengubah status. Untuk mengedit isi task, minta izin ke pembuatnya.
            </span>
          </div>
          {access.my_request?.status === "pending" ? (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[11px] font-bold shrink-0">
              <Clock className="w-3 h-3" /> Menunggu persetujuan
            </span>
          ) : (
            <button
              disabled={busy}
              onClick={() => wrap(onRequest)}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold hover:bg-primary/90 disabled:opacity-50 shrink-0"
            >
              {access.my_request?.status === "rejected" ? "Minta izin lagi" : "Minta izin edit"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
