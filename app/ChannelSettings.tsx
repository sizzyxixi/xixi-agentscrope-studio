"use client";

import { useFeedbackState, useToast } from "@/components/OperationFeedback";

import { usePreferences } from "@/components/PreferencesProvider";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/hero-ui/dialog";
import { CircleHelp, ExternalLink, LoaderCircle, MessageCircle, Plug, Radio, RefreshCw, Send, Settings2, ShieldCheck, X } from "lucide-react";
import { SelectField, ModelPicker } from "@/components/SelectField";
import { consoleApi, dateLabel } from "./StudioConsole";

type Platform = "dingtalk" | "feishu";
type Config = { app_id: string; agent_id: string; model_id: string; mcp_ids: string[]; prefix: string; robot_code: string; dm_enabled: boolean; group_enabled: boolean; require_mention: boolean; at_sender: boolean };
type Binding = { id: string; platform: Platform; name: string; config: Config; enabled: boolean; state: string; error: string; has_secret: boolean; last_received: string; last_sent: string };
type Draft = { id?: string; platform: Platform; name: string; config: Config; secret: string };
type Choice = { id: string; name: string; enabled: boolean };
type Options = { agents: Choice[]; mcps: Choice[] };
type Model = { id: string; displayName: string; modelName: string; isDefault: boolean };
type Access = { id: string; tenant_id: string; sender_id: string; chat_id: string; is_group: boolean; status: string; created_at: string };
type RecordItem = { id: string; status: string; detail: string; created_at: string; session_id?: string; attempts?: number };
type Diagnostics = { messages: RecordItem[]; deliveries: RecordItem[] };
const platformNames = { dingtalk: "钉钉", feishu: "飞书" };
const states: Record<string, string> = { connected: "已连接", connecting: "连接中", reconnecting: "重连中", connection_failed: "连接失败", configuration_error: "配置异常", disabled: "已停用" };
const runStates: Record<string, string> = { queued: "排队中", running: "执行中", waiting_approval: "等待网页确认", success: "已完成", failed: "失败", interrupted: "已中断", sent: "已送达", sending: "发送中", pending: "待发送", unknown: "结果需核对", ignored: "已忽略" };
const emptyOptions: Options = { agents: [], mcps: [] };
const futureChannels = ["Discord", "Telegram", "QQ", "微信", "企业微信", "元宝", "Matrix", "SIP", "小艺", "Mattermost", "MQTT", "Slack", "语音", "OneBot"];
const testMessage = "这是一条来自 xixi agent studio 的渠道连接测试消息。";
const defaultConfig = (): Config => ({ app_id: "", agent_id: "main", model_id: "", mcp_ids: [], prefix: "", robot_code: "", dm_enabled: true, group_enabled: true, require_mention: true, at_sender: true });

const platformInfo = {
  dingtalk: { title: "钉钉", description: "接入钉钉机器人，成员可在群聊或私聊中指挥 XIXI Agent，执行结果实时回传。", tutorial: "https://open-dingtalk.github.io/developerpedia/docs/explore/tutorials/stream/bot/java/create-bot/" },
  feishu: { title: "飞书", description: "接入飞书机器人，成员可在群聊中直接与 XIXI Agent 对话，高效处理任务。", tutorial: "https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-" },
};
function PlatformIcon({ platform }: { platform: Platform }) {
  return <span className={`channelLogo ${platform}`}>{platform === "dingtalk" ? <Send size={22} /> : <span className="feishuMark" aria-hidden="true">◈</span>}</span>;
}

