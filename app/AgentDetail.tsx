"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/hero-ui/dialog";
import { Tabs } from "@/components/hero-ui/tabs";
import { ChevronDown, LockKeyhole, MessageCircle, Plug, Sparkles, Wrench, X } from "lucide-react";
import { usePreferences } from "@/components/PreferencesProvider";
import type { AgentProfile } from "./AgentEditor";
import { builtinAgentTools } from "./AgentBindings";
import { consoleApi } from "./StudioConsole";
import { skillDescription } from "./SkillGallery";
import { RelatedSchedules } from "./RelatedSchedules";
import { AgentAvatar } from "./AgentAvatar";

type Capability = { id: string; name: string; content: string; enabled: boolean; config: { description?: string } };

export function AgentDetail({ agent, token, onClose, onEdit, onChat }: { agent: AgentProfile; token: string; onClose: () => void; onEdit: (agent: AgentProfile) => void; onChat: (agent: AgentProfile) => void }) {
  const { t, language } = usePreferences();
  const [resources, setResources] = useState<{ skills: Capability[]; mcps: Capability[] }>({ skills: [], mcps: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([
      consoleApi<{ resources: Capability[] }>(token, "resources?kind=skill"),
      consoleApi<{ resources: Capability[] }>(token, "resources?kind=mcp"),
    ]).then(([skills, mcps]) => {
      if (active) { setResources({ skills: skills.resources, mcps: mcps.resources }); setError(""); }
    }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, revision]);

  const name = language === "en" && agent.builtin ? agent.config.name_en ?? t(agent.name) : agent.name;
  const description = language === "en" && agent.builtin ? agent.config.description_en ?? t(agent.config.description ?? "") : agent.config.description;
  const isDefault = agent.id === "main";
  const skillIds = agent.config.skill_ids ?? (isDefault ? resources.skills.filter(item => item.enabled).map(item => item.id) : []);
  const mcpIds = agent.config.mcp_ids ?? (isDefault ? resources.mcps.filter(item => item.enabled).map(item => item.id) : []);
  const toolIds = agent.config.tool_ids;
  const countLabel = (label: string, count?: number) => <span>{t(label)}<strong>{count ?? t("默认配置")}</strong></span>;

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="agentDialogOverlay" />
    <Dialog.Content className="agentDetailDialog" aria-describedby="agent-detail-description">
      <header className="agentDetailHeader">
        <AgentAvatar className="agentDetailAvatar" value={agent.config.avatar} />
        <div className="agentDetailIdentity"><Dialog.Title>{name}</Dialog.Title><div className="agentDetailBadges"><span className="statusBadge">{t(agent.builtin ? "官方预设" : "自定义")}</span>{agent.builtin && <span className="agentDetailReadOnly"><LockKeyhole size={12} />{t("只读")}</span>}<span className={`statusBadge ${agent.enabled ? "success" : ""}`}>{t(agent.enabled ? "已启用" : "已停用")}</span></div></div>
        <Dialog.Close className="iconButton agentDetailClose" aria-label={t("关闭智能体详情")}><X size={20} /></Dialog.Close>
      </header>
      <Dialog.Description id="agent-detail-description" className="agentDetailDescription">{description || t("已配置专属角色与执行指令")}</Dialog.Description>
      <div className="agentDetailCounts" aria-label={t("编排概览")}>{countLabel("技能", loading && isDefault ? undefined : skillIds.length)}{countLabel("工具", toolIds?.length)}{countLabel("连接器", loading && isDefault ? undefined : mcpIds.length)}</div>
      <Tabs.Root defaultValue="role" className="agentDetailTabs" onValueChange={() => scroll.current?.scrollTo({ top: 0 })}>
        <Tabs.List aria-label={t("智能体详情")} className="agentDetailTabList"><Tabs.Trigger value="role">{t("角色与指令")}</Tabs.Trigger><Tabs.Trigger value="capabilities">{t("技能与工具")}</Tabs.Trigger><Tabs.Trigger value="schedules">{t("关联定时任务")}</Tabs.Trigger><Tabs.Trigger value="settings">{t("执行设置")}</Tabs.Trigger></Tabs.List>
        <div className="agentDetailScroll" ref={scroll}>
          <Tabs.Content value="role" className="agentDetailPanel">
            {agent.builtin && <p className="agentDetailHint"><LockKeyhole size={14} />{t("官方预设内容由平台维护，仅供查看。")}</p>}
            <h3>{t("角色与指令")}</h3><pre className="agentDetailPrompt">{agent.content || t("使用平台默认角色与工作指令。")}</pre>
            {agent.config.demo && <p className="agentDetailHint">{t("示例和热度标签为演示内容，真实经营数据需由用户提供或通过已授权工具获取。")}</p>}
          </Tabs.Content>
          <Tabs.Content value="capabilities" className="agentDetailPanel">
            {agent.builtin && <p className="agentDetailHint">{t("以下技能与连接器来自当前账号，按账号授权范围使用，不属于所有用户共享的资源。")}</p>}
            {loading ? <p className="agentDetailEmpty" role="status">{t("正在读取能力配置…")}</p> : error ? <div className="agentDetailEmpty" role="alert"><p>{t("能力配置读取失败，请重试。")}</p><button type="button" className="secondaryButton" onClick={() => { setLoading(true); setRevision(value => value + 1); }}>{t("重试")}</button></div> : <>
              <section className="agentDetailSection"><h3><Sparkles size={16} />{t(agent.builtin ? "当前账号可用的技能" : "已配置技能")}<small>{skillIds.length}</small></h3>
                {!skillIds.length ? <p className="agentDetailEmpty">{t("未配置技能")}</p> : skillIds.map(id => {
                  const skill = resources.skills.find(item => item.id === id);
                  return skill ? <details className="agentDetailSkill" key={id}><summary><div><strong>{skill.name}</strong><p>{skill.config.description || skillDescription(skill.content) || t("暂无技能简介")}</p></div><span className={`statusBadge ${skill.enabled ? "success" : ""}`}>{t(skill.enabled ? "已启用" : "已停用")}</span><ChevronDown size={15} /></summary><div className="agentDetailSkillContent"><p>{t("技能内容 · 只读")}</p><pre>{skill.content}</pre></div></details> : <p className="agentDetailEmpty" key={id}>{t("技能已删除或不可访问")}</p>;
                })}
              </section>
              <section className="agentDetailSection"><h3><Plug size={16} />{t(agent.builtin ? "当前账号可用的连接器" : "已配置连接器")}<small>{mcpIds.length}</small></h3>
                {!mcpIds.length ? <p className="agentDetailEmpty">{t("未配置连接器")}</p> : mcpIds.map(id => {
                  const mcp = resources.mcps.find(item => item.id === id);
                  return mcp ? <div className="agentDetailCapability" key={id}><div><strong>{mcp.name}</strong><p>{mcp.content || t("MCP 服务")}</p><small>{t("连接状态以实际调用结果为准")}</small></div><span className={`statusBadge ${mcp.enabled ? "success" : ""}`}>{t(mcp.enabled ? "已启用" : "已停用")}</span></div> : <p className="agentDetailEmpty" key={id}>{t("连接器已删除或不可访问")}</p>;
                })}
              </section>
            </>}
            <section className="agentDetailSection"><h3><Wrench size={16} />{t("已配置工具")}<small>{toolIds?.length ?? t("默认配置")}</small></h3>
              {toolIds === undefined ? <p className="agentDetailEmpty">{t("使用平台默认工具配置，具体可用工具以当前会话为准。")}</p> : !toolIds.length ? <p className="agentDetailEmpty">{t("未配置工具")}</p> : toolIds.map(id => {
                const tool = builtinAgentTools.find(item => item.id === id);
                const writes = ["create_file", "convert_file", "package_files", "save_memory", "workspace_write_plan"].includes(id);
                return <div className="agentDetailCapability" key={id}><div><strong>{t(tool?.name ?? id)}</strong><p>{tool ? t(tool.description) : t("工具定义以实际会话为准")}</p></div>{writes && <span className="statusBadge">{t("写入需确认")}</span>}</div>;
              })}
            </section>
          </Tabs.Content>
          <Tabs.Content value="schedules" className="agentDetailPanel"><RelatedSchedules token={token} kind="agent" resourceId={agent.id} /></Tabs.Content>
          <Tabs.Content value="settings" className="agentDetailPanel">
            <h3>{t("执行设置")}</h3><dl className="agentDetailSettings"><div><dt>{t("最大执行轮次")}</dt><dd>{agent.config.max_iters ?? 8}</dd><p>{t("限制一次任务中智能体的推理与工具执行循环次数，不是聊天消息数量。")}</p></div><div><dt>{t("上下文压缩阈值")}</dt><dd>{Math.round((agent.config.context_trigger ?? 0.75) * 100)}%</dd><p>{t("上下文达到该比例时触发历史压缩，为后续执行保留空间。")}</p></div></dl>
            <p className="agentDetailHint">{t("对话模型在聊天框中选择，使用当前账号已配置的模型。")}</p>
          </Tabs.Content>
        </div>
      </Tabs.Root>
      <footer className="agentDetailFooter"><button type="button" className="secondaryButton" onClick={onClose}>{t("关闭")}</button>{!agent.builtin && <button type="button" className="secondaryButton" onClick={() => { onClose(); onEdit(agent); }}>{t("编辑配置")}</button>}<button type="button" className="primaryButton" disabled={!agent.enabled} onClick={() => { onClose(); onChat(agent); }}><MessageCircle size={15} />{t("开始对话")}</button></footer>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
