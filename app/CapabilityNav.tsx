"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Blocks, Bot, ChevronRight, GitBranch, Plug, Zap } from "lucide-react";
import { Popover } from "@heroui/react";
import { usePreferences } from "@/components/PreferencesProvider";
import type { CapabilityTab } from "./StudioConsole";

const tabs = [
  { key: "agent", label: "智能体", icon: Bot },
  { key: "skill", label: "技能", icon: Zap },
  { key: "workflow", label: "工作流", icon: GitBranch },
  { key: "mcp", label: "连接器", icon: Plug },
] as const;

export function CapabilityNav({ active, value, onNavigate }: {
  active: boolean;
  value: CapabilityTab;
  onNavigate: (tab?: CapabilityTab) => void;
}) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const keyboardOpen = useRef(false);
  const id = useId();
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const show = () => { cancelClose(); setOpen(true); };
  const hide = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (!content.current?.contains(document.activeElement)) setOpen(false);
    }, 160);
  };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  useEffect(() => { if (open && keyboardOpen.current) { requestAnimationFrame(() => { content.current?.querySelector<HTMLButtonElement>("button")?.focus(); keyboardOpen.current = false; }); } }, [open]);

  return <>
      <button ref={trigger} type="button" className={`navItem${active ? " active" : ""}`}
        aria-expanded={open} aria-controls={open ? id : undefined}
        onPointerEnter={event => { if (event.pointerType !== "touch") show(); }}
        onPointerLeave={hide}
        onKeyDown={event => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            if (open) content.current?.querySelector<HTMLButtonElement>("button")?.focus();
            else { keyboardOpen.current = true; show(); }
          }
        }}
        onClick={() => { cancelClose(); setOpen(false); onNavigate(); }}>
        <span className="navIcon"><Blocks /></span><span>{t("能力市场")}</span>
        <ChevronRight size={14} className="capabilityNavArrow" />
      </button>
    <Popover.Content isOpen={open} onOpenChange={setOpen} triggerRef={trigger} ref={content} placement="right top" offset={8} isNonModal
      className="xixiDropdownPopup capabilityNavPopup" aria-label={t("能力市场")}
      onPointerEnter={cancelClose} onPointerLeave={hide}
      >
      <div id={id} onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
      }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <nav aria-label={t("能力市场")}>
        {tabs.map(({ key, label, icon: Icon }) => <button type="button" key={key}
          className={`capabilityNavOption${value === key ? " selected" : ""}`}
          aria-current={active && value === key ? "page" : undefined}
          onClick={() => { cancelClose(); setOpen(false); onNavigate(key); }}>
          <Icon size={16} /><span>{t(label)}</span>
        </button>)}
      </nav></div>
    </Popover.Content>
  </>;
}
