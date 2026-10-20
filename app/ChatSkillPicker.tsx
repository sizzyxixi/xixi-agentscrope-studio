"use client";

import { useEffect, useState } from "react";
import { withMockShops } from "./composer-mock-shops";
import { consoleApi } from "./StudioConsole";
import { ComposerResourceMenu, ComposerResourceTags, type ResourceOptions, type ResourceKind } from "./ComposerResourceMenu";

type Props = {
  token: string; value: string[]; onChange: (ids: string[]) => void;
  mcpValue?: string[]; onMcpChange?: (ids: string[]) => void;
  shopValue?: string[]; onShopChange?: (ids: string[]) => void;
  agentId?: string; sessionId?: string;
  onManage: () => void; onManageMcps?: () => void;
  disabled: boolean; tagsOnly?: boolean;
  onUpload?: () => void; onUploadFolder?: () => void; onWorkflows?: () => void;
};
export function ChatSkillPicker({ token, value, onChange, mcpValue = [], onMcpChange, shopValue = [], onShopChange, agentId = "main", sessionId, onManage, onManageMcps, disabled, tagsOnly = false, onUpload, onUploadFolder, onWorkflows }: Props) {
  const [resources, setResources] = useState<ResourceOptions>(() => withMockShops({}));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const path = `chat-resource-options?agent_id=${encodeURIComponent(agentId)}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ""}`;
  useEffect(() => {
    let active = true;
    if (token) void consoleApi<ResourceOptions>(token, path).then(result => { if (active) setResources(withMockShops(result)); }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [token, path]);
  const refresh = async () => {
    if (!token) return;
    setLoading(true); setError("");
    try { setResources(withMockShops(await consoleApi<ResourceOptions>(token, path))); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  const selection = { skill_ids: value, mcp_ids: mcpValue, shop_ids: shopValue };
  const change = (key: ResourceKind, ids: string[]) => ({ skill_ids: onChange, mcp_ids: onMcpChange, shop_ids: onShopChange })[key]?.(ids);
  return tagsOnly ? <ComposerResourceTags options={resources} value={selection} onChange={change} disabled={disabled} /> : <ComposerResourceMenu options={resources} value={selection} onChange={change} disabled={disabled || !token} loading={loading} error={error} onRefresh={() => void refresh()} onManage={key => key === "skill_ids" ? onManage() : onManageMcps?.()} onCheckMcp={async id => { await consoleApi(token, `resources/${id}/test`, "POST"); }} onUpload={onUpload} onUploadFolder={onUploadFolder} onWorkflows={onWorkflows} />;
}
