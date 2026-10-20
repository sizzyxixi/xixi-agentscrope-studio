"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "radix-ui";
import { usePreferences } from "@/components/PreferencesProvider";
import { consoleApi } from "./StudioConsole";

export type AgentProfile = { id: string; name: string; content: string; enabled: boolean; builtin?: boolean; config: { description?: string; avatar?: string; max_iters?: number; context_trigger?: number } };
export const defaultAgent: AgentProfile = { id: "main", name: "默认智能体", content: "", enabled: true, builtin: true, config: { avatar: "✦", description: "通用任务助手" } };
const avatars = ["✦", "🧠", "📊", "🛍️", "✍️", "💻", "🔬", "🌍"];

export function AgentEditor({ token, agent, onClose, onSaved }: { token: string; agent: AgentProfile | null; onClose: () => void; onSaved: (agent: AgentProfile, chat: boolean) => void }) {
  const { t } = usePreferences();
  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.config.description ?? "");
  const [avatar, setAvatar] = useState(agent?.config.avatar ?? "✦");
  const [content, setContent] = useState(agent?.content ?? "");
  const [maxIters, setMaxIters] = useState(agent?.config.max_iters ?? 8);
  const [trigger, setTrigger] = useState(Math.round((agent?.config.context_trigger ?? 0.75) * 100));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const chat = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "chat";
    if (saving) return;
    setSaving(true); setError("");
    try {
      const result = await consoleApi<{ resource: AgentProfile }>(token, agent ? `resources/${agent.id}` : "resources", agent ? "PUT" : "POST", { kind: "agent", name, content, enabled: agent?.enabled ?? true, config: { description, avatar, max_iters: maxIters, context_trigger: trigger / 100 } });
      onSaved(result.resource, chat);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  return <Dialog.Root open onOpenChange={open => { if (!open && !saving) onClose(); }}><Dialog.Portal><Dialog.Overlay className="agentDialogOverlay" /><Dialog.Content className="agentDialog" onInteractOutside={event => event.preventDefault()}>
    <form className="agentEditorForm" onSubmit={event => void submit(event)}><div className="sectionTitle"><div><Dialog.Title>{t(agent ? "编辑智能体" : "创建智能体")}</Dialog.Title><Dialog.Description>{t("定义它的角色与工作方式，随后即可开始对话。")}</Dialog.Description></div><Dialog.Close className="closeButton" aria-label={t("关闭智能体配置")} disabled={saving}>×</Dialog.Close></div>
      <div className="agentEditorBody"><fieldset disabled={saving}><label>{t("头像")}</label><div className="agentAvatarChoices" role="group" aria-label={t("智能体头像")}>{avatars.map(icon => <button key={icon} type="button" aria-label={`${t("头像")} ${icon}`} aria-pressed={avatar === icon} className={avatar === icon ? "selected" : ""} onClick={() => setAvatar(icon)}>{icon}</button>)}</div>
      <label>{t("名称")} *<input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder={t("例如：电商运营专家")} /></label>
      <label>{t("简介")}<textarea maxLength={300} rows={2} value={description} onChange={event => setDescription(event.target.value)} placeholder={t("一句话说明这个智能体擅长什么")} /></label>
      <label>{t("角色与指令")} *<textarea required maxLength={24000} rows={7} value={content} onChange={event => setContent(event.target.value)} placeholder={t("描述专业领域、工作方法、输出要求与执行边界")} /></label>
      <details className="agentAdvanced"><summary>{t("高级设置")}</summary><div className="formColumns"><label>{t("最大执行轮次")}<input type="number" min={1} max={50} required value={maxIters} onChange={event => setMaxIters(Number(event.target.value))} /></label><label>{t("上下文压缩阈值（%）")}<input type="number" min={20} max={85} required value={trigger} onChange={event => setTrigger(Number(event.target.value))} /></label></div><p className="formHint">{t("达到阈值后压缩历史上下文。默认配置适用于多数任务。")}</p></details></fieldset></div>
      {error && <p className="consoleAlert error" role="alert">{t(error)}</p>}
      <div className="agentEditorFooter"><button type="button" className="secondaryButton" disabled={saving} onClick={onClose}>{t("取消")}</button><button type="submit" value="save" className="secondaryButton" disabled={saving}>{t(saving ? "保存中…" : agent ? "保存修改" : "创建")}</button><button type="submit" value="chat" className="primaryButton" disabled={saving || (agent !== null && !agent.enabled)}>{t(agent ? "保存并对话" : "创建并对话")}</button></div>
    </form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
