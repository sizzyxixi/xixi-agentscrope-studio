"use client";

import Image from "next/image";
import { BookOpen, ChevronDown, Palette, UserRound } from "lucide-react";
import { normalizeStyleReferences } from "./style-schemes";
import type { LibraryReference } from "./material-library-data";
import s from "./material-task-references.module.css";

export function savedLibraryReferences(value?:string):LibraryReference[] {
  if(!value)return [];
  try { const parsed=JSON.parse(value);return Array.isArray(parsed)?normalizeStyleReferences(parsed.filter(x=>x&&typeof x.name==="string"&&["brand","model","knowledge"].includes(x.kind))):[]; } catch { return []; }
}

export function MaterialTaskReferences({resources}:{resources:LibraryReference[]}) {
  if(!resources.length)return null;
  return <details className={s.references}><summary><span>本轮引用</span><strong>{resources.map(x=>x.name).join(" · ")}</strong><ChevronDown size={13}/></summary><div>{resources.map(resource=>{const Icon=resource.kind==="brand"?Palette:resource.kind==="model"?UserRound:BookOpen;return <section key={resource.id}><div><Icon size={13}/><strong>{resource.name}</strong><small>{resource.kind==="brand"?"风格方案":resource.kind==="model"?"人物参考":"知识来源"}</small></div>{resource.images&&resource.images.length>0&&<div className={s.styleImages}>{resource.images.map(url=><Image key={url} src={url} alt="本轮风格参考图" width={100} height={70} unoptimized/>)}</div>}<p>{resource.summary||"使用所选资源的已保存内容。"}</p></section>;})}</div></details>;
}
