"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@heroui/react";
import { ArrowUpRight, Box, Check, ChevronLeft, ChevronRight, Layers3, Paintbrush2, ShoppingBag, Store, WandSparkles, X } from "lucide-react";
import { SelectField } from "@/components/SelectField";
import { StudioButton, StudioOverlay } from "./StudioControls";
import { scenes } from "./commerce-demo-data";
import { sceneImage, toolSceneImage, sceneVisuals, toolDescriptions } from "./scene-catalog";
import { languageOptions, platformOptions } from "./creative-prompt";
import s from "./scene-tool-picker.module.css";
const icons=[ShoppingBag,Store,Box,Paintbrush2,WandSparkles];
export function SceneToolPicker({selectedScene,selectedTool,onSelect,onBrowse}:{selectedScene:string;selectedTool:string;onSelect:(scene:string,tool:string)=>void;onBrowse?:(scene:string)=>void}) {
 const scrollRef=useRef<HTMLDivElement>(null);
 const [scrollState,setScrollState]=useState({left:false,right:false});
 const [browsing,setBrowsing]=useState<string|null>(null);
 const browse=(sceneName:string)=>{if(sceneName===browsing)return;setBrowsing(sceneName);onBrowse?.(sceneName);};
 const current=scenes.find(scene=>scene.name===browsing);
 const tools=current?current.tools.map(tool=>({scene:current.name,tool})):scenes.map(scene=>({scene:scene.name,tool:scene.tools[0]}));
 useEffect(()=>{
  const element=scrollRef.current;if(!element)return;
  const update=()=>{const next={left:element.scrollLeft>1,right:element.scrollLeft+element.clientWidth<element.scrollWidth-1};setScrollState(previous=>previous.left===next.left&&previous.right===next.right?previous:next);};
  element.scrollTo({left:0});const observer=new ResizeObserver(update);observer.observe(element);element.addEventListener("scroll",update,{passive:true});update();return()=>{observer.disconnect();element.removeEventListener("scroll",update);};
 },[browsing]);
 const scroll=(direction:number)=>scrollRef.current?.scrollBy({left:direction*scrollRef.current.clientWidth*.85,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
 return <section className={s.picker} aria-label="创作场景工具">
  <nav className={s.categories} aria-label="创作场景">{scenes.map((scene,index)=>{const Icon=icons[index];return <StudioButton key={scene.name} aria-label={`浏览${scene.name}`} aria-pressed={selectedScene===scene.name} data-browsing={browsing===scene.name||undefined} onPointerEnter={()=>browse(scene.name)} onFocus={()=>browse(scene.name)} onClick={()=>browse(scene.name)} className={s.category}><span className={s.categoryIcon}><Icon size={18}/></span><span>{scene.name}</span><ChevronRight size={12}/></StudioButton>;})}</nav>
  <div className={s.toolScroller}>
  <div ref={scrollRef} className={s.tools} tabIndex={0} role="region" aria-label={browsing?`${browsing}二级工具`:"场景工具推荐"}>{tools.map(({scene,tool})=><Tooltip key={`${scene}-${tool}`} delay={400} closeDelay={80}><Tooltip.Trigger<"button"> render={props=><StudioButton {...props} className={`${s.toolCard} ${selectedTool===tool&&selectedScene===scene?s.selectedTool:""}`} aria-label={`选择${tool}`} aria-pressed={selectedTool===tool&&selectedScene===scene} onClick={()=>onSelect(scene,tool)}><ToolSceneThumbnail scene={scene} tool={tool}/><span className={s.toolText}><strong>{tool}</strong><small>{toolDescriptions[tool]}</small></span>{selectedTool===tool&&selectedScene===scene?<Check size={15}/>:<ArrowUpRight size={14}/>}</StudioButton>}/><Tooltip.Content className={s.previewPopup} placement="top" offset={12}><SceneMotionPreview scene={scene} tool={tool}/><div className={s.previewCopy}><strong>{tool}</strong><p>{toolDescriptions[tool]}</p></div></Tooltip.Content></Tooltip>)}</div>
  {(scrollState.left||scrollState.right)&&<><StudioButton className={`${s.scrollArrow} ${s.scrollLeft}`} aria-label="向左浏览工具" disabled={!scrollState.left} onClick={()=>scroll(-1)}><ChevronLeft size={16}/></StudioButton><StudioButton className={`${s.scrollArrow} ${s.scrollRight}`} aria-label="向右浏览工具" disabled={!scrollState.right} onClick={()=>scroll(1)}><ChevronRight size={16}/></StudioButton></>}
  </div>
 </section>;
}
function ToolSceneThumbnail({scene,tool}:{scene:string;tool:string}) {
 const layout=/套图|SKU|系列|配色|变体/.test(tool)?"grid":/详情|首页|长图|故事/.test(tool)?"detail":/尺寸/.test(tool)?"dimension":/对比|翻译|替换/.test(tool)?"split":"photo";
 const source=toolSceneImage(scene,tool);
 return <span className={`${s.thumbnail} ${s[`thumb_${layout}`]}`}><Image src={source} alt="" width={144} height={112} unoptimized loading="eager"/>{(layout==="grid"||layout==="split")&&<Image src={source} alt="" width={144} height={112} unoptimized loading="eager"/>}{layout==="grid"&&<Image src={source} alt="" width={144} height={112} unoptimized loading="eager"/>}{layout==="detail"&&<span className={s.miniDetail}><i/><i/><i/></span>}{layout==="dimension"&&<span className={s.dimensionLine}>60 mm</span>}</span>;
}
export function SceneMotionPreview({scene,tool}:{scene:string;tool:string}) {
 const key=sceneVisuals[scene]?.key??"commerce";
 return <div className={`${s.motion} ${s[key]}`} aria-label={`${tool}动态效果预览`}><Image className={s.motionImage} src={toolSceneImage(scene,tool)} alt={`${tool}效果`} width={600} height={450} unoptimized loading="eager"/>
  {key==="commerce"&&<div className={s.setFrames}>{[0,1,2].map(index=><div key={index}><Image src={toolSceneImage(scene,tool)} alt="" width={100} height={100} unoptimized style={{objectPosition:`${30+index*25}% center`}}/></div>)}</div>}
  {key==="store"&&<div className={s.storeFrame}><i/><i/><i/><span>THE EVERYDAY EDIT</span></div>}
  {key==="product"&&<div className={s.colorways}><span/><span/><span/></div>}
  {key==="pod"&&<span className={s.printPreview}><Layers3 size={13}/>PRINT STUDIO</span>}
  {key==="retouch"&&<div className={s.retouchWipe}><Image src={toolSceneImage(scene,tool)} alt="" width={600} height={450} unoptimized/><span/></div>}
 </div>;
}
export function PlatformSetDialog({initialPlatform="",initialLanguage="",onClose,onConfirm}:{initialPlatform?:string;initialLanguage?:string;onClose:()=>void;onConfirm:(platform:string,language:string)=>void}) {
 const [platform,setPlatform]=useState(initialPlatform),[language,setLanguage]=useState(initialLanguage);
 return <StudioOverlay label="平台套图设置" onClose={onClose}><div className={s.settingsDialog}><div className={s.dialogVisual}><Image src={sceneImage("电商设计")} alt="商品套图视觉" width={450} height={600} unoptimized/></div><div className={s.dialogForm}><header><h2>平台套图</h2><StudioButton aria-label="关闭平台套图设置" onClick={onClose}><X size={17}/></StudioButton></header><p>选择目标平台与图片语言。</p><label>目标平台<SelectField aria-label="目标平台" value={platform} onValueChange={setPlatform} options={platformOptions} placeholder="选择平台"/></label><label>图片语言<SelectField aria-label="图片语言" value={language} onValueChange={setLanguage} options={languageOptions.map(value=>({value,label:value}))} placeholder="选择语言"/></label><footer><StudioButton onClick={onClose}>取消</StudioButton><StudioButton className={s.confirm} disabled={!platform||!language} onClick={()=>onConfirm(platform,language)}>确认使用<ChevronRight size={14}/></StudioButton></footer></div></div></StudioOverlay>;
}
