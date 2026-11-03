"use client";

import Image from "next/image";
import { Modal } from "@heroui/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, ImagePlus, LoaderCircle, Plus, Sparkles, Upload, X } from "lucide-react";
import { useCommerceDemo } from "./CommerceDemoContext";
import { uid } from "./commerce-demo-data";
import { officialModels, type MaterialBrand, type MaterialModel, type MaterialSpace } from "./material-library-data";
import s from "./material-library.module.css";

export function MaterialModal({title,subtitle,onClose,children,wide=false}:{title:string;subtitle?:string;onClose:()=>void;children:ReactNode;wide?:boolean}) {
  return <Modal.Backdrop isOpen isDismissable onOpenChange={open=>{if(!open)onClose();}} className={s.backdrop}><Modal.Container placement="center" className={s.modalContainer}><Modal.Dialog aria-label={title} className={`${s.dialog} ${wide?s.wideDialog:""}`}><header className={s.dialogHeader}><div><Modal.Heading>{title}</Modal.Heading>{subtitle&&<p>{subtitle}</p>}</div><button className={s.iconButton} aria-label="关闭弹窗" onClick={onClose}><X size={20}/></button></header>{children}</Modal.Dialog></Modal.Container></Modal.Backdrop>;
}

export function BrandEditor({brand,space,onClose}:{brand?:MaterialBrand;space:MaterialSpace;onClose:()=>void}) {
  const d=useCommerceDemo();
  const [name,setName]=useState(brand?.name??"");
  const [colors,setColors]=useState(brand?.colors??["#333333","#E8E4DE","#F7F7F7"]);
  const [prompt,setPrompt]=useState(brand?.prompt??"");
  const [logo,setLogo]=useState(brand?.logo??"");
  const [error,setError]=useState("");
  const logoInput=useRef<HTMLInputElement>(null);

  const save=()=>{
    if(!name.trim()){setError("请填写品牌名称。");return;}
    if(!colors.length&&!prompt.trim()&&!logo){setError("添加品牌色、Logo 或风格说明后即可保存。");return;}
    const item:MaterialBrand={id:brand?.id??uid("brand"),name:name.trim()||"我的品牌",space,colors,prompt:prompt.trim(),cover:logo,logo:logo||undefined,updatedAt:new Date().toISOString()};
    d.setMaterialLibrary(old=>({...old,brands:brand?old.brands.map(x=>x.id===brand.id?item:x):[item,...old.brands]}));
    d.setNotice(brand?"品牌已更新，后续创作可使用最新风格。":"品牌已保存，可在工作台直接引用。");onClose();
  };
  return <MaterialModal title={brand?"编辑品牌":"创建品牌"} subtitle="保存常用的颜色与风格，让商品内容保持一致。" onClose={onClose} wide><div className={s.brandEditor}><div className={s.brandForm}>
    <label className={s.field}>品牌名称 <span>必填</span><input autoFocus value={name} maxLength={60} placeholder="例如：BOTANIC / 我的店铺" onChange={e=>setName(e.target.value)}/></label>
    <div className={s.field}>品牌 Logo <span>选填</span><button className={s.logoUpload} onClick={()=>logoInput.current?.click()}>{logo?<Image src={logo} alt="品牌 Logo" width={64} height={64} unoptimized/>:<ImagePlus size={23}/>}<span>{logo?"更换 Logo":"上传 Logo"}<small>PNG、JPG、SVG，2MB 以内</small></span><Plus size={16}/></button></div>
    <div className={s.field}>品牌色 <span>可随时调整</span><div className={s.colorInputs}>{colors.map((color,i)=><div key={i}><label aria-label={`品牌色 ${i+1}`} style={{background:color}}><input type="color" aria-label={`选择品牌色 ${i+1}`} value={color} onChange={e=>setColors(old=>old.map((x,j)=>j===i?e.target.value:x))}/></label><span>{color.toUpperCase()}</span><button aria-label={`移除品牌色 ${i+1}`} onClick={()=>setColors(old=>old.filter((_,j)=>j!==i))}><X size={12}/></button></div>)}{colors.length<5&&<button className={s.addColor} aria-label="添加品牌色" onClick={()=>setColors(old=>[...old,"#D6C5AB"])}><Plus size={20}/></button>}</div></div>
    <label className={s.field}>品牌风格 <span>选填</span><textarea rows={4} value={prompt} maxLength={2000} onChange={e=>setPrompt(e.target.value)} placeholder="例如：自然极简、柔和日光、低饱和色调，保留商品真实质感。"/></label>
    <div className={s.promptSuggestions}>{["自然极简","温暖生活方式","清新植物感"].map(text=><button key={text} onClick={()=>setPrompt(old=>old?`${old}，${text}`:text)}><Plus size={12}/>{text}</button>)}</div>
  </div><div className={s.brandLivePreview}><span className={s.eyebrow}>品牌预览</span><div className={s.brandLogoPreview}>{logo?<Image src={logo} alt="品牌 Logo 预览" width={220} height={160} unoptimized/>:<ImagePlus size={40}/>}</div><h3>{name.trim()||"品牌名称"}</h3><div className={s.previewPalette}>{colors.map((color,i)=><span key={i} style={{background:color}} title={color}/>)}</div><p>{prompt||"品牌风格提示词"}</p></div></div>{error&&<p className={s.formError} role="alert">{error}</p>}<footer className={s.dialogFooter}><small>{space==="enterprise"?"保存后企业成员均可使用和编辑":"保存在个人空间，仅自己可见"}</small><button className={s.secondaryButton} onClick={onClose}>取消</button><button className={s.primaryButton} onClick={save}><Check size={15}/>保存品牌</button></footer><input ref={logoInput} type="file" hidden accept="image/png,image/jpeg,image/svg+xml" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>2*1024*1024){setError("请选择 2MB 以内的 Logo。");return;}const reader=new FileReader();reader.onload=()=>{setLogo(String(reader.result));setError("");};reader.readAsDataURL(file);e.target.value="";}}/></MaterialModal>;
}

