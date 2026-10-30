"use client";
import Image from "next/image";
import { useRef, useState, type ReactNode } from "react";
import { ArrowRight, Bookmark, Images, Video, ArrowUpRight } from "lucide-react";
import { TemplateFilters } from "./TemplateFilters";
import { emptyTemplateFilters,matchesTemplate,type TemplateFiltersState } from "./template-filtering";
import { VideoScenePicker } from "./VideoScenePicker";
import { changeVideoPromptField,defaultVideoSettings,keepsSourceDuration,videoInputIssue,videoPromptFields,videoScenarios,type VideoSettings } from "./video-creation";
import { SceneToolPicker, PlatformSetDialog } from "./SceneToolPicker";
import { sceneImage } from "./scene-catalog";
import { changePromptField, platformSetFields, promptFieldContext, serializeCreativePrompt, validImageCount, type PromptField } from "./creative-prompt";
import { CreativeConversation } from "./CreativeConversation";
import { ExploreGallery } from "./ExploreGallery";
import { CreationComposer } from "./CreationComposer";
import { CommerceDemoProvider, useCommerceDemo } from "./CommerceDemoContext";
import { SocialPublishing } from "./SocialPublishing";
import { DemoModal, ProductHub, ProductPicker, SharedMediaLibrary } from "./CommercePanels";
import { uid, templateCatalog, type CreativeJob, type DemoTemplate, type Media } from "./commerce-demo-data";
import s from "./commerce-demo.module.css";
import { StudioButton } from "./StudioControls";
export type CreativeView = "create" | "explore" | "assets" | "products" | "publish";
type Props = {view:CreativeView|"conversation";onNavigate:(view:CreativeView)=>void;conversation?:CreativeJob;conversationHeader?:ReactNode;onSession:(job:CreativeJob,open:boolean)=>void};
export function CreativeStudio(props:Props){return <CommerceDemoProvider><CreativeWorkspace {...props}/></CommerceDemoProvider>;}
const templateAspectRatios=["3 / 4","1 / 1","4 / 5","4 / 3","2 / 3","1 / 1","4 / 5","3 / 4"];
function CreativeWorkspace({view,onNavigate,conversation,conversationHeader,onSession}:Props){
 const composerRef=useRef<HTMLElement>(null);
 const d=useCommerceDemo();const [hasTool,setHasTool]=useState(false);const [languageModel,setLanguageModel]=useState("通用语言模型");const [mode,setMode]=useState("image");const [scene,setScene]=useState("");const [tool,setTool]=useState("");const [prompt,setPrompt]=useState("");const [ratio,setRatio]=useState("智能比例");const amount="2";const [videoSettings,setVideoSettings]=useState<VideoSettings>({...defaultVideoSettings});const [quality,setQuality]=useState("1K");const [model,setModel]=useState("标准");const [promptParameters,setPromptParameters]=useState<PromptField[]>([]);const context=promptFieldContext(promptParameters);const platform=context.platform??"通用",language=mode==="video"?videoSettings.language:context.language??"无文字",site=mode==="video"?videoSettings.country:"通用";const [fields,setFields]=useState<Record<string,string>>({});const [template,setTemplate]=useState<DemoTemplate|null>(null);
 const [platformDialog,setPlatformDialog]=useState<{template?:DemoTemplate}|null>(null);
 const [picker,setPicker]=useState(false);const [templatePreview,setTemplatePreview]=useState<DemoTemplate|null>(null);const [saved,setSaved]=useState<string[]>([]);
 const [templateFilters,setTemplateFilters]=useState<TemplateFiltersState>(emptyTemplateFilters);
 const [visibleTemplates,setVisibleTemplates]=useState(12);
 const filterTemplates=(next:TemplateFiltersState)=>{setTemplateFilters(next);setVisibleTemplates(12);};
 const productList=d.products.filter(p=>d.referenceProducts.includes(p.id));
 const selectVideoTool=(name:string)=>{if(hasTool&&tool===name)return;const scenario=videoScenarios.find(item=>item.name===name);if(!scenario)return;setHasTool(true);setScene(name);setTool(name);setTemplate(null);setFields({});setPromptParameters(videoPromptFields(name));setPrompt(scenario.prompt);if(name==="视频翻译")setRatio("智能比例");};
 const selectTool=(name:string,sceneName=scene)=>{
  if(name==="平台套图"){setPlatformDialog({});return;}
  filterTemplates({...templateFilters,scene:sceneName,tool:name});setHasTool(true);setScene(sceneName);setTool(name);setTemplate(null);setFields({});setPromptParameters([{key:"style",label:"视觉风格",value:"自然极简",options:["自然极简","品牌质感","温暖生活方式"]},{key:"focus",label:"创作重点",value:"商品主体与品牌识别"}]);setPrompt(`为商品制作${name}，保持商品外观、颜色与品牌标识一致。`);
 };
 const confirmPlatformSet=(selectedPlatform:string,selectedLanguage:string)=>{
  const selected=platformDialog?.template;
  filterTemplates({...templateFilters,scene:"电商设计",tool:"平台套图",platform:selectedPlatform});setHasTool(true);setMode("image");setScene("电商设计");setTool("平台套图");setTemplate(selected??null);setFields({});
  const parameters=platformSetFields(selectedPlatform,selectedLanguage);setPromptParameters(selected?changePromptField(parameters,"style",selected.style):parameters);
  setPrompt(selected?.prompt??"为商品制作一组平台套图，保持商品外观、颜色与品牌标识一致，清晰呈现核心卖点。");setPlatformDialog(null);onNavigate("create");requestAnimationFrame(()=>composerRef.current?.querySelector("textarea")?.focus());
 };
 const applyTemplate=(t:DemoTemplate)=>{
  if(t.tool==="平台套图"){setTemplatePreview(null);setPlatformDialog({template:t});onNavigate("create");return;}
  selectTool(t.tool,t.scene);setMode("image");if(mode==="video")setQuality("1K");setTemplate(t);setPromptParameters([{key:"style",label:"视觉风格",value:t.style,options:["自然极简","品牌质感","节日营销"]},{key:"focus",label:"创作重点",value:"商品主体与品牌识别"}]);setPrompt(t.prompt);onNavigate("create");setTemplatePreview(null);requestAnimationFrame(()=>composerRef.current?.scrollIntoView({behavior:"smooth",block:"center"}));
 };
 const openProduct=(id:string)=>{d.setActiveProduct(id);d.setProductTab("商品图");onNavigate("products");};
 const create=()=>{
  if(!prompt.trim()){d.setNotice("先描述创作需求，或选择一个场景模板。");return;}
  if(d.products.some(p=>d.referenceProducts.includes(p.id)&&p.archived)){d.setNotice("引用的商品已归档，请重新选择有效商品。");return;}
  if(productList.some(p=>p.skus.length>1&&!p.skus.some(s=>d.referenceSkus.includes(s.id)))){setPicker(true);d.setNotice("请明确本次使用的 SKU。");return;}
  if(hasTool&&tool==="尺寸标注"&&!fields.dimensions?.trim()&&!productList.some(p=>p.dimensions)&&!/\d+\s*(mm|cm|inch|英寸|厘米|毫米)/i.test(prompt)){d.setNotice("尺寸标注需要用户提供真实尺寸。");return;}
  if(mode==="video"){const issue=videoInputIssue(hasTool?tool:"自由创作",{hasProduct:productList.length>0,hasImage:d.media.some(m=>d.referenceMedia.includes(m.id)&&m.type==="image"),hasVideo:d.media.some(m=>d.referenceMedia.includes(m.id)&&m.type==="video")});if(issue){d.setNotice(issue);return;}}
  const effectiveTool=hasTool?tool:"自由创作";
  const id=uid("job"),n=mode==="video"?1:validImageCount(promptParameters,/套图|A\+|首页/.test(effectiveTool)?template?.structure.length??6:Number(amount));
  const media:Media[]=Array.from({length:mode==="video"?0:n},(_,i)=>({id:uid("output"),name:`${productList[0]?.name??"自由创作"} · ${template?.structure[i]??effectiveTool} ${i+1}`,type:"image",url:sceneImage(scene),demo:true,source:"创作草稿",jobId:id,createdAt:new Date().toISOString()}));
  const job:CreativeJob={editorKind:mode==="image"?"image":undefined,id,title:productList[0]?.name??(mode==="video"?effectiveTool:"自由创作"),mode,scene,tool:effectiveTool,prompt:serializeCreativePrompt(prompt,promptParameters),promptFields:structuredClone(promptParameters),productIds:[...d.referenceProducts],skuIds:[...d.referenceSkus],snapshot:structuredClone(productList),referenceIds:[...d.referenceMedia],platform,language,site,ratio,quality,amount:mode==="video"?(keepsSourceDuration(effectiveTool)?"原片":String(videoSettings.duration)):String(n),template:template?.title??"自由创作",fields:{...fields,model,languageModel,...(mode==="video"?{videoDuration:String(videoSettings.duration),videoCountry:videoSettings.country,videoLanguage:videoSettings.language,videoStage:"planning"}:{})},mediaIds:media.map(m=>m.id),createdAt:new Date().toISOString(),messages:[{role:"user",text:prompt,promptFields:structuredClone(promptParameters)},{role:"assistant",text:mode==="video"?"已整理本次视频创作要求。请确认处理方案，或继续补充需要调整的内容。":"可以继续调整画面，也可以将图片存入商品素材库。"}]};
  d.setMedia(old=>[...media,...old]);d.setJobs(old=>[job,...old]);onSession(job,true);filterTemplates({...templateFilters,scene:"",tool:""});setPrompt("");setPromptParameters([]);setHasTool(false);setScene("");setTool("");setTemplate(null);d.setReferenceProducts([]);d.setReferenceSkus([]);d.setReferenceMedia([]);
 };
 const templates=templateCatalog.filter(item=>matchesTemplate(item,templateFilters));
 const templateCards=<div className={s.templateMasonry}>{templates.slice(0,visibleTemplates).map(t=><article key={t.id}><StudioButton className={s.templateImage} aria-label={`预览模板：${t.title} · ${t.style}`} onClick={()=>setTemplatePreview(t)}><Image src={t.cover} alt={t.title} width={480} height={600} unoptimized loading="lazy" style={{aspectRatio:templateAspectRatios[templateCatalog.indexOf(t)%templateAspectRatios.length]}}/><span>{t.structure.length>1?`${t.structure.length} 图 / 模块`:"灵感模板"}</span><div className={s.imageCaption}><strong>{t.title}</strong><small>{t.style} <ArrowUpRight size={15}/></small></div></StudioButton><StudioButton className={s.templateSave} aria-label={`${saved.includes(t.id)?"取消收藏":"收藏"}${t.title} · ${t.style}`} aria-pressed={saved.includes(t.id)} onClick={()=>setSaved(old=>old.includes(t.id)?old.filter(id=>id!==t.id):[...old,t.id])}><Bookmark size={15} fill={saved.includes(t.id)?"currentColor":"none"}/></StudioButton></article>)}</div>;
 return <div className={s.workspace} data-view={view}>{(view==="products"||view==="assets")&&<header className={s.breadcrumb}><span>{view==="products"?"资产 / 商品库":"资产 / 素材库"}</span></header>}<div className={s.content}>
 <div hidden={view!=="products"}><ProductHub onCreate={goal=>{if(goal){setTemplate(null);setMode(goal==="video"?"video":"image");setQuality(goal==="video"?"768P":"1K");if(goal==="video"){selectVideoTool("商品视频");}else if(goal==="listing"){selectTool("平台套图","电商设计");}else if(goal==="pod"){selectTool("商品贴图预览","POD开发");}else{selectTool("包装概念","新品开发");}}onNavigate("create");}}/></div><div hidden={view!=="assets"}><SharedMediaLibrary onCreate={()=>onNavigate("create")} onOpenProduct={openProduct}/></div>
 {view==="create"&&<><div className={s.hero}><h1>你好，今天想要创作什么？</h1></div><div className={s.sceneTabs}>{["image","video"].map(x=><StudioButton key={x} aria-pressed={mode===x} className={mode===x?s.active:""} onClick={()=>{setMode(x);filterTemplates({...templateFilters,scene:"",tool:""});setHasTool(false);setQuality(x==="video"?"768P":"1K");setRatio("智能比例");setTool("");setScene("");setPromptParameters([]);setTemplate(null);}}>{x==="image"?<Images size={16}/>:<Video size={16}/>} {x==="image"?"图片生成":"视频生成"}</StudioButton>)}</div><CreationComposer composerRef={composerRef} prompt={prompt} onPrompt={setPrompt} onSend={create} promptFields={promptParameters} onPromptFieldChange={(key,value)=>setPromptParameters(previous=>mode==="video"?changeVideoPromptField(previous,key,value):changePromptField(previous,key,value))} ratio={ratio} onRatio={setRatio} quality={quality} onQuality={setQuality} model={model} onModel={setModel} languageModel={languageModel} onLanguageModel={setLanguageModel} mode={mode} videoSettings={videoSettings} onVideoSettings={setVideoSettings} tool={hasTool?tool:null} template={template?.title??null} onRemoveTool={()=>{filterTemplates({...templateFilters,tool:""});setHasTool(false);setTool("");setScene("");setTemplate(null);setPromptParameters([]);setFields({});}} onMore={onNavigate}/>
 {mode==="image"?<><SceneToolPicker selectedScene={scene} selectedTool={hasTool?tool:""} onSelect={(sceneName,name)=>selectTool(name,sceneName)} onBrowse={sceneName=>filterTemplates({...templateFilters,scene:sceneName,tool:hasTool&&scene===sceneName?tool:""})}/><div className={s.sectionBar}><strong>精选模板</strong><StudioButton className={s.textButton} onClick={()=>onNavigate("explore")}>全部模板 →</StudioButton></div><TemplateFilters value={templateFilters} onChange={filterTemplates} showScene={false} showTools={false}/>{templates.length?<>{templateCards}{templates.length>visibleTemplates&&<div className={s.templateMore}><StudioButton onClick={()=>setVisibleTemplates(count=>count+12)}>加载更多模板 <ArrowRight size={13}/></StudioButton></div>}</>:<div className={s.empty}>没有符合条件的模板<StudioButton className={s.textButton} onClick={()=>filterTemplates({...templateFilters,platform:"",category:""})}>重置筛选</StudioButton></div>}</>:<VideoScenePicker selected={hasTool?tool:""} onSelect={selectVideoTool} onProduct={()=>setPicker(true)}/>}</>}
 {view==="conversation"&&conversation&&<CreativeConversation key={conversation.id} job={conversation} header={conversationHeader} onChange={job=>{d.setJobs(old=>old.some(item=>item.id===job.id)?old.map(item=>item.id===job.id?job:item):[job,...old]);onSession(job,false);}} onNavigate={onNavigate} onOpenProduct={openProduct}/>}
 {view==="publish"&&<SocialPublishing/>}
 {view==="explore"&&<ExploreGallery saved={saved} onToggleSaved={id=>setSaved(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id])} onApply={applyTemplate}/>}

 </div>
 {platformDialog&&<PlatformSetDialog initialPlatform={platformDialog.template?templateFilters.platform||context.platform:context.platform} initialLanguage={context.language} onClose={()=>setPlatformDialog(null)} onConfirm={confirmPlatformSet}/>}
 {picker&&<ProductPicker multi={tool==="商品SKU组合图"} onClose={()=>setPicker(false)}/>}
 {templatePreview&&<DemoModal title={templatePreview.title} onClose={()=>setTemplatePreview(null)} wide><p className={s.muted}>{templatePreview.scene} / {templatePreview.tool} · {templatePreview.style}</p><div className={s.templatePreview}>{templatePreview.structure.map((x,i)=><div key={x}><Image src={templatePreview.cover} alt={x} width={200} height={200} unoptimized/><span>{i+1}. {x}</span></div>)}</div><p>商品、品牌和风格在整套模板中共享；生成后可单张重做。</p><footer><StudioButton onClick={()=>setTemplatePreview(null)}>取消</StudioButton><StudioButton className={s.primary} onClick={()=>applyTemplate(templatePreview)}>使用此模板</StudioButton></footer></DemoModal>}



 </div>;
}
