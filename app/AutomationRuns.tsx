"use client";

import { CheckCircle2, Clock3, CircleX, CircleSlash, ShieldQuestion, Trash2 } from "lucide-react";
import { usePreferences } from "@/components/PreferencesProvider";
import { AutomationRow, AutomationRowMenu } from "./AutomationRow";
import { DropdownMenuItem } from "@/components/hero-ui/dropdown-menu";

export type AutomationRun = {
  kind?: string;
  id: string;
  name: string;
  resource_id: string;
  session_id: string;
  status: string;
  detail: string;
  created_at: string;
};
const states = {
  success: { label: "成功", icon: CheckCircle2 },
  running: { label: "执行中", icon: Clock3 },
  failed: { label: "失败", icon: CircleX },
  waiting_approval: { label: "等待确认", icon: ShieldQuestion },
  interrupted: { label: "已中断", icon: CircleSlash },
};

function runTime(value: string, language: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { label: "—", full: "—" };
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const locale = language === "en" ? "en-US" : "zh-CN";
  return {
    label: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(!sameDay ? { month: "2-digit", day: "2-digit", ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) } : {}) }).format(date),
    full: date.toLocaleString(locale),
  };
}

export function AutomationRuns({ runs, busyId, onOpenSession, onDelete }: {
  runs: AutomationRun[];
  busyId: string;
  onOpenSession: (id: string) => void;
  onDelete: (run: AutomationRun) => void;
}) {
  const { t, language } = usePreferences();
  return <ul className="automationRunList" aria-label={t("运行记录")}>
    {runs.map(run => {
      const state = states[run.status as keyof typeof states] ?? { label: run.status, icon: CircleSlash };
      const Icon = state.icon;
      const time = runTime(run.created_at, language);
      const active = run.status === "running" || run.status === "waiting_approval";
      return <AutomationRow key={run.id} className="automationRunRow" actions={
        <AutomationRowMenu label={`${t("更多操作")}：${run.name}`} disabled={busyId === run.id}>
          <DropdownMenuItem disabled={active || busyId === run.id} className="automationRunDelete" title={active ? t("执行中或等待确认的记录暂不可删除") : undefined} onSelect={() => onDelete(run)}><Trash2 size={14} />{t("删除")}</DropdownMenuItem>
        </AutomationRowMenu>
      }>
        <button type="button" className="automationRowOpen automationRunOpen" disabled={!run.session_id || busyId === run.id}
          aria-label={`${run.name} · ${t(state.label)} · ${time.full}${run.session_id ? ` · ${t("打开会话")}` : ""}`}
          title={run.detail || run.name} onClick={() => onOpenSession(run.session_id)}>
          <span className="automationRunName">{run.name}</span>
          <span className="automationRunMeta">
            <span className={`automationRunStatus automationRunStatus--${run.status}`}><Icon size={14} aria-hidden="true" /><span>{t(state.label)}</span></span>
            <span className="automationRunSeparator" aria-hidden="true">·</span>
            <time dateTime={run.created_at} title={time.full}>{time.label}</time>
          </span>
        </button>
      </AutomationRow>;
    })}
  </ul>;
}
