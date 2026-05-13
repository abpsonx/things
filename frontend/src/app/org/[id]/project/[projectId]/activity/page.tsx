"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { 
  Activity, 
  History, 
  Clock, 
  Loader2,
  FileText,
  Layout,
  MessageSquare,
  UserPlus,
  ArrowUpRight
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Log {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  user: { name: string; email: string };
  metadata: any;
}

export default function ProjectActivityPage() {
  const { id: orgId, projectId } = useParams();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await api.get(`/organizations/${orgId}/projects/${projectId}/activity`);
        setLogs(response.data);
      } catch (err) {
        console.error("Failed to fetch logs", err);
      } finally {
        setLoading(false);
      }
    };
    if (orgId && projectId) fetchLogs();
  }, [orgId, projectId]);

  const getActionIcon = (action: string) => {
    if (action.includes("task")) return <Layout className="w-4 h-4" />;
    if (action.includes("member")) return <UserPlus className="w-4 h-4" />;
    if (action.includes("comment")) return <MessageSquare className="w-4 h-4" />;
    if (action.includes("doc")) return <FileText className="w-4 h-4" />;
    if (action.includes("project")) return <Activity className="w-4 h-4" />;
    return <History className="w-4 h-4" />;
  };

  const getActionMessage = (log: Log) => {
    const name = <span className="font-bold">{log.user.name}</span>;
    const entity = <span className="font-medium text-primary italic">"{log.metadata?.title || log.metadata?.name || log.entity_type}"</span>;
    
    switch (log.action) {
      case "task_created": return <>{name} membuat tugas baru {entity}</>;
      case "task_moved": return <>{name} memindahkan {entity} ke <span className="font-bold">{log.metadata?.new_status || log.metadata?.status}</span></>;
      case "member_added": return <>{name} menambahkan member ke project</>;
      case "comment_added": return <>{name} memberikan komentar pada {entity}</>;
      case "project_created": return <>{name} membuat proyek {entity}</>;
      case "project_updated": return <>{name} memperbarui detail proyek</>;
      case "doc_created": return <>{name} membuat dokumen baru {entity}</>;
      case "doc_updated": return <>{name} memperbarui dokumen {entity}</>;
      default: return <>{name} melakukan aksi <span className="font-bold">{log.action}</span> pada {log.entity_type}</>;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Audit Trail Proyek
          </h2>
          <p className="text-sm text-muted-foreground">Log aktivitas real-time untuk project ini.</p>
        </div>
      </div>

      {logs.length > 0 ? (
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
          <h3 className="font-bold text-xl">Belum ada aktivitas</h3>
          <p className="text-muted-foreground">Semua aksi tim di project ini akan terekam di sini.</p>
        </div>
      )}
    </div>
  );
}
