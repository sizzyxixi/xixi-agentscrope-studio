"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowUpRight, Download, LoaderCircle } from "lucide-react";
import { FormDialog, FormDialogFooter, formDialogClasses as f } from "@/components/hero-ui/form-dialog";
import { type MaterialModel } from "./material-library-data";
import s from "./model-detail.module.css";
import { InlineModelName } from "./InlineModelName";

export function ModelDetail({model,onClose,onSave,onUse,onDownload}:{model:MaterialModel;onClose:()=>void;onSave:(name:string)=>void;onUse:(image:string)=>void;onDownload:(image:string,label:string)=>Promise<void>}) {
  const [active,setActive]=useState(0);
  const [downloading,setDownloading]=useState(false);
  const [error,setError]=useState("");
  const images=[{url:model.image,label:"主图"},...(model.threeViewImage?[{url:model.threeViewImage,label:"三视图"}]:[])];
  const current=images[active]??images[0];
  const download=async()=>{if(downloading)return;setDownloading(true);setError("");try{await onDownload(current.url,current.label);}catch{setError("下载失败，请重试。");}finally{setDownloading(false);}};
  return <FormDialog title="模特详情" onClose={onClose}>
    <div className={`${f.body} ${s.body}`}>
      <InlineModelName name={model.name} onSave={onSave} large/>
      <div className={s.stage}><Image src={current.url} alt={`${model.name} ${current.label}`} width={1000} height={1000} unoptimized/></div>
      {images.length>1&&<div className={s.thumbnails} role="group" aria-label="人物图片">{images.map((image,index)=><button key={image.label} aria-label={`查看${image.label}`} aria-pressed={active===index} onClick={()=>setActive(index)}><Image src={image.url} alt="" width={96} height={72} unoptimized/><span>{image.label}</span></button>)}</div>}
      {error&&<p className={s.error} role="alert">{error}</p>}
    </div>
    <FormDialogFooter><button className={f.secondaryButton} disabled={downloading} onClick={download}>{downloading?<LoaderCircle size={14} className={s.spinner}/>:<Download size={14}/>}下载</button><button className={f.primaryButton} onClick={()=>onUse(current.url)}>引用 <ArrowUpRight size={14}/></button></FormDialogFooter>
  </FormDialog>;
}
