"use client";
import { X } from "lucide-react";
import { Dialog } from "@/components/hero-ui/dialog";
import { usePreferences } from "@/components/PreferencesProvider";
import { RelatedSchedules } from "./RelatedSchedules";
export function SkillDetail({ skill, token, onClose }: { skill: { id: string; name: string; content: string }; token: string; onClose: () => void }) {
  const { t } = usePreferences();
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="agentDialogOverlay" /><Dialog.Content className="agentDetailDialog" aria-describedby="skill-detail-description"><header className="agentDetailHeader"><Dialog.Title>{skill.name}</Dialog.Title><Dialog.Close className="iconButton agentDetailClose" aria-label={t("关闭技能详情")}><X size={20} /></Dialog.Close></header><Dialog.Description id="skill-detail-description" className="agentDetailDescription">{t("技能内容与关联定时任务")}</Dialog.Description><div className="agentDetailScroll"><RelatedSchedules token={token} kind="skill" resourceId={skill.id} /><section className="agentDetailPanel"><h3>{t("技能内容")}</h3><pre className="agentDetailPrompt">{skill.content}</pre></section></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
