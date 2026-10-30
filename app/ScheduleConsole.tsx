"use client";
import { StudioButton, StudioInput, StudioTextarea, StudioOverlay } from "./StudioControls";
import { Tabs as HeroTabs } from "@heroui/react";
import { Hint } from "@/components/hero-ui/tooltip";


import { withMockShops } from "./composer-mock-shops";
import { AgentPicker } from "./AgentPicker";
import { ComposerResourceMenu, ComposerResourceTags, type ResourceOptions } from "./ComposerResourceMenu";

import { useFeedbackState } from "@/components/OperationFeedback";

import Image from "next/image";
import { AlertDialog } from "@/components/hero-ui/dialog";
import { CirclePlay, Pencil, Pause, Play, Trash2, History, Info, X } from "lucide-react";

import { usePreferences } from "@/components/PreferencesProvider";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, Box, ChevronDown, CloudUpload } from "./lucide-icons";
import { AutomationRow, AutomationRowMenu } from "./AutomationRow";
import { AutomationRuns, type AutomationRun } from "./AutomationRuns";
import { consoleApi } from "./StudioConsole";
import { frequencyNames } from "./schedule-templates";
import { projectSchedule, toZoneInput, userTimezone, zonedISO } from "./schedule-timezone";
import { scheduleImageUrls } from "./schedule-assets";
import { RepeatPicker, ValidityPicker, ScheduleClock, ScheduleDateTime, ScheduleInterval } from "./ScheduleControls";
import { ModelPicker } from "@/components/SelectField";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/hero-ui/dropdown-menu";

type Choice = { id: string; name: string; content?: string; enabled: boolean };
type Shop = Choice & { country: string; mode: string; authorized: boolean };
type Model = { id: string; displayName: string; modelName: string; provider?: string; isDefault: boolean };
type Options = { agents: Choice[]; skills: Choice[]; mcps: Choice[]; shops: Shop[] };
type Config = { frequency: string; next_run: string; start_at?: string; timezone: string; model_id: string; agent_id: string; skill_ids: string[]; mcp_ids: string[]; shop_ids: string[]; weekdays: number[]; interval_value: number; interval_unit: string; end_date: string; end_at?: string; time?: string; month_day?: number; month_days?: number[]; month?: number; source_template_id?: string };
type Task = { id: string; kind: "schedule"; name: string; content: string; enabled: boolean; config: Config; updated_at: string; revision: number; executing: boolean; status: "active" | "paused" | "ended" };
type Draft = Omit<Task, "id" | "updated_at" | "revision" | "status" | "executing"> & { id?: string; revision?: number; request_id?: string };
type Template = { id: string; name: string; name_en: string; content: string; content_en: string; description: string; description_en: string; icon: string; config: Partial<Config> };
type Run = AutomationRun;
const timingKeys = ["frequency", "next_run", "start_at", "timezone", "time", "weekdays", "month", "month_day", "month_days", "end_date", "end_at", "interval_value", "interval_unit"] as const;
function TemplateIcon({ template }: { template: Template }) {
  const [failed, setFailed] = useState(false);
  const src = template.icon;
  return src && !failed ? <Image className="templateIllustration" src={src} alt="" width={60} height={60} unoptimized onError={() => setFailed(true)} /> : <span className="scheduleTemplateFallback"><AlarmClock size={32} /></span>;
}
type Attachment = { id: string; name: string; size: number };
const emptyOptions: Options = { agents: [], skills: [], mcps: [], shops: [] };
const weekNames = ["一", "二", "三", "四", "五", "六", "日"];
const defaultConfig = (): Config => {
  const start = new Date().toISOString();
  const zone = userTimezone();
  const future = toZoneInput(new Date(Date.now() + 3600000).toISOString(), zone);
  return { frequency: "daily", next_run: start, start_at: start, time: future.slice(11), timezone: zone, model_id: "", agent_id: "main", skill_ids: [], mcp_ids: [], shop_ids: [], weekdays: [], interval_value: 1, interval_unit: "hours", end_date: "" };
};
function recurrence(config: Config, language = "zh-CN") {
  const weekdays = [...config.weekdays].sort().map(day => weekNames[day]).join("、");
  const first = toZoneInput(config.start_at ?? config.next_run, config.timezone);
  const time = config.time ?? first.slice(11);
  if (language === "en") {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    if (config.frequency === "once") return first.replace("T", " ");
    if (config.frequency === "interval") return `Every ${config.interval_value} ${config.interval_value === 1 ? "hour" : "hours"}`;
    if (["weekly", "biweekly"].includes(config.frequency)) return `${config.frequency === "weekly" ? "Weekly" : "Every two weeks"} on ${[...config.weekdays].sort().map(day => days[day]).join(", ")} at ${time}`;
    if (config.frequency === "monthly") return `Monthly on ${ (config.month_days ?? [config.month_day ?? Number(first.slice(8,10))]).join(", ")} at ${time}`;
    if (config.frequency === "yearly") return `Yearly on ${config.month ?? Number(first.slice(5,7))}/${config.month_day ?? Number(first.slice(8,10))} at ${time}`;
    return `${config.frequency === "hourly" ? "Hourly" : "Daily"} at ${time}`;
  }
  if (config.frequency === "once") return first.replace("T", " ");
  if (config.frequency === "interval") return `每${config.interval_value}小时执行1次`;
  if (["weekly", "biweekly"].includes(config.frequency)) return `${frequencyNames[config.frequency]}${weekdays} ${time}`;
  if (config.frequency === "monthly") return `每月${(config.month_days ?? [config.month_day ?? Number(first.slice(8, 10))]).map(day => `${day}日`).join("、")} ${time}`;
  if (config.frequency === "yearly") return `每年${config.month ?? Number(first.slice(5, 7))}月${config.month_day ?? Number(first.slice(8, 10))}日 ${time}`;
  return `${frequencyNames[config.frequency] ?? config.frequency} ${time}`;
}

