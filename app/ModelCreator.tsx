"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ImagePlus, LoaderCircle, Plus, RotateCcw, Sparkles, Upload, X, MessageSquareText } from "lucide-react";
import { FormDialog, FormDialogFooter, formDialogClasses as f } from "@/components/hero-ui/form-dialog";
import { ModelAttributeField } from "./ModelAttributeField";
import { useCommerceDemo } from "./CommerceDemoContext";
import { uid } from "./commerce-demo-data";
import { officialModels, type MaterialModel, type MaterialSpace } from "./material-library-data";
import s from "./material-library.module.css";
import c from "./model-creator.module.css";

type GeneratedModel = { image: string; gender: string; age: string; appearance: string; bodyType: string; features: string; adjustments: string[]; threeViewImage?: string; referenceImage?: string };

export function ModelCreator({space,onClose,onUse,initialTab="custom"}:{space:MaterialSpace;onClose:()=>void;onUse:(model:MaterialModel)=>void;initialTab?:"custom"|"official"|"upload"}) {
  const d=useCommerceDemo();
  const [tab,setTab]=useState(initialTab);
  const [name,setName]=useState("");
  const [gender,setGender]=useState("女");
  const [age,setAge]=useState("青年");
  const [appearance,setAppearance]=useState("");
  const [bodyType,setBodyType]=useState("标准");
  const [features,setFeatures]=useState("");
  const [adjustment,setAdjustment]=useState("");
  const [refining,setRefining]=useState(false);
  const [referenceImage,setReferenceImage]=useState("");
  const referenceUpload=useRef<HTMLInputElement>(null);
  const [result,setResult]=useState<GeneratedModel|null>(null);
  const [busy,setBusy]=useState<"portrait"|"views"|null>(null);
  const [showViews,setShowViews]=useState(false);
  const [uploaded,setUploaded]=useState("");
  const [rights,setRights]=useState(false);
  const [error,setError]=useState("");
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const upload=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);

  // Frontend generation fixture; replace this boundary with the generation service.
  const generate=(refine=false)=>{
    if(busy)return;
    if(!name.trim()||(!refine&&![gender,age,bodyType].every(value=>value.trim()))){setError("请填写模特名称、性别、年龄段和体型。");return;}
    const current=refine&&result?result:{gender:gender.trim(),age:age.trim(),appearance:appearance.trim(),bodyType:bodyType.trim(),features:features.trim(),referenceImage,adjustments:[]};
    const next:GeneratedModel={...current,image:current.gender==="男"?officialModels[1].image:officialModels[0].image,threeViewImage:undefined,adjustments:refine?[...current.adjustments,adjustment.trim()]:current.adjustments};
    setBusy("portrait");setError("");
    timer.current=setTimeout(()=>{setResult(next);setShowViews(false);setRefining(false);setAdjustment("");setBusy(null);},1200);
  };
  const generateViews=()=>{
    if(!result||busy)return;
    const current=result;
    setBusy("views");
    timer.current=setTimeout(()=>{setResult({...current,threeViewImage:current.gender==="男"?"/materials/model-alex-turnaround-v1.png":"/materials/model-mia-turnaround-v1.png"});setShowViews(true);setBusy(null);},1400);
  };
  const save=(use=false,official?:MaterialModel)=>{
    if(busy)return;
    if(official&&space==="enterprise"){setError("官方模特仅可收藏至我的模特。");return;}
    if(tab==="custom"&&!official&&(!result||!name.trim()))return;
    if(tab==="upload"&&(!uploaded||!rights)){setError("请上传人物照片，并确认拥有使用权限。");return;}
    const existing=official?d.materialLibrary.models.find(x=>x.space===space&&x.source==="official"&&x.image===official.image&&!x.deletedAt):undefined;
    const description=tab==="custom"&&result?[result.gender,result.age,result.appearance,result.bodyType,result.features,...result.adjustments].filter(Boolean).join(" · "):"上传人物参考";
    const model:MaterialModel=existing??{id:uid("model"),name:official?.name??(name.trim()||(tab==="custom"?"我的定制模特":"上传模特")),space,source:official?"official":tab==="upload"?"upload":"custom",image:official?.image??(tab==="upload"?uploaded:result!.image),description:official?.description??description,...(official?{gender:official.gender,age:official.age,appearance:official.appearance,persona:official.persona,bodyType:official.bodyType,features:official.features}:{}),...(tab==="custom"&&!official&&result?{gender:result.gender,age:result.age,appearance:result.appearance,bodyType:result.bodyType,features:result.features,adjustments:result.adjustments,threeViewImage:result.threeViewImage,referenceImage:result.referenceImage}:{}),favorite:true,updatedAt:new Date().toISOString()};
    if(!existing)d.setMaterialLibrary(old=>({...old,models:[model,...old.models]}));
    d.setNotice(existing?"已在你的模特中。":"模特已保存，后续商品创作可直接复用。");
    if(use)onUse(model);onClose();
  };
  const ready=!busy&&(tab==="custom"?!!result&&!!name.trim():!!uploaded&&rights);
  return <FormDialog title="添加专属模特" onClose={onClose} wide>
    <div className={s.modalTabs} role="tablist" aria-label="添加模特方式">{([["custom","定制模特"],["official","官方模特"],["upload","上传模特"]] as const).map(([key,label])=><button role="tab" aria-selected={tab===key} disabled={!!busy} key={key} onClick={()=>{setTab(key);setError("");}}>{label}</button>)}</div>
{tab==="official"?<div className={`${f.body} ${s.officialGrid}`}>{officialModels.map(model=>{const saved=d.materialLibrary.models.some(x=>x.image===model.image&&x.space===space&&!x.deletedAt);return <article key={model.id}><span className={s.officialBadge}>官方</span><Image src={model.image} alt={model.name} width={400} height={530} unoptimized/><div><strong>{model.name}</strong><div className={s.officialActions}><button className={f.secondaryButton} disabled={saved} onClick={()=>save(false,model)}>{saved?<Check size={14}/>:<Plus size={14}/>} {saved?"已收藏":"收藏"}</button><button className={f.primaryButton} onClick={()=>save(true,model)}>引用 <ChevronRight size={14}/></button></div></div></article>;})}</div>:    <div className={`${f.body} ${c.editor}`}>
      <div className={c.settings}>
        <label className={f.field}>模特名称 {tab==="custom"?<span className={f.requiredMark} aria-hidden="true">*</span>:<span>选填</span>}<input required={tab==="custom"} autoFocus value={name} maxLength={60} onChange={e=>setName(e.target.value)} placeholder="为常用人物起个名字"/></label>
        {tab==="custom"?<>
          <div className={c.fields}>
            <ModelAttributeField label="性别" value={gender} options={["女","男"]} onChange={setGender} disabled={!!busy}/>
            <ModelAttributeField label="人物背景" required={false} placeholder="请选择或自定义人物背景" value={appearance} options={["中国","东亚","东南亚","南亚","中亚","中东","欧洲","拉丁美洲","非洲"]} onChange={setAppearance} disabled={!!busy}/>
            <ModelAttributeField label="年龄段" value={age} options={["青少年","青年","中年","老年"]} onChange={setAge} disabled={!!busy}/>
            <ModelAttributeField label="体型" value={bodyType} options={["纤细","标准","微胖","大码"]} onChange={setBodyType} disabled={!!busy}/>
          </div>
          <label className={f.field}>补充特征<textarea rows={2} maxLength={1000} disabled={!!busy} value={features} onChange={e=>setFeatures(e.target.value)} placeholder="例如：上班族、运动达人等人设；也可补充肤色、发型、妆容、服装和姿态等要求。"/></label>
          <div className={c.referenceField}><div className={c.referenceImage}><button type="button" className={c.referenceUpload} disabled={!!busy} aria-label={referenceImage?"更换模特参考图":"上传参考图"} onClick={()=>referenceUpload.current?.click()}>{referenceImage?<Image src={referenceImage} alt="模特参考图" width={44} height={44} unoptimized/>:<ImagePlus size={18}/>}<span>{referenceImage?"更换参考图":"上传参考图"}<small>选填</small></span></button>{referenceImage&&<button type="button" className={c.removeReference} disabled={!!busy} aria-label="移除模特参考图" onClick={()=>setReferenceImage("")}><X size={12}/></button>}</div></div>
          <button className={`${f.primaryButton} ${c.fullButton}`} disabled={!!busy} onClick={()=>generate()}>{busy==="portrait"?<LoaderCircle size={16} className={s.spinner}/>:result?<RotateCcw size={16}/>:<Sparkles size={16}/>} {busy==="portrait"?"正在生成模特…":result?"重新生成":"生成模特"}</button>
        </>:<><button className={s.modelUpload} onClick={()=>upload.current?.click()}><Upload size={24}/><strong>{uploaded?"更换人物照片":"上传人物照片"}</strong><small>选择清晰、单人的 JPG 或 PNG 照片</small></button><label className={s.checkLabel}><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>我已获得照片与人物形象的使用权限</label></>}
      </div>
      <div className={c.preview} data-refining={refining||undefined} aria-busy={!!busy}>
        {tab==="upload"?(uploaded?<Image src={uploaded} alt="上传人物预览" width={600} height={700} unoptimized/>:<div className={c.empty}><ImagePlus size={35}/><p>上传后在这里预览人物</p></div>):<>
          <div className={c.result} tabIndex={result?.threeViewImage?0:undefined} aria-label="模特生成预览" onKeyDown={event=>{if(!result?.threeViewImage||busy)return;if(event.key==="ArrowLeft"){event.preventDefault();setShowViews(false);}if(event.key==="ArrowRight"){event.preventDefault();setShowViews(true);}}}>
            {result?<Image src={showViews&&result.threeViewImage?result.threeViewImage:result.image} alt={showViews?"人物三视图：正面、侧面、背面":"生成的模特"} width={showViews?1536:600} height={showViews?1024:800} unoptimized/>:<div className={c.empty}><Sparkles size={35}/><strong>模特预览</strong><p>生成后可在这里查看人物形象</p></div>}
            {result?.threeViewImage&&<><button type="button" className={`${c.imageArrow} ${c.previousImage}`} aria-label="上一张图片" disabled={!!busy||!showViews} onClick={()=>setShowViews(false)}><ChevronLeft size={18}/></button><button type="button" className={`${c.imageArrow} ${c.nextImage}`} aria-label="下一张图片" disabled={!!busy||showViews} onClick={()=>setShowViews(true)}><ChevronRight size={18}/></button><span className={c.imagePosition}>{showViews?"三视图 · 2 / 2":"主图 · 1 / 2"}</span></>}
          </div>
          <div className={c.resultActions}><button className={f.secondaryButton} aria-expanded={refining} aria-controls="model-refinement" disabled={!result||!!busy} onClick={()=>setRefining(v=>!v)}><MessageSquareText size={14}/>调整人物</button><button className={f.secondaryButton} disabled={!result||!!busy} onClick={generateViews}><Sparkles size={14}/>{result?.threeViewImage?"重新生成三视图":"生成人物三视图"}</button></div>
          {result&&refining&&<div id="model-refinement" className={c.refine}><label className={f.field}>补充提示词<textarea autoFocus aria-label="补充调整提示词" rows={2} value={adjustment} maxLength={1000} disabled={!!busy} onChange={e=>setAdjustment(e.target.value)} placeholder="描述希望调整的人物特征…"/></label><div><button className={f.secondaryButton} disabled={!!busy} onClick={()=>setRefining(false)}>取消</button><button className={f.primaryButton} disabled={!!busy||!adjustment.trim()} onClick={()=>generate(true)}><RotateCcw size={14}/>重新生成</button></div></div>}
        </>}
        {busy&&<div className={c.loading} role="status"><LoaderCircle size={28} className={s.spinner}/><span>{busy==="views"?"正在生成人物三视图…":"正在生成模特…"}</span></div>}
      </div>
    </div>}
    {error&&<p role="alert" className={s.formError}>{error}</p>}
    <FormDialogFooter><span className={c.spacer}/><button className={f.secondaryButton} onClick={onClose}>取消</button>{tab!=="official"&&<button className={f.primaryButton} disabled={!ready} onClick={()=>save()}>保存</button>}</FormDialogFooter>
    <input ref={referenceUpload} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setError("请选择 JPG、PNG 或 WebP 参考图。");return;}if(file.size>3*1024*1024){setError("请选择 3MB 以内的参考图。");return;}const reader=new FileReader();reader.onload=()=>{setReferenceImage(String(reader.result));setError("");};reader.onerror=()=>setError("参考图读取失败，请重新上传。");reader.readAsDataURL(file);}}/>
    <input ref={upload} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setError("请选择 JPG、PNG 或 WebP 图片。");return;}if(file.size>3*1024*1024){setError("请选择 3MB 以内的人物照片。");return;}const reader=new FileReader();reader.onload=()=>{setUploaded(String(reader.result));setError("");};reader.readAsDataURL(file);e.target.value="";}}/>
  </FormDialog>;
}
