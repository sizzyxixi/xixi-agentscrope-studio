"use client";
import { StudioButton } from "./StudioControls";
import { useEffect, useState } from "react";
import { AlarmClock } from "lucide-react";
import { usePreferences } from "@/components/PreferencesProvider";
import { consoleApi } from "./StudioConsole";

type LinkedTask = { id: string; name: string; config: { next_run: string } };
export function RelatedSchedules({ token, kind, resourceId }: { token: string; kind: "agent" | "skill"; resourceId: string }) {
  const { t, language } = usePreferences();
  const [tasks, setTasks] = useState<LinkedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await consoleApi<{ resources: LinkedTask[] }>(token, `related-schedules/${kind}/${encodeURIComponent(resourceId)}`);
        if (active) { setTasks(result.resources); setError(false); }
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    };
    void load(); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token, kind, resourceId, revision]);
  return <section className="relatedSchedules"><h3><AlarmClock size={16} />{t("关联的已启用定时任务")}<small>{tasks.length}</small></h3>
    {loading ? <p role="status">{t("正在读取定时任务…")}</p> : error ? <p role="alert">{t("定时任务读取失败")} <StudioButton type="button" className="textButton" onClick={() => setRevision(value => value + 1)}>{t("重试")}</StudioButton></p> : tasks.length ? <ul>{tasks.map(task => <li key={task.id}><strong>{task.name}</strong><span>{t("下一次执行时间")}：<time dateTime={task.config.next_run}>{new Date(task.config.next_run).toLocaleString(language === "en" ? "en-US" : "zh-CN", { hour12: false })}</time></span></li>)}</ul> : <p>{t("暂无关联的已启用定时任务")}</p>}
  </section>;
}
