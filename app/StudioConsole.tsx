"use client";
import { StudioButton, StudioInput, StudioTextarea, StudioOverlay } from "./StudioControls";
import { Hint } from "@/components/hero-ui/tooltip";


import { useFeedbackState, useToast } from "@/components/OperationFeedback";

import { usePreferences } from "@/components/PreferencesProvider";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { SelectField } from "@/components/SelectField";
import { AgentMarket } from "./AgentMarket";
import { TokenUsageDashboard } from "./TokenUsageDashboard";
import type { TokenActivity } from "./token-usage";
import { AgentEditor, type AgentProfile } from "./AgentEditor";
import { SkillDetail } from "./SkillDetail";
import { SkillMarket } from "./SkillMarket";
import { SkillGallery, skillDescription } from "./SkillGallery";
import { MoreHorizontal, Search, RefreshCw } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator } from "@/components/hero-ui/dropdown-menu";
import { AlarmClock, Blocks, Database, FolderOpen, MemoryStick, Sparkles, Workflow } from "./lucide-icons";

export type CapabilityTab = "agent" | "skill" | "workflow" | "mcp";
export type ResourceKind = "agent" | "skill" | "mcp" | "knowledge" | "memory" | "workflow" | "schedule";
export type ConsoleView = "plugins" | "knowledge" | "memory" | "workflow" | "schedule" | "overview";
type Resource = { id: string; kind: ResourceKind; name: string; content: string; enabled: boolean; config: { icon?: string; category?: string; description?: string; url?: string; provider?: "generic" | "feishu"; url_configured?: boolean; display_url?: string; frequency?: string; next_run?: string; model_id?: string; steps?: number }; updated_at: string };
type Run = { id: string; name: string; session_id: string; status: string; detail: string; created_at: string; resource_id: string };
type Overview = { database?: "postgresql" | "sqlite"; version: string; sessions: number; messages: number; resources: Record<string, number>; scheduler: string; runs: Run[]; token_activity?: TokenActivity };
type ProjectDoc = { path: string; title: string; content: string; updated_at: string };
type Form = Omit<Resource, "id" | "updated_at"> & { id?: string };

const labels: Record<ResourceKind, { title: string; subtitle: string; icon: typeof Blocks; contentLabel: string; placeholder: string }> = {
  agent: { title: "智能体", subtitle: "创建专属智能体，开始新的对话。", icon: Sparkles, contentLabel: "角色与指令", placeholder: "描述智能体的角色与工作方式" },
  skill: { title: "Skills", subtitle: "把你的工作方法交给 Agent。启用的技能可在会话中按需读取和调用。", icon: Sparkles, contentLabel: "Skill 指令（Markdown）", placeholder: "# 工作方法\n\n描述技能的适用场景、执行步骤与输出格式。" },
  mcp: { title: "MCP 服务", subtitle: "连接 Streamable HTTP 服务，将外部工具交给 Agent。", icon: Blocks, contentLabel: "说明", placeholder: "描述这个 MCP 服务提供的能力。" },
  knowledge: { title: "知识库", subtitle: "导入资料、编辑文档。Agent 会按当前问题检索已启用的内容。", icon: Database, contentLabel: "文档内容", placeholder: "粘贴资料，或导入 Markdown / 文本文件。" },
  memory: { title: "记忆文件", subtitle: "保存偏好与长期约定。启用的记忆会自动加入对话上下文。", icon: MemoryStick, contentLabel: "记忆内容", placeholder: "# 我的偏好\n\n记录希望 Agent 始终了解的背景与约定。" },
  workflow: { title: "工作流", subtitle: "按顺序执行多个步骤，并把结果保存到一个会话。", icon: Workflow, contentLabel: "步骤提示词", placeholder: "第一步：分析需求\n---\n第二步：根据上一轮结果制定方案\n---\n第三步：检查方案" },
  schedule: { title: "自动化", subtitle: "让 Agent 按计划运行。服务需要保持在线，执行记录会持久化。", icon: AlarmClock, contentLabel: "任务提示词", placeholder: "例如：检索项目知识库，总结待办事项。" },
};
const statusLabel: Record<string, string> = { running: "运行中", success: "已完成", failed: "失败", waiting_approval: "等待确认", interrupted: "已中断" };
export const dateLabel = (value: string) => new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export async function consoleApi<T>(token: string, path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/console/${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json() as T & { detail?: string };
  if (!response.ok) throw new Error(payload.detail ?? `请求失败（${response.status}）`);
  return payload as T;
}

export function downloadFile(name: string, content: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Blocks; title: string; detail: string }) {
  const { t } = usePreferences();
  return <div className="consoleEmpty"><div className="emptyIcon"><Icon size={28} /></div><h3>{t(title)}</h3><p>{t(detail)}</p></div>;
}

