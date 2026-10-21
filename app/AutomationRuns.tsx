"use client";

import { CheckCircle2, Clock3, CircleX } from "lucide-react";
import { usePreferences } from "@/components/PreferencesProvider";
import { AutomationRow } from "./AutomationRow";

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

export function AutomationRuns({ runs, busyId, onOpenSession }: {
  runs: AutomationRun[];
  busyId: string;
  onOpenSession: (id: string) => void;
}) {
  const { t, language } = usePreferences();
  return <ul className="automationRunList" aria-label={t("运行记录")}>
    {runs.map(run => {
      const state = states[run.status as keyof typeof states] ?? (run.status === "waiting_approval" ? states.running : states.failed);
      const Icon = state.icon;
      const time = runTime(run.created_at, language);
      return <AutomationRow key={run.id} className="automationRunRow" actions={null}>
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
