"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import api from "@/lib/api";
import {
  Activity,
  History,
  User,
  ChevronRight,
  Clock,
  Loader2,
  FileText,
  Layout,
  MessageSquare,
  UserPlus,
  ArrowUpRight,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface Log {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  user: { name: string; email: string };
  metadata: any;
}

export default function ActivityLogPage() {
  const { id: orgId } = useParams();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/organizations/${orgId}/activity/export`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `activity-${orgId}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Audit log diunduh");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal export. Hanya owner/manager yang bisa.");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        // We'll need a backend endpoint for this. 
        // For now, let's assume it exists or use a mock if not yet implemented.
        const response = await api.get(`/organizations/${orgId}/activity`);
        setLogs(response.data);
      } catch (err) {
        console.error("Failed to fetch logs", err);
      } finally {
        setLoading(false);
      }
    };
    if (orgId) fetchLogs();
  }, [orgId]);

  const getActionIcon = (action: string) => {
    if (action.includes("task")) return <Layout className="w-4 h-4" />;
    if (action.includes("member")) return <UserPlus className="w-4 h-4" />;
    if (action.includes("comment")) return <MessageSquare className="w-4 h-4" />;
    if (action.includes("org")) return <FileText className="w-4 h-4" />;
    return <History className="w-4 h-4" />;
  };

  const getActionMessage = (log: Log) => {
    const name = <span className="font-bold">{log.user.name}</span>;
    const entity = <span className="font-medium text-primary italic">"{log.metadata?.title || log.metadata?.name || log.entity_type}"</span>;
    
    switch (log.action) {
      case "task_created": return <>{name} membuat tugas baru {entity}</>;
      case "task_moved": return <>{name} memindahkan {entity} ke <span className="font-bold">{log.metadata?.new_status}</span></>;
      case "member_added": return <>{name} menambahkan <span className="font-bold">{log.metadata?.email}</span> sebagai member</>;
      case "comment_added": return <>{name} memberikan komentar pada {entity}</>;
      case "project_created": return <>{name} membuat proyek {entity}</>;
      default: return <>{name} melakukan aksi <span className="font-bold">{log.action}</span> pada {log.entity_type}</>;
    }
  };

  return (
    <>
      <div className="space-y-8 w-full">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-foreground font-medium text-xs tracking-widest uppercase">Audit Trail</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                <Activity className="w-8 h-8 text-primary" />
                Riwayat Aktivitas
              </h1>
              <p className="text-muted-foreground mt-2">Lacak semua perubahan yang terjadi di workspace kamu.</p>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 shadow-md shadow-primary/20 transition-all shrink-0"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export CSV
            </button>
          </div>
        </div>

        {/* Logs List */}
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length > 0 ? (
          <div className="space-y-4">
            {logs.map((log) => (
              <div key={log.id} className="group p-4 bg-card border border-border rounded-2xl hover:border-primary/20 transition-all flex items-start gap-4 shadow-sm hover:shadow-md">
                <div className="w-10 h-10 rounded-xl bg-secondary border border-border flex items-center justify-center flex-shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                  {getActionIcon(log.action)}
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm leading-relaxed">
                    {getActionMessage(log)}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(log.created_at)}
                    </span>
                    <span className="w-1 h-1 bg-muted-foreground/30 rounded-full"></span>
                    <span className="uppercase tracking-widest font-bold">Ref ID: {log.id.slice(0, 8)}</span>
                  </div>
                </div>
                <button className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-primary transition-all">
                  <ArrowUpRight className="w-4 h-4" />
                </button>
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
