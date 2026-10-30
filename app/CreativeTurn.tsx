"use client";
import { useId, useState, type ReactNode } from "react";
import { Brain, Check, ChevronDown, Clock3, Coins, ImagePlus, ThumbsDown, ThumbsUp } from "lucide-react";
import { StudioButton } from "./StudioControls";
import { Hint } from "@/components/hero-ui/tooltip";
import type { CreativeTurnTrace } from "./creative-turn";
import s from "./creative-turn.module.css";
export function CreativeTurn({trace,children,onFeedback}:{trace:CreativeTurnTrace;children:ReactNode;onFeedback:(feedback:"like"|"dislike"|undefined)=>void}) {
 const id=useId();const [reasoning,setReasoning]=useState(false),[expanded,setExpanded]=useState<string[]>([]);
 const date=new Date(trace.completedAt);const time=Number.isFinite(date.getTime())?new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(date):"";
 return <div className={s.turn}>
  <div className={s.process}>
   <StudioButton className={s.reasoning} aria-expanded={reasoning} aria-controls={`${id}-reasoning`} onClick={()=>setReasoning(!reasoning)}><Brain size={16}/><span>思考过程</span><small>已完成</small><ChevronDown size={14} className={reasoning?s.rotated:""}/></StudioButton>
   {reasoning&&<div className={s.reasoningContent} id={`${id}-reasoning`}>{trace.reasoning.map((text,index)=><p key={index}>{text}</p>)}</div>}
   <div className={s.tools} aria-label="本轮工具调用">{trace.tools.map(tool=>{const open=expanded.includes(tool.id);return <div key={tool.id} className={s.tool}>
    <StudioButton className={s.toolTrigger} aria-expanded={open} aria-controls={`${id}-${tool.id}`} onClick={()=>setExpanded(old=>open?old.filter(item=>item!==tool.id):[...old,tool.id])}><ImagePlus size={15}/><span>{tool.label}</span><Check size={13} className={s.success}/><small>{tool.durationSeconds}s</small><ChevronDown size={13} className={open?s.rotated:""}/></StudioButton>
    {open&&<div className={s.toolDetails} id={`${id}-${tool.id}`}><code>{tool.name}</code><dl>{Object.entries(tool.input).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><p><Check size={12}/>{tool.result}</p></div>}
   </div>;})}</div>
  </div>
  <div className={s.body}>{children}</div>
  <footer className={s.footer} aria-label="本轮完成信息"><span><Check size={13}/>已完成</span>{time&&<span title={date.toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}><Clock3 size={12}/>{time}</span>}<span>{trace.durationSeconds} 秒</span><span><Coins size={12}/>{trace.credits} 积分</span><div className={s.feedback}>
   <Hint content="有帮助"><StudioButton aria-label="赞这条回复" aria-pressed={trace.feedback==="like"} onClick={()=>onFeedback(trace.feedback==="like"?undefined:"like")}><ThumbsUp size={14}/></StudioButton></Hint>
   <Hint content="需要改进"><StudioButton aria-label="踩这条回复" aria-pressed={trace.feedback==="dislike"} onClick={()=>onFeedback(trace.feedback==="dislike"?undefined:"dislike")}><ThumbsDown size={14}/></StudioButton></Hint>
  </div></footer>
 </div>;
}
