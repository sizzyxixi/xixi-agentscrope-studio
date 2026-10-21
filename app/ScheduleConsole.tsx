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
import { AlarmClock, Box, ChevronDown, CloudUpload } from "./lucide-icons";
import { AutomationRow, AutomationRowMenu } from "./AutomationRow";
import { AutomationRuns, type AutomationRun } from "./AutomationRuns";
import { consoleApi } from "./StudioConsole";
import { frequencyNames } from "./schedule-templates";
import { projectSchedule, toZoneInput, userTimezone, zonedISO } from "./schedule-timezone";
import { scheduleImageUrls } from "./schedule-assets";
import { RepeatPicker, ValidityPicker, ScheduleClock, ScheduleDateTime, ScheduleInterval } from "./ScheduleControls";
import { SelectField, ModelPicker } from "@/components/SelectField";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/hero-ui/dropdown-menu";

type Choice = { id: string; name: string; content?: string; enabled: boolean };
type Shop = Choice & { country: string; mode: string; authorized: boolean };
type Model = { id: string; displayName: string; modelName: string; isDefault: boolean };
type Options = { agents: Choice[]; skills: Choice[]; mcps: Choice[]; shops: Shop[] };
type Config = { frequency: string; next_run: string; start_at?: string; timezone: string; model_id: string; agent_id: string; skill_ids: string[]; mcp_ids: string[]; shop_ids: string[]; weekdays: number[]; interval_value: number; interval_unit: string; end_date: string; end_at?: string; time?: string; month_day?: number; month_days?: number[]; month?: number; source_template_id?: string; source_template_version?: number };
type Task = { id: string; kind: "schedule"; name: string; content: string; enabled: boolean; config: Config; updated_at: string; revision: number; executing: boolean; status: "active" | "paused" | "ended" };
type Draft = Omit<Task, "id" | "updated_at" | "revision" | "status" | "executing"> & { id?: string; revision?: number; request_id?: string };
type Template = { id: string; version: number; name: string; content: string; description: string; icon: string; tags: string[]; config: Partial<Config> };
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
  return { frequency: "daily", next_run: start, start_at: start, time: future.slice(11), month_day: Number(future.slice(8, 10)), month_days: [Number(future.slice(8, 10))], month: Number(future.slice(5, 7)), timezone: zone, model_id: "", agent_id: "main", skill_ids: [], mcp_ids: [], shop_ids: [], weekdays: [0, 1, 2, 3, 4], interval_value: 1, interval_unit: "hours", end_date: "" };
};
function recurrence(config: Config) {
  const weekdays = [...config.weekdays].sort().map(day => weekNames[day]).join("、");
  const first = toZoneInput(config.start_at ?? config.next_run, config.timezone);
  const time = config.time ?? first.slice(11);
  if (config.frequency === "once") return first.replace("T", " ");
  if (config.frequency === "interval") return `每${config.interval_value}小时执行1次`;
  if (["weekly", "biweekly"].includes(config.frequency)) return `${frequencyNames[config.frequency]}${weekdays} ${time}`;
  if (config.frequency === "monthly") return `每月${(config.month_days ?? [config.month_day ?? Number(first.slice(8, 10))]).map(day => `${day}日`).join("、")} ${time}`;
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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateTag, setTemplateTag] = useState("");
  const [zone, setZone] = useState(userTimezone);
  const originalConfig = useRef<Config | null>(null);
  const [originalZone, setOriginalZone] = useState("");
  const timingEdited = useRef(false);
  useEffect(() => {
    const update = () => { const nextZone = userTimezone(); setZone(nextZone); setDraft(current => current && current.config.timezone !== nextZone ? { ...current, config: projectSchedule(current.config, nextZone) } : current); };
    const timer = window.setInterval(update, 5000); window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const [confirmation, setConfirmation] = useState<{ task: Task; action: "toggle" | "delete" } | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
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
    const [resources, records, available, templateData, response] = await Promise.all([
      consoleApi<{ resources: Task[] }>(token, "resources?kind=schedule"),
      consoleApi<{ runs: Run[] }>(token, "runs?kind=schedule"),
      consoleApi<Options>(token, "schedule-options"),
      consoleApi<{ templates: Template[] }>(token, "schedule-templates"),
      fetch("/api/models", { headers: { authorization: `Bearer ${token}` } }),
    ]);
    if (!response.ok) throw new Error("模型列表读取失败，请检查服务连接后重试。");
    const modelData = await response.json() as { models: Model[] };
    setTasks(resources.resources); setRuns(records.runs); setTemplates(templateData.templates); setOptions(available); setModels(modelData.models); setLoadError("");
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
    originalConfig.current = task?.config ?? null; setOriginalZone(task?.config.timezone ?? zone); timingEdited.current = false;
    setMockShopIds(task ? mockShopsByTask[task.id] ?? [] : []);
    const defaults = defaultConfig();
    defaults.model_id = models.find(model => model.isDefault)?.id ?? models[0]?.id ?? "";
    if (task) setDraft({ ...task, config: projectSchedule({ ...defaults, ...task.config, month_days: task.config.month_days ?? [task.config.month_day ?? Number(toZoneInput(task.config.start_at ?? task.config.next_run, task.config.timezone).slice(8, 10))] }, zone) });
    else {
      const templateConfig = template?.config ?? {};
      const merged = { ...defaults, ...templateConfig, timezone: zone, model_id: templateConfig.model_id || defaults.model_id, ...(template ? { source_template_id: template.id, source_template_version: template.version } : {}) };
      setDraft({ kind: "schedule", request_id: crypto.randomUUID(), name: template?.name ?? "", content: template?.content ?? "", enabled: true, config: merged });
    }
    setError(""); setAttachments([]); setPlus(false); setTemplatesOpen(false);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft) return;
    if (saving) return;
    if (!draft.name.trim()) { setError("请输入任务名称"); return; }
    if (!draft.content.trim()) { setError("请输入提示词"); return; }
    if (!draft.config.weekdays.length && ["weekly", "biweekly"].includes(draft.config.frequency)) { setError("请至少选择一个星期。"); return; }
    setSaving(true); setError("");
    const savedConfig = { ...draft.config };
    if (draft.id && !timingEdited.current && originalConfig.current) {
      for (const key of timingKeys) { if (key in originalConfig.current) Object.assign(savedConfig, { [key]: originalConfig.current[key] }); else delete savedConfig[key]; }
    }
    try {
      const saved = await consoleApi<{ resource: Task }>(token, draft.id ? `resources/${draft.id}` : "resources", draft.id ? "PUT" : "POST", { ...draft, config: savedConfig });
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

  const openTemplate = async (id: string) => {
    try {
      const result = await consoleApi<{ templates: Template[] }>(token, "schedule-templates");
      setTemplates(result.templates);
      const template = result.templates.find(item => item.id === id);
      if (!template) { setError("模板已停用，请选择其他模板。"); return; }
      open(undefined, template);
    } catch (error) { setError((error as Error).message); }
  };
  const filteredTemplates = templates.filter(template => (!templatesOpen || `${template.name} ${template.content}`.toLowerCase().includes(templateSearch.trim().toLowerCase())) && (!templatesOpen || !templateTag || template.tags.includes(templateTag)));
  const templateGrid = <div className="scheduleTemplateGrid">{filteredTemplates.map(template => <button className="scheduleTemplate" key={`${template.id}:${template.version}`} onClick={() => void openTemplate(template.id)}><TemplateIcon template={template} /><span className="scheduleTemplateContent"><strong>{t(template.name)}</strong><span className="scheduleTemplateTags">{template.tags.slice(0, 3).map(tag => <span key={tag}>{t(tag)}</span>)}</span><span className="templateDescription" title={template.content}>{t(template.description)}</span><small><AlarmClock size={13} />{t(recurrence({ ...defaultConfig(), ...template.config }))}</small></span><span className="templateArrow">↗</span></button>)}</div>;
  const runningIds = new Set([...tasks.filter(task => task.executing).map(task => task.id), ...runs.filter(run => ["running", "waiting_approval"].includes(run.status)).map(run => run.resource_id)]);
  const statusNames = { active: "运行中", paused: "已暂停", ended: "已结束" };
  const groupedTasks = (["active", "paused", "ended"] as const).map(status => ({ status, tasks: filteredTasks.filter(task => task.status === status).sort((a, b) => {
    const nextA = status === "active" ? Date.parse(a.config.next_run) : Infinity;
    const nextB = status === "active" ? Date.parse(b.config.next_run) : Infinity;
    return nextA - nextB || Date.parse(b.updated_at) - Date.parse(a.updated_at);
  }) }));
  const taskRecurrence = (task: Task) => {
    const viewConfig = projectSchedule({ ...defaultConfig(), ...task.config }, zone);
    // A month boundary can map to a varying date (for example the last day of
    // the preceding month). Show the actual local occurrence instead of a false
    // fixed day-of-month rule in another timezone.
    if (task.config.timezone !== zone && ["monthly", "yearly"].includes(task.config.frequency)) return `${t(frequencyNames[task.config.frequency])} · ${t("下次")} ${toZoneInput(task.config.next_run, zone).replace("T", " ")}`;
    return t(recurrence(viewConfig));
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
    <div className="scheduleTopbar"><div className="consoleTabs" role="tablist" aria-label={t("自动化")}><button id="schedule-tasks-tab" role="tab" aria-selected={tab === "tasks"} aria-controls="schedule-panel" className={tab === "tasks" ? "active" : ""} onClick={() => switchTab("tasks")}>{t("任务列表")}{tasks.length > 0 && <span>{tasks.length}</span>}</button><button id="schedule-runs-tab" role="tab" aria-selected={tab === "runs"} aria-controls="schedule-panel" className={tab === "runs" ? "active" : ""} onClick={() => switchTab("runs")}>{t("运行记录")}</button></div><div className="scheduleTools"><input aria-label={t("搜索定时任务或运行记录")} placeholder={tab === "tasks" ? t("搜索任务…") : t("搜索运行记录…")} value={search} onChange={event => setSearch(event.target.value)} /><div className="scheduleCreate"><button className="primaryButton" onClick={() => open()}>{t("＋ 创建自动化任务")}</button><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="scheduleCreateMore" aria-label={t("更多创建方式")}><ChevronDown size={15} /></button></DropdownMenuTrigger><DropdownMenuContent data-ui-popup="menu" align="end" sideOffset={8} className="xixiDropdownPopup"><DropdownMenuItem onSelect={() => open()}>{t("自定义创建")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setTemplatesOpen(true)}>{t("从模板开始")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></div></div>

    {token && !loading && !!search.trim() && <button type="button" className="textButton accent automationClearSearch" onClick={() => setSearch("")}>{t("清空搜索条件")}</button>}
    {!token ? <div className="scheduleEmpty"><Box size={44} /><h3>{t("开启你的自动化工作空间")}</h3><p>{t("登录后创建任务、选择智能体并查看运行记录。")}</p><button className="primaryButton" onClick={onLogin}>{t("登录 / 注册")}</button></div> : <div id="schedule-panel" role="tabpanel" aria-labelledby={tab === "tasks" ? "schedule-tasks-tab" : "schedule-runs-tab"}>
      {loading ? <div className="consoleLoading">{t("正在读取定时任务…")}</div> : tab === "runs" ? <div className="scheduleRecords">{scheduleRuns.length ? <AutomationRuns runs={scheduleRuns} busyId={busyId} onOpenSession={onOpenSession}  /> : <div className="scheduleEmpty"><AlarmClock size={40} /><h3>{search ? t("没有匹配的运行记录") : t("等待第一次运行")}</h3><p>{t("任务执行后，运行状态和会话入口会出现在这里。")}</p></div>}</div> : <>
        {!tasks.length && <div className="scheduleBanner"><Image className="scheduleBannerArt" src={scheduleImageUrls.banner} alt="" width={136} height={125} unoptimized /><div><h3>{t("搭建你的店铺经营自动化任务")}</h3><p>{t("通过定时任务自动监控动态数据、执行可重复运营事项、每天为你生成清晰的经营洞察")}</p></div></div>}
        {!filteredTasks.length ? <div className="scheduleEmpty scheduleTaskEmpty"><div className="scheduleEmptyIcon"><Image src={scheduleImageUrls.empty} alt="" width={120} height={120} unoptimized /></div>{search && <><h3>{t("没有找到匹配任务")}</h3><p>{t("试试其他关键词。")}</p></>}{!search && <button className="primaryButton" onClick={() => open()}>{t("＋ 创建第一个自动化任务")}</button>}</div> : <div className="scheduleGroups">{groupedTasks.filter(group => group.tasks.length).map(group => <div className="scheduleTaskGroup" key={group.status}><button type="button" className="scheduleGroupHeading" aria-expanded={openGroups[group.status]} onClick={() => setOpenGroups(current => ({ ...current, [group.status]: !current[group.status] }))}><ChevronDown size={16} style={{ transform: openGroups[group.status] ? undefined : "rotate(-90deg)" }} />{t(group.status === "active" ? "当前" : statusNames[group.status])}<span>{group.tasks.length}</span></button>{openGroups[group.status] && <ul className="scheduleTaskList" aria-label={t(group.status === "active" ? "当前任务" : statusNames[group.status])}>{group.tasks.map(task => <AutomationRow className={`scheduleTaskRow scheduleTaskRow--${task.status}`} key={task.id} actions={<>

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
          <span className="scheduleTaskRecurrence" title={`${taskRecurrence(task)} · ${zone}`}><AlarmClock size={14} aria-hidden="true" /><span>{taskRecurrence(task)}</span></span>
          <span className={`scheduleTaskNext${runningIds.has(task.id) ? " isExecuting" : ""}`} title={task.status === "active" ? `${t(nextLabel(task))} · ${zone}` : undefined}>{t(nextLabel(task))}</span>
        </button>
        </AutomationRow>)}</ul>}</div>)}</div>}

        {!tasks.length && templates.length > 0 && <div ref={templateRef} className="scheduleTemplates"><div className="sectionTitle"><div><h3>{t("从模板开始")}</h3></div><button className="textButton" onClick={() => setTemplatesOpen(true)}>{t("查看更多")}</button></div>{templateGrid}</div>}

      </>}
    </div>}
    {templatesOpen && <div className="modalBackdrop" onMouseDown={event => { if (event.target === event.currentTarget) setTemplatesOpen(false); }}><div role="dialog" aria-modal="true" aria-label={t("选择定时任务模板")} className="resourceEditor templateDialog"><div className="sectionTitle"><div><h3>{t("为你的下一件工作选择模板")}</h3></div><button autoFocus className="closeButton" aria-label={t("关闭模板")} onClick={() => setTemplatesOpen(false)}>×</button></div><div className="scheduleTemplateFilters"><input aria-label={t("搜索模板")} placeholder={t("搜索模板名称或提示词…")} value={templateSearch} onChange={event => setTemplateSearch(event.target.value)} /></div><div className="scheduleTemplateFilters"><SelectField aria-label={t("模板标签")} value={templateTag} placeholder={t("全部标签")} onValueChange={setTemplateTag} options={[{ value: "", label: t("全部标签") }, ...[...new Set(templates.flatMap(item => item.tags))].map(tag => ({ value: tag, label: t(tag) }))]} /></div>{filteredTemplates.length ? templateGrid : <p>{t("没有匹配的模板")}</p>}</div></div>}
    {draft && <div className="modalBackdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setDraft(null); }}><form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="schedule-editor-title" className="resourceEditor scheduleEditor" onSubmit={event => void save(event)}>
      <div className="sectionTitle"><div><h3 id="schedule-editor-title">{draft.id ? t("编辑定时任务") : t("创建定时任务")}</h3></div><button type="button" className="closeButton" aria-label={t("关闭编辑器")} disabled={saving} onClick={() => setDraft(null)}>×</button></div>
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
        <RepeatPicker value={draft.config} onChange={changes => { const start = changes.frequency === "once" ? new Date(Date.now() + 3600000).toISOString() : draft.config.start_at ?? draft.config.next_run; config({ ...changes, start_at: start, next_run: start, ...(changes.frequency === "once" ? { end_date: "", end_at: "" } : {}) }); }} />
        <div className="scheduleInlineField"><span>{t(draft.config.frequency === "interval" ? "每隔" : "时间")}：</span>
          {draft.config.frequency === "once" ? <ScheduleDateTime label={t("执行日期和时间")} value={toZoneInput(draft.config.start_at ?? draft.config.next_run, draft.config.timezone)} onChange={setDate} /> : draft.config.frequency === "interval" ? <ScheduleInterval value={draft.config.interval_value} onChange={config} /> : <ScheduleClock value={draft.config.time ?? "08:30"} onChange={time => config({ time })} />}
        </div>
        <ValidityPicker start={toZoneInput(draft.config.start_at ?? draft.config.next_run, draft.config.timezone).slice(0, 10)} end={draft.config.end_date} timezone={draft.config.timezone} disabled={draft.config.frequency === "once"} onChange={(start, end) => { const anchor = start ? zonedISO(`${start}T00:00`, draft.config.timezone) : new Date().toISOString(); const endAt = end ? new Date(Date.parse(zonedISO(`${end}T23:59`, zone)) + 59999).toISOString() : ""; config({ start_at: anchor, next_run: anchor, end_date: end, end_at: endAt }); }} />
      </div>
      {originalZone && originalZone !== zone && <p className="formHint">{t("已按当前时区换算。修改调度规则后，将按当前时区重新计算。")}</p>}
      {draft.config.frequency !== "once" && <>
        {draft.config.frequency === "yearly" && <div className="formColumns scheduleDateFields">{draft.config.frequency === "yearly" && <label>{t("月份")}<SelectField aria-label={t("执行月份")} value={String(draft.config.month)} onValueChange={value => { const month = Number(value); config({ month, month_day: Math.min(draft.config.month_day ?? 1, new Date(2000, month, 0).getDate()) }); }} options={Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}月` }))} /></label>}<label>{t("日期")}<SelectField aria-label={t("执行日期")} value={String(draft.config.month_day)} onValueChange={value => config({ month_day: Number(value) })} options={Array.from({ length: draft.config.frequency === "yearly" ? new Date(2000, draft.config.month ?? 1, 0).getDate() : 31 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}日` }))} /></label></div>}
        {["monthly", "yearly", "biweekly"].includes(draft.config.frequency) && <p className="formHint">{draft.config.frequency === "biweekly" ? t("以开始时间所在周为起点，每两周执行。") : t("不存在所选日期时跳过，不顺延；2月29日仅在闰年执行。")}</p>}
        <details className="scheduleAdvanced"><summary>{t("更多调度设置")}</summary><label>{t("开始时间")}<ScheduleDateTime label={t("开始时间")} value={toZoneInput(draft.config.start_at ?? draft.config.next_run, draft.config.timezone)} onChange={setDate} /></label><p className="formHint">{draft.config.timezone}</p></details>
      </>}

      <div className="editorFooter"><span>{t("仅当前账号可见 · 服务在线时执行")}</span><button type="button" className="secondaryButton" disabled={saving} onClick={() => setDraft(null)}>{t("取消")}</button><button className="primaryButton" disabled={saving || !models.length}>{saving ? t("保存中…") : draft.id ? t("保存修改") : t("创建任务")}</button></div>
    </form></div>}
    <AlertDialog.Root open={!!confirmation} onOpenChange={value => { if (!value && !busyId) setConfirmation(null); }}><AlertDialog.Portal><AlertDialog.Overlay className="studio-dialog-overlay" /><AlertDialog.Content className="studio-confirm"><AlertDialog.Title>{t(confirmation?.action === "delete" ? "确认删除任务？" : "确认暂停任务？")}</AlertDialog.Title><AlertDialog.Description>{t(confirmation?.action === "delete" ? "删除后不再自动执行，已开始的执行、历史记录及会话将保留。" : "暂停后不再自动执行，已开始的执行会继续；暂停期间错过的执行不补发。")}</AlertDialog.Description><div><AlertDialog.Cancel asChild><button type="button" disabled={!!busyId}>{t("取消")}</button></AlertDialog.Cancel><button type="button" className={confirmation?.action === "delete" ? "danger" : "primaryButton"} disabled={!!busyId} onClick={() => confirmation && void mutate(confirmation.task, confirmation.action)}>{t(busyId ? "处理中…" : "确认")}</button></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </section>;
}
