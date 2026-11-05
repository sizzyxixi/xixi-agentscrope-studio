"use client";

import Image from "next/image";
import { useId } from "react";
import { ArrowDownToLine, ArrowUpRight, Building2, Check, Copy, Ellipsis, FolderInput, Pencil, Play, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/hero-ui/dropdown-menu";
import type { Media } from "./commerce-demo-data";
import s from "./history-file-card.module.css";

type Props = { media: Media; selected: boolean; batch: boolean; collected: boolean; onSelect: (range: boolean) => void; onPreview: () => void; onReference: () => void; onDownload: () => void; onRename?: () => void; onMove?: () => void; onCollect?: () => void; onPublish?: () => void; onDelete?: () => void };

export function FileGlyph({ name }: { name: string }) {
  const maskId = `file-glyph-${useId().replace(/:/g, "")}`;
  const extension = name.split(".").pop()?.toUpperCase() ?? "FILE";
  const kind = /^(DOCX?|MD)$/.test(extension) ? "blue" : /^(XLSX?|CSV)$/.test(extension) ? "green" : /^(PPTX?|ZIP)$/.test(extension) ? "orange" : extension === "PDF" ? "red" : /^(JSON|HTML|JS|TS)$/.test(extension) ? "cyan" : extension === "LOG" ? "purple" : "gray";
  const label=/^DOCX?$/.test(extension)?"W":/^XLSX?$/.test(extension)?"X":/^PPTX?$/.test(extension)?"P":extension==="MD"?"M":/^(JSON|HTML|JS|TS)$/.test(extension)?"</>":extension==="LOG"?"Log":extension.length>4?"FILE":extension;
  return <svg className={s.fileGlyph} data-kind={kind} width="64" height="80" viewBox="0 0 64 80" aria-hidden="true">
    <defs><mask id={maskId} x="0" y="0" width="64" height="80" maskUnits="userSpaceOnUse" style={{maskType:"luminance"}}>
      <rect width="64" height="80" fill="#fff"/>
      {extension==="ZIP"?<g fill="#000"><path d="M26 10h6v6h-6zm6 6h6v6h-6zm-6 6h6v6h-6zm6 6h6v6h-6zm-6 6h6v6h-6zm6 6h6v6h-6z"/><path d="M26 48h12v15H26zm4 4v7h4v-7z" fillRule="evenodd"/></g>:<text x="32" y="57" textAnchor="middle" fill="#000" fontSize={label.length===1?28:label.length>3?14:20} fontFamily="Arial, sans-serif" fontWeight={label.length===1?600:500}>{label}</text>}
    </mask></defs>
    <g mask={`url(#${maskId})`}><path d="M4 0h36l24 24v52a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Z" fill="currentColor"/><path d="M40 0v20a4 4 0 0 0 4 4h20Z" fill="#101820" opacity=".6"/></g>
  </svg>;
}

export function HistoryFileCard({ media, selected, batch, collected, onSelect, onPreview, onReference, onDownload, onRename, onMove, onCollect, onPublish, onDelete }: Props) {
  const date = new Date(media.createdAt);
  const time = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return <article className={s.card} data-selected={selected || undefined} data-batch={batch || undefined} aria-label={media.name}>
    <button className={s.checkbox} role="checkbox" aria-checked={selected} aria-label={`选择 ${media.name}`} onClick={e => onSelect(e.shiftKey)}>{selected && <Check size={12}/>}</button>
    <div className={s.more}><DropdownMenu><DropdownMenuTrigger asChild><button className={s.moreButton} aria-label={`更多操作 ${media.name}`}><Ellipsis size={16}/></button></DropdownMenuTrigger><DropdownMenuContent align="end" className={s.menu}>
      <DropdownMenuItem onSelect={onReference}><ArrowUpRight size={14}/>引用</DropdownMenuItem>
      <DropdownMenuItem onSelect={onDownload}><ArrowDownToLine size={14}/>下载</DropdownMenuItem>
      {onRename&&<DropdownMenuItem onSelect={onRename}><Pencil size={14}/>重命名</DropdownMenuItem>}
      {onMove&&<DropdownMenuItem onSelect={onMove}><FolderInput size={14}/>移动到文件夹</DropdownMenuItem>}
      {onCollect&&<DropdownMenuItem disabled={collected} onSelect={onCollect}><Copy size={14}/>收藏至素材</DropdownMenuItem>}
      {onPublish&&<DropdownMenuItem onSelect={onPublish}><Building2 size={14}/>发布至企业空间</DropdownMenuItem>}
      {onDelete&&<DropdownMenuItem className={s.deleteAction} onSelect={onDelete}><Trash2 size={14}/>删除</DropdownMenuItem>}
    </DropdownMenuContent></DropdownMenu></div>
    <button className={s.preview} aria-label={`预览 ${media.name}`} onClick={onPreview}>{media.type === "document" ? <FileGlyph name={media.name}/> : <><Image src={media.type === "video" ? media.poster || "/creative/video-previews/product-poster-v1.jpg" : media.url} alt={media.name} width={192} height={192} unoptimized/>{media.type === "video" && <span className={s.play}><Play size={17} fill="currentColor"/></span>}</>}</button>
    <button className={s.name} onClick={onPreview} title={media.name}>{media.name}</button>
    <time className={s.time} dateTime={media.createdAt} title={new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",dateStyle:"full",timeStyle:"short"}).format(date)}>{time}</time>
  </article>;
}
