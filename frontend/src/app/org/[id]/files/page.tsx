"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { 
  Folder, 
  FileText, 
  Image as ImageIcon, 
  File, 
  Download, 
  Search, 
  Filter, 
  MoreVertical, 
  Loader2,
  Eye,
  Calendar,
  Link as LinkIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function FileCenterPage() {
  const { id: orgId } = useParams();
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const handleCopyLink = (path: string) => {
    navigator.clipboard.writeText(path);
    alert("Link berhasil disalin ke clipboard!");
  };

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const res = await api.get(`/organizations/${orgId}/files`);
        setFiles(res.data);
      } catch (err) {
        console.error("Failed to fetch files", err);
      } finally {
        setLoading(false);
      }
    };

    if (orgId) fetchFiles();
  }, [orgId]);

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) return <ImageIcon className="w-5 h-5 text-emerald-500" />;
    if (["pdf"].includes(ext || "")) return <FileText className="w-5 h-5 text-rose-500" />;
    if (["doc", "docx", "txt"].includes(ext || "")) return <FileText className="w-5 h-5 text-blue-500" />;
    return <File className="w-5 h-5 text-muted-foreground" />;
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const filteredFiles = files.filter(f => 
    f.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.context.parent.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.context.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm font-medium text-muted-foreground italic">Mencari semua aset kantor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Folder className="w-8 h-8 text-primary" />
            File Center
          </h1>
          <p className="text-muted-foreground text-sm">
            Akses semua dokumen, gambar, dan aset tim dalam satu tempat.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input 
              type="text" 
              placeholder="Cari nama file atau proyek..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-secondary/30 border border-border rounded-2xl w-64 md:w-80 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <button className="p-2.5 border border-border rounded-2xl hover:bg-secondary transition-colors" title="Filter Pencarian">
            <Filter className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/20 border-b border-border">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Nama File</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Konteks / Sumber</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Uploader</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Ukuran</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredFiles.length > 0 ? (
                filteredFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-secondary/10 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-secondary/50 rounded-xl flex items-center justify-center">
                          {getFileIcon(file.file_name)}
                        </div>
                        <div className="flex-1 min-w-[300px]">
                          <div className="flex items-center gap-2">
                             <p className="text-sm font-bold truncate">{file.file_name}</p>
                             <span className={cn(
                               "text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                               file.source === "Task" ? "bg-blue-500/10 text-blue-500" :
                               file.source === "Chat" ? "bg-emerald-500/10 text-emerald-500" :
                               "bg-purple-500/10 text-purple-500"
                             )}>
                               {file.source}
                             </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {new Date(file.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-primary">{file.context.parent}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{file.context.name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden text-[8px] font-bold">
                          {file.uploader.avatar_url ? (
                            <img src={file.uploader.avatar_url} alt={file.uploader.name} className="w-full h-full object-cover" />
                          ) : (
                            file.uploader.name.charAt(0)
                          )}
                        </div>
                        <span className="text-xs font-medium">{file.uploader.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono text-muted-foreground">{formatSize(file.file_size)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <a 
                          href={file.file_path} 
                          target="_blank"
                          className="p-2 hover:bg-primary/10 text-primary rounded-xl transition-all"
                          title="Lihat File"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                        <a 
                          href={file.file_path} 
                          download={file.file_name}
                          className="p-2 hover:bg-emerald-500/10 text-emerald-500 rounded-xl transition-all"
                          title="Download File"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button 
                          onClick={() => handleCopyLink(file.file_path)}
                          className="p-2 hover:bg-secondary rounded-xl transition-all"
                          title="Salin Link File"
                        >
                          <LinkIcon className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <Folder className="w-12 h-12 opacity-20" />
                      <p className="text-sm italic">Tidak ada file yang ditemukan.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Storage Summary */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="p-6 border border-border rounded-3xl bg-emerald-500/5 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-600">Total File</h4>
          <p className="text-2xl font-bold">{files.length}</p>
          <p className="text-[10px] text-muted-foreground">Aset dari Task, Chat, & DM.</p>
        </div>
        <div className="p-6 border border-border rounded-3xl bg-blue-500/5 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-blue-600">Total Ukuran</h4>
          <p className="text-2xl font-bold">{formatSize(files.reduce((acc, f) => acc + (f.file_size || 0), 0))}</p>
          <p className="text-[10px] text-muted-foreground">Penggunaan ruang penyimpanan saat ini.</p>
        </div>
        <div className="p-6 border border-border rounded-3xl bg-orange-500/5 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-orange-600">Sumber Aktif</h4>
          <p className="text-2xl font-bold">{new Set(files.map(f => f.context.parent)).size}</p>
          <p className="text-[10px] text-muted-foreground">Kontribusi dari Proyek & Chat.</p>
        </div>
      </div>
    </div>
  );
}
