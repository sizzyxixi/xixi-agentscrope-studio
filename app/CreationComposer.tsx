"use client";

import Image from "next/image";
import { VideoParameterControl } from "./VideoParameterControl";
import type { VideoSettings } from "./video-creation";
import { StructuredPrompt } from "./StructuredPrompt";
import type { PromptField } from "./creative-prompt";
import { Radio, RadioGroup } from "@heroui/react";
import { useRef, useState, type RefObject } from "react";
import { ArrowUp, AtSign, Check, ChevronDown, ChevronRight, Cpu, Expand, FileText, Images, LoaderCircle, Package, Paperclip, Plus, Search, Sparkles, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/hero-ui/popover";
import { Hint } from "@/components/hero-ui/tooltip";
import { useCommerceDemo } from "./CommerceDemoContext";
import { DemoModal, MediaThumb } from "./CommercePanels";
import { StudioButton, StudioInput, StudioTextarea } from "./StudioControls";
import { uid, type Media, type Product } from "./commerce-demo-data";
import s from "./creation-composer.module.css";

type Props = {
  composerRef: RefObject<HTMLElement | null>;
  promptFields?:PromptField[]; onPromptFieldChange?:(key:string,value:string)=>void;
  prompt: string; onPrompt: (value: string) => void; onSend: () => void;
  ratio: string; onRatio: (value: string) => void; quality: string; onQuality: (value: string) => void;
  model: string; onModel: (value: string) => void; languageModel: string; onLanguageModel: (value: string) => void;
  tool: string | null; template: string | null; onRemoveTool: () => void;
  videoSettings?:VideoSettings; onVideoSettings?:(value:VideoSettings)=>void;
  mode: string; onMore: (view: "products" | "assets") => void;
};
const ratios = ["智能比例", "1:1", "3:4", "4:3", "16:9", "9:16", "4:5", "2:3"];
export function CreationComposer({composerRef, ...p}: Props) {
  const d = useCommerceDemo();
  const upload = useRef<HTMLInputElement>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [category, setCategory] = useState<"products" | "assets">("products");
  const [query, setQuery] = useState("");
  const [pendingProduct, setPendingProduct] = useState<string | null>(null);
  const [preview, setPreview] = useState<Media | null>(null);
  const [pendingFiles, setPendingFiles] = useState<{id:string;name:string;error?:string}[]>([]);
  const references = d.media.filter(m => d.referenceMedia.includes(m.id));
  const products = d.products.filter(x => !x.archived && `${x.name}${x.code}${x.skus.map(s=>s.code).join()}`.toLowerCase().includes(query.toLowerCase()));
  const assets = d.media.filter(x => x.name.toLowerCase().includes(query.toLowerCase()));
  const referenceProduct = (product: Product, skuId?: string) => {
    const multiple = p.tool === "商品SKU组合图";
    d.setReferenceProducts(old => multiple ? [...new Set([...old, product.id])] : [product.id]);
    d.setReferenceSkus(old => multiple ? [...new Set([...old, ...(skuId ? [skuId] : [])])] : skuId ? [skuId] : []);
    const mediaIds = d.links.filter(l => l.productId === product.id && l.location === "参考素材" && (!skuId || !l.skuIds.length || l.skuIds.includes(skuId))).map(l=>l.mediaId);
    d.setReferenceMedia(old => [...new Set([...old, ...mediaIds])]);
    setMentionOpen(false); setPendingProduct(null);
  };
  const removeProduct = (id:string) => {
    const product = d.products.find(p=>p.id===id);
    d.setReferenceProducts(old=>old.filter(x=>x!==id));
    d.setReferenceSkus(old=>old.filter(x=>!product?.skus.some(s=>s.id===x)));
  };
  const openMentions = () => { setQuery(""); setPendingProduct(null); setMentionOpen(true); };
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
      <StudioButton className={s.addTile} aria-label="继续上传附件" onClick={()=>upload.current?.click()}><Plus size={24}/><span>上传附件</span></StudioButton>
      {references.map(m=><div className={s.attachment} key={m.id}><Hint content={m.name}><StudioButton className={s.thumbnail} aria-label={`预览附件 ${m.name}`} onClick={()=>setPreview(m)}>{m.type==="document"?<FileText size={28}/>:<MediaThumb item={m}/>}</StudioButton></Hint><StudioButton className={s.removeAttachment} aria-label={`移除附件 ${m.name}`} onClick={()=>d.setReferenceMedia(old=>old.filter(x=>x!==m.id))}><X size={12}/></StudioButton></div>)}
      {pendingFiles.map(f=><div className={`${s.attachment} ${f.error?s.failed:""}`} key={f.id}><Hint content={f.error??`正在读取 ${f.name}`}><div className={s.pending}>{f.error?<FileText size={24}/>:<LoaderCircle className={s.spinner} size={24}/>}<span>{f.error??"读取中"}</span></div></Hint>{f.error&&<StudioButton className={s.removeAttachment} aria-label={`移除失败附件 ${f.name}`} onClick={()=>setPendingFiles(old=>old.filter(x=>x.id!==f.id))}><X size={12}/></StudioButton>}</div>)}
    </div>}
    <StudioTextarea aria-label="创作描述" className={s.prompt} value={p.prompt} placeholder={p.mode==="video"?"描述你想创作的视频…":"描述你想创作的画面…"} onChange={e=>{const value=e.target.value;if(/(^|\s)@$/.test(value)){p.onPrompt(value.slice(0,-1));openMentions();}else p.onPrompt(value);}} onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)&&!e.nativeEvent.isComposing){e.preventDefault();if(p.prompt.trim()&&!pendingFiles.some(f=>!f.error))p.onSend();}}}/>
    {!!p.promptFields?.length&&p.onPromptFieldChange&&<StructuredPrompt fields={p.promptFields} onChange={p.onPromptFieldChange}/>}
    {d.referenceProducts.length>0&&<div className={s.productReferences}>{d.products.filter(x=>d.referenceProducts.includes(x.id)).map(product=><span className={s.productChip} key={product.id}><Package size={13}/><span>{product.name}{product.skus.filter(sku=>d.referenceSkus.includes(sku.id)).map(sku=>` · ${sku.color} ${sku.spec}`).join("")}</span><StudioButton aria-label={`移除引用商品 ${product.name}`} onClick={()=>removeProduct(product.id)}><X size={12}/></StudioButton></span>)}</div>}
    <div className={s.controls}>
      <Hint content="上传附件"><StudioButton className={s.iconButton} aria-label="上传附件" onClick={()=>upload.current?.click()}><Paperclip size={19}/></StudioButton></Hint>
      <Popover open={mentionOpen} onOpenChange={setMentionOpen}><PopoverTrigger asChild><StudioButton className={s.iconButton} aria-label="引用商品或素材" onClick={()=>{setQuery("");setPendingProduct(null);}}><AtSign size={19}/></StudioButton></PopoverTrigger><PopoverContent isNonModal className={s.mentionPopover} aria-label="引用商品或素材" align="start" side="bottom"><div className={s.mentionLayout}><div className={s.categories}>{([['products','商品',Package],['assets','素材',Images]] as const).map(([key,label,Icon])=><StudioButton key={key} className={category===key?s.categoryActive:""} onClick={()=>{setCategory(key);setPendingProduct(null);setQuery("");}}><Icon size={15}/>{label}<ChevronRight size={13}/></StudioButton>)}</div><div className={s.mentionPanel}><div className={s.search}><Search size={14}/><StudioInput autoFocus aria-label={category==="products"?"搜索引用商品":"搜索引用素材"} value={query} onChange={e=>setQuery(e.target.value)} placeholder={category==="products"?"搜索商品 / SKU":"搜索素材"}/></div><div className={s.referenceList}>{category==="products"?products.slice(0,6).map(product=>{const cover=d.media.find(m=>d.links.some(l=>l.productId===product.id&&l.mediaId===m.id)&&m.type==="image");return <div key={product.id}><StudioButton className={s.referenceItem} onClick={()=>product.skus.length>1?setPendingProduct(pendingProduct===product.id?null:product.id):referenceProduct(product,product.skus[0]?.id)}>{cover?<Image src={cover.url} alt="" width={36} height={36} unoptimized/>:<Package size={20}/>}<span><strong>{product.name}</strong><small>{product.code}{product.skus.length>1?` · ${product.skus.length} 个规格`:""}</small></span>{d.referenceProducts.includes(product.id)?<Check size={14}/>:<ChevronRight size={14}/>}</StudioButton>{pendingProduct===product.id&&<div className={s.skuOptions}>{product.skus.map(sku=><StudioButton key={sku.id} onClick={()=>referenceProduct(product,sku.id)}>{sku.color} {sku.spec}<small>{sku.code}</small></StudioButton>)}</div>}</div>;}):assets.slice(0,6).map(m=><StudioButton className={s.referenceItem} key={m.id} onClick={()=>{d.setReferenceMedia(old=>old.includes(m.id)?old.filter(id=>id!==m.id):[...old,m.id]);setMentionOpen(false);}}>{m.type==="image"?<Image src={m.url} alt="" width={36} height={36} unoptimized/>:<FileText size={20}/>}<span><strong>{m.name}</strong><small>{m.type==="image"?"图片":m.type==="video"?"视频":"文档"}</small></span>{d.referenceMedia.includes(m.id)&&<Check size={14}/>}</StudioButton>)}{(category==="products"?!products.length:!assets.length)&&<p className={s.empty}>暂无匹配结果</p>}</div><StudioButton className={s.viewMore} onClick={()=>{setMentionOpen(false);p.onMore(category);}}>查看更多{category==="products"?"商品":"素材"}<ChevronRight size={13}/></StudioButton></div></div></PopoverContent></Popover>
      {p.mode==="video"&&p.videoSettings&&p.onVideoSettings?<VideoParameterControl value={p.videoSettings} onChange={p.onVideoSettings} ratio={p.ratio} onRatio={p.onRatio} quality={p.quality} onQuality={p.onQuality} tool={p.tool}/>:(<Popover><PopoverTrigger asChild><StudioButton className={s.parameter} aria-label="比例与分辨率"><Expand size={15}/><span>{p.ratio} · {p.quality}</span><ChevronDown size={12}/></StudioButton></PopoverTrigger><PopoverContent isNonModal className={s.parameterPopover} aria-label="比例与分辨率" align="start">
        <p className={s.label}>选择比例</p><RadioGroup className={s.ratioGrid} aria-label="选择比例" value={p.ratio} onChange={p.onRatio} orientation="horizontal">{ratios.map(r=><Radio key={r} value={r} autoFocus={p.ratio===r} className={s.ratioOption}><Radio.Content className={s.ratioChoice} aria-label={r}><span className={s.ratioSymbol}>{r==="智能比例"?<Images size={18} strokeWidth={1.45}/>:<span className={s.ratioIcon} style={ratioDimensions(r)}/>}</span><span>{r}</span></Radio.Content></Radio>)}</RadioGroup>
        <p className={s.label}>选择图片质量</p><RadioGroup className={s.qualityGrid} aria-label="选择清晰度" value={p.quality} onChange={p.onQuality} orientation="horizontal">{([["1K","标准"],["2K","高清"],["4K","超清"]]).map(([value,label])=><Radio key={value} value={value} className={s.qualityOption}><Radio.Content className={s.qualityChoice} aria-label={`${label} ${value}`}><span>{label}</span><span>{value}</span></Radio.Content></Radio>)}</RadioGroup>
      </PopoverContent></Popover>)}
      <Popover><PopoverTrigger asChild><StudioButton className={s.parameter} aria-label="模型选择" title={`${p.languageModel} · ${p.model}`}><Cpu size={15}/><span>{p.model}</span><ChevronDown size={12}/></StudioButton></PopoverTrigger><PopoverContent isNonModal className={s.modelPopover} aria-label="模型选择" align="start">
        <p className={s.label}>语言模型</p><RadioGroup className={s.modelList} aria-label="语言模型" value={p.languageModel} onChange={p.onLanguageModel}>{[["通用语言模型","日常创作"],["推理语言模型","复杂需求"]].map(([name,description])=><Radio value={name} key={name} className={s.modelOption}><Radio.Content className={s.modelChoice} aria-label={name}><span><strong>{name}</strong><small>{description}</small></span><Check size={16} className={s.modelCheck}/></Radio.Content></Radio>)}</RadioGroup>
        <div className={s.modelDivider}/><p className={s.label}>{p.mode==="video"?"生视频模型":"生图模型"}</p><RadioGroup className={s.modelList} aria-label={p.mode==="video"?"生视频模型":"生图模型"} value={p.model} onChange={p.onModel}>{[["标准","均衡表现"],["高保真","细节还原"],["创意","自由表现"]].map(([name,description])=><Radio value={name} key={name} className={s.modelOption}><Radio.Content className={s.modelChoice} aria-label={name}><span><strong>{name}</strong><small>{description}</small></span><Check size={16} className={s.modelCheck}/></Radio.Content></Radio>)}</RadioGroup>
      </PopoverContent></Popover>
      {p.tool&&<span className={s.toolChip}><Sparkles size={13}/><span>{p.tool}{p.template&&<small> · {p.template}</small>}</span><StudioButton aria-label="移除引用工具" onClick={p.onRemoveTool}><X size={12}/></StudioButton></span>}
      <StudioButton className={s.send} aria-label="发送创作需求" disabled={!p.prompt.trim()||pendingFiles.some(f=>!f.error)} onClick={p.onSend}><ArrowUp size={20}/></StudioButton>
    </div>
    <StudioInput hidden ref={upload} type="file" multiple accept="image/*,video/*,.pdf,.txt,.docx,.xlsx,.csv" onChange={e=>{void addFiles(Array.from(e.target.files??[]));e.target.value="";}}/>
    {preview&&<DemoModal title={preview.name} onClose={()=>setPreview(null)}><div className={s.preview}>{preview.type==="video"?<video src={preview.url} controls/>:preview.type==="document"?<p>{preview.name}</p>:<MediaThumb item={preview}/>}</div></DemoModal>}
  </section>;
}

function ratioDimensions(ratio:string){const [width,height]=ratio.split(":").map(Number);const scale=22/Math.max(width,height);return {width:Math.round(width*scale),height:Math.round(height*scale)};}
