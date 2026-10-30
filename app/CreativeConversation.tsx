"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { changeVideoPromptField,keepsSourceDuration,videoCountries,videoSettingsFromFields,type VideoSettings } from "./video-creation";
import {CreativeVideoResult} from "./CreativeVideoResult";
import {sampleVideoPoster,videoResultTrace} from "./video-session";
import { VideoPlanReview } from "./VideoPlanReview";
import { StructuredPrompt } from "./StructuredPrompt";
import { changePromptField, platformSetFields, promptFieldContext, serializeCreativePrompt, type PromptField } from "./creative-prompt";
import { CreativeTurn } from "./CreativeTurn";
import { creativeTurnTrace } from "./creative-turn";
import { copyCreativeMedia, downloadCreativeMedia } from "./creative-media-actions";
import { useToast } from "@/components/OperationFeedback";
import { Package } from "lucide-react";
import { CreativeImageGroup } from "./CreativeImageGroup";
import { CreativeImageEditor } from "./CreativeImageEditor";
import { boxSvg, boxTemplates, svgUrl, type EditSubmission } from "./creative-editing";
import { CreationComposer } from "./CreationComposer";
import { ArchivePanel, MediaThumb } from "./CommercePanels";
import { useCommerceDemo } from "./CommerceDemoContext";
import { artwork, uid, type CreativeJob, type Media } from "./commerce-demo-data";
import s from "./creative-conversation.module.css";

