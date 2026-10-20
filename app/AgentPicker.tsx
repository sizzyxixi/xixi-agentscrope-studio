"use client";

import { useFeedbackState } from "@/components/OperationFeedback";

import { useEffect, useState } from "react";
import { usePreferences } from "@/components/PreferencesProvider";
import { ModelSelectorRoot, ModelSelectorTrigger, ModelSelectorValue, ModelSelectorContent, ModelSelectorSearch, ModelSelectorList, ModelSelectorEmpty, ModelSelectorGroup, ModelSelectorItem } from "@/components/assistant-ui/elements/model-selector";
import { AgentEditor, defaultAgent, type AgentProfile } from "./AgentEditor";
import { consoleApi } from "./StudioConsole";
import { AgentAvatar } from "./AgentAvatar";

export function AgentPicker({ token, id, name, avatar, disabled, hasHistory, onSelect, onManage }: { token: string; id: string; name?: string; avatar?: string; disabled: boolean; hasHistory: boolean; onSelect: (agent: AgentProfile) => void; onManage: () => void }) {
  const { t } = usePreferences();
  const [agents, setAgents] = useState<AgentProfile[]>([defaultAgent]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [, setError] = useFeedbackState("error");
  useEffect(() => {
    if (!token) return;
    let active = true;
    void consoleApi<{ agents: AgentProfile[] }>(token, "agents").then(result => { if (active) setAgents(result.agents); }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [token, setError]);
  const changeOpen = async (next: boolean) => {
    setOpen(next);
    if (next && token) {
      try { const result = await consoleApi<{ agents: AgentProfile[] }>(token, "agents"); setAgents(result.agents); setError(""); }
      catch (e) { setError((e as Error).message); }
    }
  };
  const missing = !agents.some(agent => agent.id === id && agent.enabled);
  const choices = agents.map(agent => ({ id: agent.id, name: agent.id === id && name ? name : agent.name, icon: <AgentAvatar className="agentPickerAvatar" value={agent.builtin ? agent.config.avatar : agent.id === id && avatar ? avatar : agent.config.avatar} />, description: agent.enabled ? agent.config.description : t("已停用"), disabled: !agent.enabled }));
  if (!choices.some(agent => agent.id === id)) choices.push({ id, name: name ?? t("智能体不可用"), icon: <AgentAvatar className="agentPickerAvatar" value={avatar} />, description: t("请选择其他智能体"), disabled: true });
  return <div className="chatAgentBar"><span className="chatAgentLabel">{t("智能体")}</span><ModelSelectorRoot models={choices} value={id} onValueChange={value => { const agent = agents.find(item => item.id === value && item.enabled); if (agent) onSelect(agent); }} open={open} onOpenChange={value => void changeOpen(value)}>
    <ModelSelectorTrigger type="button" disabled={disabled || !token} className="xixiSelectTrigger chatAgentTrigger" aria-label={t("切换智能体")}><ModelSelectorValue placeholder={t("选择智能体")} showEffort={false} /></ModelSelectorTrigger>
    <ModelSelectorContent searchable align="start" className="xixiModelPopup chatAgentPopup"><ModelSelectorSearch placeholder={t("搜索智能体…")} aria-label={t("搜索智能体")} /><ModelSelectorList><ModelSelectorEmpty>{t("没有找到匹配的智能体")}</ModelSelectorEmpty><ModelSelectorGroup>{choices.map(agent => <ModelSelectorItem key={agent.id} model={agent} />)}</ModelSelectorGroup></ModelSelectorList>
      <div className="agentPickerFooter">{hasHistory && <p>{t("切换后将开启新会话，原对话保留。")}</p>}<button type="button" className="textButton" onClick={() => { setOpen(false); setCreating(true); }}>{t("＋ 创建智能体")}</button><button type="button" className="textButton" onClick={() => { setOpen(false); onManage(); }}>{t("管理智能体")}</button></div>
    </ModelSelectorContent>
  </ModelSelectorRoot>{missing && <span className="formHint warning">{t("智能体已停用或删除，请切换后继续。")}</span>}
  {creating && <AgentEditor token={token} agent={null} onClose={() => setCreating(false)} onSaved={agent => { setAgents(previous => [...previous, agent]); setCreating(false); onSelect(agent); }} />}
  </div>;
}
