"use client";
import { StudioButton } from "./StudioControls";
import { Hint } from "@/components/hero-ui/tooltip";


import { useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { usePreferences } from "@/components/PreferencesProvider";

export type GallerySkill = { id: string; name: string; description: string; icon?: string; category?: string; action: ReactNode; footer?: ReactNode; onOpen?: () => void };
const categoryLabels: Record<string, string> = {
  "office-collaboration": "办公协同", "data-analysis": "数据分析",
  "content-creation": "内容创作", "developer-tools": "开发工具",
};
export function skillDescription(content: string) {
  const description = content.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (description && !/^[>|][-+]?$/.test(description)) return description.replace(/^["']|["']$/g, "");
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, "").split("\n").map(line => line.trim()).find(line => line && !line.startsWith("#")) ?? "";
}
function categoryFor(skill: GallerySkill) {
  return skill.category?.trim() || "未分类";
}
function SkillAvatar({ name, icon, tone }: { name: string; icon?: string; tone: number }) {
  const [failedIcon, setFailedIcon] = useState<string>();
  const imageIcon = icon && /^(https?:\/\/|\/(?!\/))/.test(icon);
  return <span className={`skillAvatar skillAvatarTone${tone}`} aria-hidden="true">
    {imageIcon && failedIcon !== icon ?
      // Skill artwork may be hosted by its publisher; preserve its original asset.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={icon} alt="" onError={() => setFailedIcon(icon)} /> : icon && !imageIcon ? icon : Array.from(name.trim())[0] ?? "S"}
  </span>;
}
export function SkillGallery({ skills }: { skills: GallerySkill[] }) {
  const { t } = usePreferences();
  const [category, setCategory] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const categories = [...new Set(skills.map(categoryFor))];
  const selectedCategory = category !== null && categories.includes(category) ? category : null;
  const visible = skills.filter(skill => selectedCategory === null || categoryFor(skill) === selectedCategory);
  return <div className="skillGallery">
    <div className="skillCategoryBar"><div ref={strip} className="skillCategories" role="group" aria-label={t("技能分类")}><StudioButton type="button" aria-pressed={selectedCategory === null} className={selectedCategory === null ? "active" : ""} onClick={() => setCategory(null)}>{t("全部")}</StudioButton>{categories.map(item => <StudioButton type="button" key={item} aria-pressed={selectedCategory === item} className={selectedCategory === item ? "active" : ""} onClick={() => setCategory(item)}>{t(categoryLabels[item] ?? item)}</StudioButton>)}</div><StudioButton className="skillCategoryNext" type="button" aria-label={t("查看更多技能分类")} onClick={() => strip.current?.scrollBy({ left: 260, behavior: "smooth" })}><ChevronRight size={18} /></StudioButton></div>
    {visible.length ? <div className="skillGalleryGrid">{visible.map(skill => <article className="skillGalleryCard" key={skill.id}>
      <div className="skillGalleryTop"><SkillAvatar name={skill.name} icon={skill.icon} tone={Array.from(skill.name).reduce((sum, char) => sum + char.codePointAt(0)!, 0) % 6} /><div className="skillGalleryCopy"><Hint content={skill.name}><h3 >{skill.onOpen ? <StudioButton type="button" className="skillDetailName" aria-label={`${t("查看技能详情")} ${skill.name}`} onClick={skill.onOpen}>{skill.name}</StudioButton> : skill.name}</h3></Hint><Hint content={skill.description}><p >{skill.description || t("暂无技能简介")}</p></Hint></div><div className="skillGalleryAction">{skill.action}</div></div>
      <div className="skillGalleryBottom">{skill.footer && <div className="skillGalleryFooter">{skill.footer}</div>}</div>
    </article>)}</div> : <div className="skillCategoryEmpty">{t("该分类暂无技能")}</div>}
  </div>;
}
