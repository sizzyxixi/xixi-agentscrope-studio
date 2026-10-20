"use client";

import { useFeedbackState, useToast } from "@/components/OperationFeedback";

import { usePreferences } from "@/components/PreferencesProvider";

import { useCallback, useEffect, useState } from "react";
import { consoleApi } from "./StudioConsole";
import { SelectField } from "@/components/SelectField";
import { Dialog } from "@/components/hero-ui/dialog";
import { Check, Plus, LoaderCircle } from "lucide-react";
import { SkillGallery } from "./SkillGallery";

type Skill = { slug: string; title: string; description: string; source: string; sha256: string; files: string[]; resource_id: string | null; enabled: boolean; icon?: string; category?: string };
type Page = { content: string; offset: number; total: number; next_offset: number | null };

export function SkillMarket({ token, onInstalled }: { token: string; onInstalled: () => Promise<void> }) {
  const { t } = usePreferences();
  const toast = useToast();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [, setError] = useFeedbackState("error");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<Skill | null>(null);
  const [file, setFile] = useState("SKILL.md");
  const [page, setPage] = useState<Page | null>(null);
  const [reading, setReading] = useState(false);
  const refresh = useCallback(async () => {
    try { const result = await consoleApi<{ skills: Skill[] }>(token, "skill-market"); setSkills(result.skills); }
    catch (e) { setError((e as Error).message); }
  }, [token, setError]);
  useEffect(() => {
    let active = true;
    void consoleApi<{ skills: Skill[] }>(token, "skill-market").then(result => { if (active) setSkills(result.skills); }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [token, setError]);
  useEffect(() => {
    if (!selected?.resource_id) return;
    let active = true;
    void consoleApi<Page>(token, `skills/${selected.resource_id}/read?path=${encodeURIComponent(file)}&limit=24000`).then(result => { if (active) setPage(result); }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setReading(false); });
    return () => { active = false; };
  }, [token, selected, file, setError]);
  const install = async (skill: Skill) => {
    setBusy(skill.slug); setError("");
    try { await consoleApi(token, `skill-market/${skill.slug}/install`, "POST"); await refresh(); await onInstalled(); toast.success("技能已安装。"); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const more = async () => {
    if (!selected?.resource_id || page?.next_offset == null) return;
    setReading(true);
    try { const next = await consoleApi<Page>(token, `skills/${selected.resource_id}/read?path=${encodeURIComponent(file)}&offset=${page.next_offset}&limit=24000`); setPage(previous => previous ? { ...next, content: previous.content + next.content, offset: 0 } : next); }
    catch (e) { setError((e as Error).message); } finally { setReading(false); }
  };
  return <div className="skillMarket">
    <div className="sectionTitle"><div><h3>{t("技能市场")}</h3><p>{t("Anthropic 官方技能 · 启用后可在会话中按需读取和调用")}</p></div><span className="statusBadge success">{skills.length} {t("个技能包")}</span></div>

    <SkillGallery skills={skills.map(skill => ({ id: skill.slug, name: skill.title || skill.slug, description: t(skill.description), icon: skill.icon, category: skill.category,
      action: skill.resource_id ? <button type="button" className="skillQuickAction installed" disabled={!skill.enabled} aria-label={`${t("查看技能内容")} ${skill.title}`} title={skill.enabled ? t("读取 SKILL.md 和引用文件") : t("请在已安装技能中启用后读取")} onClick={() => { setFile("SKILL.md"); setPage(null); setReading(true); setError(""); setSelected(skill); }}><Check size={19} /></button> : <button type="button" className="skillQuickAction" disabled={!!busy} aria-label={`${t("安装技能")} ${skill.title}`} onClick={() => void install(skill)}>{busy === skill.slug ? <LoaderCircle size={18} className="skillInstalling" /> : <Plus size={21} />}</button>,
      footer: <><a className="textButton" href={skill.source} target="_blank" rel="noreferrer">{t("查看来源 ↗")}</a>{skill.resource_id && <span className={`statusBadge ${skill.enabled ? "success" : ""}`}>{t(skill.enabled ? "已安装 · 已启用" : "已安装 · 已停用")}</span>}</>
    }))} />
    <Dialog.Root open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); setError(""); } }}><Dialog.Portal><Dialog.Overlay className="skillReaderOverlay" /><Dialog.Content className="skillReader">
      <div className="sectionTitle"><div><Dialog.Title>{selected?.slug}</Dialog.Title><Dialog.Description>{t("技能指令与配套文件 · 只读")}</Dialog.Description></div><Dialog.Close className="closeButton" aria-label={t("关闭技能内容")}>×</Dialog.Close></div>
      <SelectField aria-label={t("技能文件")} value={file} disabled={reading} onValueChange={value => { setFile(value); setPage(null); setReading(true); setError(""); }} options={(selected?.files ?? []).map(path => ({ value: path, label: path }))} />

      <pre className="skillReaderContent">{page?.content ?? (reading ? t("正在读取技能内容…") : "")}</pre>
      <div className="editorFooter"><span>{page ? t(`已读取 ${page.content.length} / ${page.total} 字符`) : ""}</span>{page?.next_offset != null && <button className="secondaryButton" disabled={reading} onClick={() => void more()}>{reading ? t("读取中…") : t("继续读取")}</button>}</div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
