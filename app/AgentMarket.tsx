"use client";

import { useFeedbackState, useToast } from "@/components/OperationFeedback";

import { useEffect, useState } from "react";
import { usePreferences } from "@/components/PreferencesProvider";
import { consoleApi } from "./StudioConsole";
import type { AgentProfile } from "./AgentEditor";
import { AgentDetail } from "./AgentDetail";
import { AgentAvatar } from "./AgentAvatar";
import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/hero-ui/dropdown-menu";

const assetBase = "https://hccmjailahbrxtsmvxot.supabase.co/storage/v1/object/public/xixi-agentscope-studio/assert/agent";

export function AgentMarket({ token, search, mine, onEdit, onChat }: { token: string; search: string; mine: boolean; onEdit: (agent: AgentProfile) => void; onChat: (agent: AgentProfile) => void }) {
  const { t, language } = usePreferences();
  const toast = useToast();
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useFeedbackState("error");
  const [busy, setBusy] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [detail, setDetail] = useState<AgentProfile | null>(null);
  useEffect(() => {
    let active = true;
    void consoleApi<{ agents: AgentProfile[] }>(token, "agents").then(result => { if (active) setAgents(result.agents); }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, setError]);
  const mutate = async (agent: AgentProfile, remove = false) => {
    setBusy(agent.id); setError("");
    try {
      await consoleApi(token, `resources/${agent.id}`, remove ? "DELETE" : "PUT", remove ? undefined : { ...agent, kind: "agent", enabled: !agent.enabled });
      const result = await consoleApi<{ agents: AgentProfile[] }>(token, "agents"); setAgents(result.agents); setDeleteId(""); toast.success(remove ? "智能体已删除。" : agent.enabled ? "智能体已停用。" : "智能体已启用。");
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const displayName = (agent: AgentProfile) => language === "en" && agent.builtin ? agent.config.name_en ?? t(agent.name) : agent.name;
  const description = (agent: AgentProfile) => language === "en" && agent.builtin ? agent.config.description_en ?? t(agent.config.description ?? "") : agent.config.description;
  const query = search.trim().toLowerCase();
  const visible = agents.filter(agent => (!mine || !agent.builtin) && `${agent.name} ${agent.config.name_en ?? ""} ${agent.config.description ?? ""} ${agent.config.description_en ?? ""}`.toLowerCase().includes(query))
    .sort((a, b) => Number(Boolean(b.config.cover_url)) - Number(Boolean(a.config.cover_url)));

  return <div className="agentMarket">
    {!mine && <div className="agentMarketBanner">
      <div className="agentMarketBannerCopy"><h2>{t("7×24h 自动化店铺运营助手")}<br /><strong>{t("助你生意大卖")}</strong></h2><p>{t("支持多家主流电商平台，覆盖开店、选品、刊登、履约、运营全链路")}</p></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${assetBase}/banner.png`} alt="" className="agentMarketBannerArt" />
    </div>}

    {loading ? <p className="consoleLoading">{t("正在读取智能体…")}</p> : !visible.length ? <div className="consoleEmpty"><h3>{t(mine && !query ? "还没有自定义智能体" : "没有找到匹配的智能体")}</h3><p>{t(mine && !query ? "点击右上角「创建智能体」，定义你的专属助手。" : "换一个关键词，或创建一个新的智能体。")}</p></div> : <div className="agentMarketGrid">{visible.map(agent => <article className={`agentMarketCard ${!agent.enabled ? "disabledAgent" : ""}`} key={agent.id}>
      <button type="button" className="agentMarketDetailOpen" aria-label={`${t("查看智能体详情")} ${displayName(agent)}`} aria-haspopup="dialog" onClick={() => setDetail(agent)} />
      {agent.config.cover_url ? /* eslint-disable-next-line @next/next/no-img-element */
        <img className="agentMarketCover" src={agent.config.cover_url} alt="" loading="lazy" /> : <div className="agentMarketCover agentMarketCustomCover" aria-hidden="true"><span>{agent.config.avatar ?? "✦"}</span></div>}
      <div className="agentMarketCardBody">
        <div className="agentMarketCardTitle">{agent.config.avatar?.startsWith("https://") && <AgentAvatar className="agentMarketPlatformLogo" value={agent.config.avatar} />}<h3 title={displayName(agent)}>{displayName(agent)}</h3>{!agent.builtin && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="iconButton" aria-label={`${t("管理智能体")} ${agent.name}`} disabled={!!busy}><MoreHorizontal size={18} /></button></DropdownMenuTrigger><DropdownMenuContent className="xixiDropdownPopup" align="end"><DropdownMenuItem onSelect={() => onEdit(agent)}>{t("编辑")}</DropdownMenuItem><DropdownMenuItem onSelect={() => void mutate(agent)}>{t(agent.enabled ? "停用" : "启用")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setDeleteId(agent.id)}>{t("删除")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div>
        <p className="agentMarketDescription" title={description(agent)}>{description(agent) || t("已配置专属角色与执行指令")}</p>
        <div className="agentMarketCardFooter"><div className="agentMarketTags">{agent.config.tags?.length ? agent.config.tags.map((tag, index) => <span className={index % 2 ? "blue" : "purple"} key={tag} title={agent.config.demo ? t("演示标签，不代表真实使用统计") : undefined}>{t(tag)}</span>) : <span className="purple">{t(agent.builtin ? "内置" : "自定义")}</span>}{!agent.enabled && <span className="muted">{t("已停用")}</span>}</div><button type="button" className="primaryButton agentMarketChat" aria-label={`${t("与智能体对话")} ${displayName(agent)}`} disabled={!agent.enabled || !!busy} onClick={() => onChat(agent)}>{t("对话")}</button></div>
        {deleteId === agent.id && <div className="agentMarketDelete" role="alert"><p>{t("删除后历史对话仍会保留。")}</p><button type="button" disabled={!!busy} onClick={() => void mutate(agent, true)}>{t("确认删除")}</button><button type="button" disabled={!!busy} onClick={() => setDeleteId("")}>{t("取消")}</button></div>}
      </div>
    </article>)}</div>}
    {detail && <AgentDetail key={detail.id} agent={detail} token={token} onClose={() => setDetail(null)} onEdit={onEdit} onChat={onChat} />}
  </div>;
}
