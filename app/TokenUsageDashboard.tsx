"use client";

import { ActivityGraph } from "@/components/assistant-ui/elements/activity-graph";
import { usePreferences } from "@/components/PreferencesProvider";
import type { TokenActivity } from "./token-usage";

export function TokenUsageDashboard({ activity, loading }: { activity?: TokenActivity; loading: boolean }) {
  const { language } = usePreferences();
  const en = language === "en";
  const number = (value: number | undefined) => value === undefined ? "—" : value.toLocaleString(language);
  return <section className="consoleCard tokenDashboard" aria-label={en ? "Token usage" : "Token 消耗"} aria-busy={loading}>
    <div className="sectionTitle"><div>
      <h3>{en ? "Token usage" : "Token 消耗"}</h3>
      <p>{en ? "Daily model usage over the last 182 days · Beijing time" : "近 182 天的每日模型用量 · 北京时间"}</p>
    </div><span className="statusBadge">{en ? "Provider-reported" : "实际用量"}</span></div>
    <div className="tokenMetricGrid">{[
      [en ? "Today" : "今日消耗", activity?.today_tokens],
      [en ? "Last 30 days" : "近 30 天", activity?.last_30_days_tokens],
      [en ? "Input · 182 days" : "输入 · 近半年", activity?.input_tokens],
      [en ? "Output · 182 days" : "输出 · 近半年", activity?.output_tokens],
    ].map(([label, value]) => <div className="tokenMetric" key={label}>
      <span>{label}</span><strong>{number(value as number | undefined)}</strong><small>tokens</small>
    </div>)}</div>
    {activity ? <>
      <ActivityGraph data={activity.data} start={activity.start} end={activity.end}
        title={en ? "Daily consumption" : "每日消耗"}
        total={`${number(activity.total_tokens)} tokens`}
        locale={language} lessLabel={en ? "Less" : "少"} moreLabel={en ? "More" : "多"}
        className="tokenActivityGraph" />
      <div className="tokenDashboardFooter"><span>{activity.start} — {activity.end}</span>
        <span>{number(activity.call_count)} {en ? "model calls" : "次模型调用"}</span></div>
      <p className="tokenUsageNote">{en ? "Only provider-reported input and output tokens are counted; unavailable usage is not estimated." : "仅汇总模型实际返回的输入与输出 token，不估算缺失用量。"}
        {activity.missing_calls > 0 && ` ${number(activity.missing_calls)} ${en ? "calls have unavailable usage." : "次调用尚无用量数据。"}`}
        {activity.undated_calls > 0 && ` ${number(activity.undated_calls)} ${en ? "historical calls have no recoverable date and are excluded." : "次历史调用无法恢复日期，未计入看板。"}`}
      </p>
      {activity.call_count === 0 && <p className="tokenUsageNote">{en ? "No model calls in this period. Usage will appear after your next conversation." : "此时间段暂无模型调用，开始对话后会在这里展示用量。"}</p>}
    </> : <p className="tokenUsageNote" role="status">{loading ? (en ? "Loading usage…" : "正在读取用量…") : (en ? "Usage unavailable. Refresh after the service connects." : "用量读取失败，请刷新重试。")}</p>}
  </section>;
}
