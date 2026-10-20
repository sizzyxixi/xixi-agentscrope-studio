"use client";

import { useEffect, useState } from "react";
import { usePreferences } from "@/components/PreferencesProvider";
import { consoleApi } from "./StudioConsole";
import type { AgentProfile } from "./AgentEditor";
import { MoreHorizontal, MessageCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

export function AgentMarket({ token, onEdit, onChat }: { token: string; onEdit: (agent: AgentProfile) => void; onChat: (agent: AgentProfile) => void }) {
  const { t } = usePreferences();
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [deleteId, setDeleteId] = useState("");
  useEffect(() => {
    let active = true;
    void consoleApi<{ agents: AgentProfile[] }>(token, "agents").then(result => { if (active) setAgents(result.agents); }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);
  const mutate = async (agent: AgentProfile, remove = false) => {
    setBusy(agent.id); setError("");
    try {
      await consoleApi(token, `resources/${agent.id}`, remove ? "DELETE" : "PUT", remove ? undefined : { ...agent, kind: "agent", enabled: !agent.enabled });
      const result = await consoleApi<{ agents: AgentProfile[] }>(token, "agents"); setAgents(result.agents); setDeleteId("");
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const visible = agents.filter(agent => `${agent.name} ${agent.config.description ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="agentMarket"><div className="resourceToolbar"><input aria-label={t("搜索智能体")} placeholder={t("搜索名称或简介…")} value={search} onChange={event => setSearch(event.target.value)} /><span>{agents.length} {t("个智能体")}</span></div>
    {error && <p className="consoleAlert error" role="alert">{t(error)}</p>}
    {loading ? <p className="consoleLoading">{t("正在读取智能体…")}</p> : !visible.length ? <div className="consoleEmpty"><h3>{t("没有找到匹配的智能体")}</h3><p>{t("换一个关键词，或创建一个新的智能体。")}</p></div> : <div className="resourceGrid agentGrid">{visible.map(agent => <article className={`resourceCard agentCard ${!agent.enabled ? "disabledAgent" : ""}`} key={agent.id}>
      <div className="resourceCardTop"><span className="agentCardAvatar">{agent.config.avatar ?? "✦"}</span><div className="agentCardBadges">{agent.builtin && <span className="statusBadge">{t("内置")}</span>}<span className="statusBadge">{t(agent.enabled ? "已启用" : "已停用")}</span>{!agent.builtin && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="iconButton" aria-label={`${t("管理智能体")} ${agent.name}`} disabled={!!busy}><MoreHorizontal size={18} /></button></DropdownMenuTrigger><DropdownMenuContent className="xixiDropdownPopup" align="end"><DropdownMenuItem onSelect={() => onEdit(agent)}>{t("编辑")}</DropdownMenuItem><DropdownMenuItem onSelect={() => void mutate(agent)}>{t(agent.enabled ? "停用" : "启用")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setDeleteId(agent.id)}>{t("删除")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div></div>
      <h3>{agent.name}</h3><p className="agentDescription">{agent.config.description ? agent.builtin ? t(agent.config.description) : agent.config.description : t("已配置专属角色与执行指令")}</p>
      <div className="resourceCardActions"><button type="button" className="primaryButton agentChatButton" disabled={!agent.enabled || !!busy} onClick={() => onChat(agent)}><MessageCircle size={15} />{t("对话")}</button>{!agent.builtin && <button type="button" className="textButton" onClick={() => onEdit(agent)}>{t("编辑")}</button>}</div>
      {deleteId === agent.id && <div className="deleteConfirm"><span>{t("删除后历史对话仍会保留。")}</span><button disabled={!!busy} onClick={() => void mutate(agent, true)}>{t("确认删除")}</button><button onClick={() => setDeleteId("")}>{t("取消")}</button></div>}
    </article>)}</div>}
  </div>;
}
