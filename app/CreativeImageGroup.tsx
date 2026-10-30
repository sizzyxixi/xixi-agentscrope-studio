"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Download, Maximize2, Quote, PanelsTopLeft } from "lucide-react";
import type { CreativeJob, Media } from "./commerce-demo-data";
import { DesignArtwork } from "./CreativeImageEditor";
import { StudioButton } from "./StudioControls";
import s from "./creative-conversation.module.css";
export function CreativeImageGroup({job,items,onEdit,onCanvas,onCopy,onReference,onDownload}:{job:CreativeJob;items:Media[];onEdit:(id:string)=>void;onCanvas:(id:string)=>void;onCopy:(media:Media)=>void;onReference:(media:Media)=>void;onDownload:(media:Media)=>void}) {
 const [index,setIndex]=useState(0);const active=items[index]??items[0];if(!active)return null;
 return <div className={s.imageGroup}>
  <div className={s.groupGallery}>
   <div className={s.mainFrame}>
    <StudioButton className={s.mainImage} aria-label={`放大编辑 ${active.name}`} onClick={()=>onEdit(active.id)}><DesignArtwork job={job} media={active}/><span className={s.expandHint}><Maximize2 size={15}/>{job.editorKind==="layers"?"画布编辑":"放大预览"}</span></StudioButton>
    <div className={s.imageQuickActions} aria-label="图片快捷操作"><StudioButton aria-label={`复制 ${active.name}`} onClick={()=>onCopy(active)}><Copy size={15}/><span>复制</span></StudioButton><StudioButton aria-label={`下载 ${active.name}`} onClick={()=>onDownload(active)}><Download size={15}/><span>下载</span></StudioButton><StudioButton aria-label={`画布编辑 ${active.name}`} onClick={()=>onCanvas(active.id)}><PanelsTopLeft size={15}/><span>画布编辑</span></StudioButton><StudioButton aria-label={`引用 ${active.name}`} onClick={()=>onReference(active)}><Quote size={15}/><span>引用</span></StudioButton></div>
    {items.length>1&&<div className={s.galleryPaging}><StudioButton aria-label="查看上一张" onClick={()=>setIndex((index-1+items.length)%items.length)}><ChevronLeft size={15}/></StudioButton><span>{index+1} / {items.length}</span><StudioButton aria-label="查看下一张" onClick={()=>setIndex((index+1)%items.length)}><ChevronRight size={15}/></StudioButton></div>}
   </div>
   {items.length>1&&<nav className={s.thumbnails} aria-label="切换套图">{items.map((media,i)=><StudioButton key={media.id} aria-label={`查看 ${media.name}`} aria-pressed={active.id===media.id} className={active.id===media.id?s.currentThumbnail:""} onClick={()=>setIndex(i)}><DesignArtwork job={job} media={media}/></StudioButton>)}</nav>}
  </div>
 </div>;
}
