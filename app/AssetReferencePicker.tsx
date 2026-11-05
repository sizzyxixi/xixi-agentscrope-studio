"use client";
import Image from "next/image";
import { useState } from "react";
import { InputGroup } from "@heroui/react";
import { FileText, Palette, Search, UserRound, X } from "lucide-react";
import { useCommerceDemo } from "./CommerceDemoContext";
import { StudioSelect } from "./StudioControls";
import { MaterialVisual } from "./MaterialLibrary";
import { FileGlyph } from "./HistoryFileCard";
import { isCreation, isInCreationHistory, isMaterialAvailable, mediaSpace, type LibraryReference } from "./material-library-data";
import { matchesHistoryType } from "./material-history";
import { modelVisibleInSpace } from "./model-profile";
import { styleReference, hasStyleContent } from "./style-schemes";
import s from "./asset-reference-picker.module.css";
export type ReferencePickerTab="history"|"materials"|"styles"|"models";
export function AssetReferencePicker({initialTab="materials"}:{initialTab?:ReferencePickerTab}){
  const d=useCommerceDemo();
  const [tab,setTab]=useState<ReferencePickerTab>(initialTab),[type,setType]=useState("全部"),[query,setQuery]=useState(""),[space,setSpace]=useState(()=>initialTab==="styles"?(d.materialLibrary.brands.find(x=>d.libraryReferences.some(r=>r.id===x.id&&r.kind==="brand"))?.space??"personal"):initialTab==="models"?(d.materialLibrary.models.find(x=>d.libraryReferences.some(r=>r.id===x.id&&r.kind==="model"))?.space??"personal"):"personal");
  const [folder,setFolder]=useState("all");
  const folders=d.materialLibrary.folders.filter(folder=>folder.space===space&&!folder.deletedAt);
  const folderMatch=(id:string)=>folder==="all"||(folder==="root"?!folders.some(folder=>folder.id===d.materialLibrary.metadata[id]?.folder):d.materialLibrary.metadata[id]?.folder===folder);
  const queryMatch=(value:string)=>value.toLowerCase().includes(query.toLowerCase());
  const visibleMedia=d.media.filter(m=>isMaterialAvailable(m,d.materialLibrary)&&(tab==="history"?mediaSpace(m)==="personal"&&isInCreationHistory(m):mediaSpace(m)===space&&(!isCreation(m)||d.materialLibrary.metadata[m.id]?.collection))&&(tab!=="materials"||folderMatch(m.id))&&matchesHistoryType(m,type)&&queryMatch(`${m.name} ${d.materialLibrary.metadata[m.id]?.tags?.join(" ")??""}`)).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const brands=d.materialLibrary.brands.filter(x=>!x.deletedAt&&x.space===space&&queryMatch(`${x.name} ${x.prompt}`));
  const models=d.materialLibrary.models.filter(x=>modelVisibleInSpace(x,space==="enterprise"?"enterprise":"personal")&&queryMatch(`${x.name} ${x.description}`));
  const referenceMedia=(id:string)=>{
    if(!d.media.some(m=>m.id===id&&isMaterialAvailable(m,d.materialLibrary)))return;
    d.setReferenceMedia(old=>[...new Set([...old,id])]);
    d.setMaterialLibrary(old=>({...old,metadata:{...old.metadata,[id]:{...old.metadata[id],usedAt:new Date().toISOString()}}}));
  };
  const referenceResource=(resource:LibraryReference)=>{d.setLibraryReferences(old=>[...old.filter(x=>x.kind!==resource.kind),resource]);};
  const changeTab=(next:ReferencePickerTab)=>{setTab(next);setQuery("");setType("全部");};
  return <section aria-label="素材引用选择器" className={`${s.picker} ${s.dropdown}`}>
    <div className={s.topbar}><div role="tablist" aria-label="引用内容" className={s.tabs}>{([["history","创作历史"],["materials","素材"],["styles","风格"],["models","模特"]] as const).map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} onClick={()=>changeTab(key)}>{label}</button>)}</div>{tab!=="history"&&<StudioSelect aria-label="引用范围" value={space} popoverProps={{isNonModal:true,"data-asset-picker-overlay":true}} onChange={e=>{setSpace(e.target.value==="enterprise"?"enterprise":"personal");setFolder("all");}}><option value="personal">我的</option><option value="enterprise">企业共享</option></StudioSelect>}<InputGroup className={s.search} aria-label="搜索资产库"><InputGroup.Prefix><Search size={15}/></InputGroup.Prefix><InputGroup.Input className={s.searchInput} autoFocus aria-label="搜索引用素材" placeholder={tab==="styles"?"搜索风格名称或描述":tab==="models"?"搜索模特":"搜索文件名称或标签"} value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<InputGroup.Suffix><button type="button" aria-label="清空搜索" onClick={()=>setQuery("")}><X size={14}/></button></InputGroup.Suffix>}</InputGroup></div>
    {(tab==="materials"||tab==="history")&&<div className={s.filters}><div role="tablist" aria-label="文件类型" className={s.fileTypes}>{["全部","图片","视频","文档","其他"].map(value=><button key={value} role="tab" aria-selected={type===value} onClick={()=>setType(value)}>{value}</button>)}</div>{tab==="materials"&&<StudioSelect className={s.folderSelect} aria-label="素材文件夹" value={folder} popoverProps={{isNonModal:true,"data-asset-picker-overlay":true}} onChange={event=>setFolder(event.target.value)}><option value="all">全部文件夹</option><option value="root">未分组</option>{folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</StudioSelect>}</div>}
    <div className={s.scrollArea}>
      {(tab==="materials"||tab==="history")&&(visibleMedia.length?<div className={s.assetGrid}>{visibleMedia.map(m=><article key={m.id}><button className={s.assetSelect} aria-label={`引用 ${m.name}`} onClick={()=>referenceMedia(m.id)}><span className={s.fileThumb}>{m.type==="document"?<FileGlyph name={m.name}/>:<MaterialVisual media={m}/>}</span><strong title={m.name}>{m.name}</strong></button></article>)}</div>:<div className={s.empty}><FileText size={28}/><p>{query?"没有找到匹配文件":"暂无可引用文件"}</p></div>)}
      {tab==="styles"&&<><div className={s.resourceList}>{brands.map(brand=><article key={brand.id}><button className={s.resourceSelect} aria-label={`引用风格 ${brand.name}`} onClick={()=>{if(!hasStyleContent(brand)){d.setNotice("请先补充风格描述或参考图。");return;}referenceResource(styleReference(brand));}}>{brand.referenceImages?.[0]?<Image src={brand.referenceImages[0]} alt="" width={120} height={90} unoptimized/>:<div className={s.resourcePlaceholder}><Palette size={25}/></div>}<span><strong>{brand.name}</strong>{brand.prompt&&<small>{brand.prompt}</small>}</span></button></article>)}</div>{!brands.length&&<div className={s.empty}><Palette size={28}/><p>暂无匹配风格</p></div>}</>}
      {tab==="models"&&<><div className={s.modelGrid}>{models.map(model=><article key={model.id}><button className={s.modelSelect} aria-label={`引用模特 ${model.name}`} onClick={()=>referenceResource({id:model.id,kind:"model",name:model.name,summary:model.description,image:model.image,images:[model.image,...(model.threeViewImage?[model.threeViewImage]:[])]})}><Image src={model.image} alt="" width={160} height={212} unoptimized/><span>{model.name}</span></button></article>)}</div>{!models.length&&<div className={s.empty}><UserRound size={28}/><p>暂无匹配模特</p></div>}</>}

    </div>
  </section>;
}