export default function ScheduleConsole({ token, onLogin, onOpenSession, onModels, userId, onManageResources }: { userId: string; token: string; onLogin: () => void; onOpenSession: (id: string) => void; onManageResources?: (tab: "skill" | "mcp" | "agent" | "workflow") => void; onModels: () => void }) {
  const { t, language } = usePreferences();
  const [tab, setTab] = useState("tasks");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [, setOptions] = useState<Options>(emptyOptions);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useFeedbackState("error");
  const [loadError, setLoadError] = useFeedbackState("error", true);
  const [, setNotice] = useFeedbackState("auto");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const runRequests = useRef(new Set<string>());
  const [runCooldowns, setRunCooldowns] = useState<Record<string, number>>({});
  const [runClock, setRunClock] = useState(0);
  const hasRunCooldowns = Object.keys(runCooldowns).length > 0;
  useEffect(() => {
    if (!hasRunCooldowns) return;
    const timer = window.setInterval(() => { const now = performance.now(); setRunClock(now); setRunCooldowns(previous => Object.fromEntries(Object.entries(previous).filter(([, end]) => end > now))); }, 1000);
    return () => window.clearInterval(timer);
  }, [hasRunCooldowns]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [zone, setZone] = useState(userTimezone);
  const originalConfig = useRef<Config | null>(null);
  const timingEdited = useRef(false);
  useEffect(() => {
    const update = () => { const nextZone = userTimezone(); setZone(nextZone); setDraft(current => current && current.config.timezone !== nextZone ? { ...current, config: projectSchedule(current.config, nextZone) } : current); };
    const timer = window.setInterval(update, 5000); window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const [confirmation, setConfirmation] = useState<{ task: Task; action: "toggle" | "delete" } | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [taskStatus, setTaskStatus] = useState("active");
  const [taskPage, setTaskPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ counts: { active: 0, paused: 0, ended: 0 } as Record<string, number>, all_total: 0, total: 0, page: 1, pages: 1 });
  const refreshRequest = useRef(0);
  const [loadedTaskQuery, setLoadedTaskQuery] = useState("");
  const pageRef = useRef<HTMLElement>(null);
  const savedPage = useRef({ tab: "tasks", search: "", scroll: 0, taskStatus: "active", page: 1 });
  const restoreScroll = useRef<number | null>(null);
  useEffect(() => { savedPage.current = { ...savedPage.current, tab, search, taskStatus, page: taskPage }; }, [tab, search, taskStatus, taskPage]);
  useEffect(() => {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(`xixi-schedule-page:${userId}`) || "null");
      if (stored) { restoreScroll.current = stored.scroll ?? 0; window.queueMicrotask(() => { setTab(stored.tab === "runs" ? "runs" : "tasks"); setSearch(stored.search ?? ""); setTaskStatus(["active", "paused", "ended"].includes(stored.taskStatus) ? stored.taskStatus : "active"); setTaskPage(Number.isInteger(stored.page) && stored.page > 0 ? stored.page : 1); }); }
    } catch { /* Ignore an outdated page preference. */ }
    return () => { window.sessionStorage.setItem(`xixi-schedule-page:${userId}`, JSON.stringify(savedPage.current)); };
  }, [userId]);
  useEffect(() => { if (!loading && restoreScroll.current !== null && pageRef.current) { pageRef.current.scrollTop = restoreScroll.current; savedPage.current.scroll = restoreScroll.current; restoreScroll.current = null; } }, [loading]);
  const switchTab = (next: string) => { setTab(next); setSearch(""); setTaskPage(1); };
  const [mockShopIds, setMockShopIds] = useState<string[]>([]);
  const [mockShopsByTask, setMockShopsByTask] = useState<Record<string, string[]>>({});
  const [resourceOptions, setResourceOptions] = useState<ResourceOptions>(() => withMockShops({}));
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceError, setResourceError] = useState("");
  const loadResourceOptions = async (agent: string) => {
    setResourceLoading(true); setResourceError("");
    try { setResourceOptions(withMockShops(await consoleApi<ResourceOptions>(token, `chat-resource-options?agent_id=${encodeURIComponent(agent)}`))); }
    catch (e) { setResourceError((e as Error).message); } finally { setResourceLoading(false); }
  };
  const resourceAgentId = draft?.config.agent_id;
  useEffect(() => {
    let active = true;
    if (resourceAgentId && token) void consoleApi<ResourceOptions>(token, `chat-resource-options?agent_id=${encodeURIComponent(resourceAgentId)}`).then(result => { if (active) setResourceOptions(withMockShops(result)); }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [resourceAgentId, token, setError]);
  const [plus, setPlus] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const attachmentRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const request = ++refreshRequest.current;
    const [resources, records, available, templateData, response] = await Promise.all([
      consoleApi<{ resources: Task[] } & typeof pageInfo>(token, `schedule-page?status=${taskStatus}&page=${taskPage}&page_size=20&search=${encodeURIComponent(search)}`),
      consoleApi<{ runs: Run[] }>(token, "runs?kind=schedule"),
      consoleApi<Options>(token, "schedule-options"),
      consoleApi<{ templates: Template[] }>(token, "schedule-templates"),
      fetch("/api/models", { headers: { authorization: `Bearer ${token}` } }),
    ]);
    if (request !== refreshRequest.current) return;
    if (!response.ok) throw new Error("模型列表读取失败，请检查服务连接后重试。");
    const modelData = await response.json() as { models: Model[] };
    if (request !== refreshRequest.current) return;
    setLoadedTaskQuery(`${taskStatus}:${resources.page}:${search}`);
    setTasks(resources.resources); setPageInfo(resources); setTaskPage(resources.page); setRuns(records.runs); setTemplates(templateData.templates); setOptions(available); setModels(modelData.models); setLoadError("");
  }, [token, taskStatus, taskPage, search, setLoadError]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(refresh).catch(e => { if (active) setLoadError((e as Error).message); }).finally(() => { if (active) setLoading(false); });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void Promise.resolve().then(refresh).catch(e => { if (active) setLoadError((e as Error).message); });
    }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh, setLoadError]);
  useEffect(() => {
    if (!draft) return;
    const previous = document.activeElement as HTMLElement | null;
    triggerRef.current = previous;
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { triggerRef.current?.focus(); };
  }, [!!draft]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      // Portalled HeroUI popups own Escape/Tab while open.
      if (document.querySelector('[data-ui-popup]:not([data-exiting])')) return;
      if (event.key === "Escape" && !saving) {
        if (document.querySelector(".agentDialog")) return;
        if (plus) { setPlus(false); }
        else if (draft) setDraft(null);
        else setTemplatesOpen(false);
      }
      if (event.key === "Tab" && draft && dialogRef.current) {
        const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea, [tabindex="0"]'));
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    // Capture before HeroUI dismisses a portalled menu so the same Escape
    // cannot also close this parent editor after the popup unmounts.
    window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true);
  }, [saving, plus, draft]);

  const config = (changes: Partial<Config>) => { if (timingKeys.some(key => key in changes)) timingEdited.current = true; setDraft(current => current ? { ...current, config: { ...current.config, ...changes } } : current); };
  const open = (task?: Task, template?: Template) => {
    if (!token) { onLogin(); return; }
    originalConfig.current = task?.config ?? null; timingEdited.current = false;
    setMockShopIds(task ? mockShopsByTask[task.id] ?? [] : []);
    const defaults = defaultConfig();
    defaults.model_id = models.find(model => model.isDefault)?.id ?? models[0]?.id ?? "";
    if (task) setDraft({ ...task, config: projectSchedule({ ...defaults, ...task.config, month_days: task.config.month_days ?? [task.config.month_day ?? Number(toZoneInput(task.config.start_at ?? task.config.next_run, task.config.timezone).slice(8, 10))] }, zone) });
    else {
      const templateConfig = template?.config ?? {};
      const merged = { ...defaults, ...templateConfig, timezone: zone, model_id: defaults.model_id, ...(template ? { source_template_id: template.id } : {}) };
      setDraft({ kind: "schedule", request_id: crypto.randomUUID(), name: template ? localized(template).name : "", content: template ? localized(template).content : "", enabled: true, config: merged });
    }
    setError(""); setAttachments([]); setPlus(false); setTemplatesOpen(false);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft) return;
    if (saving) return;
    if (!draft.name.trim()) { setError("请输入任务名称"); return; }
    if (!draft.content.trim()) { setError("请输入提示词"); return; }
    if (!draft.config.weekdays.length && ["weekly", "biweekly"].includes(draft.config.frequency)) { setError("请至少选择一个星期。"); return; }
    if (draft.config.frequency === "monthly" && !draft.config.month_days?.length) { setError("请至少选择一个执行日期。"); return; }
    if (draft.config.frequency === "yearly" && (!draft.config.month || !draft.config.month_day)) { setError("请选择执行月份和日期。"); return; }
    setSaving(true); setError("");
    const savedConfig = { ...draft.config };
    if (draft.id && !timingEdited.current && originalConfig.current) {
      for (const key of timingKeys) { if (key in originalConfig.current) Object.assign(savedConfig, { [key]: originalConfig.current[key] }); else delete savedConfig[key]; }
    }
    try {
      const saved = await consoleApi<{ resource: Task }>(token, draft.id ? `resources/${draft.id}` : "resources", draft.id ? "PUT" : "POST", { ...draft, config: savedConfig });
      setMockShopsByTask(previous => ({ ...previous, [saved.resource.id]: mockShopIds }));
      setDraft(null); switchTab("tasks"); setTaskStatus("active"); setTaskPage(1); setAttachments([]); setNotice(draft.id ? "任务更新成功。" : "任务创建成功。"); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const mutate = async (task: Task, action: "run" | "toggle" | "delete") => {
    if (action === "run") {
      if (runRequests.current.has(task.id) || (runCooldowns[task.id] ?? 0) > runClock || task.executing) return;
      runRequests.current.add(task.id);
    }
    setBusyId(task.id); setError("");
    try {
      if (action === "run") {
        const result = await consoleApi<{ run: { session_id: string } }>(token, `resources/${task.id}/run`, "POST");
        // eslint-disable-next-line react-hooks/purity -- This handler reads the clock only after a user-triggered request, never during render.
        const now = performance.now(); setRunClock(now); setRunCooldowns(previous => ({ ...previous, [task.id]: now + 10000 }));
        onOpenSession(result.run.session_id);
        void refresh();
        return;
      }
      if (action === "toggle") { await consoleApi(token, `resources/${task.id}/schedule-state`, "POST", { enabled: !task.enabled, revision: task.revision }); setNotice(task.enabled ? "任务已暂停。" : "任务已恢复。"); setConfirmation(null); }
      if (action === "delete") { await consoleApi(token, `resources/${task.id}`, "DELETE"); setConfirmation(null); setNotice("任务已删除。"); }
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { if (action === "run") runRequests.current.delete(task.id); setBusyId(""); }
  };
  const scheduleRuns = runs.filter(run => run.name.toLowerCase().includes(search.trim().toLowerCase()));

  const openTemplate = async (id: string) => {
    try {
      const result = await consoleApi<{ template: Template }>(token, `schedule-templates/${encodeURIComponent(id)}/prepare`, "POST");
      const template = result.template;
      open(undefined, template);
    } catch (error) { setError((error as Error).message); }
  };
  const localized = (template: Template) => {
    const content = language === "en" ? template.content_en : template.content;
    return { name: language === "en" ? template.name_en : template.name, content, description: (language === "en" ? template.description_en : template.description) || content.slice(0, 100) };
  };
  const filteredTemplates = templates.filter(template => !templatesOpen || `${localized(template).name} ${localized(template).content}`.toLowerCase().includes(templateSearch.trim().toLowerCase()));
  const templateGrid = <div className="scheduleTemplateGrid">{filteredTemplates.map(template => { const copy = localized(template); return <StudioButton className="scheduleTemplate" key={template.id} onClick={() => void openTemplate(template.id)}><TemplateIcon template={template} /><span className="scheduleTemplateContent"><strong>{copy.name}</strong><Hint content={copy.content}><span className="templateDescription">{copy.description}</span></Hint><small><AlarmClock size={13} />{recurrence({ ...defaultConfig(), ...template.config }, language)}</small></span><span className="templateArrow">↗</span></StudioButton>; })}</div>;
  const runningIds = new Set([...tasks.filter(task => task.executing).map(task => task.id), ...runs.filter(run => ["running", "waiting_approval"].includes(run.status)).map(run => run.resource_id)]);
  const statusNames = { active: "运行中", paused: "已暂停", ended: "已结束" };
  const taskEmpty = <div className="scheduleEmpty scheduleTaskEmpty"><div className="scheduleEmptyIcon"><Image src={scheduleImageUrls.empty} alt="" width={120} height={120} unoptimized /></div><h3>{t(search ? "没有找到匹配任务" : pageInfo.all_total ? "暂无该状态的任务" : "还没有定时任务")}</h3>{search ? <p>{t("试试其他关键词。")}</p> : (taskStatus === "active" || !pageInfo.all_total) && <StudioButton className="primaryButton" onClick={() => open()}>{t("＋ 创建第一个自动化任务")}</StudioButton>}</div>;
  const taskPagePending = loadedTaskQuery !== `${taskStatus}:${taskPage}:${search}`;
  const taskRecurrence = (task: Task) => {
    const viewConfig = projectSchedule({ ...defaultConfig(), ...task.config }, zone);
    // A month boundary can map to a varying date (for example the last day of
    // the preceding month). Show the actual local occurrence instead of a false
    // fixed day-of-month rule in another timezone.
    if (task.config.timezone !== zone && ["monthly", "yearly"].includes(task.config.frequency)) return `${t(frequencyNames[task.config.frequency])} · ${t("下次")} ${toZoneInput(task.config.next_run, zone).replace("T", " ")}`;
    return recurrence(viewConfig, language);
  };
  const nextLabel = (task: Task) => {
    if (runningIds.has(task.id)) return "执行中";
    if (task.status !== "active") return statusNames[task.status];
    const next = toZoneInput(task.config.next_run, zone);
    const today = toZoneInput(new Date().toISOString(), zone).slice(0, 10);
    return `下一次执行时间：${next.slice(0, 10) === today ? "今天" : next.slice(0, 10)} ${next.slice(11)}`;
  };
  const setDate = (value: string) => {
    if (!draft || !value) return;
    try { const time = zonedISO(value, draft.config.timezone); config({ start_at: time, next_run: time }); setError(""); } catch (e) { setError((e as Error).message); }
  };


  return <section ref={pageRef} onScroll={event => { savedPage.current.scroll = event.currentTarget.scrollTop; }} className="consolePage schedulePage">
    <div className="scheduleTopbar"><div className="scheduleTabsHeader"><div className="consoleTabs" role="tablist" aria-label={t("自动化")}><StudioButton id="schedule-tasks-tab" role="tab" aria-selected={tab === "tasks"} aria-controls="schedule-panel" className={tab === "tasks" ? "active" : ""} onClick={() => switchTab("tasks")}>{t("任务列表")}{pageInfo.all_total > 0 && <span>{pageInfo.all_total}</span>}</StudioButton><StudioButton id="schedule-runs-tab" role="tab" aria-selected={tab === "runs"} aria-controls="schedule-panel" className={tab === "runs" ? "active" : ""} onClick={() => switchTab("runs")}>{t("运行记录")}</StudioButton></div>{tab === "runs" && <Hint content={t("仅展示最近 50 条记录")}><StudioButton type="button" className="scheduleRunsHint" aria-label={t("仅展示最近 50 条记录")}><Info size={14} aria-hidden="true" /></StudioButton></Hint>}</div><div className="scheduleTools"><div className="scheduleSearchField"><StudioInput aria-label={t("搜索定时任务或运行记录")} placeholder={tab === "tasks" ? t("搜索任务…") : t("搜索运行记录…")} value={search} onChange={event => { setSearch(event.target.value); setTaskPage(1); }} />{search && <StudioButton type="button" className="scheduleSearchClear" aria-label={t("清空搜索")} onClick={() => { setSearch(""); setTaskPage(1); }}><X size={14} /></StudioButton>}</div><div className="scheduleCreate"><StudioButton className="primaryButton" onClick={() => open()}>{t("＋ 创建自动化任务")}</StudioButton><DropdownMenu><DropdownMenuTrigger asChild><StudioButton type="button" className="scheduleCreateMore" aria-label={t("更多创建方式")}><ChevronDown size={15} /></StudioButton></DropdownMenuTrigger><DropdownMenuContent data-ui-popup="menu" align="end" sideOffset={8} className="xixiDropdownPopup"><DropdownMenuItem onSelect={() => open()}>{t("自定义创建")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setTemplatesOpen(true)}>{t("从模板开始")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></div></div>

    {!token ? <div className="scheduleEmpty"><Box size={44} /><h3>{t("开启你的自动化工作空间")}</h3><p>{t("登录后创建任务、选择智能体并查看运行记录。")}</p><StudioButton className="primaryButton" onClick={onLogin}>{t("登录 / 注册")}</StudioButton></div> : <div id="schedule-panel" role="tabpanel" aria-labelledby={tab === "tasks" ? "schedule-tasks-tab" : "schedule-runs-tab"}>
      {loading ? <div className="consoleLoading">{t("正在读取定时任务…")}</div> : tab === "runs" ? <div className="scheduleRecords">{scheduleRuns.length ? <AutomationRuns runs={scheduleRuns} busyId={busyId} onOpenSession={onOpenSession}  /> : <div className="scheduleEmpty"><AlarmClock size={40} /><h3>{search ? t("没有匹配的运行记录") : t("等待第一次运行")}</h3><p>{t("任务执行后，运行状态和会话入口会出现在这里。")}</p></div>}</div> : <>
        {!pageInfo.all_total && <div className="scheduleBanner"><Image className="scheduleBannerArt" src={scheduleImageUrls.banner} alt="" width={136} height={125} unoptimized /><div><h3>{t("搭建你的店铺经营自动化任务")}</h3><p>{t("通过定时任务自动监控动态数据、执行可重复运营事项、每天为你生成清晰的经营洞察")}</p></div></div>}
        {pageInfo.all_total > 0 ? <HeroTabs selectedKey={taskStatus} onSelectionChange={key => { setTaskStatus(String(key)); setTaskPage(1); }} className="scheduleStatusTabs">
          <HeroTabs.ListContainer><HeroTabs.List aria-label={t("任务状态")}>{["active", "paused", "ended"].map(status => <HeroTabs.Tab id={status} key={status}>{t(status === "active" ? "当前" : statusNames[status as keyof typeof statusNames])}<span className="scheduleStatusCount">{pageInfo.counts[status]}</span><HeroTabs.Indicator /></HeroTabs.Tab>)}</HeroTabs.List></HeroTabs.ListContainer>
          {["active", "paused", "ended"].map(status => <HeroTabs.Panel id={status} key={status}>{taskStatus === status && <>
            {taskPagePending ? <div className="consoleLoading">{loadError ? <StudioButton type="button" onClick={() => void refresh().catch(error => setLoadError((error as Error).message))}>{t("重新加载")}</StudioButton> : t("正在读取定时任务…")}</div> : !tasks.length ? taskEmpty : <ul className="scheduleTaskList" aria-label={t(status === "active" ? "当前任务" : statusNames[status as keyof typeof statusNames])}>{tasks.map(task => <AutomationRow className={`scheduleTaskRow scheduleTaskRow--${task.status}`} key={task.id} actions={<>

            {task.status === "active" && <Hint content={runningIds.has(task.id) ? t("执行中") : (runCooldowns[task.id] ?? 0) > runClock ? language === "en" ? `Try again in ${Math.ceil((runCooldowns[task.id] - runClock) / 1000)}s` : `请在${Math.ceil((runCooldowns[task.id] - runClock) / 1000)}秒后重试` : t("立即执行")}><StudioButton type="button" className="automationRowAction scheduleTaskRun" disabled={busyId === task.id || runningIds.has(task.id) || (runCooldowns[task.id] ?? 0) > runClock} aria-label={`${t("立即执行")}：${task.name}`}  onClick={() => void mutate(task, "run")}><CirclePlay size={17} aria-hidden="true" /></StudioButton></Hint>}
            <AutomationRowMenu label={`${t("更多操作")}：${task.name}`} disabled={busyId === task.id}>
              <DropdownMenuItem onSelect={() => open(task)}><Pencil size={14} />{t("编辑")}</DropdownMenuItem>
              {task.status !== "ended" && <DropdownMenuItem onSelect={() => task.status === "active" ? setConfirmation({ task, action: "toggle" }) : void mutate(task, "toggle")}>{task.status === "active" ? <Pause size={14} /> : <Play size={14} />}{t(task.status === "active" ? "暂停" : "恢复")}</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => { setTab("runs"); setSearch(task.name); }}><History size={14} />{t("运行记录")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="scheduleTaskDelete" onSelect={() => setConfirmation({ task, action: "delete" })}><Trash2 size={14} />{t("删除")}</DropdownMenuItem>
            </AutomationRowMenu>

        </>}>
          <Hint content={task.name}><StudioButton type="button" className="automationRowOpen scheduleTaskOpen"  aria-label={`${t("编辑")}：${task.name}`} onClick={() => open(task)} disabled={busyId === task.id}><span className="scheduleTaskTitle">{task.name}</span>
          <Hint content={`${taskRecurrence(task)} · ${zone}`}><span className="scheduleTaskRecurrence" ><AlarmClock size={14} aria-hidden="true" /><span>{taskRecurrence(task)}</span></span></Hint>
          <Hint content={task.status === "active" ? `${t(nextLabel(task))} · ${zone}` : undefined}><span className={`scheduleTaskNext${runningIds.has(task.id) ? " isExecuting" : ""}`} >{t(nextLabel(task))}</span></Hint>
        </StudioButton></Hint>
        </AutomationRow>)}</ul>}
            {pageInfo.pages > 1 && <nav className="schedulePagination" aria-label={t("任务分页")}><StudioButton type="button" disabled={taskPagePending || pageInfo.page <= 1} onClick={() => setTaskPage(pageInfo.page - 1)}>{t("上一页")}</StudioButton><span>{pageInfo.page} / {pageInfo.pages} · {pageInfo.total} {t("条")}</span><StudioButton type="button" disabled={taskPagePending || pageInfo.page >= pageInfo.pages} onClick={() => setTaskPage(pageInfo.page + 1)}>{t("下一页")}</StudioButton></nav>}
          </>}</HeroTabs.Panel>)}
        </HeroTabs> : taskEmpty}

        {!pageInfo.all_total && templates.length > 0 && <div ref={templateRef} className="scheduleTemplates"><div className="sectionTitle"><div><h3>{t("从模板开始")}</h3></div><StudioButton className="textButton" onClick={() => setTemplatesOpen(true)}>{t("查看更多")}</StudioButton></div>{templateGrid}</div>}

      </>}
    </div>}
    {templatesOpen && <StudioOverlay label={t("选择任务模板")} onClose={() => setTemplatesOpen(false)}><div className="resourceEditor templateDialog"><div className="sectionTitle"><div><h3>{t("为你的下一件工作选择模板")}</h3></div><StudioButton autoFocus className="closeButton" aria-label={t("关闭模板")} onClick={() => setTemplatesOpen(false)}>×</StudioButton></div><div className="scheduleTemplateFilters"><StudioInput aria-label={t("搜索模板")} placeholder={t("搜索模板名称或提示词…")} value={templateSearch} onChange={event => setTemplateSearch(event.target.value)} /></div>{filteredTemplates.length ? templateGrid : <p>{t("没有匹配的模板")}</p>}</div></StudioOverlay>}
    {draft && <StudioOverlay label={t("自动化任务")} onClose={() => setDraft(null)} isDismissable={!(saving)}><form ref={dialogRef} className="resourceEditor scheduleEditor" onSubmit={event => void save(event)}>
      <div className="sectionTitle"><div><h3 id="schedule-editor-title">{draft.id ? t("编辑定时任务") : t("创建定时任务")}</h3></div><StudioButton type="button" className="closeButton" aria-label={t("关闭编辑器")} disabled={saving} onClick={() => setDraft(null)}>×</StudioButton></div>
      <label>{t("任务名称")}<StudioInput required maxLength={100} value={draft.name} placeholder={t("给这个任务起个名字")} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <div className="scheduleAgentField"><span className="scheduleFieldLabel">{t("智能体")}</span><AgentPicker token={token} id={draft.config.agent_id} disabled={saving} hasHistory={false} onManage={() => onManageResources?.("agent")} onSelect={agent => { config({ agent_id: agent.id, skill_ids: [], mcp_ids: [] }); setMockShopIds([]); if (draft.config.skill_ids.length || draft.config.mcp_ids.length || mockShopIds.length) setNotice("已切换智能体，请重新选择适用的能力和店铺。"); }} /></div>
      <label htmlFor="schedule-prompt">{t("任务提示词")}<span className="requiredMark">*</span></label><div className="scheduleComposer">
        <div className="scheduleTags"><ComposerResourceTags options={resourceOptions} value={{ ...draft.config, shop_ids: mockShopIds }} onChange={(key, ids) => key === "shop_ids" ? setMockShopIds(ids) : config({ [key]: ids })} disabled={saving} />{attachments.map(file => <Hint content={file.name} key={file.id}><span className="scheduleTag attachmentTag"  ><CloudUpload size={14} />{file.name} <small>{(file.size / 1024).toFixed(0)} {t("KB")}</small><StudioButton type="button" aria-label={t(`移除附件${file.name}`)} onClick={() => setAttachments(items => items.filter(item => item.id !== file.id))}>×</StudioButton></span></Hint>)}</div>
        <StudioTextarea id="schedule-prompt" required maxLength={2000} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} placeholder={t("请详细描述 AI 应如何执行这项任务")} rows={5} />
        <div className="scheduleComposerBottom"><div className="schedulePlusWrap"><ComposerResourceMenu open={plus} onOpenChange={setPlus} loading={resourceLoading} error={resourceError} onWorkflows={() => onManageResources?.("workflow")} options={resourceOptions} value={{ ...draft.config, shop_ids: mockShopIds }} onChange={(key, ids) => key === "shop_ids" ? setMockShopIds(ids) : config({ [key]: ids })} disabled={saving} onUpload={() => attachmentRef.current?.click()} onRefresh={() => void loadResourceOptions(draft.config.agent_id)} onCheckMcp={async id => { await consoleApi(token, `resources/${id}/test`, "POST"); }} onManage={key => onManageResources?.(key === "skill_ids" ? "skill" : "mcp")} /></div><div className="scheduleModel"><ModelPicker aria-label={t("对话模型")} value={draft.config.model_id} onValueChange={value => config({ model_id: value })} placeholder={models.length ? t("选择模型") : t("尚未配置模型")} disabled={!models.length} models={models.map(model => ({ id: model.id, name: model.displayName || model.modelName, provider: model.provider, modelName: model.modelName, isDefault: model.isDefault, description: t(`${model.modelName}${model.isDefault ? t(" · 默认模型") : ""}`), keywords: [model.modelName] }))} /></div></div>
      </div><StudioInput ref={attachmentRef} hidden type="file" multiple accept=".txt,.md,.markdown,.csv,.pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={event => { const files = Array.from(event.target.files ?? []); if (files.some(file => !file.type.startsWith("image/") && !/\.(txt|md|markdown|csv|pdf|docx?|xlsx?|png|jpe?g|gif|webp|bmp|avif|svg|heic|tiff?)$/i.test(file.name))) { setError(t("请选择 TXT、Markdown、CSV、PDF、Word、Excel 或图片文件。")); event.target.value = ""; return; } setAttachments(items => [...items, ...files.map(file => ({ id: crypto.randomUUID(), name: file.name, size: file.size }))]); event.target.value = ""; }} />
      {!models.length && <p className="formHint warning">{t("请先配置一个 LLM 模型。")}<StudioButton type="button" className="textButton accent" onClick={() => { setDraft(null); onModels(); }}>{t("前往模型设置 ↗")}</StudioButton></p>}
      <div className="scheduleDivider" />
      <div className="scheduleTimingRow">
        <RepeatPicker value={draft.config} onChange={changes => { const start = changes.frequency === "once" ? new Date(Date.now() + 3600000).toISOString() : draft.config.start_at ?? draft.config.next_run; config({ ...changes, start_at: start, next_run: start, ...(changes.frequency === "once" ? { end_date: "", end_at: "" } : {}) }); }} />
        <div className="scheduleInlineField"><span>{t(draft.config.frequency === "interval" ? "每隔" : "时间")}：</span>
          {draft.config.frequency === "once" ? <ScheduleDateTime label={t("执行日期和时间")} value={toZoneInput(draft.config.start_at ?? draft.config.next_run, draft.config.timezone)} onChange={setDate} /> : draft.config.frequency === "interval" ? <ScheduleInterval value={draft.config.interval_value} onChange={config} /> : <ScheduleClock value={draft.config.time ?? "08:30"} onChange={time => config({ time })} />}
        </div>
        <ValidityPicker start={toZoneInput(draft.config.start_at ?? draft.config.next_run, draft.config.timezone).slice(0, 10)} end={draft.config.end_date} timezone={draft.config.timezone} disabled={draft.config.frequency === "once"} onChange={(start, end) => { const anchor = start ? zonedISO(`${start}T00:00`, draft.config.timezone) : new Date().toISOString(); const endAt = end ? new Date(Date.parse(zonedISO(`${end}T23:59`, zone)) + 59999).toISOString() : ""; config({ start_at: anchor, next_run: anchor, end_date: end, end_at: endAt }); }} />
      </div>
      <div className="editorFooter"><StudioButton type="button" className="secondaryButton" disabled={saving} onClick={() => setDraft(null)}>{t("取消")}</StudioButton><StudioButton type="submit" className="primaryButton" disabled={saving || !models.length}>{saving ? t("保存中…") : draft.id ? t("保存修改") : t("创建任务")}</StudioButton></div>
    </form></StudioOverlay>}
    <AlertDialog.Root open={!!confirmation} onOpenChange={value => { if (!value && !busyId) setConfirmation(null); }}><AlertDialog.Portal><AlertDialog.Overlay className="studio-dialog-overlay" /><AlertDialog.Content className="studio-confirm"><AlertDialog.Title>{t(confirmation?.action === "delete" ? "确认删除任务？" : "确认暂停任务？")}</AlertDialog.Title><AlertDialog.Description>{t(confirmation?.action === "delete" ? "删除后不再自动执行，已开始的执行、历史记录及会话将保留。" : "暂停后不再自动执行，已开始的执行会继续；暂停期间错过的执行不补发。")}</AlertDialog.Description><div><AlertDialog.Cancel asChild><StudioButton type="button" disabled={!!busyId}>{t("取消")}</StudioButton></AlertDialog.Cancel><StudioButton type="button" className={confirmation?.action === "delete" ? "danger" : "primaryButton"} disabled={!!busyId} onClick={() => confirmation && void mutate(confirmation.task, confirmation.action)}>{t(busyId ? "处理中…" : "确认")}</StudioButton></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </section>;
}
