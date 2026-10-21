"use client";

import { useRef, useState, type ReactNode } from "react";
import { Download, Pencil } from "lucide-react";
import { Hint } from "@/components/hero-ui/tooltip";
import { usePreferences } from "@/components/PreferencesProvider";
import { AgentAvatar } from "./AgentAvatar";

export function ConversationHeader({ title, agentName, agentAvatar, disabled, navigation, fileToggle, onRename, onExport }: {
  title: string; agentName: string; agentAvatar?: string; disabled: boolean;
  navigation: ReactNode; fileToggle: ReactNode;
  onRename: (title: string) => Promise<boolean>; onExport: () => void;
}) {
  const { t } = usePreferences();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const saving = useRef(false);
  const cancelled = useRef(false);
  const save = async () => {
    if (saving.current || cancelled.current) return;
    if (draft.trim() === title) { setEditing(false); return; }
    saving.current = true;
    try { if (await onRename(draft)) setEditing(false); }
    finally { saving.current = false; }
  };
  return <header className="conversationHeader">
    <div className="conversationHeaderIdentity">
      {navigation}
      <div className="conversationHeaderAgent"><AgentAvatar value={agentAvatar} className="conversationHeaderAvatar" /><span>{agentName}</span></div>
      <span className="conversationHeaderDivider" aria-hidden="true" />
      {editing ? <form className="conversationTitleForm" onSubmit={event => { event.preventDefault(); void save(); }}>
        <input autoFocus aria-label={t("会话标题")} maxLength={100} value={draft} disabled={disabled} onFocus={event => event.currentTarget.select()} onChange={event => setDraft(event.target.value)} onBlur={() => void save()} onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); cancelled.current = true; setEditing(false); }
        }} />
      </form> : <button type="button" className="conversationTitleButton" aria-label={t("编辑会话标题")} disabled={disabled} onClick={() => { cancelled.current = false; setDraft(title); setEditing(true); }}>
        <span>{title}</span><Pencil size={14} aria-hidden="true" />
      </button>}
    </div>
    <div className="conversationHeaderActions"><Hint content={t("导出会话")}><button type="button" className="iconButton" aria-label={t("导出会话")} onClick={onExport}><Download size={18} /></button></Hint>{fileToggle}</div>
  </header>;
}