export function ModelCreator({space,onClose,onUse,initialTab="custom"}:{space:MaterialSpace;onClose:()=>void;onUse:(model:MaterialModel)=>void;initialTab?:"custom"|"official"|"upload"}) {
  const d=useCommerceDemo();
  const [tab,setTab]=useState(initialTab);
  const [name,setName]=useState("");
  const [gender,setGender]=useState("女");
  const [age,setAge]=useState("25–35 岁");
  const [style,setStyle]=useState("自然亲和");
  const [loading,setLoading]=useState(false);
  const [generated,setGenerated]=useState(false);
  const [chosen,setChosen]=useState(officialModels[0].image);
  const [uploaded,setUploaded]=useState("");
  const [rights,setRights]=useState(false);
  const [error,setError]=useState("");
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const upload=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  const save=(use=false,official?:MaterialModel)=>{
    if(tab==="upload"&&(!uploaded||!rights)){setError("请上传人物照片，并确认拥有使用权限。");return;}
    const existing=official?d.materialLibrary.models.find(x=>x.space===space&&x.source==="official"&&x.image===official.image&&!x.deletedAt):undefined;
    const model:MaterialModel=existing??{id:uid("model"),name:official?.name??(name.trim()||(tab==="custom"?"我的定制模特":"上传模特")),space,source:official?"official":tab==="upload"?"upload":"custom",image:official?.image??(tab==="upload"?uploaded:chosen),description:official?.description??`${gender} · ${age} · ${style}`,favorite:true,updatedAt:new Date().toISOString()};
    if(!existing)d.setMaterialLibrary(old=>({...old,models:[model,...old.models]}));
    d.setNotice(existing?"已在你的模特中。":"模特已保存，后续商品创作可直接复用。");
    if(use)onUse(model);onClose();
  };
  return <MaterialModal title="添加专属模特" subtitle="选好人物形象，下次做商品图时直接使用。" onClose={onClose} wide><div className={s.modalTabs} role="tablist" aria-label="添加模特方式">{([["custom","定制模特"],["official","官方模特"],["upload","上传模特"]] as const).map(([key,label])=><button role="tab" aria-selected={tab===key} key={key} onClick={()=>{setTab(key);setError("");}}>{label}</button>)}</div>
  {tab==="official"?<div className={s.officialGrid}>{officialModels.map(model=>{const saved=d.materialLibrary.models.some(x=>x.image===model.image&&x.space===space&&!x.deletedAt);return <article key={model.id}><Image src={model.image} alt={model.name} width={400} height={530} unoptimized/><div><strong>{model.name}</strong><small>{model.description}</small><button className={saved?s.secondaryButton:s.primaryButton} onClick={()=>save(false,model)}>{saved?<Check size={14}/>:<Plus size={14}/>} {saved?"已收藏":"收藏到模特"}</button><button className={s.textButton} onClick={()=>save(true,model)}>立即使用 <ChevronRight size={14}/></button></div></article>;})}</div>:<div className={s.modelEditor}><div className={s.modelSettings}><label className={s.field}>模特名称 <span>选填</span><input autoFocus value={name} maxLength={60} onChange={e=>setName(e.target.value)} placeholder="为常用人物起个名字"/></label>{tab==="custom"?<><div className={s.field}>性别<div className={s.segmented}>{["女","男"].map(x=><button key={x} aria-pressed={gender===x} onClick={()=>{setGender(x);setGenerated(false);}}>{x}</button>)}</div></div><label className={s.field}>年龄段<select value={age} onChange={e=>setAge(e.target.value)}>{["18–24 岁","25–35 岁","36–45 岁","46–60 岁"].map(x=><option key={x}>{x}</option>)}</select></label><label className={s.field}>人物气质<select value={style} onChange={e=>setStyle(e.target.value)}>{["自然亲和","简约时尚","休闲活力","优雅成熟"].map(x=><option key={x}>{x}</option>)}</select></label><details className={s.advanced}><summary>更多人物特征</summary><label className={s.field}>补充描述<textarea rows={2} placeholder="发型、体型或其他你希望保留的特征"/></label></details><button className={s.primaryButton} disabled={loading} onClick={()=>{setLoading(true);setGenerated(false);timer.current=setTimeout(()=>{setLoading(false);setGenerated(true);setChosen(gender==="男"?officialModels[1].image:officialModels[0].image);},1600);}}>{loading?<LoaderCircle size={16} className={s.spinner}/>:<Sparkles size={16}/>} {loading?"正在准备人物形象…":generated?"重新生成候选":"生成候选"}</button><p className={s.tinyNote}>可调整人物特征并生成候选，选定后保存为常用模特。</p></>:<><button className={s.modelUpload} onClick={()=>upload.current?.click()}><Upload size={24}/><strong>{uploaded?"更换人物照片":"上传人物照片"}</strong><small>选择清晰、单人的 JPG 或 PNG 照片</small></button><label className={s.checkLabel}><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>我已获得照片与人物形象的使用权限</label><p className={s.tinyNote}>{space==="enterprise"?"保存后，本企业成员均可使用此模特。":"人物仅保存在个人空间。"}</p></>}</div><div className={s.modelCandidates}>{loading?<div className={s.generating}><LoaderCircle size={30} className={s.spinner}/><strong>正在准备候选形象</strong><p>保存选中的人物，后续保持一致。</p></div>:tab==="upload"?uploaded?<Image src={uploaded} alt="上传人物预览" width={600} height={700} unoptimized/>:<div className={s.modelPlaceholder}><ImagePlus size={42}/><p>上传后在这里预览人物</p></div>:generated?<><div className={s.candidateImages}>{(gender==="男"?[officialModels[1]]:[officialModels[0],officialModels[2]]).map(model=><button key={model.id} aria-label={`选择候选 ${model.name}`} aria-pressed={chosen===model.image} onClick={()=>setChosen(model.image)}><Image src={model.image} alt={model.name} width={400} height={530} unoptimized/><span><Check size={14}/></span></button>)}</div><p>选择一个人物形象保存</p></>:<div className={s.modelPlaceholder}><Sparkles size={38}/><strong>创建适合商品的出镜人物</strong><p>设置基础特征，生成后选定形象。</p><div className={s.portraitStack}>{officialModels.map(m=><Image key={m.id} src={m.image} alt="" width={74} height={96} unoptimized/>)}</div></div>}</div></div>}
  {error&&<p role="alert" className={s.formError}>{error}</p>}<footer className={s.dialogFooter}><small>{tab==="official"?"收藏后可在模特列表中再次选择":"人物参考按当前创作工具的支持能力使用"}</small><button className={s.secondaryButton} onClick={onClose}>取消</button>{tab!=="official"&&<><button className={s.secondaryButton} disabled={tab==="custom"?!generated:!uploaded||!rights} onClick={()=>save()}>保存模特</button><button className={s.primaryButton} disabled={tab==="custom"?!generated:!uploaded||!rights} onClick={()=>save(true)}>保存并使用 <ChevronRight size={15}/></button></>}</footer><input ref={upload} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>3*1024*1024){setError("请选择 3MB 以内的人物照片。");return;}const reader=new FileReader();reader.onload=()=>{setUploaded(String(reader.result));setError("");};reader.readAsDataURL(file);e.target.value="";}}/></MaterialModal>;
}
