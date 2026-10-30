"use client";

import { useEffect, useId, useRef, useState } from "react";
import { StudioButton } from "./StudioControls";
import { Blocks, Bot, Check, ChevronRight, GitBranch, Plug, Zap } from "lucide-react";
import { Popover } from "@heroui/react";
import { usePreferences } from "@/components/PreferencesProvider";
import type { CapabilityTab } from "./StudioConsole";
import s from "./capability-nav.module.css";

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
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const frame=requestAnimationFrame(()=>{
      const current=content.current?.querySelector<HTMLButtonElement>('[aria-current="page"]');
      (current??content.current?.querySelector<HTMLButtonElement>('button'))?.focus();
    });
    return ()=>cancelAnimationFrame(frame);
  },[open]);
  const close=()=>{setOpen(false);trigger.current?.focus();};
  return <>
    <StudioButton ref={trigger} type="button" className={`navItem${active ? " active" : ""}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onKeyDown={event=>{if(event.key==="ArrowRight"||event.key==="ArrowDown"){event.preventDefault();setOpen(true);}if(event.key==="Escape")close();}}
      onClick={()=>setOpen(!open)}>
      <span className="navIcon"><Blocks /></span><span>{t("能力市场")}</span>
      <ChevronRight size={14} className={s.arrow}/>
    </StudioButton>
    <Popover.Content isOpen={open} onOpenChange={setOpen} triggerRef={trigger} ref={content} placement="right top" offset={10} isNonModal className={s.popup}>
      <Popover.Dialog id={id} aria-label={t("能力市场分类")} className={s.dialog}><nav className={s.options} aria-label={t("能力市场分类")} onKeyDown={event=>{
        if(event.key==="ArrowLeft"||event.key==="Escape"){event.preventDefault();event.stopPropagation();close();return;}
        if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
        const buttons=Array.from(content.current?.querySelectorAll<HTMLButtonElement>('button')??[]);
        const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next=event.key==="Home"?0:event.key==="End"?buttons.length-1:(index+(event.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length;
        event.preventDefault();buttons[next]?.focus();
      }}>
        {tabs.map(({key,label,icon:Icon})=><StudioButton type="button" key={key} className={s.option} aria-current={active&&value===key?"page":undefined} onClick={()=>{close();onNavigate(key);}}><Icon size={16}/><span>{t(label)}</span>{active&&value===key&&<Check size={13} className={s.check}/>}</StudioButton>)}</nav>
      </Popover.Dialog>
    </Popover.Content>
  </>;
}
