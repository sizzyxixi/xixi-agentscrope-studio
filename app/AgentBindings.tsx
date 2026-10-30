"use client";
import { StudioButton } from "./StudioControls";

import { useFeedbackState } from "@/components/OperationFeedback";

import { useEffect, useState } from "react";
import { ChevronDown, Plug, Sparkles, Wrench } from "lucide-react";
import { usePreferences } from "@/components/PreferencesProvider";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/hero-ui/dropdown-menu";
import { consoleApi } from "./StudioConsole";

export const builtinAgentTools = [
  { id: "web_search", name: "网页搜索", description: "通过 DeepSeek 搜索公开网页，需本账号的官方 API Key，按次计费" },
  { id: "web_fetch", name: "读取网页", description: "读取公开网页正文，不支持登录或动态页面交互" },
  { id: "read_file", name: "读取文件", description: "解析文档、表格、图片和音视频资料" },
  { id: "create_file", name: "生成文件", description: "生成并校验真实文件，保留用户原件" },
  { id: "convert_file", name: "转换文件", description: "支持的文档、图片和音视频格式转换" },
  { id: "package_files", name: "文件打包", description: "将会话文件打包成 ZIP" },
  { id: "search_documents", name: "检索知识库", description: "检索项目文档和个人知识库" },
  { id: "save_memory", name: "保存记忆", description: "经确认后保存长期记忆" },
  { id: "workspace_write_plan", name: "记录执行计划", description: "记录任务拆解和执行计划" },
];
type Resource = { id: string; name: string; enabled: boolean; kind: string };
type Bindings = { tool_ids?: string[]; skill_ids?: string[]; mcp_ids?: string[] };

export function AgentBindings({ token, value, onChange }: { token: string; value: Bindings; onChange: (next: Bindings) => void }) {
  const { t } = usePreferences();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useFeedbackState("error");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void consoleApi<{ resources: Resource[] }>(token, "resources").then(result => {
      if (active) setResources(result.resources);
    }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, revision, setError]);
  const groups = [
    { key: "tool_ids", label: "内置工具", Icon: Wrench, options: builtinAgentTools.map(tool => ({ ...tool, enabled: true })) },
    { key: "mcp_ids", label: "MCP 连接器", Icon: Plug, options: resources.filter(item => item.kind === "mcp") },
    { key: "skill_ids", label: "技能", Icon: Sparkles, options: resources.filter(item => item.kind === "skill") },
  ] as const;
  return <section className="agentBindings" aria-label={t("工具与技能")}>
    <h4>{t("工具与技能")}</h4>
    <p className="formHint">{t("配置数量不限。智能体仅可使用已配置且有权限的能力；每轮对话最多指定 3 个技能和 3 个 MCP。")}</p>
    {error && <StudioButton type="button" className="textButton" onClick={() => { setLoading(true); setError(""); setRevision(n => n + 1); }}>{t("重试")}</StudioButton>}
    {groups.map(({ key, label, Icon, options }) => {
      const selected = value[key] ?? [];
      const toggle = (id: string) => onChange({ ...value, [key]: selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id] });
      return <div className="agentBindingGroup" key={key}>
        <DropdownMenu><DropdownMenuTrigger asChild><StudioButton type="button" className="agentBindingTrigger" disabled={key !== "tool_ids" && loading}>
          <Icon size={16} /><span>{t(label)}</span><small>{selected.length}</small><ChevronDown size={15} />
        </StudioButton></DropdownMenuTrigger><DropdownMenuContent className="xixiDropdownPopup agentBindingPopup" align="start" sideOffset={6}>
          <DropdownMenuLabel>{t(label)}</DropdownMenuLabel><DropdownMenuSeparator />
          {!options.length && <DropdownMenuCheckboxItem checked={false} disabled>{t("暂无可用资源，请先到能力市场添加")}</DropdownMenuCheckboxItem>}
          {options.map(item => <DropdownMenuCheckboxItem key={item.id} checked={selected.includes(item.id)} disabled={!item.enabled} onSelect={event => event.preventDefault()} onCheckedChange={() => toggle(item.id)}>{t(item.name)}{!item.enabled && t("（已停用）")}</DropdownMenuCheckboxItem>)}
        </DropdownMenuContent></DropdownMenu>
        {(selected.length > 0 || value[key] === undefined) && <StudioButton type="button" className="textButton agentBindingClear" onClick={() => onChange({ ...value, [key]: [] })}>{t("清空")}</StudioButton>}
        {value[key] === undefined && <p className="formHint">{t("尚未配置该类能力，保存后仅允许使用明确选择的能力。")}</p>}
        {selected.length > 0 && <div className="scheduleTags">{selected.map(id => {
          const item = options.find(option => option.id === id);
          return <span className="scheduleTag" key={id}>{item ? t(item.name) : t("资源已删除")}{item && !item.enabled && t("（已停用）")}<StudioButton type="button" aria-label={`${t("移除")} ${item?.name ?? id}`} onClick={() => toggle(id)}>×</StudioButton></span>;
        })}</div>}
      </div>;
    })}
  </section>;
}
