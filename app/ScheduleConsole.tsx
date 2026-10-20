"use client";

import { usePreferences } from "@/components/PreferencesProvider";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, Blocks, Box, ChevronDown, CloudUpload, Store, Sparkles } from "./lucide-icons";
import { consoleApi, dateLabel, RunList } from "./StudioConsole";
import { frequencyNames, scheduleTemplates } from "./schedule-templates";
import { SelectField, ModelPicker } from "@/components/SelectField";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";

type Choice = { id: string; name: string; content?: string; enabled: boolean };
type Shop = Choice & { country: string; mode: string; authorized: boolean };
type Model = { id: string; displayName: string; modelName: string; isDefault: boolean };
type Options = { agents: Choice[]; skills: Choice[]; mcps: Choice[]; shops: Shop[] };
type Config = { frequency: string; next_run: string; start_at?: string; timezone: string; model_id: string; agent_id: string; skill_ids: string[]; mcp_ids: string[]; shop_ids: string[]; weekdays: number[]; interval_value: number; interval_unit: string; end_date: string };
type Task = { id: string; kind: "schedule"; name: string; content: string; enabled: boolean; config: Config; updated_at: string };
type Draft = Omit<Task, "id" | "updated_at"> & { id?: string };
type Run = { kind?: string; id: string; name: string; resource_id: string; session_id: string; status: string; detail: string; created_at: string };
type Attachment = { id: string; name: string; size: number };
const emptyOptions: Options = { agents: [], skills: [], mcps: [], shops: [] };
const weekNames = ["一", "二", "三", "四", "五", "六", "日"];
const toBeijingInput = (value: string) => new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16);
const defaultConfig = (): Config => ({ frequency: "daily", next_run: new Date(Date.now() + 3600000).toISOString(), timezone: "Asia/Shanghai", model_id: "", agent_id: "main", skill_ids: [], mcp_ids: [], shop_ids: [], weekdays: [0, 1, 2, 3, 4], interval_value: 1, interval_unit: "hours", end_date: "" });
function recurrence(config: Config) {
  if (config.frequency === "interval") return `每 ${config.interval_value} ${{ minutes: "分钟", hours: "小时", days: "天" }[config.interval_unit] ?? "小时"}`;
  if (["weekly", "biweekly"].includes(config.frequency)) return `${frequencyNames[config.frequency]} · ${config.weekdays.map(day => `周${weekNames[day]}`).join("、")}`;
  return frequencyNames[config.frequency] ?? config.frequency;
}

