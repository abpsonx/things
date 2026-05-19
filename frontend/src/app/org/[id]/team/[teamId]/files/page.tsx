"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Users, 
  FileText, 
  Download, 
  ExternalLink,
  Search,
  FileCode,
  FileImage,
  FileArchive,
  File as FileIcon,
  Loader2
} from "lucide-react";
import api from "@/lib/api";
import TeamNav from "@/components/team/TeamNav";

interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  uploaded_at: string;
  task_title: string;
  task_id: string;
}

export default function TeamFilesPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;

  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [team, setTeam] = useState<any>(null);

  useEffect(() => {
    fetchTeamAndFiles();
  }, [teamId]);

  const fetchTeamAndFiles = async () => {
    try {
      // Fetch team info
      const teamRes = await api.get(`/organizations/${orgId}/teams/${teamId}`);
      setTeam(teamRes.data);

      // Fetch all tasks for the team and extract attachments
      const tasksRes = await api.get(`/organizations/${orgId}/teams/${teamId}/tasks`);
      const allFiles: Attachment[] = [];
      
      tasksRes.data.forEach((task: any) => {
        if (task.attachments) {
          task.attachments.forEach((att: any) => {
            allFiles.push({
              ...att,
              task_title: task.title,
              task_id: task.id
            });
          });
        }
      });
      
      setFiles(allFiles.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()));
    } catch (err) {
      console.error("Failed to fetch team files", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredFiles = files.filter(f => 
    f.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.task_title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext || '')) return <FileImage className="w-5 h-5 text-blue-500" />;
    if (['pdf', 'doc', 'docx', 'txt'].includes(ext || '')) return <FileText className="w-5 h-5 text-red-500" />;
    if (['zip', 'rar', '7z'].includes(ext || '')) return <FileArchive className="w-5 h-5 text-orange-500" />;
    if (['js', 'ts', 'tsx', 'html', 'css', 'json'].includes(ext || '')) return <FileCode className="w-5 h-5 text-green-500" />;
    return <FileIcon className="w-5 h-5 text-gray-500" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center h-screen bg-[#fafafa]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#fafafa]">
      {/* Header */}
      <div className="border-b border-border px-8 py-5 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-500/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">{team?.name}</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Document Center</p>
            </div>
          </div>
        </div>

        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari file..."
            className="w-full pl-10 pr-4 py-2 bg-secondary/50 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="flex-1 p-8 max-w-6xl mx-auto w-full">
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-secondary/20 border-b border-border">
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Nama File</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Tugas</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Ukuran</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Tanggal</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {filteredFiles.length > 0 ? (
                  filteredFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-secondary/10 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center group-hover:bg-white transition-colors">
                            {getFileIcon(file.file_name)}
                          </div>
                          <span className="font-medium text-foreground">{file.file_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-muted-foreground">{file.task_title}</span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground italic">
                        {formatSize(file.file_size)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {new Date(file.uploaded_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a 
                            href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/${file.file_path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-all"
                            title="Buka File"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                          <a 
                            href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/${file.file_path}`}
                            download={file.file_name}
                            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-all"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="w-8 h-8 opacity-20" />
                        <p>Tidak ada file ditemukan</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