export function RunList({ runs, onOpenSession }: { runs: Run[]; onOpenSession: (id: string) => void }) {
  const { t } = usePreferences();
  return <div className="runList">{runs.map(run => <div className="runRow" key={run.id}>
    <span className={`statusBadge ${run.status}`}>{t(statusLabel[run.status] ?? run.status)}</span>
    <div><strong>{run.name}</strong><p>{run.detail}</p></div><time>{dateLabel(run.created_at)}</time>
    {run.session_id && <StudioButton type="button" className="textButton" onClick={() => onOpenSession(run.session_id)}>{t("打开会话 ↗")}</StudioButton>}
  </div>)}</div>;
}

export function StudioConsole({ view, token, onLogin, onOpenSession, capabilityTab, onCapabilityTabChange, onStartAgentChat }: { view: ConsoleView; token: string; onLogin: () => void; onOpenSession: (id: string) => void; capabilityTab: CapabilityTab; onCapabilityTabChange: (tab: CapabilityTab) => void; onStartAgentChat?: (agent: AgentProfile) => void }) {
  const { t } = usePreferences();
  const toast = useToast();
  const [agentDraft, setAgentDraft] = useState<AgentProfile | null | undefined>(undefined);
  const [agentSearch, setAgentSearch] = useState("");
  const [myAgents, setMyAgents] = useState(false);
  const [skillTab, setSkillTab] = useState<"installed" | "market">("installed");
  const [marketRevision, setMarketRevision] = useState(0);
  const kind: ResourceKind = view === "plugins" ? capabilityTab : view === "overview" ? "skill" : view;
  const [resources, setResources] = useState<Resource[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewConnection, setOverviewConnection] = useState<"loading" | "online" | "offline">("loading");
  const [documents, setDocuments] = useState<ProjectDoc[]>([]);
  const [showProject, setShowProject] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, setError] = useFeedbackState("error");
  const [, setNotice] = useFeedbackState("auto");
  const [search, setSearch] = useState("");
  const [skillDetail, setSkillDetail] = useState<Resource | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [testResults, setTestResults] = useState<Record<string, { message: string; tools: { name: string; description: string }[] }>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      if (view === "overview") {
        const result = await consoleApi<Overview>(token, "status"); setOverview(result); setOverviewConnection("online");
      } else {
        const result = await consoleApi<{ resources: Resource[] }>(token, `resources?kind=${kind}`); setResources(result.resources);
        if (kind === "workflow" || kind === "schedule") { const result = await consoleApi<{ runs: Run[] }>(token, "runs"); setRuns(result.runs); }
      }
    } catch (e) { if (view === "overview") setOverviewConnection("offline"); setError((e as Error).message); } finally { setLoading(false); }
  }, [token, view, kind, setError]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!token) { setResources([]); setOverview(null); setRuns([]); return; }
      if (view === "overview") { setOverview(null); setOverviewConnection("loading"); }
      setLoading(true); setError(""); setResources([]); setSearch(""); setForm(null); setDeleteId(""); setNotice(""); setTestResults({});
      try {
        if (view === "overview") { const result = await consoleApi<Overview>(token, "status"); if (active) { setOverview(result); setOverviewConnection("online"); } }
        else {
          const result = await consoleApi<{ resources: Resource[] }>(token, `resources?kind=${kind}`); if (active) setResources(result.resources);
          if (kind === "workflow" || kind === "schedule") { const result = await consoleApi<{ runs: Run[] }>(token, "runs"); if (active) setRuns(result.runs); }
        }
      } catch (e) { if (active) { if (view === "overview") setOverviewConnection("offline"); setError((e as Error).message); } } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [token, view, kind, setError, setNotice]);

  useEffect(() => {
    if (!token || (view !== "overview" && kind !== "workflow" && kind !== "schedule")) return;
    let active = true, pending = false;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      void (async () => {
        try {
          if (view === "overview") {
            const result = await consoleApi<Overview>(token, "status");
            if (active) { setOverview(result); setOverviewConnection("online"); }
          } else {
            const result = await consoleApi<{ runs: Run[] }>(token, "runs");
            if (active) setRuns(result.runs);
          }
        } catch { if (active && view === "overview") setOverviewConnection("offline"); }
        finally { pending = false; }
      })();
    }, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [token, view, kind]);

  const newForm = (): Form => ({ kind, name: "", content: "", enabled: kind !== "mcp", config: kind === "schedule" ? { frequency: "daily", next_run: new Date(Date.now() + 3600_000).toISOString() } : {} });
  const add = () => { if (!token) { onLogin(); return; } if (kind === "agent") { setAgentDraft(null); return; } setForm(newForm()); setError(""); };
  const addFeishu = () => {
    if (!token) { onLogin(); return; }
    setForm({ kind: "mcp", name: "飞书云文档", content: "通过飞书个人 MCP 服务访问已授权工具。", enabled: false, config: { provider: "feishu" } });
    setError("");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!form) return;
    setSaving(true); setError("");
    try {
      await consoleApi(token, form.id ? `resources/${form.id}` : "resources", form.id ? "PUT" : "POST", form);
      setForm(null); await refresh(); setNotice("已保存，启用状态会在下一轮 Agent 对话生效。");
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const mutate = async (resource: Resource, action: "toggle" | "delete" | "run" | "test") => {
    setBusyId(resource.id); setError(""); setNotice("");
    try {
      if (action === "toggle") { await consoleApi(token, `resources/${resource.id}`, "PUT", { ...resource, enabled: !resource.enabled }); toast.success(resource.enabled ? "已停用。" : "已启用。"); }
      if (action === "delete") { await consoleApi(token, `resources/${resource.id}`, "DELETE"); setDeleteId(""); toast.success("已删除。"); }
      if (action === "run") {
        await consoleApi(token, `resources/${resource.id}/run`, "POST"); setNotice("已启动，执行结果会出现在下方运行记录。");
      }
      if (action === "test") {
        const result = await consoleApi<{ message: string; tools: { name: string; description: string }[] }>(token, `resources/${resource.id}/test`, "POST");
        setTestResults(previous => ({ ...previous, [resource.id]: result })); toast.success(result.message);
      }
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusyId(""); }
  };
  const importText = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    if (file.size > 512_000 || !/\.(md|txt|csv|json)$/i.test(file.name)) { setError("支持 500 KB 以内的 .md、.txt、.csv 和 .json 文本文件。"); return; }
    setForm({ ...newForm(), name: file.name, content: await file.text() });
  };
  const exportBackup = async () => {
    try {
      const result = await consoleApi<{ resources: Resource[] }>(token, "resources");
      downloadFile("xixi-console-backup.json", JSON.stringify({ format: "xixi-console-v1", exported_at: new Date().toISOString(), resources: result.resources }, null, 2), "application/json"); toast.success("备份文件已准备下载。");
    } catch (e) { setError((e as Error).message); }
  };
  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("备份文件不能超过 5 MB。");
      const backup = JSON.parse(await file.text()) as { format: string; resources: Resource[] };
      if (backup.format !== "xixi-console-v1" || !Array.isArray(backup.resources) || backup.resources.length > 100) throw new Error("备份格式无效（最多 100 个资源）。");
      setSaving(true);
      let count = 0;
      for (const resource of backup.resources) {
        try { await consoleApi(token, "resources", "POST", { ...resource, enabled: false }); count++; }
        catch (e) { throw new Error(`已导入 ${count} 项，下一项失败：${(e as Error).message}`); }
      }
      setNotice(`已导入 ${count} 项，均保持停用，请检查后逐项启用。`); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const loadProject = async () => {
    try { const result = await consoleApi<{ documents: ProjectDoc[] }>(token, "project-docs"); setDocuments(result.documents); setShowProject(previous => !previous); }
    catch (e) { setError((e as Error).message); }
  };

  const visible = resources.filter(item => `${item.name} ${item.content}`.toLowerCase().includes(search.toLowerCase()));
  const descriptor = labels[kind];
  const Icon = descriptor.icon;
  return <section className={`consolePage ${view === "plugins" && kind === "skill" ? "skillListPage" : ""}`}>
    {view === "plugins" ? <div className={`capabilityTopbar ${kind === "agent" ? "agentMarketTopbar" : ""}`}>
      <div className="consoleTabs" role="tablist" aria-label={t("能力市场分类")}>{([{ key: "agent", label: t("智能体") }, { key: "skill", label: t("技能") }, { key: "workflow", label: t("工作流") }, { key: "mcp", label: t("连接器") }] as const).map(tab => <StudioButton key={tab.key} role="tab" aria-selected={kind === tab.key} className={kind === tab.key ? "active" : ""} onClick={() => onCapabilityTabChange(tab.key)}>{tab.label}</StudioButton>)}</div>
      <div className="consoleActions">{kind === "mcp" && <StudioButton type="button" className="secondaryButton" onClick={addFeishu}>{t("接入飞书")}</StudioButton>}{kind === "skill" && skillTab === "installed" && <><label className="agentMarketSearch"><Search size={15} aria-hidden="true" /><StudioInput aria-label={t("搜索资源")} placeholder={t("搜索技能…")} value={search} onChange={event => setSearch(event.target.value)} /></label><StudioButton className="secondaryButton" disabled={!token} onClick={() => fileRef.current?.click()}>{t("↑ 导入文本")}</StudioButton></>}{kind === "agent" && <><label className="agentMarketSearch"><Search size={15} aria-hidden="true" /><StudioInput aria-label={t("搜索智能体")} placeholder={t("搜索…")} value={agentSearch} onChange={event => setAgentSearch(event.target.value)} /></label><StudioButton type="button" className={`secondaryButton agentMarketMine ${myAgents ? "selected" : ""}`} aria-pressed={myAgents} onClick={() => setMyAgents(value => !value)}>{t(myAgents ? "全部智能体" : "我的智能体")}</StudioButton></>}<Hint content={t("刷新")}><StudioButton className={kind === "agent" ? "iconButton agentMarketRefresh" : "secondaryButton"} aria-label={t("刷新")}  onClick={() => { setMarketRevision(value => value + 1); void refresh(); }} disabled={loading || !token}>{kind === "agent" ? <RefreshCw size={16} /> : loading ? t("读取中…") : t("刷新")}</StudioButton></Hint><StudioButton className="primaryButton" onClick={add}>＋ {kind === "agent" ? t("创建智能体") : kind === "skill" ? t("新建技能") : kind === "workflow" ? t("新建工作流") : t("添加连接器")}</StudioButton></div>
    </div> : <div className="consoleHeading"><div><h2>{view === "overview" ? t("工作台概览") : t(descriptor.title)}</h2><p>{view === "overview" ? t("查看服务状态、资源与最近运行，让每一步都有迹可循。") : t(descriptor.subtitle)}</p></div>
      <div className="consoleActions"><StudioButton className="secondaryButton" onClick={() => void refresh()} disabled={loading || !token}>{loading ? t("读取中…") : t("刷新")}</StudioButton>{view !== "overview" && <StudioButton className="primaryButton" onClick={add}>＋ {kind === "schedule" ? t("创建任务") : t(`新建${descriptor.title}`)}</StudioButton>}</div>
    </div>}


    {!token ? <div className="consoleLogin"><EmptyState icon={FolderOpen} title={t("你的工作空间，等你开启")} detail={t("登录后即可管理技能、资料、记忆和自动化任务。")} /><StudioButton className="primaryButton" onClick={onLogin}>{t("登录 / 注册")}</StudioButton></div> : <>

      {view === "plugins" && kind === "skill" && <><div className="consoleTabs skillListTabs"><StudioButton className={skillTab === "installed" ? "active" : ""} onClick={() => setSkillTab("installed")}>{t("已安装技能")}</StudioButton><StudioButton className={skillTab === "market" ? "active" : ""} onClick={() => setSkillTab("market")}>{t("技能市场")}</StudioButton>{skillTab === "installed" && <span className="skillListCount">{resources.length} {t("项 ·")}{resources.filter(item => item.enabled).length} {t("已启用")}</span>}</div><StudioInput ref={fileRef} type="file" hidden accept=".md,.txt,.csv,.json" onChange={event => void importText(event)} /></>}
      {view === "plugins" && kind === "agent" ? <AgentMarket key={marketRevision} token={token} search={agentSearch} mine={myAgents} onEdit={setAgentDraft} onChat={agent => onStartAgentChat?.(agent)} /> : view === "plugins" && kind === "skill" && skillTab === "market" ? <SkillMarket key={marketRevision} token={token} onInstalled={refresh} /> : view === "overview" ? <>
        <div className="metricGrid">{[{ label: t("历史会话"), value: overview?.sessions ?? "—", icon: "↗" }, { label: t("对话消息"), value: overview?.messages ?? "—", icon: "◷" }, { label: t("资源配置"), value: overview ? Object.values(overview.resources).reduce((a, b) => a + b, 0) : "—", icon: "✧" }, { label: "AgentScope", value: overview?.version ?? "—", icon: "◈" }].map(metric => <article className="metricCard" key={metric.label}><span>{metric.label}<i>{metric.icon}</i></span><strong>{metric.value}</strong></article>)}</div>
        <TokenUsageDashboard activity={overview?.token_activity} loading={loading} />
        <div className="consoleCard"><div className="sectionTitle"><div><h3>{t("服务与数据")}</h3><p>{t("当前工作空间的服务与数据状态")}</p></div><span className={`statusBadge ${overviewConnection === "online" ? "success" : overviewConnection === "offline" ? "failed" : ""}`}>{t(overviewConnection === "online" ? "服务在线" : overviewConnection === "offline" ? "连接异常" : "正在连接…")}</span></div><div className="serviceFacts"><div><span>{t("持久化")}</span><strong>{t(overview?.database === "postgresql" ? "PostgreSQL · 按用户隔离" : overview?.database === "sqlite" ? "个人工作空间" : overview ? "按用户隔离保存" : "等待服务连接")}</strong></div><div><span>{t("自动调度")}</span><strong>{t(overview?.scheduler ?? "等待服务连接")}</strong></div><div><span>{t("工具权限")}</span><strong>{t("按工具权限策略执行，必要时请求确认")}</strong></div></div>
          <div className="backupActions"><StudioButton className="secondaryButton" disabled={!overview || saving} onClick={() => void exportBackup()}>{t("导出资源备份")}</StudioButton><StudioButton className="secondaryButton" disabled={!overview || saving} onClick={() => backupRef.current?.click()}>{saving ? t("导入中…") : t("导入资源备份")}</StudioButton><span>{t("包含智能体、技能、连接器、记忆、工作流和定时任务等资源配置；不含会话、模型密钥、附件及生成文件。")}</span><StudioInput ref={backupRef} hidden type="file" accept=".json" onChange={event => void importBackup(event)} /></div>
        </div>
        <div className="consoleCard"><div className="sectionTitle"><div><h3>{t("最近运行")}</h3><p>{t("工作流与定时任务的真实执行记录")}</p></div></div>{overview?.runs.length ? <RunList runs={overview.runs} onOpenSession={onOpenSession} /> : <EmptyState icon={AlarmClock} title={t("还没有运行记录")} detail={t("创建工作流或定时任务后，执行结果会出现在这里。")} />}</div>
      </> : <>
        {kind !== "skill" && <div className="resourceToolbar"><StudioInput aria-label={t("搜索资源")} placeholder={t(`搜索${descriptor.title}…`)} value={search} onChange={event => setSearch(event.target.value)} /><span>{resources.length} {t("项 ·")}{resources.filter(item => item.enabled).length} {t("已启用")}</span>
          {["skill", "memory", "knowledge"].includes(kind) && <StudioButton className="secondaryButton" onClick={() => fileRef.current?.click()}>{t("↑ 导入文本")}</StudioButton>}
          {kind === "knowledge" && <StudioButton className="secondaryButton" onClick={() => void loadProject()}>{showProject ? t("收起项目文档") : t("查看项目文档")}</StudioButton>}
          <StudioInput ref={fileRef} type="file" hidden accept=".md,.txt,.csv,.json" onChange={event => void importText(event)} />
        </div>}
        {showProject && kind === "knowledge" && <div className="consoleCard"><h3>{t("项目文档 · 只读")}</h3><p className="formHint">{t("这些文档已被项目检索索引；导入后可在个人知识库中编辑副本。")}</p>{documents.map(doc => <div className="projectDoc" key={doc.path}><div><strong>{doc.title}</strong><code>{doc.path}</code></div><StudioButton className="textButton" onClick={() => setForm({ ...newForm(), name: doc.title, content: doc.content })}>{t("导入副本")}</StudioButton></div>)}</div>}
        {loading && !resources.length ? <div className="consoleLoading">{t("正在读取你的工作空间…")}</div> : !visible.length ? <EmptyState icon={Icon} title={search ? t("没有找到匹配内容") : t(`还没有${descriptor.title}`)} detail={search ? t("换一个关键词试试。") : t("点击右上角新建，或导入已有文本，开始配置你的 Agent。")} /> : kind === "skill" ? <SkillGallery skills={visible.map(resource => ({ id: resource.id, name: resource.name, description: resource.config.description || skillDescription(resource.content), icon: resource.config.icon, category: resource.config.category, onOpen: () => setSkillDetail(resource),
          action: <DropdownMenu><DropdownMenuTrigger asChild><StudioButton type="button" className="skillQuickAction" aria-label={`${t("管理技能")} ${resource.name}`}><MoreHorizontal size={19} /></StudioButton></DropdownMenuTrigger><DropdownMenuContent className="xixiDropdownPopup" align="end">
            <DropdownMenuCheckboxItem checked={resource.enabled} disabled={busyId === resource.id} onCheckedChange={() => void mutate(resource, "toggle")}>{t("启用技能")}</DropdownMenuCheckboxItem><DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { setForm(resource); setError(""); }}>{t("编辑")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => downloadFile(`${resource.name.replace(/[\\/:*?"<>|]/g, "_")}.md`, resource.content)}>{t("导出")}</DropdownMenuItem>
            <DropdownMenuItem className="danger" onSelect={() => setDeleteId(resource.id)}>{t("删除")}</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>,
          footer: deleteId === resource.id ? <div className="deleteConfirm"><span>{t("删除后无法恢复")}</span><StudioButton disabled={busyId === resource.id} onClick={() => void mutate(resource, "delete")}>{t("确认删除")}</StudioButton><StudioButton onClick={() => setDeleteId("")}>{t("取消")}</StudioButton></div> : <span className={`statusBadge ${resource.enabled ? "success" : ""}`}>{t(resource.enabled ? "已启用" : "已停用")}</span>
        }))} /> : <div className="resourceGrid">{visible.map(resource => <article className="resourceCard" key={resource.id}>
          <div className="resourceCardTop"><div className="resourceIcon"><Icon size={21} /></div><StudioButton className={`toggle ${resource.enabled ? "on" : ""}`} role="switch" aria-checked={resource.enabled} aria-label={t(`${resource.enabled ? t("停用") : t("启用")}${resource.name}`)} disabled={busyId === resource.id} onClick={() => void mutate(resource, "toggle")}><span /></StudioButton></div>
          <h3>{resource.name}</h3><p className="resourcePreview">{resource.kind === "mcp" ? (resource.config.display_url || resource.config.url) : resource.content}</p>
          <div className="resourceMeta"><span>{resource.enabled ? t("已启用") : t("已停用")}</span><span>{resource.kind === "workflow" ? t(`${resource.config.steps} 个步骤`) : resource.kind === "schedule" ? ({ daily: t("每天"), hourly: t("每小时"), once: t("单次") }[resource.config.frequency ?? ""] ?? "") : t(`${resource.content.length} 字符`)}</span></div>
          {resource.kind === "schedule" && resource.config.next_run && <p className="nextRun">{t("下次运行")}{dateLabel(resource.config.next_run)}</p>}
          {testResults[resource.id] && <div className="mcpResult"><strong>{t("可用工具")} ({testResults[resource.id].tools.length})</strong>{testResults[resource.id].tools.map(tool => <Hint content={tool.description} key={tool.name}><p  ><code>{tool.name}</code></p></Hint>)}</div>}
          <div className="resourceCardActions"><StudioButton className="textButton" onClick={() => { setForm(resource); setError(""); }}>{t("编辑")}</StudioButton>
            {["workflow", "schedule"].includes(kind) && <StudioButton className="textButton accent" disabled={busyId === resource.id} onClick={() => void mutate(resource, "run")}>{busyId === resource.id ? t("提交中…") : t("▷ 立即运行")}</StudioButton>}
            {kind === "mcp" && <StudioButton className="textButton accent" disabled={busyId === resource.id} onClick={() => void mutate(resource, "test")}>{busyId === resource.id ? t("连接中…") : t("测试连接")}</StudioButton>}
            {["skill", "memory", "knowledge"].includes(kind) && <StudioButton className="textButton" onClick={() => downloadFile(`${resource.name.replace(/[\\/:*?"<>|]/g, "_")}.md`, resource.content)}>{t("导出")}</StudioButton>}
            <StudioButton className="textButton danger" onClick={() => setDeleteId(resource.id)}>{t("删除")}</StudioButton>
          </div>
          {deleteId === resource.id && <div className="deleteConfirm"><span>{t("删除后无法恢复")}</span><StudioButton disabled={busyId === resource.id} onClick={() => void mutate(resource, "delete")}>{t("确认删除")}</StudioButton><StudioButton onClick={() => setDeleteId("")}>{t("取消")}</StudioButton></div>}
        </article>)}</div>}
        {["workflow", "schedule"].includes(kind) && <div className="consoleCard"><div className="sectionTitle"><div><h3>{t("运行记录")}</h3><p>{t("服务在线时自动更新；需要确认工具时请打开会话。")}</p></div></div>{runs.filter(run => resources.some(resource => resource.id === run.resource_id)).length ? <RunList runs={runs.filter(run => resources.some(resource => resource.id === run.resource_id))} onOpenSession={onOpenSession} /> : <EmptyState icon={AlarmClock} title={t("等待第一次运行")} detail={t("点击立即运行，也可以等待定时任务到期。")} />}</div>}
      </>}
    </>}
    {skillDetail && <SkillDetail skill={skillDetail} token={token} onClose={() => setSkillDetail(null)} />}
    {agentDraft !== undefined && <AgentEditor token={token} agent={agentDraft} onClose={() => setAgentDraft(undefined)} onSaved={(agent, chat) => { setAgentDraft(undefined); setMarketRevision(value => value + 1); if (chat) onStartAgentChat?.(agent); }} />}
    {form && <StudioOverlay label={t("资源编辑器")} onClose={() => setForm(null)} isDismissable={!(saving)}><form className="resourceEditor" onSubmit={event => void save(event)} aria-label={t("资源编辑器")}><div className="sectionTitle"><div><h3>{form.id ? t("编辑") : t("新建")}{t(labels[form.kind].title)}</h3></div><StudioButton type="button" className="closeButton" aria-label={t("关闭编辑器")} disabled={saving} onClick={() => setForm(null)}>×</StudioButton></div>
      <label>{t("名称")}<StudioInput autoFocus required maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder={t("给它一个容易识别的名字")} /></label>
      {form.kind === "mcp" ? <><label>{t(form.config.provider === "feishu" ? "飞书个人 MCP 服务地址" : "服务地址")}<StudioInput type={form.config.provider === "feishu" ? "password" : "url"} autoComplete="off" required={!form.config.url_configured} value={form.config.url ?? ""} onChange={event => setForm({ ...form, config: { ...form.config, url: event.target.value } })} placeholder={form.config.url_configured ? t("已保存；留空保留原地址，填写新地址可替换") : form.config.provider === "feishu" ? "https://mcp.feishu.cn/…" : "https://your-service.example/mcp"} /></label>{form.config.provider === "feishu" ? <p className="formHint">{t("在飞书 MCP 平台创建服务、选择工具并完成授权后，粘贴生成的完整服务地址。地址加密保存，授权过期后可在此替换。保存后先测试连接，再启用。")} <a href="https://open.feishu.cn/page/mcp" target="_blank" rel="noopener noreferrer">{t("打开飞书 MCP 平台")}</a></p> : <p className="formHint">{t("支持无需认证的 Streamable HTTP 服务；飞书个人授权地址请使用“接入飞书”。先保存并测试，再启用以挂载工具。")}</p>}</> : <label>{t(labels[form.kind].contentLabel)}<StudioTextarea required value={form.content} onChange={event => setForm({ ...form, content: event.target.value })} placeholder={t(labels[form.kind].placeholder)} rows={12} /></label>}
      {form.kind === "workflow" && <p className="formHint">{t("用独立一行 --- 分隔步骤，最多 10 步。遇到权限确认时暂停，打开会话确认后继续后续步骤。")}</p>}
      {form.kind === "schedule" && <div className="formColumns"><label>{t("重复频率")}<SelectField aria-label={t("重复频率")} value={form.config.frequency ?? "daily"} onValueChange={value => setForm({ ...form, config: { ...form.config, frequency: value } })} options={[{ value: "once", label: t("单次") }, { value: "hourly", label: t("每小时") }, { value: "daily", label: t("每天（间隔 24 小时）") }]} /></label><label>{t("首次运行（本地时间）")}<StudioInput type="datetime-local" required value={form.config.next_run ? new Date(new Date(form.config.next_run).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ""} onChange={event => setForm({ ...form, config: { ...form.config, next_run: event.target.value ? new Date(event.target.value).toISOString() : "" } })} /></label></div>}
      <label className="checkLabel"><StudioInput type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })} />{form.kind === "schedule" ? t("启用自动调度（使用默认模型）") : t("启用此资源")}</label>

      <div className="editorFooter"><span>{t("内容仅保存到当前账号")}</span><StudioButton type="button" className="secondaryButton" disabled={saving} onClick={() => setForm(null)}>{t("取消")}</StudioButton><StudioButton type="submit" className="primaryButton" disabled={saving}>{saving ? t("保存中…") : t("保存")}</StudioButton></div>
    </form></StudioOverlay>}
  </section>;
}
