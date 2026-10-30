"use client";
import { RotateCcw } from "lucide-react";
import { scenes } from "./commerce-demo-data";
import { StudioButton } from "./StudioControls";
import { platformLabel } from "./creative-prompt";
import { templatePlatforms,templateCategories,emptyTemplateFilters,type TemplateFiltersState } from "./template-filtering";
import s from "./template-filters.module.css";
export function TemplateFilters({value,onChange,showScene=true,showTools=true}:{value:TemplateFiltersState;onChange:(value:TemplateFiltersState)=>void;showScene?:boolean;showTools?:boolean}) {
 const tools=scenes.find(scene=>scene.name===value.scene)?.tools??[];
 const row=(key:keyof TemplateFiltersState,label:string,options:readonly string[])=> <div className={s.row} key={key}><span className={s.label}>{label}</span><div className={s.options} role="group" aria-label={`模板${label}筛选`}>{["",...options].map(option=><StudioButton key={option} aria-pressed={value[key]===option} className={value[key]===option?s.selected:""} onClick={()=>onChange({...value,[key]:option,...(key==="scene"?{tool:""}:{})})}>{option?(key==="platform"?platformLabel(option):option):"全部"}</StudioButton>)}</div></div>;
 const changed=!!((showScene&&value.scene)||(showTools&&value.tool)||value.platform||value.category);
 return <div className={s.filters} aria-label="模板多层筛选">
  {showScene&&row("scene","场景",scenes.map(scene=>scene.name))}
  {showTools&&tools.length>0&&row("tool","工具",tools)}
  {row("platform","平台",templatePlatforms)}
  {row("category","品类",templateCategories)}
  {changed&&<StudioButton className={s.reset} onClick={()=>onChange({...emptyTemplateFilters(),...(!showScene?{scene:value.scene,tool:value.tool}:{})})}><RotateCcw size={11}/>重置筛选</StudioButton>}
 </div>;
}
