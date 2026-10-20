// Source: https://r.assistant-ui.com/conversation-map.json (assistant-ui, MIT).
"use client";
/* eslint-disable react-hooks/refs -- Upstream caches immutable runtime message projections; DOM refs are read in effects and handlers. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuiState, useThreadViewport } from "@assistant-ui/react";
import type { ThreadMessage } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/components/PreferencesProvider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/hero-ui/popover";
import { ListOrdered } from "lucide-react";
import { ConversationMap } from "./conversation-map";

import { projectConversation, readingLine, sameIds, type ConversationProjection } from "../utils/conversation-map";

function useConversationProjection(messages: readonly ThreadMessage[]) {
  const cacheRef = useRef<ConversationProjection | undefined>(undefined);
  const cached = cacheRef.current;
  const projection =
    cached?.messages === messages
      ? cached
      : projectConversation(messages, cached);

  useEffect(() => {
    cacheRef.current = projection;
  }, [projection]);
  return projection;
}

export function ConversationMapAui({
  side = "left",
  className,
}: {
  side?: "left" | "right";
  className?: string;
}) {
  const { t } = usePreferences();
  const [compactOpen, setCompactOpen] = useState(false);
  const compactTriggerRef = useRef<HTMLButtonElement>(null);
  const messages = useAuiState((s) => s.thread.messages);
  const viewport = useThreadViewport((s) => s.element.viewport);
  const viewportHeight = useThreadViewport((s) => s.height.viewport);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [visibleIds, setVisibleIds] = useState<readonly string[]>([]);
  const scheduleRef = useRef<(() => void) | undefined>(undefined);

  const { entries, turnOf, turnKey } = useConversationProjection(messages);

  const turnOfRef = useRef(turnOf);

  useEffect(() => {
    turnOfRef.current = turnOf;
  });

  useEffect(() => {
    if (!viewport) return undefined;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const owners = turnOfRef.current;
      const view = viewport.getBoundingClientRect();
      const line = readingLine(viewport);

      // One pass yields both facts the rail draws: which turn is being read,
      // and which turns the viewport currently holds.
      let current: string | undefined;
      const onScreen: string[] = [];
      for (const element of viewport.querySelectorAll<HTMLElement>(
        "[data-message-id]",
      )) {
        const box = element.getBoundingClientRect();
        if (box.top >= view.bottom) break;

        const id = element.dataset["messageId"];
        const head = id === undefined ? undefined : owners.get(id);
        if (head === undefined) continue;

        if (box.top <= line) current = head;
        if (box.bottom > view.top && !onScreen.includes(head)) {
          onScreen.push(head);
        }
      }

      setActiveId(current ?? owners.values().next().value);
      setVisibleIds((previous) =>
        sameIds(previous, onScreen) ? previous : onScreen,
      );
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    scheduleRef.current = schedule;
    schedule();
    viewport.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    for (const element of viewport.querySelectorAll<HTMLElement>("[data-message-id]")) observer.observe(element);
    const mutationObserver = new MutationObserver(() => {
      for (const element of viewport.querySelectorAll<HTMLElement>("[data-message-id]")) observer.observe(element);
      schedule();
    });
    const messageColumn = viewport.querySelector(".aui-conversation-messages");
    if (messageColumn) mutationObserver.observe(messageColumn, { subtree: true, childList: true, characterData: true });

    return () => {
      scheduleRef.current = undefined;
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", schedule);
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [viewport]);

  useEffect(() => {
    scheduleRef.current?.();
  }, [turnKey]);

  const select = useCallback(
    (id: string) => {
      if (!viewport) return;
      for (const element of viewport.querySelectorAll<HTMLElement>(
        "[data-message-id]",
      )) {
        if (element.dataset["messageId"] !== id) continue;

        // `scrollIntoView` aligns every scrollable ancestor, which drags the
        // page a thread is embedded in; only this viewport should move.
        const top =
          element.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          viewport.scrollTop;
        viewport.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
        return;
      }
    },
    [viewport],
  );

  if (!entries.length) return null;

  return (
    <div
      data-slot="conversation-map-rail"
      className={cn(
        "pointer-events-none sticky top-0 z-10 h-0 w-full",
        className,
      )}
    >
      <div
        className={cn(
          "conversationMapGutter pointer-events-auto absolute top-0 px-3 py-10",
          side === "right" ? "right-0" : "left-0",
        )}
        style={{ height: viewportHeight }}
      >
        <ConversationMap
          entries={entries}
          activeId={activeId}
          visibleIds={visibleIds}
          onSelect={select}
          side={side === "right" ? "left" : "right"}
        />
      </div>
      <div className="conversationMapCompact">
        <Popover open={compactOpen} onOpenChange={setCompactOpen}>
          <PopoverTrigger asChild>
            <button ref={compactTriggerRef} type="button" aria-label={t("会话轮次导航")} title={t("会话轮次导航")}><ListOrdered size={17} /></button>
          </PopoverTrigger>
          <PopoverContent className="conversationMapCompactList" align="end" sideOffset={8}>
            <div className="conversationMapCompactHeading">{t("会话轮次")} · {entries.length}</div>
            <nav aria-label={t("会话轮次导航")}>{entries.map((entry, index) => <button key={entry.id} type="button" aria-current={entry.id === activeId ? "true" : undefined} onClick={() => { select(entry.id); setCompactOpen(false); }}><span>{index + 1}</span><span>{entry.title}</span></button>)}</nav>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
