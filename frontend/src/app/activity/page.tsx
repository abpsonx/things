"use client";

import React, { useEffect, useState } from "react";

import api from "@/lib/api";
import { Activity, Clock, Loader2, History, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default function GlobalActivityPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGlobalLogs = async () => {
      try {
        const orgsRes = await api.get("/organizations");
        const orgs = orgsRes.data;
        
        const logPromises = orgs.map((org: any) => api.get(`/organizations/${org.id}/activity`));
        const results = await Promise.all(logPromises);
        
        const allLogs = results.flatMap((res: any) => res.data);
        // Sort by date descending
        allLogs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        setLogs(allLogs);
      } catch (err) {
        console.error("Failed to fetch global activity", err);
      } finally {
        setLoading(false);
      }
    };
    fetchGlobalLogs();
  }, []);

  return (
    <>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Activity className="w-8 h-8 text-primary" />
            Aktivitas Global
          </h1>
          <p className="text-muted-foreground">Lacak semua perubahan di seluruh workspace kamu.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length > 0 ? (
          <div className="space-y-4">
            {logs.map((log) => (
              <div key={log.id} className="p-4 bg-card border border-border rounded-2xl hover:border-primary/20 transition-all flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-secondary border border-border flex items-center justify-center flex-shrink-0">
                  <History className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm">
                    <span className="font-bold">{log.user.name}</span> melakukan <span className="font-medium italic">"{log.action}"</span> pada {log.entity_type}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1 font-bold text-primary uppercase tracking-tighter">
                      {log.metadata?.org_name || "Workspace"}
                    </span>
                    <span className="w-1 h-1 bg-muted-foreground/30 rounded-full"></span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(log.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 border border-dashed border-border rounded-3xl space-y-4">
            <Activity className="w-12 h-12 text-muted-foreground mx-auto opacity-20" />
            <h3 className="font-bold text-xl">Belum ada riwayat</h3>
            <p className="text-muted-foreground">Aktivitas tim akan muncul di sini secara otomatis.</p>
          </div>
        )}
      </div>
    </>
  );
}
