"use client";

import Image from "next/image";
import { VideoParameterControl } from "./VideoParameterControl";
import type { VideoSettings } from "./video-creation";
import { StructuredPrompt } from "./StructuredPrompt";
import type { PromptField } from "./creative-prompt";
import { Radio, RadioGroup } from "@heroui/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowUp, LibraryBig, Palette, Check, ChevronDown, ChevronRight, Cpu, Expand, FileText, Images, LoaderCircle, Package, Plus, Search, Sparkles, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/hero-ui/popover";
import { Hint } from "@/components/hero-ui/tooltip";
import { useCommerceDemo } from "./CommerceDemoContext";
import { DemoModal, MediaThumb } from "./CommercePanels";
import { AssetReferencePicker, type ReferencePickerTab } from "./AssetReferencePicker";
import { isMaterialAvailable } from "./material-library-data";
import { StudioButton, StudioInput, StudioTextarea } from "./StudioControls";
import { uid, type Media } from "./commerce-demo-data";
import s from "./creation-composer.module.css";
import { generationCreditEstimate, generationModelOptions, normalizeGenerationModel } from "./generation-models";

type Props = {
  composerRef: RefObject<HTMLElement | null>;
  promptFields?:PromptField[]; onPromptFieldChange?:(key:string,value:string)=>void;
  prompt: string; onPrompt: (value: string) => void; onSend: () => void;
  ratio: string; onRatio: (value: string) => void; quality: string; onQuality: (value: string) => void;
  model: string; onModel: (value: string) => void;
  tool: string | null; template: string | null; onRemoveTool: () => void;
  videoSettings?:VideoSettings; onVideoSettings?:(value:VideoSettings)=>void;
  mode: string; onMore: (view: "products" | "assets") => void;
};
const ratios = ["智能比例", "1:1", "3:4", "4:3", "16:9", "9:16", "4:5", "2:3"];
export function CreationComposer({composerRef, ...p}: Props) {
  const d = useCommerceDemo();
  const upload = useRef<HTMLInputElement>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const referenceTrigger=useRef<HTMLButtonElement>(null),referencePanel=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!mentionOpen)return;
    // Capture pointer presses so blank areas and controls that stop bubbling also dismiss.
    // Nested HeroUI selects render in portals and remain part of the picker interaction.
    const closeOutside=(event:PointerEvent)=>{
      const inside=event.composedPath().some(node=>node===referenceTrigger.current||node===referencePanel.current||(node instanceof Element&&node.hasAttribute("data-asset-picker-overlay")));
      if(!inside)setMentionOpen(false);
    };
    document.addEventListener("pointerdown",closeOutside,true);
    return()=>document.removeEventListener("pointerdown",closeOutside,true);
  },[mentionOpen]);
  const [referenceTab,setReferenceTab]=useState<ReferencePickerTab>("materials");
  const [modelOpen,setModelOpen]=useState(false);
  const generationModel=normalizeGenerationModel(p.mode,p.model);
  const modelOptions=generationModelOptions(p.mode);
  const creditEstimate=generationCreditEstimate(p.mode,generationModel,p.quality);
  const creditUnit=p.mode==="video"?"秒":"张";
  const [preview, setPreview] = useState<Media | null>(null);
  const [pendingFiles, setPendingFiles] = useState<{id:string;name:string;error?:string}[]>([]);
  const references = d.media.filter(m => d.referenceMedia.includes(m.id)&&isMaterialAvailable(m,d.materialLibrary));
  const removeProduct = (id:string) => {
    const product = d.products.find(p=>p.id===id);
    d.setReferenceProducts(old=>old.filter(x=>x!==id));
    d.setReferenceSkus(old=>old.filter(x=>!product?.skus.some(s=>s.id===x)));
  };
  const openMentions = () => { setReferenceTab("materials");setMentionOpen(true); };
  const addFiles = async (files:File[]) => {
    for (const file of files) {
      const id=uid("attachment");
      const error=file.size>20*1024*1024?"文件超过 20MB":!(/^(image|video)\//.test(file.type)||/\.(pdf|txt|docx|xlsx|csv)$/i.test(file.name))?"不支持的文件格式":undefined;
      setPendingFiles(old=>[...old,{id,name:file.name,error}]);
      if(error)continue;
      try {
        const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("读取失败"));reader.readAsDataURL(file);});
        const media:Media={id,name:file.name,url,type:file.type.startsWith("image")?"image":file.type.startsWith("video")?"video":"document",source:"创作上传",createdAt:new Date().toISOString()};
        d.setMedia(old=>[media,...old]);d.setReferenceMedia(old=>[...old,id]);
        setPendingFiles(old=>old.filter(x=>x.id!==id));
      } catch {setPendingFiles(old=>old.map(x=>x.id===id?{...x,error:"读取失败，请重新上传"}:x));}
    }
  };
  return <section ref={composerRef} className={s.composer} aria-label="创作输入框">
    {(references.length>0||pendingFiles.length>0)&&<div className={s.attachments} aria-label="已引用附件">
      {references.map(m=><div className={s.attachment} key={m.id}><Hint content={m.name}><StudioButton className={s.thumbnail} aria-label={`预览附件 ${m.name}`} onClick={()=>setPreview(m)}>{m.type==="document"?<FileText size={28}/>:<MediaThumb item={m}/>}</StudioButton></Hint><StudioButton className={s.removeAttachment} aria-label={`移除附件 ${m.name}`} onClick={()=>d.setReferenceMedia(old=>old.filter(x=>x!==m.id))}><X size={12}/></StudioButton></div>)}
      {pendingFiles.map(f=><div className={`${s.attachment} ${f.error?s.failed:""}`} key={f.id}><Hint content={f.error??`正在读取 ${f.name}`}><div className={s.pending}>{f.error?<FileText size={24}/>:<LoaderCircle className={s.spinner} size={24}/>}<span>{f.error??"读取中"}</span></div></Hint>{f.error&&<StudioButton className={s.removeAttachment} aria-label={`移除失败附件 ${f.name}`} onClick={()=>setPendingFiles(old=>old.filter(x=>x.id!==f.id))}><X size={12}/></StudioButton>}</div>)}
    </div>}
    {d.libraryReferences.length>0&&<div className={s.libraryReferenceChips} aria-label="已引用资源">{d.libraryReferences.map(resource=><span key={resource.id}>{(resource.image||resource.images?.[0])?<Image src={resource.image||resource.images?.[0]||""} alt={resource.name} width={26} height={26} unoptimized/>:<span className={s.referenceThumb}>{resource.kind==="brand"?<Palette size={15}/>:<FileText size={15}/>}</span>}<strong title={resource.name}>{resource.kind==="brand"?"风格":resource.kind==="model"?"模特":"知识"}·{resource.name}</strong><StudioButton aria-label={`移除引用 ${resource.name}`} onClick={()=>d.setLibraryReferences(old=>old.filter(x=>x.id!==resource.id))}><X size={12}/></StudioButton></span>)}</div>}
    <div className={s.promptRow}><StudioButton className={s.uploadTile} aria-label="上传附件" onClick={()=>upload.current?.click()}><Plus size={18}/><span>上传附件</span></StudioButton><StudioTextarea aria-label="创作描述" className={s.prompt} value={p.prompt} placeholder={p.mode==="video"?"描述你想创作的视频…":"描述你想创作的画面…"} onChange={e=>{const value=e.target.value;if(/(^|\s)@$/.test(value)){p.onPrompt(value.slice(0,-1));openMentions();}else p.onPrompt(value);}} onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)&&!e.nativeEvent.isComposing){e.preventDefault();if(p.prompt.trim()&&!pendingFiles.some(f=>!f.error))p.onSend();}}}/></div>
    {!!p.promptFields?.length&&p.onPromptFieldChange&&<StructuredPrompt fields={p.promptFields} onChange={p.onPromptFieldChange}/>}
    {d.referenceProducts.length>0&&<div className={s.productReferences}>{d.products.filter(x=>d.referenceProducts.includes(x.id)).map(product=><span className={s.productChip} key={product.id}><Package size={13}/><span>{product.name}{product.skus.filter(sku=>d.referenceSkus.includes(sku.id)).map(sku=>` · ${sku.color} ${sku.spec}`).join("")}</span><StudioButton aria-label={`移除引用商品 ${product.name}`} onClick={()=>removeProduct(product.id)}><X size={12}/></StudioButton></span>)}</div>}

    <div className={s.controls}>
      <Popover open={mentionOpen} onOpenChange={setMentionOpen}><PopoverTrigger asChild><StudioButton ref={referenceTrigger} className={s.assetReferenceTrigger} aria-label="资产库" onClick={()=>setReferenceTab("materials")}><LibraryBig size={17}/><span>资产库</span><ChevronDown size={12}/></StudioButton></PopoverTrigger><PopoverContent ref={referencePanel} isNonModal shouldCloseOnInteractOutside={element=>!element.closest("[data-asset-picker-overlay]")} side="top" align="start" sideOffset={10} aria-label="资产库" className={s.referenceDropdown}>{mentionOpen&&<AssetReferencePicker key={referenceTab} initialTab={referenceTab}/>}</PopoverContent></Popover>
      {p.mode==="video"&&p.videoSettings&&p.onVideoSettings?<VideoParameterControl value={p.videoSettings} onChange={p.onVideoSettings} ratio={p.ratio} onRatio={p.onRatio} quality={p.quality} onQuality={p.onQuality} tool={p.tool}/>:(<Popover><PopoverTrigger asChild><StudioButton className={s.parameter} aria-label="比例与分辨率"><Expand size={15}/><span>{p.ratio} · {p.quality}</span><ChevronDown size={12}/></StudioButton></PopoverTrigger><PopoverContent isNonModal className={s.parameterPopover} aria-label="比例与分辨率" align="start">
        <p className={s.label}>选择比例</p><RadioGroup className={s.ratioGrid} aria-label="选择比例" value={p.ratio} onChange={p.onRatio} orientation="horizontal">{ratios.map(r=><Radio key={r} value={r} autoFocus={p.ratio===r} className={s.ratioOption}><Radio.Content className={s.ratioChoice} aria-label={r}><span className={s.ratioSymbol}>{r==="智能比例"?<Images size={18} strokeWidth={1.45}/>:<span className={s.ratioIcon} style={ratioDimensions(r)}/>}</span><span>{r}</span></Radio.Content></Radio>)}</RadioGroup>
        <p className={s.label}>选择图片质量</p><RadioGroup className={s.qualityGrid} aria-label="选择清晰度" value={p.quality} onChange={p.onQuality} orientation="horizontal">{([["1K","标准"],["2K","高清"],["4K","超清"]]).map(([value,label])=><Radio key={value} value={value} className={s.qualityOption}><Radio.Content className={s.qualityChoice} aria-label={`${label} ${value}`}><span>{label}</span><span>{value}</span></Radio.Content></Radio>)}</RadioGroup>
      </PopoverContent></Popover>)}
      {p.tool&&<span className={s.toolChip}><Sparkles size={13}/><span>{p.tool}{p.template&&<small> · {p.template}</small>}</span><StudioButton aria-label="移除引用工具" onClick={p.onRemoveTool}><X size={12}/></StudioButton></span>}
      <div className={s.generationControls}>
        <span className={s.creditEstimate} role="status" aria-live="polite" aria-label={creditEstimate===null?"暂无法估算积分":`预估 ${creditEstimate} 积分/${creditUnit}`} title={`按 ${generationModel} · ${p.quality} 预估`}><span>预估</span><strong>{creditEstimate===null?"—":creditEstimate}</strong>{creditEstimate!==null&&<span>积分/{creditUnit}</span>}</span>
        <Popover open={modelOpen} onOpenChange={setModelOpen}><PopoverTrigger asChild><StudioButton className={`${s.parameter} ${s.generationModel}`} aria-label="模型选择" title={p.mode==="video"?"选择生视频模型":"选择生图模型"}><Cpu size={15}/><span>{generationModel}</span><ChevronDown size={12}/></StudioButton></PopoverTrigger><PopoverContent isNonModal className={s.modelPopover} aria-label={p.mode==="video"?"生视频模型":"生图模型"} align="end">
          <div className={s.modelHeading}><p className={s.label}>{p.mode==="video"?"生视频模型":"生图模型"}</p><span className={s.priceResolution}>{p.quality}</span></div>
          <RadioGroup className={s.modelList} aria-label={p.mode==="video"?"生视频模型":"生图模型"} value={generationModel} onChange={value=>{p.onModel(value);setModelOpen(false);}}>{modelOptions.map(option=>{const credits=generationCreditEstimate(p.mode,option.id,p.quality);return <Radio value={option.id} key={option.id} className={s.modelOption}><Radio.Content className={s.modelChoice} aria-label={option.id}><span><strong>{option.id}</strong><small>{credits===null?"暂无法估算积分":`预估 ${credits} 积分/${creditUnit}`}</small></span><Check size={16} className={s.modelCheck}/></Radio.Content></Radio>;})}</RadioGroup>
        </PopoverContent></Popover>
      <StudioButton className={s.send} aria-label="发送创作需求" disabled={!p.prompt.trim()||pendingFiles.some(f=>!f.error)} onClick={p.onSend}><ArrowUp size={20}/></StudioButton>
      </div>
    </div>
    <StudioInput hidden ref={upload} type="file" multiple accept="image/*,video/*,.pdf,.txt,.docx,.xlsx,.csv" onChange={e=>{void addFiles(Array.from(e.target.files??[]));e.target.value="";}}/>
    {preview&&<DemoModal title={preview.name} onClose={()=>setPreview(null)}><div className={s.preview}>{preview.type==="video"?<video src={preview.url} controls/>:preview.type==="document"?<p>{preview.name}</p>:<MediaThumb item={preview}/>}</div></DemoModal>}
  </section>;
}

function ratioDimensions(ratio:string){const [width,height]=ratio.split(":").map(Number);const scale=22/Math.max(width,height);return {width:Math.round(width*scale),height:Math.round(height*scale)};}
