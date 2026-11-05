"use client";

import { FormDialogFooter, formDialogClasses as f } from "@/components/hero-ui/form-dialog";

import Image from "next/image";
import { useRef, useState } from "react";
import { Check, Images, Palette, Upload, X } from "lucide-react";
import { MaterialModal } from "./MaterialLibraryDialogs";
import { useCommerceDemo } from "./CommerceDemoContext";
import { uid } from "./commerce-demo-data";
import { isMaterialAvailable, type MaterialBrand, type MaterialSpace } from "./material-library-data";
import s from "./material-library.module.css";
import { addStyleImages, MAX_STYLE_REFERENCE_IMAGES, hasStyleContent } from "./style-schemes";

type Props={scheme?:MaterialBrand;space:MaterialSpace;initialImage?:string;initialName?:string;onClose:()=>void};
export function StyleEditor({scheme,space,initialImage,initialName,onClose}:Props){
  const d=useCommerceDemo();
  const [name,setName]=useState(scheme?.name??initialName??"");
  const [prompt,setPrompt]=useState(scheme?.prompt??"");
  const [images,setImages]=useState<string[]>(scheme?.referenceImages??(initialImage?[initialImage]:[]));
  const [error,setError]=useState("");
  const [imagePicker,setImagePicker]=useState(false);
  const [pickedImages,setPickedImages]=useState<string[]>([]);
  const imageInput=useRef<HTMLInputElement>(null);
  const availableImages=d.media.filter(media=>media.type==="image"&&isMaterialAvailable(media,d.materialLibrary)).filter((media,index,all)=>all.findIndex(item=>item.url===media.url)===index);
  const readFiles=async(files:File[])=>{
    if(images.length>=MAX_STYLE_REFERENCE_IMAGES){setError("参考图最多 5 张，请先移除已有图片。");return;}
    const uploaded:string[]=[];
    for(const file of files){
      if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>5*1024*1024){setError("参考图支持 JPG、PNG、WebP，单张 5MB 以内。");continue;}
      try{const value=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});uploaded.push(value);}catch{setError("图片读取失败，请重新选择。");}
    }
    if(new Set([...images,...uploaded]).size>MAX_STYLE_REFERENCE_IMAGES)setError("参考图最多 5 张，已保留前 5 张。");
    setImages(old=>addStyleImages(old,uploaded));
  };
  const save=()=>{
    if(images.length>MAX_STYLE_REFERENCE_IMAGES){setError("参考图最多 5 张，请移除多余图片。");return;}
    if(!name.trim()){setError("请填写方案名称。");return;}
    if(!hasStyleContent({prompt,referenceImages:images})){setError("请填写风格描述或添加参考图。");return;}
    const item:MaterialBrand={...scheme,id:scheme?.id??uid("style"),name:name.trim(),space,prompt:prompt.trim(),referenceImages:[...new Set(images)],cover:images[0]??"",updatedAt:new Date().toISOString()};
    d.setMaterialLibrary(old=>({...old,brands:scheme?old.brands.map(itemOld=>itemOld.id===scheme.id?item:itemOld):[item,...old.brands]}));
    d.setNotice(scheme?"风格方案已更新。":"风格方案已保存，可在创作时引用。");onClose();
  };
  return <><MaterialModal title={scheme?"编辑风格方案":"创建风格方案"} subtitle={space==="enterprise"?`分享人：${scheme?.sharedBy??"团队成员"} ｜ 最新编辑时间：${scheme?.updatedAt?new Date(scheme.updatedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}):"—"}`:"保存常用的视觉风格，让下一次商品创作有据可循。"} onClose={onClose} wide className={s.styleDialog}>
    <div className={`${f.body} ${s.brandEditor} ${s.styleEditor}`}><div className={s.brandForm}>
      <label className={f.field}>方案名称 <span className={f.requiredMark} aria-hidden="true">*</span><input required autoFocus value={name} maxLength={60} placeholder="例如：商品图日常视觉/护肤系列·自然光" onChange={e=>setName(e.target.value)}/></label>
      <label className={f.field}>风格描述 <span>选填</span><textarea rows={3} value={prompt} maxLength={2000} onChange={e=>setPrompt(e.target.value)} placeholder="描述希望沿用的色调、光线、材质、背景或构图。"/></label>

      <div className={`${f.field} ${s.styleReferenceField}`}>风格参考图 <span>选填，最多 5 张</span>
        {images.length>0&&<div className={s.styleReferenceImages}>{images.map((url,i)=><div key={url}><Image src={url} alt={`风格参考图 ${i+1}`} width={180} height={140} unoptimized/><button aria-label={`移除参考图 ${i+1}`} onClick={()=>setImages(old=>old.filter(image=>image!==url))}><X size={12}/></button></div>)}</div>}
        <div className={s.styleImageActions}><button disabled={images.length>=MAX_STYLE_REFERENCE_IMAGES} onClick={()=>imageInput.current?.click()}><Upload size={14}/>上传参考图</button><button onClick={()=>{setPickedImages(images);setImagePicker(true);}}><Images size={14}/>从素材选择</button></div>
      </div>
    </div><aside className={s.styleLivePreview} aria-label="风格方案预览"><span className={s.stylePreviewLabel}>方案预览</span><div className={s.stylePreviewImages}>{images[0]?<Image src={images[0]} alt="方案预览主图" width={480} height={360} unoptimized/>:<div className={s.stylePreviewEmpty}><Palette size={30}/></div>}</div>{images.length>1&&<div className={s.stylePreviewThumbnails} aria-label="其他参考图">{images.slice(1).map((url,i)=><Image key={url} src={url} alt={`其他参考图 ${i+2}`} width={60} height={60} unoptimized/>)}</div>}<h3>{name.trim()||"风格方案名称"}</h3>{prompt&&<p>{prompt}</p>}</aside></div>
    {error&&<p role="alert" className={s.formError}>{error}</p>}<FormDialogFooter><button className={f.secondaryButton} onClick={onClose}>取消</button><button className={f.primaryButton} onClick={save}><Check size={15}/>保存方案</button></FormDialogFooter>
    <input ref={imageInput} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" onChange={e=>{setError("");void readFiles(Array.from(e.target.files??[]));e.target.value="";}}/>
  </MaterialModal>
  {imagePicker&&<MaterialModal title="选择风格参考图" subtitle="最多选择 5 张参考图。" onClose={()=>setImagePicker(false)}><div className={`${f.body} ${s.styleImagePicker}`}>{availableImages.map(media=><button key={media.id} className={s.stylePickImage} aria-label={`选择参考图 ${media.name}`} aria-pressed={pickedImages.includes(media.url)} disabled={!pickedImages.includes(media.url)&&pickedImages.length>=MAX_STYLE_REFERENCE_IMAGES} onClick={()=>setPickedImages(old=>old.includes(media.url)?old.filter(url=>url!==media.url):[...old,media.url])}><Image src={media.url} alt={media.name} width={160} height={120} unoptimized/><span>{media.name}</span><i>{pickedImages.includes(media.url)&&<Check size={12}/>}</i></button>)}{!availableImages.length&&<p>暂无可用图片，可返回上传参考图。</p>}</div><FormDialogFooter><small>已选择 {pickedImages.length} / 5 张</small><button className={f.secondaryButton} onClick={()=>setImagePicker(false)}>取消</button><button className={f.primaryButton} disabled={pickedImages.length>MAX_STYLE_REFERENCE_IMAGES} onClick={()=>{setImages([...new Set(pickedImages)]);setImagePicker(false);}}>使用所选图片</button></FormDialogFooter></MaterialModal>}
  </>;
}
