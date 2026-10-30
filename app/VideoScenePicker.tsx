"use client";
import Image from 'next/image';
import { Tooltip } from '@heroui/react';
import sceneStyles from './scene-tool-picker.module.css';
import { VideoMotionPreview,videoMotionKeys } from './VideoMotionPreview';
import { useRef,useState } from 'react';
import { ShoppingBag,ShoppingCart,Copy,Scissors,Languages,ArrowUpRight,Check,ChevronRight,Upload,Film,Package,X } from 'lucide-react';
import { SelectField } from '@/components/SelectField';
import { useCommerceDemo } from './CommerceDemoContext';
import { StudioButton,StudioInput } from './StudioControls';
import { uid } from './commerce-demo-data';
import { videoScenarios } from './video-creation';
import s from './video-creation.module.css';
const icons=[ShoppingBag,ShoppingCart,Copy,Scissors,Languages];
export function VideoScenePicker({selected,onSelect,onProduct}:{selected:string;onSelect:(name:string)=>void;onProduct:()=>void}){
 const d=useCommerceDemo(),upload=useRef<HTMLInputElement>(null);const [uploading,setUploading]=useState(false);
 const scenario=videoScenarios.find(item=>item.name===selected);
 const needsVideo=['视频复刻','视频编辑','视频翻译'].includes(selected),needsProduct=['商品视频','带货视频','视频复刻'].includes(selected);
 const videos=d.media.filter(item=>item.type==='video');const source=videos.find(item=>d.referenceMedia.includes(item.id));
 const hasProduct=d.referenceProducts.length>0||d.media.some(item=>item.type==='image'&&d.referenceMedia.includes(item.id));
 const chooseSource=(id:string)=>d.setReferenceMedia(old=>[...old.filter(key=>!videos.some(video=>video.id===key)),...(id?[id]:[])]);
 return <section className={s.scenePicker} aria-label="视频创作工具"><nav className={`${sceneStyles.categories} ${s.videoCategories}`} aria-label="视频场景">{videoScenarios.map((item,index)=>{const Icon=icons[index];return <Tooltip key={item.name} delay={350} closeDelay={100}><Tooltip.Trigger<"button"> render={props=><StudioButton {...props} className={sceneStyles.category} aria-label={`选择${item.name}`} aria-pressed={selected===item.name} onClick={()=>onSelect(item.name)}><span className={sceneStyles.categoryIcon}><Icon size={18}/></span><span>{item.name}</span><ChevronRight size={12}/></StudioButton>}/><Tooltip.Content className={s.videoTooltip} placement="top" offset={12}><VideoMotionPreview name={item.name}/><div className={s.videoTooltipCopy}><strong>{item.name}</strong><p>{item.description}</p></div></Tooltip.Content></Tooltip>;})}</nav>
 {scenario&&<div className={s.workflow}><div className={s.workflowHeading}><strong>{scenario.name}</strong><ol aria-label="创作流程">{scenario.steps.map((step,index)=><li key={step}><span>{index+1}</span>{step}{index<2&&<ChevronRight size={12}/>}</li>)}</ol></div><div className={s.inputRow}>
 {needsProduct&&<StudioButton className={s.inputAction} onClick={onProduct}><Package size={16}/><span>{hasProduct?'已引用商品 / 商品图':'引用商品或 SKU'}</span>{hasProduct?<Check size={14}/>:<ChevronRight size={13}/>}</StudioButton>}
 {needsVideo&&<><div className={s.sourceSelect}><Film size={16}/><SelectField aria-label={selected==='视频复刻'?'参考视频':'原视频'} placeholder={selected==='视频复刻'?'选择参考视频':'选择原视频'} value={source?.id??''} onValueChange={chooseSource} options={videos.map(item=>({value:item.id,label:item.name}))}/></div><StudioButton className={s.inputAction} disabled={uploading} onClick={()=>upload.current?.click()}><Upload size={14}/>{uploading?'正在上传':'上传视频'}</StudioButton>{source&&<StudioButton className={s.clearSource} aria-label="移除原视频" onClick={()=>chooseSource('')}><X size={14}/></StudioButton>}</>}
 <span className={s.inputHint}>输入：{scenario.input}</span></div></div>}
 <div className={s.examplesHeading}><strong>视频灵感</strong></div><div className={s.exampleCards}>{videoScenarios.map(item=><StudioButton key={item.name} className={s.exampleCard} aria-label={`使用${item.name}方案`} onClick={()=>onSelect(item.name)}><Image src={`/creative/video-previews/${videoMotionKeys[item.name]}-poster-v1.jpg`} alt={item.name} width={480} height={600} unoptimized/><span className={s.examplePlay}><Film size={16}/></span><div><strong>{item.name}</strong><small>{item.input}<ArrowUpRight size={13}/></small></div></StudioButton>)}</div>
 <StudioInput ref={upload} hidden type="file" accept="video/mp4,video/webm,video/quicktime" onChange={async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(!file.type.startsWith('video/')||file.size>100*1024*1024){d.setNotice('请上传 100MB 以内的视频文件。');return;}setUploading(true);try{const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});const id=uid('video-source');d.setMedia(old=>[{id,name:file.name,type:'video',url,source:'用户上传',createdAt:new Date().toISOString()},...old]);d.setReferenceMedia(old=>[...old.filter(key=>!videos.some(video=>video.id===key)),id]);}catch{d.setNotice('视频读取失败，请重新选择。');}finally{setUploading(false);}}}/>
 </section>;
}
