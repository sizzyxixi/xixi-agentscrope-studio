"use client";

import { usePreferences } from "@/components/PreferencesProvider";

import { useEffect, useState } from "react";
import { consoleApi } from "./StudioConsole";
import { CloudUpload, Sparkles, Workflow } from "./lucide-icons";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";

type Skill = { id: string; name: string; enabled: boolean };
export function ChatSkillPicker({ token, value, onChange, onManage, disabled, tagsOnly = false, onUpload, onWorkflows }: { token: string; value: string[]; onChange: (ids: string[]) => void; onManage: () => void; disabled: boolean; tagsOnly?: boolean; onUpload?: () => void; onWorkflows?: () => void }) {
  const { t } = usePreferences();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!token) return;
    let active = true;
    void consoleApi<{ resources: Skill[] }>(token, "resources?kind=skill").then(result => { if (active) setSkills(result.resources); }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [token]);
  const refresh = async (next: boolean) => {
    setOpen(next);
    if (!next || !token) return;
    setLoading(true); setError("");
    try { const result = await consoleApi<{ resources: Skill[] }>(token, "resources?kind=skill"); setSkills(result.resources); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter(item => item !== id));
    else if (value.length < 3) onChange([...value, id]);
  };
  if (tagsOnly) return value.length ? <div className="scheduleTags chatSkillTags">{value.map(id => <span className="scheduleTag" key={id}><Sparkles size={14} />{skills.find(skill => skill.id === id)?.name ?? t("已选技能")}<button type="button" disabled={disabled} aria-label={t(`移除技能 ${skills.find(skill => skill.id === id)?.name ?? id}`)} onClick={() => toggle(id)}>×</button></span>)}</div> : null;
  return <DropdownMenu open={open} onOpenChange={next => void refresh(next)}><DropdownMenuTrigger asChild><button type="button" className="schedulePlus" aria-label={t("添加附件、技能或工作流")} disabled={disabled || !token}>＋</button></DropdownMenuTrigger><DropdownMenuContent data-ui-popup="menu" className="xixiDropdownPopup scheduleAttachmentMenu" align="start" sideOffset={8}>
    <DropdownMenuItem onSelect={onUpload}><CloudUpload />{t("上传附件")}</DropdownMenuItem>
    <DropdownMenuSub><DropdownMenuSubTrigger><Sparkles />{t("技能")}<span className="chatSkillCount">{value.length}/3</span></DropdownMenuSubTrigger><DropdownMenuSubContent data-ui-popup="submenu" className="xixiDropdownPopup scheduleResourceSubmenu chatSkillSubmenu" collisionPadding={12}><DropdownMenuLabel>{t("选择技能（最多 3 个）")}</DropdownMenuLabel><DropdownMenuSeparator />
      {loading ? <DropdownMenuItem disabled>{t("正在读取技能…")}</DropdownMenuItem> : error ? <DropdownMenuItem disabled>{error}</DropdownMenuItem> : !skills.length ? <DropdownMenuItem disabled>{t("暂无技能，请先到技能市场安装")}</DropdownMenuItem> : skills.map(skill => <DropdownMenuCheckboxItem key={skill.id} checked={value.includes(skill.id)} disabled={!skill.enabled || (!value.includes(skill.id) && value.length >= 3)} onSelect={event => event.preventDefault()} onCheckedChange={() => toggle(skill.id)}>{skill.name}{!skill.enabled && t("（已停用）")}</DropdownMenuCheckboxItem>)}
      <DropdownMenuSeparator /><DropdownMenuItem onSelect={() => { setOpen(false); onManage(); }}>{t("管理 / 安装更多技能 ↗")}</DropdownMenuItem>
    </DropdownMenuSubContent></DropdownMenuSub>
    <DropdownMenuItem onSelect={onWorkflows}><Workflow />{t("工作流")}</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>;
}
