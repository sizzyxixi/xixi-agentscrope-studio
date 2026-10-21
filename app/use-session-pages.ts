"use client";

import { useEffect, useRef, useState } from "react";

export const sessionGroups = ["recent", "automation"] as const;
export type SessionGroup = typeof sessionGroups[number];
type Page = { limit: number; hasMore: boolean; loading: boolean; expanded: boolean; error: boolean };
const initialPages = (): Record<SessionGroup, Page> => ({
  recent: { limit: 10, hasMore: false, loading: false, expanded: false, error: false },
  automation: { limit: 10, hasMore: false, loading: false, expanded: false, error: false },
});

/** Keep page requests scoped to the account/search that started them. */
export function useSessionPages<T>({ token, search, onPage }: {
  token: string; search: string; onPage: (sessions: T[]) => void;
}) {
  const [pages, setPages] = useState(initialPages);
  const [revision, setRevision] = useState(0);
  const state = useRef(pages);
  const receive = useRef(onPage);
  const scope = useRef<{ controller: AbortController; pending: Set<SessionGroup>; initialized: Set<SessionGroup> } | null>(null);
  useEffect(() => { receive.current = onPage; });
  const update = (group: SessionGroup, patch: Partial<Page>) => {
    state.current = { ...state.current, [group]: { ...state.current[group], ...patch } };
    setPages(state.current);
  };

  useEffect(() => {
    const controller = new AbortController();
    const current = { controller, pending: new Set<SessionGroup>(), initialized: new Set<SessionGroup>() };
    scope.current = current;
    const reset = initialPages();
    if (token) for (const group of sessionGroups) reset[group].loading = true;
    state.current = reset;
    window.queueMicrotask(() => { if (!controller.signal.aborted) setPages(state.current); });
    const query = async (group: SessionGroup, refresh = false) => {
      if (!token || current.pending.has(group)) return;
      current.pending.add(group);
      if (!refresh) update(group, { loading: true });
      try {
        const params = new URLSearchParams({ group, summary: "true", limit: "10", search: search.trim() });
        const response = await fetch(`/api/agent/sessions?${params}`, {
          headers: { authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        if (!response.ok) throw new Error("Cannot load sessions");
        const result = await response.json() as { sessions: T[]; has_more: boolean };
        if (controller.signal.aborted) return;
        receive.current(result.sessions);
        update(group, { ...(state.current[group].limit === 10 ? { hasMore: result.has_more } : {}), error: false });
      } catch {
        if (!controller.signal.aborted) update(group, { error: true });
      } finally {
        current.pending.delete(group);
        current.initialized.add(group);
        if (!controller.signal.aborted) update(group, { loading: false });
      }
    };
    const start = window.setTimeout(() => {
      for (const group of sessionGroups) void query(group);
    }, search ? 250 : 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") for (const group of sessionGroups) void query(group, true);
    }, 10000);
    return () => { controller.abort(); window.clearTimeout(start); window.clearInterval(interval); };
  }, [token, search, revision]);

  const loadMore = async (group: SessionGroup, offset: number) => {
    const current = scope.current;
    if (!token) {
      update(group, { limit: offset + 20, expanded: true, hasMore: false });
      return;
    }
    if (!current || current.controller.signal.aborted || current.pending.has(group) || !current.initialized.has(group)) return;
    current.pending.add(group);
    update(group, { loading: true });
    try {
      const params = new URLSearchParams({ group, summary: "true", limit: "20", offset: String(offset), search: search.trim() });
      const response = await fetch(`/api/agent/sessions?${params}`, {
        headers: { authorization: `Bearer ${token}` }, signal: current.controller.signal,
      });
      if (!response.ok) throw new Error("Cannot load sessions");
      const result = await response.json() as { sessions: T[]; has_more: boolean };
      if (current.controller.signal.aborted) return;
      receive.current(result.sessions);
      update(group, { limit: offset + result.sessions.length, hasMore: result.has_more, expanded: true, error: false });
    } catch {
      if (!current.controller.signal.aborted) update(group, { error: true });
    } finally {
      current.pending.delete(group);
      if (!current.controller.signal.aborted) update(group, { loading: false });
    }
  };

  return { pages, loadMore, refresh: () => setRevision(value => value + 1) };
}