type Props = {job:CreativeJob;header?:ReactNode;onChange:(job:CreativeJob)=>void;onNavigate:(view:"products"|"assets"|"publish")=>void;onOpenProduct:(id:string)=>void};
export function CreativeConversation({job,header,onChange,onNavigate,onOpenProduct}:Props) {
  const d=useCommerceDemo();
  const toast=useToast();
  const composerRef=useRef<HTMLElement>(null);
  const endRef=useRef<HTMLDivElement>(null);
  const initialParameters=job.promptFields??(job.tool==="平台套图"?changePromptField(platformSetFields(job.platform,job.language),"count",job.amount):[]);
  const [promptParameters,setPromptParameters]=useState<PromptField[]>(initialParameters);
  const [prompt,setPrompt]=useState("");
  const [ratio,setRatio]=useState(job.ratio);
  const [quality,setQuality]=useState(job.mode==="video"&&!["768P","1080P"].includes(job.quality)?"768P":job.quality);
  const [videoSettings,setVideoSettings]=useState<VideoSettings>(()=>videoSettingsFromFields(job.fields,job.language));
  const [model,setModel]=useState(job.fields.model??"标准");
  const [languageModel,setLanguageModel]=useState(job.fields.languageModel??"通用语言模型");
  const [tool,setTool]=useState<string|null>(job.tool==="自由创作"?null:job.tool);
  const [archive,setArchive]=useState<string[]>([]);
  const [editing,setEditing]=useState<{id:string;ids:string[];canvas?:boolean}|null>(null);
  useEffect(()=>{endRef.current?.scrollIntoView({block:"end",behavior:"instant"});},[job.id,job.messages.length]);
  const send=(request?:string)=>{
    const text=(request??prompt).trim();
    if(!text)return;
    const id=uid("output");
    const media:Media={id,name:`${job.title} · ${job.mediaIds.length+1}`,url:job.editorKind?(d.media.find(m=>m.id===job.mediaIds[job.mediaIds.length-1])?.url??artwork(text,job.mediaIds.length)):artwork(text,job.mediaIds.length),type:"image",source:"对话创作",jobId:job.id,createdAt:new Date().toISOString()};
    if(job.mode!=="video")d.setMedia(old=>[media,...old]);
    onChange({...job,platform:promptFieldContext(promptParameters).platform??job.platform,language:job.mode==="video"?videoSettings.language:promptFieldContext(promptParameters).language??job.language,site:job.mode==="video"?videoSettings.country:job.site,amount:job.mode==="video"?(keepsSourceDuration(tool??"")?"原片":String(videoSettings.duration)):job.amount,promptFields:promptParameters,ratio,quality,tool:tool??"自由创作",fields:{...job.fields,model,languageModel,...(job.mode==="video"?{videoDuration:String(videoSettings.duration),videoCountry:videoSettings.country,videoLanguage:videoSettings.language,videoStage:"planning"}:{})},mediaIds:job.mode==="video"?job.mediaIds:[...job.mediaIds,id],messages:[...job.messages,{role:"user",text,promptFields:structuredClone(promptParameters),referenceIds:[...d.referenceMedia],productIds:[...d.referenceProducts]},{role:"assistant",text:job.mode==="video"?"已更新视频处理方案，请确认本轮调整要求。":"已根据你的要求调整。",mediaIds:job.mode==="video"?[]:[id],trace:creativeTurnTrace({...job,ratio,quality,tool:tool??"自由创作",site:job.mode==="video"?videoSettings.country:job.site},1,new Date().toISOString())}]});
    setPrompt("");d.setReferenceMedia([]);d.setReferenceProducts([]);d.setReferenceSkus([]);
  };
  const applyEdit=(value:EditSubmission)=>{
    const source=d.media.find(m=>m.id===value.sourceId);if(!source)return;
    const previewId=uid("annotation"),outputId=uid("output"),now=new Date().toISOString();
    const reference:Media={id:previewId,name:`${source.name} · 编辑标注`,url:value.preview,type:"image",source:"编辑标注",jobId:job.id,createdAt:now};
    const output:Media={...source,id:outputId,name:`${job.editorKind==="packaging"?`SANTAL · ${boxTemplates.find(template=>template.id===value.document.template)?.name}展开图`:source.name.replace(/ · 版本 \d+$/, "")} · 版本 ${job.messages.filter(m=>m.role==="assistant").length+1}`,url:job.editorKind==="packaging"?svgUrl(boxSvg(value.document.template,value.document.width,value.document.height,value.document.depth)):job.editorKind==="layers"?value.preview:source.url,createdAt:now};
    d.setMedia(old=>[reference,output,...old]);
    onChange({...job,mediaIds:[...job.mediaIds,outputId],documents:{...job.documents,...(job.editorKind==="image"?{[value.sourceId]:value.document}:{}),[outputId]:{...value.document,marks:[]}},messages:[...job.messages,{role:"user",text:value.instruction,promptFields:structuredClone(promptParameters),referenceIds:[previewId],editRequest:{sourceId:value.sourceId,document:value.document,instruction:value.instruction}},{role:"assistant",text:"已生成新的版本，原图已保留。",mediaIds:[outputId],trace:creativeTurnTrace(job,1,now)}]});
  };
  const generateVideo=()=>{
    const now=new Date().toISOString(),id=uid("video");
    const output:Media={id,name:`${job.title} · 版本 1`,url:"",placeholder:true,poster:sampleVideoPoster,type:"video",source:"视频创作",jobId:job.id,createdAt:now,duration:Number(job.amount)||6,width:1366,height:768,version:1};
    d.setMedia(old=>[output,...old]);
    onChange({...job,fields:{...job.fields,videoStage:"placeholder"},mediaIds:[...job.mediaIds,id],messages:[...job.messages,{role:"user",text:"确认视频方案。"},{role:"assistant",text:"视频方案已确认，可以先准备社媒发布内容。",mediaIds:[id],trace:videoResultTrace(now)}]});
  };
  const download=async(media:Media)=>{try{await downloadCreativeMedia(job,media);}catch{toast.error("图片下载失败，请重试。");}};
  const copy=async(media:Media)=>{try{await copyCreativeMedia(job,media);toast.success("图片已复制。");}catch{toast.error("复制失败，请下载图片后使用。");}};
  const reference=(media:Media)=>{d.setReferenceMedia(old=>[...new Set([...old,media.id])]);requestAnimationFrame(()=>composerRef.current?.querySelector("textarea")?.focus());};
  return <section className={s.session} aria-label="创作会话">
    {header}
    <div className={s.scroll}>
      <div className={s.messages}>
        <div className={s.settings}>{job.mode==="video"?"视频创作":"图片创作"}<span>·</span>{job.tool}<span>·</span>{job.ratio} / {job.quality}{job.mode==="video"&&<><span>·</span>{job.amount==="原片"?"原片时长":`${job.amount} 秒`}<span>·</span>{videoCountries.find(country=>country.value===job.site)?.label??job.site} / {job.language}</>}</div>
        {job.messages.map((message,index)=>{
          const outputIds=message.mediaIds??(message.role==="assistant"&&index===1?job.mediaIds.filter(id=>!job.messages.slice(2).some(m=>m.mediaIds?.includes(id))):[]);
          const referenceIds=message.referenceIds??(index===0?job.referenceIds:[]);
          const productNames=index===0?job.snapshot.filter(p=>job.productIds.includes(p.id)).map(p=>p.name):d.products.filter(p=>message.productIds?.includes(p.id)).map(p=>p.name);
          const messageFields=message.promptFields??(index===0?initialParameters:[]);
          const editMessageField=(key:string,value:string)=>{
            const next=job.mode==="video"?changeVideoPromptField(messageFields,key,value):changePromptField(messageFields,key,value);setPromptParameters(next);
            onChange({...job,...(index===0?{prompt:serializeCreativePrompt(message.text,next)}:{}),platform:promptFieldContext(next).platform??job.platform,language:promptFieldContext(next).language??job.language,fields:{...job.fields,...(job.mode==="video"?{videoStage:"planning"}:{})},promptFields:next,messages:job.messages.map((item,i)=>i===index?{...item,promptFields:next}:item)});
          };
          const content=<>
            {productNames.length>0&&<div className={s.references}>{productNames.map(name=><span key={name}><Package size={13}/>{name}</span>)}</div>}
            {referenceIds.length>0&&<div className={s.attachments}>{d.media.filter(media=>referenceIds.includes(media.id)).map(media=><div key={media.id}><MediaThumb item={media}/></div>)}</div>}
            <p>{message.text}</p>
            {message.role==="user"&&messageFields.length>0&&<StructuredPrompt fields={messageFields} onChange={editMessageField} compact/>}
            {job.mode==="video"&&message.role==="assistant"&&index===job.messages.length-1&&!["rendered","placeholder"].includes(job.fields.videoStage)&&<VideoPlanReview job={job} onChange={onChange} onGenerate={generateVideo}/>}
            {job.mode==="video"&&outputIds.length>0&&<CreativeVideoResult job={job} items={outputIds.flatMap(id=>{const media=d.media.find(m=>m.id===id);return media?.type==="video"?[media,...(media.parentId?d.media.filter(parent=>parent.id===media.parentId):[])]:[];})} onManage={()=>onNavigate("publish")}/>}
            {job.mode!=="video"&&outputIds.length>0&&<CreativeImageGroup job={job} items={outputIds.flatMap(id=>{const media=d.media.find(m=>m.id===id);return media?[media]:[];})} onEdit={id=>setEditing({id,ids:outputIds})} onCanvas={id=>setEditing({id,ids:outputIds,canvas:job.editorKind!=="packaging"})} onCopy={media=>void copy(media)} onReference={reference} onDownload={media=>void download(media)}/>}
          </>;
          const trace=message.trace??creativeTurnTrace(job,outputIds.length,d.media.find(media=>media.id===outputIds[0])?.createdAt??job.createdAt);
          return <article key={index} className={message.role==="user"?s.user:s.assistant} aria-label={message.role==="user"?"你的消息":"创作助手的消息"}>
            {message.role==="assistant"?<CreativeTurn trace={trace} onFeedback={feedback=>onChange({...job,messages:job.messages.map((item,i)=>i===index?{...item,trace:{...trace,feedback}}:item)})}>{content}</CreativeTurn>:content}
          </article>;
        })}
        <div ref={endRef}/>
      </div>
    </div>
    <div className={s.dock}><CreationComposer composerRef={composerRef} prompt={prompt} onPrompt={setPrompt} onSend={()=>send()} promptFields={promptParameters} onPromptFieldChange={(key,value)=>setPromptParameters(previous=>job.mode==="video"?changeVideoPromptField(previous,key,value):changePromptField(previous,key,value))} ratio={ratio} onRatio={setRatio} quality={quality} onQuality={setQuality} model={model} onModel={setModel} languageModel={languageModel} onLanguageModel={setLanguageModel} mode={job.mode} videoSettings={videoSettings} onVideoSettings={setVideoSettings} tool={tool} template={job.template==="自由创作"?null:job.template} onRemoveTool={()=>{setTool(null);setPromptParameters([]);}} onMore={onNavigate}/></div>
    {editing&&<CreativeImageEditor key={editing.id} job={job} items={editing.ids.flatMap(id=>{const media=d.media.find(m=>m.id===id);return media?[media]:[];})} initialId={editing.id} canvasMode={editing.canvas} onClose={()=>setEditing(null)} onSubmit={applyEdit} onSave={(id,document)=>onChange({...job,documents:{...job.documents,[id]:document}})}/> }
    {archive.length>0&&<ArchivePanel ids={archive} onClose={()=>setArchive([])} onOpenProduct={onOpenProduct}/>}
  </section>;
}
