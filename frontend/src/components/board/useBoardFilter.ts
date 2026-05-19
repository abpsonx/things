"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type DueRange = "overdue" | "today" | "week" | null;

export interface BoardFilter {
  search: string;
  assigneeIds: string[];
  priorities: string[];
  labelIds: string[];
  dueRange: DueRange;
  mineOnly: boolean;
}

export const EMPTY_FILTER: BoardFilter = {
  search: "",
  assigneeIds: [],
  priorities: [],
  labelIds: [],
  dueRange: null,
  mineOnly: false,
};

export interface SavedView {
  id: string;
  name: string;
  filter: BoardFilter;
}

const storageKey = (boardKey: string) => `things:saved-views:${boardKey}`;

export function isFilterActive(f: BoardFilter): boolean {
  return (
    !!f.search ||
    f.assigneeIds.length > 0 ||
    f.priorities.length > 0 ||
    f.labelIds.length > 0 ||
    f.dueRange !== null ||
    f.mineOnly
  );
}

function inDueRange(dueAt: Date, range: DueRange): boolean {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(startOfDay);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  if (range === "overdue") return dueAt < startOfDay;
  if (range === "today") return dueAt >= startOfDay && dueAt <= endOfDay;
  if (range === "week") return dueAt >= startOfDay && dueAt <= endOfWeek;
  return true;
}

interface FilterableTask {
  title?: string;
  description?: string | null;
  assignee_id?: string | null;
  priority?: string | null;
  due_date?: string | null;
  labels?: { id: string }[] | null;
}

export function applyBoardFilter<T extends FilterableTask>(
  tasks: T[],
  f: BoardFilter,
  currentUserId?: string,
): T[] {
  const q = f.search.trim().toLowerCase();
  return tasks.filter((t) => {
    if (q) {
      const hay = `${t.title || ""} ${t.description || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.mineOnly) {
      if (!currentUserId || t.assignee_id !== currentUserId) return false;
    } else if (f.assigneeIds.length > 0) {
      if (!t.assignee_id || !f.assigneeIds.includes(t.assignee_id)) return false;
    }
    if (f.priorities.length > 0) {
      if (!t.priority || !f.priorities.includes(t.priority)) return false;
    }
    if (f.labelIds.length > 0) {
      const ids = (t.labels || []).map((l) => l.id);
      if (!f.labelIds.some((id) => ids.includes(id))) return false;
    }
    if (f.dueRange) {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      if (isNaN(d.getTime())) return false;
      if (!inDueRange(d, f.dueRange)) return false;
    }
    return true;
  });
}

export function useBoardFilter(boardKey: string) {
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(boardKey));
      if (raw) setSavedViews(JSON.parse(raw));
    } catch {
      // ignore corrupt storage
    }
  }, [boardKey]);

  const persistViews = useCallback(
    (views: SavedView[]) => {
      setSavedViews(views);
      try {
        localStorage.setItem(storageKey(boardKey), JSON.stringify(views));
      } catch {
        // ignore quota errors
      }
    },
    [boardKey],
  );

  const saveView = useCallback(
    (name: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      persistViews([...savedViews, { id, name, filter }]);
    },
    [filter, savedViews, persistViews],
  );

  const applyView = useCallback((v: SavedView) => setFilter(v.filter), []);

  const deleteView = useCallback(
    (id: string) => persistViews(savedViews.filter((v) => v.id !== id)),
    [savedViews, persistViews],
  );

  const resetFilter = useCallback(() => setFilter(EMPTY_FILTER), []);

  const active = useMemo(() => isFilterActive(filter), [filter]);

  return {
    filter,
    setFilter,
    resetFilter,
    active,
    savedViews,
    saveView,
    applyView,
    deleteView,
  };
}