export default function ChannelSettings({ token, onLogin, onModels, onOpenSession }: { token: string; onLogin: () => void; onModels: () => void; onOpenSession: (id: string) => void }) {
  const { t } = usePreferences();
  const toast = useToast();
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [options, setOptions] = useState<Options>(emptyOptions);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useFeedbackState("error");
  const [, setLoadError] = useFeedbackState("error", true);
  const [, setNotice] = useFeedbackState("auto");
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dialogTab, setDialogTab] = useState("config");
  const [access, setAccess] = useState<Access[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({ messages: [], deliveries: [] });
  const [secretVisible, setSecretVisible] = useState(false);
  const [agentForm, setAgentForm] = useState<{ name: string; content: string } | null>(null);
  const [target, setTarget] = useState("");
  const [targetGroup, setTargetGroup] = useState(false);
  const [testConfirmed, setTestConfirmed] = useState(false);
  const [manualAccess, setManualAccess] = useState({ tenant_id: "", sender_id: "", chat_id: "", is_group: false });
  const live = bindings.find(binding => binding.id === draft?.id);
  const locked = live?.enabled === true;

  const refresh = useCallback(async () => {
    if (!token) return;
    const [channelData, optionData, response] = await Promise.all([
      consoleApi<{ bindings: Binding[] }>(token, "channels"),
      consoleApi<Options>(token, "schedule-options"),
      fetch("/api/models", { headers: { authorization: `Bearer ${token}` } }),
    ]);
    if (!response.ok) throw new Error("模型配置读取失败。");
    const modelData = await response.json() as { models: Model[] };
    setBindings(channelData.bindings); setOptions(optionData); setModels(modelData.models); setLoadError("");
  }, [token, setLoadError]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(refresh).catch(e => { if (active) setLoadError((e as Error).message); }).finally(() => { if (active) setLoading(false); });
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh().catch(e => { if (active) setLoadError((e as Error).message); }); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh, setLoadError]);
  useEffect(() => {
    if (!draft?.id || !token) return;
    let active = true;
    const load = async () => {
      const [permissions, details] = await Promise.all([
        consoleApi<{ access: Access[] }>(token, `channels/${draft.id}/access`),
        consoleApi<Diagnostics>(token, `channels/${draft.id}/diagnostics`),
      ]);
      if (active) { setAccess(permissions.access); setDiagnostics(details); }
    };
    void load().catch(e => { if (active) setError((e as Error).message); });
    const timer = window.setInterval(() => { void load().catch(() => {}); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [draft?.id, token, setError]);

  const open = (platform: Platform) => {
    if (!token) { onLogin(); return; }
    const existing = bindings.find(binding => binding.platform === platform);
    const config = defaultConfig();
    config.model_id = models.find(model => model.isDefault)?.id ?? models[0]?.id ?? "";
    setDraft(existing ? { ...existing, secret: "" } : { platform, name: `${t(platformNames[platform])}机器人`, config, secret: "" });
    setDialogTab("config"); setError(""); setNotice(""); setAccess([]); setDiagnostics({ messages: [], deliveries: [] }); setSecretVisible(false); setAgentForm(null); setTarget(""); setTestConfirmed(false);
  };
  const change = (values: Partial<Config>) => setDraft(current => current ? { ...current, config: { ...current.config, ...values } } : current);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft || locked) return;
    setBusy("save"); setError(""); setNotice("");
    try {
      const result = await consoleApi<{ binding: Binding }>(token, `channels/${draft.platform}`, "PUT", draft);
      setDraft({ ...result.binding, secret: "" }); await refresh(); setNotice("配置已保存。校验凭证后，可启用连接。");
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const action = async (name: "validate" | "enable" | "disable" | "reconnect") => {
    if (!draft?.id) return;
    setBusy(name); setError(""); setNotice("");
    try {
      const result = await consoleApi<{ message?: string }>(token, `channels/${draft.id}/${name}`, "POST", {});
      await refresh(); setNotice(result.message ?? (name === "disable" ? "渠道已停用，正在运行的任务会继续完成。" : "已启动连接，请查看真实连接状态并完成平台配置。"));
    } catch (e) { setError((e as Error).message); await refresh().catch(() => {}); } finally { setBusy(""); }
  };
  const setPermission = async (item: Access, status: "allowed" | "blocked") => {
    if (!draft?.id) return;
    setBusy(item.id); setError("");
    try { const result = await consoleApi<{ access: Access[] }>(token, `channels/${draft.id}/access/${item.id}`, "PUT", { status }); setAccess(result.access); toast.success("渠道访问权限已更新。"); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const addPermission = async () => {
    if (!draft?.id) return;
    setBusy("access"); setError("");
    try { const result = await consoleApi<{ access: Access[] }>(token, `channels/${draft.id}/access`, "POST", manualAccess); setAccess(result.access); setManualAccess({ tenant_id: "", sender_id: "", chat_id: "", is_group: false }); toast.success("接收对象已添加。"); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const sendTest = async () => {
    if (!draft?.id || !testConfirmed) return;
    setBusy("test"); setError(""); setNotice("");
    try {
      const result = await consoleApi<{ ok: boolean; deliveries: RecordItem[] }>(token, `channels/${draft.id}/test-send`, "POST", { target, group: targetGroup, confirm: true });
      setNotice(result.ok ? "测试消息已发送。请在目标会话核对，双向收发还需从平台发消息验证。" : "测试发送未成功，请查看下方发送记录。");
      setDiagnostics(await consoleApi<Diagnostics>(token, `channels/${draft.id}/diagnostics`));
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const createAgent = async () => {
    if (!agentForm?.name.trim() || !agentForm.content.trim()) return;
    setBusy("agent"); setError("");
    try { const result = await consoleApi<{ resource: Choice }>(token, "resources", "POST", { kind: "agent", ...agentForm, enabled: true }); await refresh(); change({ agent_id: result.resource.id }); setAgentForm(null); toast.success("智能体已创建。"); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const toggleCapability = (key: "mcp_ids", id: string) => {
    if (!draft) return;
    const values = draft.config[key];
    if (values.includes(id)) change({ [key]: values.filter(value => value !== id) });
    else if (values.length < 3) change({ [key]: [...values, id] });
  };
  const enabled = bindings.filter(binding => binding.enabled);
  const displayTime = (value: string) => value ? dateLabel(value) : "暂无";
  const records = (items: RecordItem[], empty: string) => items.length ? <div className="channelRecords">{items.map(item => <div className="channelRecord" key={item.id}><span className={`statusBadge ${item.status}`}>{t(runStates[item.status] ?? item.status)}</span><div><p>{item.detail || (item.status === "sent" ? t("平台已确认接收") : t("处理记录"))}</p><small>{dateLabel(item.created_at)}{item.attempts !== undefined ? t(` · ${item.attempts} 次发送尝试`) : ""}</small></div>{item.session_id && <button type="button" className="textButton" onClick={() => { setDraft(null); onOpenSession(item.session_id!); }}>{t("打开会话 ↗")}</button>}</div>)}</div> : <p className="channelEmptyText">{empty}</p>;

  return <section className="channelSettings">
    <div className="channelPageHeading"><div><h2>{t("远程助理")}</h2><p>{t("连接第三方消息通道，即可远程指挥 XIXI Agent 执行任务")}</p></div><button type="button" className="secondaryButton" disabled={!!busy || loading} onClick={() => { setLoading(true); void refresh().catch(e => setLoadError((e as Error).message)).finally(() => setLoading(false)); }}><RefreshCw size={14} />{t("刷新")}</button></div>

    {!token ? <div className="channelLogin"><MessageCircle size={36} /><h3>{t("连接你的远程助理")}</h3><p>{t("登录后配置机器人与执行智能体。")}</p><button className="primaryButton" onClick={onLogin}>{t("登录 / 注册")}</button></div> : loading ? <p className="consoleLoading">{t("正在读取远程助理…")}</p> : <>
      {enabled.length > 0 && <><div className="channelSectionLabel"><span><i className="channelDot connected" />{t("已激活")}</span><small>{enabled.length} {t("个")}</small></div><div className="channelActiveGrid">
        {enabled.map(binding => <button type="button" className="channelCard" key={binding.id} onClick={() => open(binding.platform)}><div className="channelCardTop"><PlatformIcon platform={binding.platform} /><span className={`channelState ${binding.state}`}><i />{t(states[binding.state] ?? "待连接")}</span></div><h3>{t(platformNames[binding.platform])}</h3><p>{binding.name}</p><div className="channelBindingInfo"><span>{options.agents.find(agent => agent.id === binding.config.agent_id)?.name ?? "智能体已移除"}</span><span>{models.find(model => model.id === binding.config.model_id)?.displayName ?? "模型已移除"}</span></div><div className="channelCardFooter"><span>{binding.error ? t("连接需要处理") : t(`最近收信 ${displayTime(binding.last_received)}`)}</span><strong>{t("配置")}<ExternalLink size={13} /></strong></div></button>)}
      </div></>}
      {(Object.keys(platformNames) as Platform[]).some(platform => !bindings.some(binding => binding.platform === platform && binding.enabled)) && <><div className="channelSectionLabel"><span>{t("可连接渠道")}</span></div><div className="channelAvailableGrid">{(Object.keys(platformNames) as Platform[]).filter(platform => !bindings.some(binding => binding.platform === platform && binding.enabled)).map(platform => <article className="channelAvailable" key={platform}>
        <div className="channelAvailableTop"><PlatformIcon platform={platform} /><h3>{t(platformInfo[platform].title)}</h3><button type="button" className="channelConnectButton" onClick={() => open(platform)}>{t("连接")}</button></div>
        <p>{t(platformInfo[platform].description)}</p>
        <div className="channelAvailableFooter">{bindings.some(binding => binding.platform === platform) && <small>{t("已配置")}</small>}<a href={platformInfo[platform].tutorial} target="_blank" rel="noopener noreferrer">{t("配置教程")}<ExternalLink size={12} /></a></div>
      </article>)}</div></>}

      <div className="channelSectionLabel channelFutureLabel"><span>{t("更多渠道")}</span><small>{t("后续支持")}</small></div><div className="channelFutureGrid">{futureChannels.map(name => <div className="channelFuture" key={name}><Plug size={16} /><span>{name}</span><small>{t("暂未支持")}</small></div>)}</div>
    </>}
    <Dialog.Root isKeyboardDismissDisabled={!!busy} open={!!draft} onOpenChange={open => { if (!open && !busy) setDraft(null); }}><Dialog.Portal><Dialog.Overlay className="channelDialogOverlay" /><Dialog.Content className="channelDialog" onInteractOutside={event => event.preventDefault()}>
      {draft && <><header className="channelDialogHeader"><PlatformIcon platform={draft.platform} /><div><Dialog.Title>{t(platformNames[draft.platform])} · {t("远程助理配置")}</Dialog.Title><Dialog.Description>{t("将此机器人的对话交给你指定的智能体。")}</Dialog.Description></div><Dialog.Close asChild><button type="button" className="iconButton" aria-label={t("关闭渠道配置")} disabled={!!busy}><X size={19} /></button></Dialog.Close></header>
      <div className="channelDialogTabs" role="tablist" aria-label={t("渠道配置")}><button role="tab" aria-selected={dialogTab === "config"} onClick={() => setDialogTab("config")}><Settings2 size={14} />{t("基础配置")}</button><button role="tab" aria-selected={dialogTab === "access"} disabled={!draft.id} onClick={() => setDialogTab("access")}><ShieldCheck size={14} />{t("访问控制")}{access.filter(item => item.status === "pending").length > 0 && <small>{access.filter(item => item.status === "pending").length}</small>}</button><button role="tab" aria-selected={dialogTab === "diagnostics"} disabled={!draft.id} onClick={() => setDialogTab("diagnostics")}><Radio size={14} />{t("连接诊断")}</button></div>
      <div className="channelDialogBody">
      {live && <div className="channelLiveStatus"><span className={`channelState ${live.state}`}><i />{t(states[live.state] ?? live.state)}</span><span>{live.error || (live.enabled ? t("长连接状态由后端实时检测") : t("保存配置不会自动开始收发消息"))}</span></div>}
      {dialogTab === "config" && <form id="channel-config-form" onSubmit={event => void save(event)}><fieldset disabled={locked || !!busy}><label>{t("配置名称")}<input required maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>{t("执行智能体")}<SelectField aria-label={t("渠道智能体")} value={draft.config.agent_id} disabled={locked || !!busy} onValueChange={value => { if (value === "__create") setAgentForm({ name: "", content: "" }); else change({ agent_id: value }); }} options={[...options.agents.filter(agent => agent.enabled).map(agent => ({ value: agent.id, label: agent.name })), { value: "__create", label: t("＋ 创建更多智能体…") }]} /></label>
      {!options.agents.some(agent => agent.enabled) && <p className="formHint">{t("还没有可用智能体，请创建一个后再保存渠道。")}</p>}
      {agentForm && <div className="scheduleAgentForm"><h4>{t("创建智能体")}</h4><label>{t("名称")}<input maxLength={100} value={agentForm.name} onChange={event => setAgentForm({ ...agentForm, name: event.target.value })} /></label><label>{t("角色与指令")}<textarea rows={4} maxLength={24000} value={agentForm.content} onChange={event => setAgentForm({ ...agentForm, content: event.target.value })} /></label><button type="button" className="secondaryButton" onClick={() => setAgentForm(null)}>{t("取消")}</button><button type="button" className="primaryButton" onClick={() => void createAgent()} disabled={!agentForm.name.trim() || !agentForm.content.trim()}>{t("创建并选择")}</button></div>}
      <label>{t("对话模型")}<ModelPicker aria-label={t("渠道对话模型")} models={models.map(model => ({ id: model.id, name: model.displayName || model.modelName, description: t(`${model.modelName}${model.isDefault ? t(" · 默认模型") : ""}`), keywords: [model.modelName] }))} value={draft.config.model_id} onValueChange={value => change({ model_id: value })} disabled={locked || !!busy || !models.length} placeholder={models.length ? t("选择模型") : t("尚未配置模型")} /></label>{!models.length && <button type="button" className="textButton accent" onClick={() => { setDraft(null); onModels(); }}>{t("前往模型设置 ↗")}</button>}
      <div className="channelFormSection"><h4>{t("平台凭证")}</h4><label>{draft.platform === "dingtalk" ? "Client ID（AppKey）" : "App ID"}<input required maxLength={200} autoComplete="off" spellCheck={false} value={draft.config.app_id} onChange={event => change({ app_id: event.target.value.trim() })} /></label><label>{draft.platform === "dingtalk" ? "Client Secret（AppSecret）" : "App Secret"}<div className="channelSecret"><input required={!live?.has_secret} type={secretVisible ? "text" : "password"} autoComplete="new-password" maxLength={4096} value={draft.secret} onChange={event => setDraft({ ...draft, secret: event.target.value })} placeholder={live?.has_secret ? t("已保存 · 留空保留原 Secret") : t("填写应用 Secret")} /><button type="button" className="textButton" onClick={() => setSecretVisible(!secretVisible)}>{secretVisible ? t("隐藏") : t("显示")}</button></div></label>
      <div className="channelSetupGuide"><CircleHelp size={16} /><div><strong>{draft.platform === "dingtalk" ? t("接收方式：Stream 模式") : t("接收方式：WebSocket 长连接")}</strong><p>{draft.platform === "dingtalk" ? t("在钉钉开放平台启用机器人能力，设置 Stream 接收并发布应用。") : t("使用飞书企业自建应用。先保存并启用本地连接，再到开放平台配置长连接、订阅接收消息事件并发布。")}</p><a href={platformInfo[draft.platform].tutorial} target="_blank" rel="noopener noreferrer">{t("查看配置教程")}<ExternalLink size={12} /></a><a href={draft.platform === "dingtalk" ? "https://open-dev.dingtalk.com/" : "https://open.feishu.cn/app"} target="_blank" rel="noreferrer">{t("打开开发者平台 ↗")}</a></div></div></div>
      <details className="channelAdvanced"><summary>{t("高级配置")}</summary><div className="channelAdvancedBody">{draft.platform === "dingtalk" && <label>Robot Code <small>{t("主动测试发送和延迟回传时需要")}</small><input maxLength={200} value={draft.config.robot_code} onChange={event => change({ robot_code: event.target.value.trim() })} /></label>}<div className="channelFormSection"><h4>{t("对话能力")}</h4>{([{ key: "mcp_ids", title: t("MCP 连接器"), list: options.mcps }] as const).map(group => <div className="channelCapabilities" key={group.key}><span>{group.title}<small>{draft.config[group.key].length}/3</small></span>{!group.list.length ? <p className="formHint">{t("还没有")}{group.title}{t("，可在「能力市场」中添加。")}</p> : group.list.map(item => <label className="checkLabel" key={item.id}><input type="checkbox" checked={draft.config[group.key].includes(item.id)} disabled={!item.enabled || (!draft.config[group.key].includes(item.id) && draft.config[group.key].length >= 3)} onChange={() => toggleCapability(group.key, item.id)} />{item.name}{!item.enabled && <small>{t("已停用")}</small>}</label>)}</div>)}<label>{t("回复前缀")}<input maxLength={100} value={draft.config.prefix} onChange={event => change({ prefix: event.target.value })} placeholder={t("选填，例如：XIXI 助手")} /></label></div>
      <div className="channelFormSection"><h4>{t("消息触发规则")}</h4><label className="checkLabel"><input type="checkbox" checked={draft.config.dm_enabled} onChange={event => change({ dm_enabled: event.target.checked })} />{t("接收私聊消息")}</label><label className="checkLabel"><input type="checkbox" checked={draft.config.group_enabled} onChange={event => change({ group_enabled: event.target.checked })} />{t("接收群聊消息")}</label><label className="checkLabel"><input type="checkbox" checked={draft.config.require_mention} onChange={event => change({ require_mention: event.target.checked })} />{t("群聊仅在 @机器人时触发")}</label>{draft.platform === "dingtalk" && <label className="checkLabel"><input type="checkbox" checked={draft.config.at_sender} onChange={event => change({ at_sender: event.target.checked })} />{t("群聊回复时 @发送者")}</label>}<p className="formHint">{t("新发送者需要在「访问控制」中授权。不同群成员使用独立会话。")}</p></div></div></details></fieldset>{locked && <p className="formHint">{t("修改配置前请先停用渠道，正在运行的任务会继续完成。")}</p>}</form>}
      {dialogTab === "access" && <div><h3>{t("谁可以使用这个机器人")}</h3><p className="formHint">{t("允许后，该发送者可使用本绑定指定智能体的资料与所选工具。新消息到达后会显示待授权申请，授权前不会调用模型。")}</p>{!access.length ? <div className="channelEmptyState"><ShieldCheck size={28} /><p>{t("暂无访问申请")}</p><small>{t("从钉钉或飞书发送一条消息后，回到这里授权。")}</small></div> : <div className="channelAccessList">{access.map(item => <article key={item.id}><div><strong>{item.is_group ? t("群聊发送者") : t("私聊发送者")}</strong><span className={`statusBadge ${item.status === "allowed" ? "success" : ""}`}>{item.status === "allowed" ? t("已允许") : item.status === "blocked" ? t("已拒绝") : t("待授权")}</span></div><dl><dt>{t("发送者")}</dt><dd>{item.sender_id}</dd><dt>{t("租户")}</dt><dd>{item.tenant_id}</dd><dt>{t("会话")}</dt><dd>{item.chat_id}</dd></dl><div className="channelAccessActions">{item.status !== "allowed" && <button type="button" className="secondaryButton" disabled={!!busy} onClick={() => void setPermission(item, "allowed")}>{t("允许访问")}</button>}{item.status !== "blocked" && <button type="button" className="textButton danger" disabled={!!busy} onClick={() => void setPermission(item, "blocked")}>{item.status === "allowed" ? t("撤销授权") : t("拒绝")}</button>}</div></article>)}</div>}
      <details className="channelManualAccess"><summary>{t("手动添加允许的身份")}</summary><label>{t("租户标识")}<input value={manualAccess.tenant_id} onChange={event => setManualAccess({ ...manualAccess, tenant_id: event.target.value })} /></label><label>{t("发送者标识")}<input value={manualAccess.sender_id} onChange={event => setManualAccess({ ...manualAccess, sender_id: event.target.value })} /></label><label>{t("会话标识")}<input value={manualAccess.chat_id} onChange={event => setManualAccess({ ...manualAccess, chat_id: event.target.value })} /></label><label className="checkLabel"><input type="checkbox" checked={manualAccess.is_group} onChange={event => setManualAccess({ ...manualAccess, is_group: event.target.checked })} />{t("群聊身份")}</label><button type="button" className="secondaryButton" disabled={!!busy || !manualAccess.tenant_id || !manualAccess.sender_id || !manualAccess.chat_id} onClick={() => void addPermission()}>{t("添加到允许列表")}</button></details></div>}
      {dialogTab === "diagnostics" && <div><div className="channelFacts"><div><span>{t("最近收到消息")}</span><strong>{displayTime(live?.last_received ?? "")}</strong></div><div><span>{t("最近发送成功")}</span><strong>{displayTime(live?.last_sent ?? "")}</strong></div></div><div className="channelTest"><h3>{t("发送测试消息")}</h3><p className="formHint">{draft.platform === "feishu" ? t("填写飞书 chat_id，机器人必须在该会话内。") : t("私聊填写用户 Staff ID，群聊填写 openConversationId；需配置 Robot Code 和发送权限。")}</p><label>{t("接收目标")}<input value={target} maxLength={500} onChange={event => { setTarget(event.target.value); setTestConfirmed(false); }} placeholder={draft.platform === "feishu" ? "oc_…" : t("Staff ID 或 openConversationId")} /></label>{draft.platform === "dingtalk" && <label className="checkLabel"><input type="checkbox" checked={targetGroup} onChange={event => { setTargetGroup(event.target.checked); setTestConfirmed(false); }} />{t("发送到群聊")}</label>}<blockquote>{testMessage}</blockquote><label className="checkLabel"><input type="checkbox" checked={testConfirmed} onChange={event => setTestConfirmed(event.target.checked)} />{t("已核对接收目标，确认发送以上测试消息")}</label><button type="button" className="secondaryButton" disabled={!!busy || !testConfirmed || !target.trim() || live?.state !== "connected"} onClick={() => void sendTest()}><Send size={14} />{t("发送测试消息")}</button></div><h4>{t("消息处理记录")}</h4>{records(diagnostics.messages, t("暂无消息处理记录"))}<h4>{t("发送记录")}</h4>{records(diagnostics.deliveries, t("暂无发送记录"))}<p className="formHint">{t("发送结果不明的消息不会自动重发，请先核对平台会话。")}</p></div>}
      </div><footer className="channelDialogFooter">{busy && <span className="channelBusy"><LoaderCircle size={14} />{t("处理中…")}</span>}{dialogTab === "config" && !locked && <button form="channel-config-form" type="submit" className="primaryButton" disabled={!!busy || !models.length || !!agentForm}>{busy === "save" ? t("保存中…") : t("保存配置")}</button>}{draft.id && <><button type="button" className="secondaryButton" disabled={!!busy} onClick={() => void action("validate")}>{t("校验凭证")}</button>{locked && <button type="button" className="secondaryButton" disabled={!!busy} onClick={() => void action("reconnect")}>{t("重新连接")}</button>}<button type="button" className={locked ? "secondaryButton" : "primaryButton"} disabled={!!busy} onClick={() => void action(locked ? "disable" : "enable")}>{locked ? t("停用渠道") : t("启用渠道")}</button></>}</footer></>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
