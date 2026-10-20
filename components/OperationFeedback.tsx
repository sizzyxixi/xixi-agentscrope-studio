"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { Toast, ToastQueue } from "@heroui/react";
import { CircleCheck, CircleX, Info, LoaderCircle, CircleAlert } from "lucide-react";
import { usePreferences } from "./PreferencesProvider";
import { EMPTY_FEEDBACK, FeedbackStore, feedbackKind, type FeedbackKind } from "@/lib/feedback-store";

const FeedbackContext = createContext<FeedbackStore | null>(null);
const serverSnapshot = () => EMPTY_FEEDBACK;

export function OperationFeedbackProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new FeedbackStore());
  const [queue] = useState(() => new ToastQueue<{ id: string; message: string; kind: FeedbackKind }>({ exitDuration: 180 }));
  const queued = useRef(new Map<string, { key: string; sequence: number }>());
  const [mounted, setMounted] = useState(false);
  const messages = useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
  const { t } = usePreferences();
  useEffect(() => { queueMicrotask(() => setMounted(true)); return store.dispose; }, [store]);
  useEffect(() => {
    let reporting = false;
    const onInvalid = (event: Event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return;
      event.preventDefault();
      // A submit can invalidate several controls; announce and focus the first.
      if (reporting) return;
      reporting = true;
      setTimeout(() => { reporting = false; }, 0);
      const label = (field.getAttribute("aria-label") || field.labels?.[0]?.textContent || "必填项").replace(/\s*\*\s*/g, "").trim();
      const message = field.validity.valueMissing ? `请填写${label}。` : field.validationMessage;
      store.publish(message, "warning", "form-validation");
      field.focus();
    };
    document.addEventListener("invalid", onInvalid, true);
    return () => document.removeEventListener("invalid", onInvalid, true);
  }, [store]);
  useEffect(() => {
    const active = new Set(messages.map(message => message.id));
    for (const [id, entry] of queued.current) if (!active.has(id)) { queue.close(entry.key); queued.current.delete(id); }
    for (const message of messages) {
      const existing = queued.current.get(message.id);
      if (existing?.sequence === message.sequence) continue;
      const content = { id: message.id, message: message.message, kind: message.kind };
      if (existing && queue.update(existing.key, content)) { existing.sequence = message.sequence; continue; }
      const key = queue.add(content, { onClose: () => store.dismiss(message.id) });
      queued.current.set(message.id, { key, sequence: message.sequence });
    }
  }, [messages, queue, store]);
  return <FeedbackContext.Provider value={store}>{children}{mounted && createPortal(
    <Toast.Provider queue={queue} placement="top" isExpanded maxVisibleToasts={5} width="min(640px, calc(100vw - 32px))" className="heroFeedbackRegion" aria-label={t("操作提示")}>
      {({ toast }) => {
        const message = toast.content;
        const Icon = { success: CircleCheck, error: CircleX, info: Info, warning: CircleAlert, loading: LoaderCircle, plain: null }[message.kind];
        const variant = message.kind === "error" ? "danger" : message.kind === "success" || message.kind === "warning" ? message.kind : "default";
        return <Toast toast={toast} variant={variant} className={`operationToast operationToast--${message.kind}`} data-feedback-id={message.id} data-feedback-kind={message.kind}>
          {Icon && <Toast.Indicator><Icon size={18} className="operationToastIcon" aria-hidden="true" /></Toast.Indicator>}
          <Toast.Content><Toast.Title className="operationToastText">{t(message.message)}</Toast.Title></Toast.Content>
        </Toast>;
      }}
    </Toast.Provider>, document.body,
  )}</FeedbackContext.Provider>;

}

function useFeedbackStore() {
  const store = useContext(FeedbackContext);
  if (!store) throw new Error("OperationFeedbackProvider is required.");
  return store;
}

export function useToast() {
  const store = useFeedbackStore();
  return useMemo(() => ({
    info: (message: string, id?: string) => store.publish(message, "info", id),
    success: (message: string, id?: string) => store.publish(message, "success", id),
    error: (message: string, id?: string) => store.publish(message, "error", id),
    warning: (message: string, id?: string) => store.publish(message, "warning", id),
    loading: (message: string, id?: string) => store.publish(message, "loading", id),
    dismiss: store.dismiss,
  }), [store]);
}

/** Preserve error state used by retry controls, while presenting feedback globally. */
export function useFeedbackState(kind: FeedbackKind | "auto" = "error", deduplicate = false): [string, Dispatch<SetStateAction<string>>] {
  const store = useFeedbackStore();
  const id = useId();
  const [message, setMessage] = useState("");
  const current = useRef("");
  const setFeedback = useCallback<Dispatch<SetStateAction<string>>>(action => {
    const next = typeof action === "function" ? action(current.current) : action;
    const repeated = next === current.current;
    current.current = next;
    setMessage(next);
    if (next && !(deduplicate && repeated)) store.publish(next, kind === "auto" ? feedbackKind(next) : kind, id);
  }, [store, id, kind, deduplicate]);
  return [message, setFeedback];
}
