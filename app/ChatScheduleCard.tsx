"use client";
import { Button } from "@heroui/react";
import { AlarmClock } from "lucide-react";
import { usePreferences } from "@/components/PreferencesProvider";

type Draft = { name: string; content: string; agent_name: string; model_name?: string; automatic: boolean; skills?: string[]; mcps?: string[]; shops?: string[]; config: { frequency: string; timezone: string; next_run: string; start_at: string; time: string; interval_value?: number; weekdays?: number[]; month_days?: number[]; month?: number; month_day?: number; end_date?: string } };

export function ChatScheduleCard({ draft, pending, rejected, failed, running, result, onConfirm }: { draft: Draft; pending: boolean; rejected: boolean; failed: boolean; running: boolean; result: unknown; onConfirm: (approved: boolean) => void }) {
  const { language } = usePreferences();
  const en = language === "en";
  const c = draft.config;
  const frequencies: Record<string, string> = en ? { once: "Once", hourly: "Hourly", interval: `Every ${c.interval_value} hours`, daily: "Daily", weekly: "Weekly", biweekly: "Every two weeks", monthly: "Monthly", yearly: "Yearly" } : { once: "单次", hourly: "每小时", interval: `每隔 ${c.interval_value} 小时`, daily: "每天", weekly: "每周", biweekly: "每双周", monthly: "每月", yearly: "每年" };
  const weekdays = en ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const rule = [frequencies[c.frequency] ?? c.frequency, ["weekly", "biweekly"].includes(c.frequency) ? c.weekdays?.map(day => weekdays[day]).join(en ? ", " : "、") : c.frequency === "monthly" ? c.month_days?.join(", ") + (en ? " (day of month)" : "日") : c.frequency === "yearly" ? `${c.month}/${c.month_day}` : "", ["once", "hourly", "interval"].includes(c.frequency) ? "" : c.time].filter(Boolean).join(" · ");
  let saved = false;
  try { saved = JSON.parse(typeof result === "string" ? result : JSON.stringify(result ?? {})).saved === true; } catch { /* Tool errors remain plain text. */ }
  const format = (value: string) => {
    try { return new Intl.DateTimeFormat(en ? "en-GB" : "zh-CN", { timeZone: c.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)); } catch { return value; }
  };
  return <section className="chatScheduleCard" aria-label={en ? "Scheduled task confirmation" : "定时任务确认"}>
    <header><AlarmClock size={20} /><strong>{en ? "Scheduled task" : "定时任务"}</strong><small role="status">{pending ? (en ? "Awaiting confirmation" : "待确认") : saved ? (en ? "Created" : "已创建") : rejected ? (en ? "Not created" : "未创建") : running ? (en ? "Creating…" : "创建中…") : (en ? "Not created" : "未创建")}</small></header>
    <h3>{draft.name}</h3><p className="chatSchedulePrompt">{draft.content}</p>
    <dl>
      <dt>{en ? "Schedule" : "执行规则"}</dt><dd>{rule}</dd>
      <dt>{en ? "First run" : "首次执行"}</dt><dd>{format(c.next_run)} · {c.timezone}</dd>
      <dt>{en ? "Valid until" : "有效期"}</dt><dd>{c.end_date || (en ? "No end date" : "长期有效")}</dd>
      <dt>{en ? "Agent" : "智能体"}</dt><dd>{draft.agent_name}</dd>
      <dt>{en ? "Model" : "模型"}</dt><dd>{draft.model_name || (en ? "Account default model" : "账号默认模型")}</dd>
      {!![...(draft.skills ?? []), ...(draft.mcps ?? []), ...(draft.shops ?? [])].length && <><dt>{en ? "Resources" : "指定能力与店铺"}</dt><dd>{[...(draft.skills ?? []), ...(draft.mcps ?? []), ...(draft.shops ?? [])].join(" · ")}</dd></>}
      <dt>{en ? "Results" : "结果位置"}</dt><dd>{en ? "Automation → Run history" : "自动化 → 运行记录"}</dd>
    </dl>
    {!draft.automatic && <p role="note" className="chatScheduleWarning">{en ? "Automatic scheduling is disabled in this deployment. Saving this task will not enable automatic execution." : "当前部署未启用自动调度，保存任务后不会自动执行。"}</p>}
    {failed && <p role="alert">{typeof result === "string" ? result : (en ? "Creation failed. Please try again." : "创建失败，请调整后重试。")}</p>}
    {pending && <footer><Button variant="secondary" onPress={() => onConfirm(false)}>{en ? "Cancel / revise" : "取消 / 修改"}</Button><Button className="primaryButton" variant="primary" onPress={() => onConfirm(true)}>{en ? "Confirm creation" : "确认创建"}</Button></footer>}
  </section>;
}

export type { Draft as ChatScheduleDraft };
