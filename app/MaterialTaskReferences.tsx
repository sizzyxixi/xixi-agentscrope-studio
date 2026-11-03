"use client";

import { BookOpen, ChevronDown, Palette, UserRound } from "lucide-react";
import type { LibraryReference } from "./material-library-data";
import s from "./material-task-references.module.css";

export function savedLibraryReferences(value?:string):LibraryReference[] {
  if(!value)return [];
  try { const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed.filter(x=>x&&typeof x.name==="string"&&["brand","model","knowledge"].includes(x.kind)):[]; } catch { return []; }
}

export function MaterialTaskReferences({resources}:{resources:LibraryReference[]}) {
  if(!resources.length)return null;
  return <details className={s.references}><summary><span>本轮引用</span><strong>{resources.map(x=>x.name).join(" · ")}</strong><ChevronDown size={13}/></summary><div>{resources.map(resource=>{const Icon=resource.kind==="brand"?Palette:resource.kind==="model"?UserRound:BookOpen;return <section key={resource.id}><div><Icon size={13}/><strong>{resource.name}</strong><small>{resource.kind==="brand"?"品牌风格":resource.kind==="model"?"人物参考":"知识来源"}</small></div>{resource.colors&&<div className={s.colors}>{resource.colors.map((color,i)=><span key={i} style={{background:color}} title={color}/>)}</div>}<p>{resource.summary||"使用所选资源的已保存内容。"}</p></section>;})}</div></details>;
}
