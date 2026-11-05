"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { Modal } from "@heroui/react";
import { ArrowDownToLine, ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, FileText, Palette, Play, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Media } from "./commerce-demo-data";
import { PdfPreview, WordPreview } from "./FilePreview";
import s from "./material-preview.module.css";

import { materialPreviewKind } from "./material-preview-kind";
export { supportsMaterialPreview } from "./material-preview-kind";
const htmlPolicy=`<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline' https: http:; font-src data: https:; form-action 'none'; base-uri 'none'">`;
function DocumentContent({media}:{media:Media}){
  const kind=materialPreviewKind(media);
  const [content,setContent]=useState<string|null>(null),[failed,setFailed]=useState(false);
  const text=["text","markdown","html"].includes(kind);
  useEffect(()=>{if(!text)return;const controller=new AbortController();fetch(media.url,{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.text();}).then(setContent).catch(e=>{if(e.name!=="AbortError")setFailed(true);});return()=>controller.abort();},[media.url,text]);
  if(kind==="pdf")return <PdfPreview url={media.url}/>;
  if(kind==="word")return <WordPreview url={media.url}/>;
  if(failed)return <div className={s.documentMessage}>文件读取失败，请重试或下载文件。</div>;
  if(content===null)return <div className={s.documentMessage}>正在加载文件…</div>;
  if(kind==="html")return <div className={s.browser}><div className={s.address}><span/>文件预览 / {media.name}</div><iframe title={`HTML 预览：${media.name}`} sandbox="" referrerPolicy="no-referrer" srcDoc={htmlPolicy+content}/></div>;
  if(kind==="markdown")return <article className={s.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></article>;
  return <pre className={s.text}>{content}</pre>;
}
type Props={media:Media;items:Media[];onClose:()=>void;onNavigate:(media:Media)=>void;onDownload:()=>void;onReference:()=>void;onNotice:(message:string)=>void;onSaveStyle?:()=>void};
export function MaterialPreview({media,items,onClose,onNavigate,onDownload,onReference,onNotice,onSaveStyle}:Props){
  const [open,setOpen]=useState(true);
  const [imageTransition,setImageTransition]=useState<{from:Media;step:number}|null>(null);
  const [zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0}),[copied,setCopied]=useState(false),[copying,setCopying]=useState(false),[videoError,setVideoError]=useState(false);
  const imageRef=useRef<HTMLImageElement>(null),videoRef=useRef<HTMLVideoElement>(null);
  const [playing,setPlaying]=useState(false);
  const drag=useRef<{x:number;y:number}|null>(null);
  const kind=materialPreviewKind(media),visual=kind==="image"||kind==="video";
  const siblings=items.filter(item=>item.type===media.type),index=siblings.findIndex(item=>item.id===media.id);
  const close=()=>{if(kind==="video")onClose();else{setImageTransition(null);setOpen(false);}};
  useEffect(()=>{if(open)return;const timer=setTimeout(onClose,260);return()=>clearTimeout(timer);},[open,onClose]);
  useEffect(()=>{
    setZoom(1);setPan({x:0,y:0});setCopied(false);setVideoError(false);setPlaying(false);drag.current=null;
    if(media.type==="image"){
      for(const neighbor of [siblings[index-1],siblings[index+1]])if(neighbor){const preload=new window.Image();preload.src=neighbor.url;}
    }
  },[media.id]); // Reset the view while retaining the same overlay during navigation.
  useEffect(()=>{if(!imageTransition)return;const timer=setTimeout(()=>setImageTransition(null),280);return()=>clearTimeout(timer);},[imageTransition]);
  const changeZoom=(value:number)=>{setZoom(Math.min(5,Math.max(.25,value)));if(value<=1)setPan({x:0,y:0});};
  const move=(step:number)=>{if(!open||imageTransition)return;const next=siblings[index+step];if(next){if(kind==="image")setImageTransition({from:media,step});onNavigate(next);}};
  const copy=async()=>{
    if(copying)return;setCopying(true);
    try{
      // Preserve the user gesture for clipboard permission while the image is converted.
      const png=(async()=>{const image=imageRef.current;if(!image||!image.complete)throw Error();const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext("2d");if(!context)throw Error();context.drawImage(image,0,0);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error()),"image/png"));})();
      await navigator.clipboard.write([new ClipboardItem({"image/png":png})]);setCopied(true);onNotice("图片已复制。");
    }catch{onNotice("图片复制失败，请使用下载保存图片。");}finally{setCopying(false);}
  };
  return <Modal.Backdrop isOpen={open} isDismissable onOpenChange={next=>{if(!next)close();}} className={`${s.backdrop} ${visual?s.visualBackdrop:s.documentBackdrop} ${kind==="image"?s.imageBackdrop:""}`}><Modal.Container className={s.container}><Modal.Dialog aria-label={visual?`${kind==="image"?"图片":"视频"}预览：${media.name}`:`文件预览：${media.name}`} className={visual?s.lightbox:s.drawer}><div className={s.content} onKeyDown={e=>{if(visual&&!(e.target instanceof HTMLInputElement)){if(e.key==="ArrowLeft"){e.preventDefault();move(-1);}if(e.key==="ArrowRight"){e.preventDefault();move(1);}}}}>
    <header className={s.header}><div><Modal.Heading>{media.name}</Modal.Heading>{visual&&<span>{index+1} / {siblings.length}</span>}</div>{!visual&&<><button onClick={onDownload} title="下载文件" aria-label="下载文件"><ArrowDownToLine size={18}/></button><button onClick={onReference} title="引用文件" aria-label="引用文件"><ArrowUpRight size={18}/></button></>}<button className={s.close} onClick={close} aria-label="关闭预览"><X size={24}/></button></header>
    {visual?<>
      <div className={s.stage} onWheel={kind==="image"?e=>{changeZoom(zoom+(e.deltaY<0?.1:-.1));}:undefined}>
        {imageTransition&&kind==="image"&&<div className={`${s.imageCanvas} ${s.departingImage} ${imageTransition.step>0?s.imageToLeft:s.imageToRight}`} aria-hidden="true"><img src={imageTransition.from.url} alt="" draggable={false}/></div>}
        {kind==="image"?<div className={`${s.imageCanvas} ${imageTransition?(imageTransition.step>0?s.imageFromRight:s.imageFromLeft):""}`} data-zoomed={zoom>1||undefined} onDoubleClick={()=>changeZoom(zoom===1?2:1)} onPointerDown={e=>{if(zoom<=1)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX-pan.x,y:e.clientY-pan.y};}} onPointerMove={e=>{if(drag.current)setPan({x:e.clientX-drag.current.x,y:e.clientY-drag.current.y});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><img ref={imageRef} src={media.url} alt={media.name} draggable={false} style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`}}/></div>:videoError?<div className={s.videoError}><FileText size={32}/><p>视频暂时无法播放，请下载文件。</p></div>:<div className={s.videoWrap}><video ref={videoRef} src={media.url} poster={media.poster} autoPlay controls playsInline preload="metadata" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>setVideoError(true)}/>{!playing&&<button className={s.playVideo} aria-label="播放视频" onClick={()=>{void videoRef.current?.play().catch(()=>onNotice("视频播放失败，请下载文件。"));}}><Play size={30} fill="currentColor"/></button>}</div>}
      </div>
      <button className={`${s.previous} ${s.nav}`} disabled={index<=0||!!imageTransition||!open} onClick={()=>move(-1)} aria-label="上一份素材"><ChevronLeft size={25}/></button><button className={`${s.next} ${s.nav}`} disabled={index>=siblings.length-1||!!imageTransition||!open} onClick={()=>move(1)} aria-label="下一份素材"><ChevronRight size={25}/></button>
      <footer className={s.quickbar}><button onClick={onDownload} title="下载" aria-label="下载"><ArrowDownToLine size={19}/></button>{kind==="image"&&<><button onClick={()=>void copy()} disabled={copying} title="复制图片" aria-label="复制图片">{copied?<Check size={19}/>:<Copy size={19}/>}</button><span className={s.separator}/><button onClick={()=>changeZoom(zoom-.25)} disabled={zoom<=.25} title="缩小" aria-label="缩小图片"><ZoomOut size={19}/></button><button className={s.zoomValue} onClick={()=>changeZoom(1)} title="重置缩放" aria-label="重置缩放">{Math.round(zoom*100)}%</button><button onClick={()=>changeZoom(zoom+.25)} disabled={zoom>=5} title="放大" aria-label="放大图片"><ZoomIn size={19}/></button><button onClick={()=>{setZoom(1);setPan({x:0,y:0});}} title="适应窗口" aria-label="适应窗口"><RotateCcw size={17}/></button></>}<span className={s.separator}/><button onClick={onReference} className={s.reference}><ArrowUpRight size={18}/>引用</button>{onSaveStyle&&<button onClick={onSaveStyle} title="保存为风格方案" aria-label="保存为风格方案"><Palette size={18}/></button>}</footer>
    </>:<div className={s.documentBody}><DocumentContent key={media.id} media={media}/></div>}
  </div></Modal.Dialog></Modal.Container></Modal.Backdrop>;
}