export default function ScheduleConsole({ token, onLogin, onOpenSession, onModels }: { token: string; onLogin: () => void; onOpenSession: (id: string) => void; onModels: () => void }) {
  const { t } = usePreferences();
  const [tab, setTab] = useState("tasks");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [options, setOptions] = useState<Options>(emptyOptions);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [plus, setPlus] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [agentForm, setAgentForm] = useState<{ name: string; content: string } | null>(null);
  const attachmentRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [resources, records, available, response] = await Promise.all([
      consoleApi<{ resources: Task[] }>(token, "resources?kind=schedule"),
      consoleApi<{ runs: Run[] }>(token, "runs"),
      consoleApi<Options>(token, "schedule-options"),
      fetch("/api/models", { headers: { authorization: `Bearer ${token}` } }),
    ]);
    if (!response.ok) throw new Error("模型列表读取失败，请检查服务连接后刷新。");
    const modelData = await response.json() as { models: Model[] };
    setTasks(resources.resources); setRuns(records.runs); setOptions(available); setModels(modelData.models); setLoadError("");
  }, [token]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(refresh).catch(e => { if (active) setLoadError((e as Error).message); }).finally(() => { if (active) setLoading(false); });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void Promise.resolve().then(refresh).catch(e => { if (active) setLoadError((e as Error).message); });
    }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);
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
      if (document.querySelector('[data-ui-popup][data-state="open"]')) return;
      if (event.key === "Escape" && !saving) {
        if (agentForm) setAgentForm(null);
        else if (plus) { setPlus(false); }
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
  }, [saving, plus, draft, agentForm]);

  const config = (changes: Partial<Config>) => setDraft(current => current ? { ...current, config: { ...current.config, ...changes } } : current);
  const open = (task?: Task, template?: typeof scheduleTemplates[number]) => {
    if (!token) { onLogin(); return; }
    const defaults = defaultConfig();
    defaults.model_id = models.find(model => model.isDefault)?.id ?? models[0]?.id ?? "";
    setDraft(task ? { ...task, config: { ...defaults, ...task.config, start_at: task.config.start_at ?? task.config.next_run } } : { kind: "schedule", name: template?.name ?? "", content: template?.prompt ?? "", enabled: true, config: { ...defaults, frequency: template?.frequency ?? "daily", ...(template?.frequency === "interval" ? { interval_value: 50, interval_unit: "minutes" } : {}) } });
    setError(""); setAttachments([]); setPlus(false); setTemplatesOpen(false); setAgentForm(null);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft) return;
    if (!draft.config.weekdays.length && ["weekly", "biweekly"].includes(draft.config.frequency)) { setError("请至少选择一个星期。"); return; }
    setSaving(true); setError("");
    try {
      await consoleApi(token, draft.id ? `resources/${draft.id}` : "resources", draft.id ? "PUT" : "POST", draft);
      setDraft(null); setAttachments([]); setNotice("定时任务已保存。服务在线时将按计划执行。"); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const mutate = async (task: Task, action: "run" | "toggle" | "delete") => {
    setBusyId(task.id); setError("");
    try {
      if (action === "run") { await consoleApi(token, `resources/${task.id}/run`, "POST"); setTab("runs"); setNotice("任务已开始，点击打开会话查看执行详情。"); }
      if (action === "toggle") await consoleApi(token, `resources/${task.id}`, "PUT", { ...task, enabled: !task.enabled });
      if (action === "delete") { await consoleApi(token, `resources/${task.id}`, "DELETE"); setDeleteId(""); }
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusyId(""); }
  };
  const select = (key: "skill_ids" | "mcp_ids" | "shop_ids", id: string) => {
    if (!draft) return;
    const selected = draft.config[key];
    if (selected.includes(id)) config({ [key]: selected.filter(value => value !== id) });
    else if (key === "shop_ids" || selected.length < 3) config({ [key]: [...selected, id] });
  };
  const createAgent = async () => {
    if (!agentForm?.name.trim() || !agentForm.content.trim()) return;
    setSaving(true); setError("");
    try {
      const result = await consoleApi<{ resource: Choice }>(token, "resources", "POST", { kind: "agent", ...agentForm, enabled: true });
      await refresh(); config({ agent_id: result.resource.id }); setAgentForm(null);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const filteredTasks = tasks.filter(task => `${task.name} ${task.content}`.toLowerCase().includes(search.toLowerCase()));
  const scheduleRuns = runs.filter(run => (tasks.some(task => task.id === run.resource_id) || run.kind === "schedule") && `${run.name} ${run.detail}`.toLowerCase().includes(search.toLowerCase()));
  const agentName = (id: string) => options.agents.find(agent => agent.id === id)?.name ?? "智能体已移除";
  const modelName = (id: string) => models.find(model => model.id === id)?.displayName ?? (id ? "模型已移除" : "账号默认模型");
  const templateGrid = <div className="scheduleTemplateGrid">{scheduleTemplates.map(template => <button className="scheduleTemplate" key={t(template.name)} onClick={() => open(undefined, template)}><span className="templateIllustration" aria-hidden="true">{template.icon}</span><span><strong>{t(template.name)}</strong><span className="templateDescription">{t(template.description)}</span><small><AlarmClock size={13} /> {template.frequency === "interval" ? t("每 50 分钟") : template.frequency === "weekly" ? t("每周一至周五") : t("每天")} {t("· 创建时设置时间")}</small></span><span className="templateArrow">↗</span></button>)}</div>;

  return <section className="consolePage schedulePage">
    <div className="scheduleTopbar"><div className="consoleTabs" role="tablist" aria-label={t("定时任务")}><button id="schedule-tasks-tab" role="tab" aria-selected={tab === "tasks"} aria-controls="schedule-panel" className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>{t("任务列表")}<span>{tasks.length}</span></button><button id="schedule-runs-tab" role="tab" aria-selected={tab === "runs"} aria-controls="schedule-panel" className={tab === "runs" ? "active" : ""} onClick={() => setTab("runs")}>{t("运行记录")}</button></div><div className="scheduleTools"><input aria-label={t("搜索定时任务或运行记录")} placeholder={tab === "tasks" ? t("搜索任务…") : t("搜索运行记录…")} value={search} onChange={event => setSearch(event.target.value)} /><button className="iconButton" aria-label={t("刷新定时任务")} onClick={() => { setLoading(true); setError(""); void refresh().catch(e => setLoadError((e as Error).message)).finally(() => setLoading(false)); }}>↻</button><div className="scheduleCreate"><button className="primaryButton" onClick={() => open()}>{t("＋ 创建定时任务")}</button><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="scheduleCreateMore" aria-label={t("更多创建方式")}><ChevronDown size={15} /></button></DropdownMenuTrigger><DropdownMenuContent data-ui-popup="menu" align="end" sideOffset={8} className="xixiDropdownPopup"><DropdownMenuItem onSelect={() => open()}>{t("自定义创建")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setTemplatesOpen(true)}>{t("从模板开始")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></div></div>
    {(error || loadError) && !draft && <p className="consoleAlert error" role="alert">{error || loadError}</p>}{notice && <p className="consoleAlert success" role="status">{t(notice)}</p>}
    {!token ? <div className="scheduleEmpty"><Box size={44} /><h3>{t("开启你的自动化工作空间")}</h3><p>{t("登录后创建任务、选择智能体并查看运行记录。")}</p><button className="primaryButton" onClick={onLogin}>{t("登录 / 注册")}</button></div> : <div id="schedule-panel" role="tabpanel" aria-labelledby={tab === "tasks" ? "schedule-tasks-tab" : "schedule-runs-tab"}>
      {loading ? <div className="consoleLoading">{t("正在读取定时任务…")}</div> : tab === "runs" ? <div className="scheduleRecords">{scheduleRuns.length ? <RunList runs={scheduleRuns} onOpenSession={onOpenSession} /> : <div className="scheduleEmpty"><AlarmClock size={40} /><h3>{search ? t("没有匹配的运行记录") : t("等待第一次运行")}</h3><p>{t("任务执行后，运行状态和会话入口会出现在这里。")}</p></div>}</div> : <>
        {!tasks.length && <div className="scheduleBanner"><div className="scheduleBannerArt" aria-hidden="true"><div className="bannerClock"><AlarmClock size={35} /></div><div className="bannerSheet"><span /><span /><span /><span /></div><Sparkles className="bannerSparkle" size={25} /></div><div><span className="scheduleKicker">YOUR ALWAYS-ON TEAM</span><h3>{t("搭建你的店铺经营自动化任务")}</h3><p>{t("定时监控经营数据、执行重复事项，让智能体为你生成清晰的经营洞察。")}</p></div></div>}
        {!filteredTasks.length ? <div className="scheduleEmpty"><div className="scheduleEmptyIcon"><Box size={38} /></div>{search && <><h3>{t("没有找到匹配任务")}</h3><p>{t("试试其他关键词。")}</p></>}{!search && <button className="primaryButton" onClick={() => open()}>{t("＋ 创建第一个定时任务")}</button>}</div> : <div className="resourceGrid scheduleTaskGrid">{filteredTasks.map(task => {
          const expired = !!task.config.end_date && task.config.end_date < toBeijingInput(new Date().toISOString()).slice(0, 10);
          return <article className="resourceCard scheduleTask" key={task.id}><div className="resourceCardTop"><div className="resourceIcon"><AlarmClock size={22} /></div><span className="statusBadge">{expired ? t("已过期") : task.enabled ? t("已启用") : t("已停用")}</span><button className={`toggle ${task.enabled ? "on" : ""}`} role="switch" aria-checked={task.enabled} aria-label={t(`${task.enabled ? t("停用") : t("启用")}${task.name}`)} disabled={busyId === task.id || expired} onClick={() => void mutate(task, "toggle")}><span /></button></div><h3>{task.name}</h3><p className="resourcePreview">{task.content}</p><div className="scheduleTaskFacts"><span>◈ {agentName(task.config.agent_id ?? "main")}</span><span>◇ {modelName(task.config.model_id)}</span><span>◷ {t(recurrence({ ...defaultConfig(), ...task.config }))}</span><span>{task.config.end_date ? t(`有效至 ${task.config.end_date}`) : t("永久有效")}</span></div><p className="nextRun">{task.enabled && !expired ? t(`下次运行 ${dateLabel(task.config.next_run)}`) : t("自动执行已停止")}</p><div className="resourceCardActions"><button className="textButton" onClick={() => open(task)}>{t("编辑")}</button><button className="textButton accent" disabled={busyId === task.id} onClick={() => void mutate(task, "run")}>{t("▷ 立即运行")}</button><button className="textButton" onClick={() => { setTab("runs"); setSearch(task.name); }}>{t("运行记录")}</button><button className="textButton danger" onClick={() => setDeleteId(task.id)}>{t("删除")}</button></div>{deleteId === task.id && <div className="deleteConfirm"><span>{t("确认删除？历史记录将保留。")}</span><button disabled={busyId === task.id} onClick={() => void mutate(task, "delete")}>{t("确认")}</button><button onClick={() => setDeleteId("")}>{t("取消")}</button></div>}</article>;
        })}</div>}
        <div ref={templateRef} className="scheduleTemplates"><div className="sectionTitle"><div><h3>{t("从模板开始")}</h3></div><button className="textButton" onClick={() => setTemplatesOpen(true)}>{t("查看全部 ↗")}</button></div>{templateGrid}</div>
      </>}
    </div>}
    {templatesOpen && <div className="modalBackdrop" onMouseDown={event => { if (event.target === event.currentTarget) setTemplatesOpen(false); }}><div role="dialog" aria-modal="true" aria-label={t("选择定时任务模板")} className="resourceEditor templateDialog"><div className="sectionTitle"><div><p className="eyebrow">TEMPLATE LIBRARY</p><h3>{t("为你的下一件工作选择模板")}</h3></div><button autoFocus className="closeButton" aria-label={t("关闭模板")} onClick={() => setTemplatesOpen(false)}>×</button></div>{templateGrid}</div></div>}
    {draft && <div className="modalBackdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setDraft(null); }}><form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="schedule-editor-title" className="resourceEditor scheduleEditor" onSubmit={event => void save(event)}>
      <div className="sectionTitle"><div><p className="eyebrow">SCHEDULE A LITTLE MAGIC</p><h3 id="schedule-editor-title">{draft.id ? t("编辑定时任务") : t("创建定时任务")}</h3></div><button type="button" className="closeButton" aria-label={t("关闭编辑器")} disabled={saving} onClick={() => setDraft(null)}>×</button></div>
      <label>{t("任务名称")}<input required maxLength={100} value={draft.name} placeholder={t("给这个任务起个名字")} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>{t("智能体")}<SelectField aria-label={t("智能体")} required value={draft.config.agent_id} onValueChange={value => { if (value === "__create") setAgentForm({ name: "", content: "" }); else config({ agent_id: value }); }} placeholder={t("选择执行任务的智能体")} options={[...options.agents.filter(agent => agent.enabled).map(agent => ({ value: agent.id, label: agent.name })), { value: "__create", label: t("＋ 创建更多智能体…") }]} /></label>
      {!options.agents.some(agent => agent.enabled) && <p className="formHint">{t("还没有可用智能体。")}<button className="textButton accent" type="button" onClick={() => setAgentForm({ name: "", content: "" })}>{t("创建第一个智能体")}</button></p>}
      {agentForm && <div className="scheduleAgentForm"><h4>{t("创建智能体")}</h4><label>{t("智能体名称")}<input maxLength={100} value={agentForm.name} onChange={event => setAgentForm({ ...agentForm, name: event.target.value })} /></label><label>{t("角色与执行指令")}<textarea maxLength={24000} rows={3} value={agentForm.content} onChange={event => setAgentForm({ ...agentForm, content: event.target.value })} placeholder={t("描述专业领域、工作方法与边界")} /></label><div><button type="button" className="secondaryButton" onClick={() => setAgentForm(null)}>{t("取消")}</button><button type="button" className="primaryButton" disabled={saving || !agentForm.name.trim() || !agentForm.content.trim()} onClick={() => void createAgent()}>{t("创建并选择")}</button></div></div>}
      <label htmlFor="schedule-prompt">{t("任务提示词")}<span className="requiredMark">*</span></label><div className="scheduleComposer">
        <div className="scheduleTags">{([{ key: "skill_ids", list: options.skills, icon: "ϟ" }, { key: "shop_ids", list: options.shops, icon: "▣" }, { key: "mcp_ids", list: options.mcps, icon: "⌘" }] as const).flatMap(group => draft.config[group.key].map(id => <span className="scheduleTag" key={id}><span>{group.icon}</span>{group.list.find(item => item.id === id)?.name ?? "已失效资源"}<button type="button" aria-label={t(`移除${group.list.find(item => item.id === id)?.name ?? "资源"}`)} onClick={() => select(group.key, id)}>×</button></span>))}{attachments.map(file => <span className="scheduleTag attachmentTag" key={file.id} title={t("仅交互预览，暂不参与执行")}><CloudUpload size={14} />{file.name} <small>{(file.size / 1024).toFixed(0)} {t("KB · 占位")}</small><button type="button" aria-label={t(`移除附件${file.name}`)} onClick={() => setAttachments(items => items.filter(item => item.id !== file.id))}>×</button></span>)}</div>
        <textarea id="schedule-prompt" required value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} placeholder={t("请详细描述 AI 应如何执行这项任务")} rows={5} />
        <div className="scheduleComposerBottom"><div className="schedulePlusWrap"><DropdownMenu open={plus} onOpenChange={setPlus}><DropdownMenuTrigger asChild><button type="button" className={`schedulePlus ${plus ? "active" : ""}`} aria-label={t("添加附件、技能、连接器或店铺")}>＋</button></DropdownMenuTrigger><DropdownMenuContent data-ui-popup="menu" align="start" sideOffset={8} collisionPadding={12} className="xixiDropdownPopup scheduleAttachmentMenu" onEscapeKeyDown={event => event.stopPropagation()}><DropdownMenuItem onSelect={() => attachmentRef.current?.click()}><CloudUpload />{t("上传文件")}</DropdownMenuItem><DropdownMenuSeparator />{([{ key: "skills", name: t("技能"), Icon: Sparkles }, { key: "mcps", name: t("连接器"), Icon: Blocks }, { key: "shops", name: t("店铺"), Icon: Store }] as const).map(group => <DropdownMenuSub key={group.key}><DropdownMenuSubTrigger><group.Icon />{group.name}</DropdownMenuSubTrigger><DropdownMenuSubContent data-ui-popup="submenu" collisionPadding={12} className="xixiDropdownPopup scheduleResourceSubmenu"><DropdownMenuLabel>{group.name}{group.key === "shops" ? t("（可多选）") : t("（最多 3 个）")}</DropdownMenuLabel><DropdownMenuSeparator />{!options[group.key].length ? <DropdownMenuItem disabled className="scheduleChoiceEmpty">{group.key === "shops" ? t("尚未接入店铺授权，接入后可多选店铺。") : t(`还没有${group.name}，请先在「能力市场」中添加。`)}</DropdownMenuItem> : options[group.key].map(item => {
          const key = group.key === "skills" ? "skill_ids" : group.key === "mcps" ? "mcp_ids" : "shop_ids";
          const checked = draft.config[key].includes(item.id);
          const shop = group.key === "shops" ? item as Shop : null;
          const unavailable = !item.enabled || (shop && !shop.authorized);
          return <DropdownMenuCheckboxItem key={item.id} checked={checked} disabled={!!unavailable || (!checked && key !== "shop_ids" && draft.config[key].length >= 3)} onSelect={event => event.preventDefault()} onCheckedChange={() => select(key, item.id)}><span className="scheduleChoiceCopy"><b>{item.name}</b><small>{shop ? t(`${shop.country} · ${shop.mode} · ${shop.authorized ? t("🟢 已授权") : t("🔴 已失效")}`) : item.enabled ? t("已启用") : t("已停用")}</small></span></DropdownMenuCheckboxItem>;
        })}</DropdownMenuSubContent></DropdownMenuSub>)}</DropdownMenuContent></DropdownMenu></div><div className="scheduleModel"><Box size={15} /><ModelPicker aria-label={t("对话模型")} value={draft.config.model_id} onValueChange={value => config({ model_id: value })} placeholder={models.length ? t("选择模型") : t("尚未配置模型")} disabled={!models.length} models={models.map(model => ({ id: model.id, name: model.displayName || model.modelName, description: t(`${model.modelName}${model.isDefault ? t(" · 默认模型") : ""}`), keywords: [model.modelName] }))} /></div></div>
      </div><input ref={attachmentRef} hidden type="file" multiple accept=".txt,.md,.markdown,.csv,.pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={event => { const files = Array.from(event.target.files ?? []); if (files.some(file => !file.type.startsWith("image/") && !/\.(txt|md|markdown|csv|pdf|docx?|xlsx?|png|jpe?g|gif|webp|bmp|avif|svg|heic|tiff?)$/i.test(file.name))) { setError(t("请选择 TXT、Markdown、CSV、PDF、Word、Excel 或图片文件。")); event.target.value = ""; return; } setAttachments(items => [...items, ...files.map(file => ({ id: crypto.randomUUID(), name: file.name, size: file.size }))]); event.target.value = ""; }} />
      {!models.length && <p className="formHint warning">{t("请先配置一个 LLM 模型。")}<button type="button" className="textButton accent" onClick={() => { setDraft(null); onModels(); }}>{t("前往模型设置 ↗")}</button></p>}
      <div className="scheduleDivider" /><div className="formColumns"><label>{t("重复频率")}<SelectField aria-label={t("重复频率")} value={draft.config.frequency} onValueChange={value => config({ frequency: value })} options={Object.entries(frequencyNames).filter(([key]) => key !== "hourly" || draft.config.frequency === "hourly").map(([value, label]) => ({ value, label: t(label) }))} /></label><label>{t("首次执行 · 北京时间")}<input type="datetime-local" required value={toBeijingInput(draft.config.start_at ?? draft.config.next_run)} onChange={event => { if (event.target.value) { const time = new Date(`${event.target.value}:00+08:00`).toISOString(); config({ next_run: time, start_at: time }); } }} /></label></div>
      {draft.config.frequency === "interval" && <div className="formColumns"><label>{t("每隔")}<input type="number" min={1} max={10000} step={1} required value={draft.config.interval_value} onChange={event => config({ interval_value: Number(event.target.value) })} /></label><label>{t("单位")}<SelectField aria-label={t("间隔单位")} value={draft.config.interval_unit} onValueChange={value => config({ interval_unit: value })} options={[{ value: "minutes", label: t("分钟") }, { value: "hours", label: t("小时") }, { value: "days", label: t("天") }]} /></label></div>}
      {["weekly", "biweekly"].includes(draft.config.frequency) && <div className="scheduleWeekdays" role="group" aria-label={t("执行星期")}>{weekNames.map((name, index) => <button type="button" key={name} aria-pressed={draft.config.weekdays.includes(index)} className={draft.config.weekdays.includes(index) ? "active" : ""} onClick={() => config({ weekdays: draft.config.weekdays.includes(index) ? draft.config.weekdays.filter(day => day !== index) : [...draft.config.weekdays, index].sort() })}>{t(t(`周${name}`))}</button>)}</div>}
      {["monthly", "yearly", "biweekly"].includes(draft.config.frequency) && <p className="formHint">{draft.config.frequency === "biweekly" ? t("以首次执行所在周为起点，每隔一周执行。") : t("按首次执行的日期和时间重复；月份中不存在的日期将跳过。")}</p>}
      <div className="formColumns"><label>{t("有效期")}<SelectField aria-label={t("有效期")} value={draft.config.end_date ? "date" : "forever"} onValueChange={value => config({ end_date: value === "forever" ? "" : toBeijingInput(draft.config.start_at ?? draft.config.next_run).slice(0, 10) })} options={[{ value: "forever", label: t("永久有效") }, { value: "date", label: t("指定截止日期") }]} /></label>{draft.config.end_date && <label>{t("截止日期（当天 23:59:59）")}<input type="date" required value={draft.config.end_date} min={toBeijingInput(draft.config.start_at ?? draft.config.next_run).slice(0, 10)} onChange={event => config({ end_date: event.target.value })} /></label>}</div>
      <label className="checkLabel"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />{t("启用自动调度")}</label>{error && <p className="consoleAlert error" role="alert">{t(error)}</p>}
      <div className="editorFooter"><span>{t("仅当前账号可见 · 服务在线时执行")}</span><button type="button" className="secondaryButton" disabled={saving} onClick={() => setDraft(null)}>{t("取消")}</button><button className="primaryButton" disabled={saving || !!agentForm || !models.length || !options.agents.some(agent => agent.id === draft.config.agent_id && agent.enabled)}>{saving ? t("保存中…") : draft.id ? t("保存修改") : t("创建任务")}</button></div>
    </form></div>}
  </section>;
}
