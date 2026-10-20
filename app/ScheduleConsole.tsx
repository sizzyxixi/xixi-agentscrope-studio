"use client";

import { withMockShops } from "./composer-mock-shops";
import { AgentPicker } from "./AgentPicker";
import { ComposerResourceMenu, ComposerResourceTags, type ResourceOptions } from "./ComposerResourceMenu";

import { useFeedbackState } from "@/components/OperationFeedback";

import Image from "next/image";
import { AlertDialog } from "@/components/hero-ui/dialog";
import { CirclePlay, Pencil, Pause, Play, Trash2, History } from "lucide-react";

import { usePreferences } from "@/components/PreferencesProvider";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, Box, ChevronDown, CloudUpload, Sparkles } from "./lucide-icons";
import { AutomationRow, AutomationRowMenu } from "./AutomationRow";
import { AutomationRuns, type AutomationRun } from "./AutomationRuns";
import { consoleApi } from "./StudioConsole";
import { frequencyNames, scheduleTemplates } from "./schedule-templates";
import { SelectField, ModelPicker } from "@/components/SelectField";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/hero-ui/dropdown-menu";

type Choice = { id: string; name: string; content?: string; enabled: boolean };
type Shop = Choice & { country: string; mode: string; authorized: boolean };
type Model = { id: string; displayName: string; modelName: string; isDefault: boolean };
type Options = { agents: Choice[]; skills: Choice[]; mcps: Choice[]; shops: Shop[] };
type Config = { frequency: string; next_run: string; start_at?: string; timezone: string; model_id: string; agent_id: string; skill_ids: string[]; mcp_ids: string[]; shop_ids: string[]; weekdays: number[]; interval_value: number; interval_unit: string; end_date: string; time?: string; month_day?: number; month?: number; source_template_id?: string; source_template_version?: number };
type Task = { id: string; kind: "schedule"; name: string; content: string; enabled: boolean; config: Config; updated_at: string; revision: number; executing: boolean; status: "active" | "paused" | "ended" };
type Draft = Omit<Task, "id" | "updated_at" | "revision" | "status" | "executing"> & { id?: string; revision?: number; request_id?: string };
type Run = AutomationRun;
type Attachment = { id: string; name: string; size: number };
const emptyOptions: Options = { agents: [], skills: [], mcps: [], shops: [] };
const weekNames = ["一", "二", "三", "四", "五", "六", "日"];
const userTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const toZoneInput = (value: string, zone: string) => {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (key: string) => parts.find(item => item.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};
function zonedISO(value: string, zone: string) {
  const wall = Date.parse(`${value}:00Z`);
  let utc = wall;
  for (let i = 0; i < 3; i++) utc += wall - Date.parse(`${toZoneInput(new Date(utc).toISOString(), zone)}:00Z`);
  const result = new Date(utc).toISOString();
  if (toZoneInput(result, zone) !== value) throw new Error("该时间在当前时区不存在，请重新选择。");
  return result;
}
const defaultConfig = (): Config => {
  const start = new Date().toISOString();
  const zone = userTimezone();
  const future = toZoneInput(new Date(Date.now() + 3600000).toISOString(), zone);
  return { frequency: "daily", next_run: start, start_at: start, time: future.slice(11), month_day: Number(future.slice(8, 10)), month: Number(future.slice(5, 7)), timezone: zone, model_id: "", agent_id: "main", skill_ids: [], mcp_ids: [], shop_ids: [], weekdays: [0, 1, 2, 3, 4], interval_value: 1, interval_unit: "hours", end_date: "" };
};
function recurrence(config: Config) {
  const weekdays = [...config.weekdays].sort().map(day => weekNames[day]).join("、");
  const first = toZoneInput(config.start_at ?? config.next_run, config.timezone);
  const time = config.time ?? first.slice(11);
  if (config.frequency === "once") return first.replace("T", " ");
  if (config.frequency === "interval") return `每周${weekdays}，每${config.interval_value}${config.interval_unit === "minutes" ? "分钟" : "小时"}执行1次`;
  if (["weekly", "biweekly"].includes(config.frequency)) return `${frequencyNames[config.frequency]}${weekdays} ${time}`;
  if (config.frequency === "monthly") return `每月${config.month_day ?? Number(first.slice(8, 10))}日 ${time}`;
  if (config.frequency === "yearly") return `每年${config.month ?? Number(first.slice(5, 7))}月${config.month_day ?? Number(first.slice(8, 10))}日 ${time}`;
  return `${frequencyNames[config.frequency] ?? config.frequency} ${time}`;
}

export default function ScheduleConsole({ token, onLogin, onOpenSession, onModels, userId, onManageResources }: { userId: string; token: string; onLogin: () => void; onOpenSession: (id: string) => void; onManageResources?: (tab: "skill" | "mcp" | "agent" | "workflow") => void; onModels: () => void }) {
  const { t } = usePreferences();
  const [tab, setTab] = useState("tasks");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [, setOptions] = useState<Options>(emptyOptions);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useFeedbackState("error");
  const [, setLoadError] = useFeedbackState("error", true);
  const [, setNotice] = useFeedbackState("auto");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [runToDelete, setRunToDelete] = useState<Run | null>(null);
  const [confirmation, setConfirmation] = useState<{ task: Task; action: "toggle" | "delete" } | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateTag, setTemplateTag] = useState("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ active: true, paused: true, ended: false });
  const pageRef = useRef<HTMLElement>(null);
  const savedPage = useRef({ tab: "tasks", search: "", scroll: 0, groups: { active: true, paused: true, ended: false } as Record<string, boolean> });
  const restoreScroll = useRef<number | null>(null);
  useEffect(() => { savedPage.current = { ...savedPage.current, tab, search, groups: openGroups }; }, [tab, search, openGroups]);
  useEffect(() => {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(`xixi-schedule-page:${userId}`) || "null");
      if (stored) { restoreScroll.current = stored.scroll ?? 0; window.queueMicrotask(() => { setTab(stored.tab === "runs" ? "runs" : "tasks"); setSearch(stored.search ?? ""); if (stored.groups) setOpenGroups(stored.groups); }); }
    } catch { /* Ignore an outdated page preference. */ }
    return () => { window.sessionStorage.setItem(`xixi-schedule-page:${userId}`, JSON.stringify(savedPage.current)); };
  }, [userId]);
  useEffect(() => { if (!loading && restoreScroll.current !== null && pageRef.current) { pageRef.current.scrollTop = restoreScroll.current; savedPage.current.scroll = restoreScroll.current; restoreScroll.current = null; } }, [loading]);
  const deleteRun = async () => {
    if (!runToDelete || busyId) return;
    const run = runToDelete;
    setBusyId(run.id);
    try {
      await consoleApi(token, `runs/${run.id}`, "DELETE");
      setRuns(current => current.filter(item => item.id !== run.id));
      setRunToDelete(null);
      setNotice("运行记录已删除。");
    } catch (error) { setError((error as Error).message); }
    finally { setBusyId(""); }
  };
  const switchTab = (next: string) => { setTab(next); setSearch(""); };
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
    const [resources, records, available, response] = await Promise.all([
      consoleApi<{ resources: Task[] }>(token, "resources?kind=schedule"),
      consoleApi<{ runs: Run[] }>(token, "runs?kind=schedule"),
      consoleApi<Options>(token, "schedule-options"),
      fetch("/api/models", { headers: { authorization: `Bearer ${token}` } }),
    ]);
    if (!response.ok) throw new Error("模型列表读取失败，请检查服务连接后刷新。");
    const modelData = await response.json() as { models: Model[] };
    setTasks(resources.resources); setRuns(records.runs); setOptions(available); setModels(modelData.models); setLoadError("");
  }, [token, setLoadError]);
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
      // Portalled assistant-ui popups own Escape/Tab while open.
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
    // Capture before Radix dismisses a portalled menu so the same Escape
    // cannot also close this parent editor after the popup unmounts.
    window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true);
  }, [saving, plus, draft]);

  const config = (changes: Partial<Config>) => setDraft(current => current ? { ...current, config: { ...current.config, ...changes } } : current);
  const open = (task?: Task, template?: typeof scheduleTemplates[number]) => {
    if (!token) { onLogin(); return; }
    setMockShopIds(task ? mockShopsByTask[task.id] ?? [] : []);
    const defaults = defaultConfig();
    defaults.model_id = models.find(model => model.isDefault)?.id ?? models[0]?.id ?? "";
    setDraft(task ? { ...task, config: { ...defaults, ...task.config, timezone: defaults.timezone, start_at: task.config.start_at ?? task.config.next_run, time: task.config.time ?? toZoneInput(task.config.start_at ?? task.config.next_run, defaults.timezone).slice(11), month_day: task.config.month_day ?? Number(toZoneInput(task.config.start_at ?? task.config.next_run, defaults.timezone).slice(8, 10)), month: task.config.month ?? Number(toZoneInput(task.config.start_at ?? task.config.next_run, defaults.timezone).slice(5, 7)) } } : { kind: "schedule", request_id: crypto.randomUUID(), name: template?.name ?? "", content: template?.prompt ?? "", enabled: true, config: { ...defaults, frequency: template?.frequency ?? "daily", ...(template ? { source_template_id: template.id, source_template_version: template.version, time: "08:30" } : {}), ...(template?.frequency === "interval" ? { interval_value: 50, interval_unit: "minutes" } : {}) } });
    setError(""); setAttachments([]); setPlus(false); setTemplatesOpen(false);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft) return;
    if (saving) return;
    if (!draft.name.trim()) { setError("请输入任务名称"); return; }
    if (!draft.content.trim()) { setError("请输入提示词"); return; }
    if (!draft.config.weekdays.length && ["weekly", "biweekly", "interval"].includes(draft.config.frequency)) { setError("请至少选择一个星期。"); return; }
    setSaving(true); setError("");
    try {
      const saved = await consoleApi<{ resource: Task }>(token, draft.id ? `resources/${draft.id}` : "resources", draft.id ? "PUT" : "POST", draft);
      setMockShopsByTask(previous => ({ ...previous, [saved.resource.id]: mockShopIds }));
      setDraft(null); switchTab("tasks"); setOpenGroups(current => ({ ...current, active: true })); setAttachments([]); setNotice(draft.id ? "任务更新成功。" : "任务创建成功。"); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const mutate = async (task: Task, action: "run" | "toggle" | "delete") => {
    setBusyId(task.id); setError("");
    try {
      if (action === "run") { await consoleApi(token, `resources/${task.id}/run`, "POST"); switchTab("runs"); setNotice("任务已开始，点击打开会话查看执行详情。"); }
      if (action === "toggle") { await consoleApi(token, `resources/${task.id}/schedule-state`, "POST", { enabled: !task.enabled, revision: task.revision }); setNotice(task.enabled ? "任务已暂停。" : "任务已恢复。"); setConfirmation(null); }
      if (action === "delete") { await consoleApi(token, `resources/${task.id}`, "DELETE"); setConfirmation(null); setNotice("任务已删除。"); }
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusyId(""); }
  };
  const filteredTasks = tasks.filter(task => `${task.name} ${task.content}`.toLowerCase().includes(search.trim().toLowerCase()));
  const scheduleRuns = runs.filter(run => (tasks.some(task => task.id === run.resource_id) || run.kind === "schedule") && run.name.toLowerCase().includes(search.trim().toLowerCase()));

  const templates = scheduleTemplates.filter(template => !templatesOpen || (`${template.name} ${template.prompt}`.toLowerCase().includes(templateSearch.trim().toLowerCase()) && (templateTag === "all" || template.tags.includes(templateTag))));
  const templateGrid = <div className="scheduleTemplateGrid">{templates.map(template => <button className="scheduleTemplate" key={template.id} onClick={() => open(undefined, template)}><span className="templateIllustration" aria-hidden="true">{template.icon}</span><span><strong>{t(template.name)}</strong><span className="scheduleTemplateTags">{template.tags.slice(0, 3).map(tag => <span key={tag}>{t(tag)}</span>)}</span><span className="templateDescription" title={template.prompt}>{t(template.description)}</span><small><AlarmClock size={13} /> {template.frequency === "interval" ? t("每50分钟执行1次") : template.frequency === "weekly" ? t("每周一至周五 08:30") : t("每天 08:30")}</small></span><span className="templateArrow">↗</span></button>)}</div>;
  const runningIds = new Set([...tasks.filter(task => task.executing).map(task => task.id), ...runs.filter(run => ["running", "waiting_approval"].includes(run.status)).map(run => run.resource_id)]);
  const statusNames = { active: "运行中", paused: "已暂停", ended: "已结束" };
  const groupedTasks = (["active", "paused", "ended"] as const).map(status => ({ status, tasks: filteredTasks.filter(task => task.status === status).sort((a, b) => {
    const nextA = status === "active" ? Date.parse(a.config.next_run) : Infinity;
    const nextB = status === "active" ? Date.parse(b.config.next_run) : Infinity;
    return nextA - nextB || Date.parse(b.updated_at) - Date.parse(a.updated_at);
  }) }));
  const nextLabel = (task: Task) => {
    if (runningIds.has(task.id)) return "执行中";
    if (task.status !== "active") return statusNames[task.status];
    const next = toZoneInput(task.config.next_run, task.config.timezone);
    const today = toZoneInput(new Date().toISOString(), task.config.timezone).slice(0, 10);
    return `下一次执行时间：${next.slice(0, 10) === today ? "今天" : next.slice(0, 10)} ${next.slice(11)}`;
  };
  const setDate = (value: string) => {
    if (!draft || !value) return;
    try { const time = zonedISO(value, draft.config.timezone); config({ start_at: time, next_run: time }); setError(""); } catch (e) { setError((e as Error).message); }
  };


  return <section ref={pageRef} onScroll={event => { savedPage.current.scroll = event.currentTarget.scrollTop; }} className="consolePage schedulePage">
    <div className="scheduleTopbar"><div className="consoleTabs" role="tablist" aria-label={t("自动化")}><button id="schedule-tasks-tab" role="tab" aria-selected={tab === "tasks"} aria-controls="schedule-panel" className={tab === "tasks" ? "active" : ""} onClick={() => switchTab("tasks")}>{t("任务列表")}<span>{tasks.length}</span></button><button id="schedule-runs-tab" role="tab" aria-selected={tab === "runs"} aria-controls="schedule-panel" className={tab === "runs" ? "active" : ""} onClick={() => switchTab("runs")}>{t("运行记录")}</button></div><div className="scheduleTools"><input aria-label={t("搜索定时任务或运行记录")} placeholder={tab === "tasks" ? t("搜索任务…") : t("搜索运行记录…")} value={search} onChange={event => setSearch(event.target.value)} /><button className="iconButton" aria-label={t("刷新定时任务")} onClick={() => { setLoading(true); setError(""); void refresh().catch(e => setLoadError((e as Error).message)).finally(() => setLoading(false)); }}>↻</button><div className="scheduleCreate"><button className="primaryButton" onClick={() => open()}>{t("＋ 创建自动化任务")}</button><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="scheduleCreateMore" aria-label={t("更多创建方式")}><ChevronDown size={15} /></button></DropdownMenuTrigger><DropdownMenuContent data-ui-popup="menu" align="end" sideOffset={8} className="xixiDropdownPopup"><DropdownMenuItem onSelect={() => open()}>{t("自定义创建")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setTemplatesOpen(true)}>{t("从模板开始")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></div></div>

    {token && !loading && !!search.trim() && <button type="button" className="textButton accent automationClearSearch" onClick={() => setSearch("")}>{t("清空搜索条件")}</button>}
    {!token ? <div className="scheduleEmpty"><Box size={44} /><h3>{t("开启你的自动化工作空间")}</h3><p>{t("登录后创建任务、选择智能体并查看运行记录。")}</p><button className="primaryButton" onClick={onLogin}>{t("登录 / 注册")}</button></div> : <div id="schedule-panel" role="tabpanel" aria-labelledby={tab === "tasks" ? "schedule-tasks-tab" : "schedule-runs-tab"}>
      {loading ? <div className="consoleLoading">{t("正在读取定时任务…")}</div> : tab === "runs" ? <div className="scheduleRecords">{scheduleRuns.length ? <AutomationRuns runs={scheduleRuns} busyId={busyId} onOpenSession={onOpenSession} onDelete={setRunToDelete} /> : <div className="scheduleEmpty"><AlarmClock size={40} /><h3>{search ? t("没有匹配的运行记录") : t("等待第一次运行")}</h3><p>{t("任务执行后，运行状态和会话入口会出现在这里。")}</p></div>}</div> : <>
        {!tasks.length && <div className="scheduleBanner"><div className="scheduleBannerArt" aria-hidden="true"><div className="bannerClock"><AlarmClock size={35} /></div><div className="bannerSheet"><span /><span /><span /><span /></div><Sparkles className="bannerSparkle" size={25} /></div><div><span className="scheduleKicker">YOUR ALWAYS-ON TEAM</span><h3>{t("搭建你的店铺经营自动化任务")}</h3><p>{t("定时监控经营数据、执行重复事项，让智能体为你生成清晰的经营洞察。")}</p></div></div>}
        {!filteredTasks.length ? <div className="scheduleEmpty"><div className="scheduleEmptyIcon"><Image src="https://bmfppeqixqhinyklhbzo.supabase.co/storage/v1/object/public/xixi-agentscope-studio/assert/no-data.png" alt="" width={96} height={96} unoptimized /></div>{search && <><h3>{t("没有找到匹配任务")}</h3><p>{t("试试其他关键词。")}</p></>}{!search && <button className="primaryButton" onClick={() => open()}>{t("＋ 创建第一个定时任务")}</button>}</div> : <div className="scheduleGroups">{groupedTasks.filter(group => group.tasks.length).map(group => <div className="scheduleTaskGroup" key={group.status}><button type="button" className="scheduleGroupHeading" aria-expanded={openGroups[group.status]} onClick={() => setOpenGroups(current => ({ ...current, [group.status]: !current[group.status] }))}><ChevronDown size={16} style={{ transform: openGroups[group.status] ? undefined : "rotate(-90deg)" }} />{t(group.status === "active" ? "当前" : statusNames[group.status])}<span>{group.tasks.length}</span></button>{openGroups[group.status] && <ul className="scheduleTaskList" aria-label={t(group.status === "active" ? "当前任务" : statusNames[group.status])}>{group.tasks.map(task => <AutomationRow className={`scheduleTaskRow scheduleTaskRow--${task.status}`} key={task.id} actions={<>

            {task.status === "active" && <button type="button" className="automationRowAction scheduleTaskRun" disabled={busyId === task.id || runningIds.has(task.id)} aria-label={`${t("立即执行")}：${task.name}`} title={runningIds.has(task.id) ? t("执行中") : t("立即执行")} onClick={() => void mutate(task, "run")}><CirclePlay size={17} aria-hidden="true" /></button>}
            <AutomationRowMenu label={`${t("更多操作")}：${task.name}`} disabled={busyId === task.id}>
              <DropdownMenuItem onSelect={() => open(task)}><Pencil size={14} />{t("编辑")}</DropdownMenuItem>
              {task.status !== "ended" && <DropdownMenuItem onSelect={() => task.status === "active" ? setConfirmation({ task, action: "toggle" }) : void mutate(task, "toggle")}>{task.status === "active" ? <Pause size={14} /> : <Play size={14} />}{t(task.status === "active" ? "暂停" : "恢复")}</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => { setTab("runs"); setSearch(task.name); }}><History size={14} />{t("运行记录")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="scheduleTaskDelete" onSelect={() => setConfirmation({ task, action: "delete" })}><Trash2 size={14} />{t("删除")}</DropdownMenuItem>
            </AutomationRowMenu>

        </>}>
          <button type="button" className="automationRowOpen scheduleTaskOpen" title={task.name} aria-label={`${t("编辑")}：${task.name}`} onClick={() => open(task)} disabled={busyId === task.id}><span className="scheduleTaskTitle">{task.name}</span>
          <span className="scheduleTaskRecurrence" title={`${t(recurrence({ ...defaultConfig(), ...task.config }))} · ${task.config.timezone}`}><AlarmClock size={14} aria-hidden="true" /><span>{t(recurrence({ ...defaultConfig(), ...task.config }))}</span></span>
          <span className={`scheduleTaskNext${runningIds.has(task.id) ? " isExecuting" : ""}`} title={task.status === "active" ? `${t(nextLabel(task))} · ${task.config.timezone}` : undefined}>{t(nextLabel(task))}</span>
        </button>
        </AutomationRow>)}</ul>}</div>)}</div>}

        {!tasks.length && <div ref={templateRef} className="scheduleTemplates"><div className="sectionTitle"><div><h3>{t("从模板开始")}</h3></div><button className="textButton" onClick={() => setTemplatesOpen(true)}>{t("查看全部 ↗")}</button></div>{templateGrid}</div>}

      </>}
    </div>}
    {templatesOpen && <div className="modalBackdrop" onMouseDown={event => { if (event.target === event.currentTarget) setTemplatesOpen(false); }}><div role="dialog" aria-modal="true" aria-label={t("选择定时任务模板")} className="resourceEditor templateDialog"><div className="sectionTitle"><div><p className="eyebrow">TEMPLATE LIBRARY</p><h3>{t("为你的下一件工作选择模板")}</h3></div><button autoFocus className="closeButton" aria-label={t("关闭模板")} onClick={() => setTemplatesOpen(false)}>×</button></div><div className="scheduleTemplateFilters"><input aria-label={t("搜索模板")} placeholder={t("搜索模板名称或提示词…")} value={templateSearch} onChange={event => setTemplateSearch(event.target.value)} /><SelectField aria-label={t("模板标签")} value={templateTag} onValueChange={setTemplateTag} options={[{ value: "all", label: t("全部标签") }, ...Array.from(new Set(scheduleTemplates.flatMap(item => item.tags))).map(tag => ({ value: tag, label: t(tag) }))]} /></div>{templates.length ? templateGrid : <p>{t("没有匹配的模板")}</p>}</div></div>}
    {draft && <div className="modalBackdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setDraft(null); }}><form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="schedule-editor-title" className="resourceEditor scheduleEditor" onSubmit={event => void save(event)}>
      <div className="sectionTitle"><div><p className="eyebrow">SCHEDULE A LITTLE MAGIC</p><h3 id="schedule-editor-title">{draft.id ? t("编辑定时任务") : t("创建定时任务")}</h3></div><button type="button" className="closeButton" aria-label={t("关闭编辑器")} disabled={saving} onClick={() => setDraft(null)}>×</button></div>
      <label>{t("任务名称")}<input required maxLength={100} value={draft.name} placeholder={t("给这个任务起个名字")} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <div className="scheduleAgentField"><span className="scheduleFieldLabel">{t("智能体")}</span><AgentPicker token={token} id={draft.config.agent_id} disabled={saving} hasHistory={false} onManage={() => onManageResources?.("agent")} onSelect={agent => { config({ agent_id: agent.id, skill_ids: [], mcp_ids: [] }); setMockShopIds([]); if (draft.config.skill_ids.length || draft.config.mcp_ids.length || mockShopIds.length) setNotice("已切换智能体，请重新选择适用的能力和店铺。"); }} /></div>
      <label htmlFor="schedule-prompt">{t("任务提示词")}<span className="requiredMark">*</span></label><div className="scheduleComposer">
        <div className="scheduleTags"><ComposerResourceTags options={resourceOptions} value={{ ...draft.config, shop_ids: mockShopIds }} onChange={(key, ids) => key === "shop_ids" ? setMockShopIds(ids) : config({ [key]: ids })} disabled={saving} />{attachments.map(file => <span className="scheduleTag attachmentTag" key={file.id} title={t("仅交互预览，暂不参与执行")}><CloudUpload size={14} />{file.name} <small>{(file.size / 1024).toFixed(0)} {t("KB · 占位")}</small><button type="button" aria-label={t(`移除附件${file.name}`)} onClick={() => setAttachments(items => items.filter(item => item.id !== file.id))}>×</button></span>)}</div>
        <textarea id="schedule-prompt" required maxLength={2000} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} placeholder={t("请详细描述 AI 应如何执行这项任务")} rows={5} />
        <div className="scheduleComposerBottom"><div className="schedulePlusWrap"><ComposerResourceMenu open={plus} onOpenChange={setPlus} loading={resourceLoading} error={resourceError} onWorkflows={() => onManageResources?.("workflow")} options={resourceOptions} value={{ ...draft.config, shop_ids: mockShopIds }} onChange={(key, ids) => key === "shop_ids" ? setMockShopIds(ids) : config({ [key]: ids })} disabled={saving} onUpload={() => attachmentRef.current?.click()} onRefresh={() => void loadResourceOptions(draft.config.agent_id)} onCheckMcp={async id => { await consoleApi(token, `resources/${id}/test`, "POST"); }} onManage={key => onManageResources?.(key === "skill_ids" ? "skill" : "mcp")} /></div><div className="scheduleModel"><Box size={15} /><ModelPicker aria-label={t("对话模型")} value={draft.config.model_id} onValueChange={value => config({ model_id: value })} placeholder={models.length ? t("选择模型") : t("尚未配置模型")} disabled={!models.length} models={models.map(model => ({ id: model.id, name: model.displayName || model.modelName, description: t(`${model.modelName}${model.isDefault ? t(" · 默认模型") : ""}`), keywords: [model.modelName] }))} /></div></div>
      </div><input ref={attachmentRef} hidden type="file" multiple accept=".txt,.md,.markdown,.csv,.pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={event => { const files = Array.from(event.target.files ?? []); if (files.some(file => !file.type.startsWith("image/") && !/\.(txt|md|markdown|csv|pdf|docx?|xlsx?|png|jpe?g|gif|webp|bmp|avif|svg|heic|tiff?)$/i.test(file.name))) { setError(t("请选择 TXT、Markdown、CSV、PDF、Word、Excel 或图片文件。")); event.target.value = ""; return; } setAttachments(items => [...items, ...files.map(file => ({ id: crypto.randomUUID(), name: file.name, size: file.size }))]); event.target.value = ""; }} />
      {!models.length && <p className="formHint warning">{t("请先配置一个 LLM 模型。")}<button type="button" className="textButton accent" onClick={() => { setDraft(null); onModels(); }}>{t("前往模型设置 ↗")}</button></p>}
      <div className="scheduleDivider" />
      <div className="scheduleTimingRow">
        <div className="scheduleInlineField"><span>{t("重复")}：</span><SelectField aria-label={t("重复频率")} value={draft.config.frequency} onValueChange={value => { const start = value === "once" ? new Date(Date.now() + 3600000).toISOString() : draft.config.start_at ?? draft.config.next_run; config({ frequency: value, start_at: start, next_run: start, ...(value === "once" ? { end_date: "" } : {}) }); }} options={Object.entries(frequencyNames).filter(([key]) => key !== "hourly" || draft.config.frequency === "hourly").map(([value, label]) => ({ value, label: t(label) }))} /></div>
        <div className="scheduleInlineField"><span>{t(draft.config.frequency === "interval" ? "每隔" : "时间")}：</span>
          {draft.config.frequency === "once" ? <input aria-label={t("执行日期和时间")} type="datetime-local" required value={toZoneInput(draft.config.start_at ?? draft.config.next_run, draft.config.timezone)} onChange={event => setDate(event.target.value)} /> : draft.config.frequency === "interval" ? <><input aria-label={t("间隔数值")} className="scheduleIntervalValue" type="number" min={1} max={999999} step={1} required value={draft.config.interval_value} onChange={event => config({ interval_value: Number(event.target.value) })} /><SelectField aria-label={t("间隔单位")} value={draft.config.interval_unit} onValueChange={value => config({ interval_unit: value })} options={[{ value: "minutes", label: t("分钟") }, { value: "hours", label: t("小时") }]} /></> : <input aria-label={t("执行时间")} type="time" required value={draft.config.time ?? "08:30"} onChange={event => config({ time: event.target.value })} />}
        </div>
        <div className="scheduleInlineField"><span>{t("有效期")}：</span><SelectField aria-label={t("有效期")} disabled={draft.config.frequency === "once"} value={draft.config.end_date ? "date" : "forever"} onValueChange={value => config({ end_date: value === "forever" ? "" : toZoneInput(draft.config.start_at ?? draft.config.next_run, draft.config.timezone).slice(0, 10) })} options={draft.config.frequency === "once" ? [{ value: "forever", label: t("仅本次") }] : [{ value: "forever", label: t("长期有效") }, { value: "date", label: t("指定截止日期") }]} /></div>
      </div>
      {draft.config.frequency !== "once" && <>
        {["monthly", "yearly"].includes(draft.config.frequency) && <div className="formColumns scheduleDateFields">{draft.config.frequency === "yearly" && <label>{t("月份")}<SelectField aria-label={t("执行月份")} value={String(draft.config.month)} onValueChange={value => { const month = Number(value); config({ month, month_day: Math.min(draft.config.month_day ?? 1, new Date(2000, month, 0).getDate()) }); }} options={Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}月` }))} /></label>}<label>{t("日期")}<SelectField aria-label={t("执行日期")} value={String(draft.config.month_day)} onValueChange={value => config({ month_day: Number(value) })} options={Array.from({ length: draft.config.frequency === "yearly" ? new Date(2000, draft.config.month ?? 1, 0).getDate() : 31 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}日` }))} /></label></div>}
        {["weekly", "biweekly", "interval"].includes(draft.config.frequency) && <div className="scheduleWeekdays" role="group" aria-label={t("执行星期")}>{weekNames.map((name, index) => <button type="button" key={name} aria-pressed={draft.config.weekdays.includes(index)} className={draft.config.weekdays.includes(index) ? "active" : ""} onClick={() => config({ weekdays: draft.config.weekdays.includes(index) ? draft.config.weekdays.filter(day => day !== index) : [...draft.config.weekdays, index].sort() })}>{t(`周${name}`)}</button>)}</div>}
        {["monthly", "yearly", "biweekly"].includes(draft.config.frequency) && <p className="formHint">{draft.config.frequency === "biweekly" ? t("以开始时间所在周为起点，每两周执行。") : t("不存在所选日期时跳过，不顺延；2月29日仅在闰年执行。")}</p>}
        {draft.config.end_date && <label className="scheduleDateFields">{t("截止日期（当天 23:59:59）")}<input type="date" required value={draft.config.end_date} min={toZoneInput(draft.config.start_at ?? draft.config.next_run, draft.config.timezone).slice(0, 10)} onChange={event => config({ end_date: event.target.value })} /></label>}
        <details className="scheduleAdvanced"><summary>{t("更多调度设置")}</summary><label>{t("开始时间")}<input type="datetime-local" required value={toZoneInput(draft.config.start_at ?? draft.config.next_run, draft.config.timezone)} onChange={event => setDate(event.target.value)} /></label><p className="formHint">{draft.config.timezone}</p></details>
      </>}

      <div className="editorFooter"><span>{t("仅当前账号可见 · 服务在线时执行")}</span><button type="button" className="secondaryButton" disabled={saving} onClick={() => setDraft(null)}>{t("取消")}</button><button className="primaryButton" disabled={saving || !models.length}>{saving ? t("保存中…") : draft.id ? t("保存修改") : t("创建任务")}</button></div>
    </form></div>}
    <AlertDialog.Root open={!!runToDelete} onOpenChange={value => { if (!value && !busyId) setRunToDelete(null); }}><AlertDialog.Portal><AlertDialog.Overlay className="studio-dialog-overlay" /><AlertDialog.Content className="studio-confirm"><AlertDialog.Title>{t("确认删除运行记录？")}</AlertDialog.Title><AlertDialog.Description>{t("此记录将从运行列表中移除，自动化任务和对应会话将保留。")}</AlertDialog.Description><div><AlertDialog.Cancel asChild><button type="button" disabled={!!busyId}>{t("取消")}</button></AlertDialog.Cancel><button type="button" className="danger" disabled={!!busyId} onClick={() => void deleteRun()}>{t(busyId ? "处理中…" : "删除")}</button></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
    <AlertDialog.Root open={!!confirmation} onOpenChange={value => { if (!value && !busyId) setConfirmation(null); }}><AlertDialog.Portal><AlertDialog.Overlay className="studio-dialog-overlay" /><AlertDialog.Content className="studio-confirm"><AlertDialog.Title>{t(confirmation?.action === "delete" ? "确认删除任务？" : "确认暂停任务？")}</AlertDialog.Title><AlertDialog.Description>{t(confirmation?.action === "delete" ? "删除后不再自动执行，已开始的执行、历史记录及会话将保留。" : "暂停后不再自动执行，已开始的执行会继续；暂停期间错过的执行不补发。")}</AlertDialog.Description><div><AlertDialog.Cancel asChild><button type="button" disabled={!!busyId}>{t("取消")}</button></AlertDialog.Cancel><button type="button" className={confirmation?.action === "delete" ? "danger" : "primaryButton"} disabled={!!busyId} onClick={() => confirmation && void mutate(confirmation.task, confirmation.action)}>{t(busyId ? "处理中…" : "确认")}</button></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </section>;
}
