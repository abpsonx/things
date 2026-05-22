"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

export interface EditRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  requester?: { id: string; name: string; avatar_url?: string | null } | null;
}

export interface EditAccess {
  can_edit: boolean;
  can_approve: boolean;
  my_request: EditRequest | null;
  pending_requests: EditRequest[];
}

/**
 * Manages a task's edit-access: whether the current user can edit, their
 * pending request, and (for approvers) requests awaiting approval.
 */
export function useTaskEditAccess(taskId: string, isOpen: boolean) {
  const [access, setAccess] = useState<EditAccess | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get(`/tasks/${taskId}/edit-requests`);
      setAccess(res.data);
    } catch (err) {
      console.error("Failed to fetch edit access", err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (isOpen && taskId) refresh();
  }, [isOpen, taskId, refresh]);

  const requestEdit = useCallback(async () => {
    await api.post(`/tasks/${taskId}/edit-requests`);
    await refresh();
  }, [taskId, refresh]);

  const resolve = useCallback(async (requestId: string, action: "approve" | "reject") => {
    await api.post(`/tasks/${taskId}/edit-requests/${requestId}/${action}`);
    await refresh();
  }, [taskId, refresh]);

  // Optimistic default while loading: assume allowed (backend enforces anyway).
  const canEdit = access ? access.can_edit : true;

  return { access, canEdit, loading, refresh, requestEdit, resolve };
}
