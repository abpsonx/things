'use client';

import React, { useState, useEffect } from 'react';
import { Plus, X, FolderRoot, Building2, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialOrgId?: string;
}

export default function CreateProjectModal({ isOpen, onClose, onSuccess, initialOrgId }: CreateProjectModalProps) {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState(initialOrgId || '');
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingOrgs, setFetchingOrgs] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchOrgs();
    }
  }, [isOpen]);

  const fetchOrgs = async () => {
    setFetchingOrgs(true);
    try {
      const res = await api.get('/organizations');
      setOrgs(res.data);
      if (!selectedOrgId && res.data.length > 0) {
        setSelectedOrgId(res.data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch orgs', err);
    } finally {
      setFetchingOrgs(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !selectedOrgId) return;

    setLoading(true);
    try {
      await api.post(`/organizations/${selectedOrgId}/projects`, { name: projectName });
      setProjectName('');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to create project', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <FolderRoot className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Buat Proyek Baru</h2>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Setup Workspace Anda</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-foreground ml-1">Pilih Workspace</label>
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none bg-slate-50/30"
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                disabled={fetchingOrgs}
              >
                {fetchingOrgs ? (
                  <option>Loading workspace...</option>
                ) : (
                  orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-foreground ml-1">Nama Proyek</label>
            <input
              autoFocus
              type="text"
              className="w-full px-4 py-3 rounded-2xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-slate-50/30"
              placeholder="Contoh: Website Redesign 2024"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              required
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl font-bold text-muted-foreground hover:bg-slate-100 transition-all"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !projectName.trim() || !selectedOrgId}
              className="flex-1 py-3 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              Buat Proyek
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
