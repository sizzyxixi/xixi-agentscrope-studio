"use client";

import Image from "next/image";
import { perfumeArtwork } from "./creative-perfume-asset.mjs";
import { Modal } from "@heroui/react";
import { useRef, useState, type PointerEvent } from "react";
import { ArrowUp, Check, ChevronLeft, ChevronRight, Download, Eraser, Eye, EyeOff, GripVertical, Layers, Lock, Maximize2, MessageSquarePlus, MousePointer2, MoveUp, MoveDown, Package, PenLine, Redo2, ScanLine, Square, Trash2, Type, Undo2, Unlock, WandSparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import { Hint } from "@/components/hero-ui/tooltip";
import { StudioButton, StudioInput, StudioTextarea } from "./StudioControls";
import type { CreativeJob, Media } from "./commerce-demo-data";
import { uid } from "./commerce-demo-data";
import { boxSvg, boxTemplates, emptyDocument, layerSvg, svgUrl, type DesignLayer, type EditDocument, type EditSubmission, type Mark } from "./creative-editing";
import s from "./creative-image-editor.module.css";

const colors=["#e84343","#e9ae31","#4b8b69","#3878dc","#252525","#aa9170"];
type Tool="pointer"|"pen"|"text"|"comment"|"rect"|"eraser";
export function DesignArtwork({job,media,className}:{job:CreativeJob;media:Media;className?:string}) {
 const document=job.documents?.[media.id];
 if(job.editorKind==="layers"||document?.canvasHeight)return <svg className={className} role="img" aria-label={media.name} viewBox={`0 0 800 ${document?.canvasHeight??1000}`}><LayerNodes height={document?.canvasHeight??1000} layers={document?.layers??emptyDocument().layers}/></svg>;
 return <Image width={800} height={800} unoptimized loading="eager" className={className} src={document&&job.editorKind==="packaging"?svgUrl(boxSvg(document.template,document.width,document.height,document.depth)):media.url} alt={media.name}/>;
}
function LayerNodes({layers,height=1000}:{layers:DesignLayer[];height?:number}) {return <>{[...layers].reverse().filter(layer=>layer.visible).map(layer=><g key={layer.id} data-layer={layer.id} opacity={layer.opacity/100}>
 {layer.kind==="image"?<image href={/\/creative\/generated\/perfume-santal-v1\.(png|jpg)$/.test(layer.fill)?perfumeArtwork:layer.fill} x={layer.x*8} y={layer.y*height/100} width={layer.width*8} height={layer.height*height/100} preserveAspectRatio="xMidYMid slice"/>:layer.kind==="text"?<text x={layer.x*8} y={layer.y*height/100+(layer.fontSize??20)} fontSize={layer.fontSize} fill={layer.fill} fontFamily="Georgia,serif" letterSpacing="2">{layer.text}</text>:<rect x={layer.x*8} y={layer.y*height/100} width={layer.width*8} height={layer.height*height/100} fill={layer.fill}/>}
 </g>)}</>;}
export function CreativeImageEditor({job,items,initialId,canvasMode=false,sourceSize,onClose,onSubmit,onSave}:{job:CreativeJob;items:Media[];initialId:string;canvasMode?:boolean;sourceSize?:{width:number;height:number};onClose:()=>void;onSubmit:(value:EditSubmission)=>void;onSave:(id:string,doc:EditDocument)=>void}) {
 const kind=canvasMode?"layers":job.editorKind??"image";
 const [active,setActive]=useState(initialId);
 const documentFor=(id:string):EditDocument=>{
  const saved=job.documents?.[id];
  const initial=saved??{...emptyDocument(),template:id.includes("mailer")?"mailer":"tuck"};
  if(canvasMode&&job.editorKind!=="layers"&&!saved?.canvasHeight)return {...initial,canvasHeight:800,layers:[{id:"source-image",name:"图片图层",kind:"image",x:0,y:0,width:100,height:100,fill:items.find(item=>item.id===id)?.url??items[0].url,visible:true,locked:false,opacity:100}]};
  return initial;
 };
 const [doc,setDoc]=useState<EditDocument>(()=>documentFor(initialId));
 const [past,setPast]=useState<EditDocument[]>([]),[future,setFuture]=useState<EditDocument[]>([]);
 const [tool,setTool]=useState<Tool>("pointer"),[annotating,setAnnotating]=useState(false);
 const [color,setColor]=useState(colors[0]),[selected,setSelected]=useState<string|null>(null);
 const [draftMark,setDraftMark]=useState<Mark|null>(null);
 const [instruction,setInstruction]=useState(""),[zoom,setZoom]=useState(100),[busy,setBusy]=useState(false),[resize,setResize]=useState(false);
 const [size,setSize]=useState(sourceSize??{width:1024,height:1024});
 const board=useRef<HTMLDivElement>(null);
 const drag=useRef<{start:[number,number];document:EditDocument;layerId?:string;mark?:Mark} | null>(null);
 const item=items.find(m=>m.id===active)??items[0];
 const selectedLayer=doc.layers.find(l=>l.id===selected),selectedMark=doc.marks.find(m=>m.id===selected);
 const commit=(next:EditDocument)=>{setPast(old=>[...old,doc].slice(-40));setFuture([]);setDoc(next);};
 const undo=()=>{if(!past.length)return;setFuture(old=>[doc,...old]);setDoc(past[past.length-1]);setPast(old=>old.slice(0,-1));};
 const redo=()=>{if(!future.length)return;setPast(old=>[...old,doc]);setDoc(future[0]);setFuture(old=>old.slice(1));};
 const updateLayer=(patch:Partial<DesignLayer>)=>{if(doc.layers.find(l=>l.id===selected)?.locked)return;commit({...doc,layers:doc.layers.map(l=>l.id===selected?{...l,...patch}:l)});};
 const choose=(id:string)=>{onSave(active,doc);setActive(id);setDoc(documentFor(id));setPast([]);setFuture([]);setSelected(null);setDraftMark(null);};
 const point=(event:PointerEvent<HTMLDivElement>):[number,number]=>{const rect=board.current!.getBoundingClientRect();return [Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100)),Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100))];};
 const down=(event:PointerEvent<HTMLDivElement>)=>{
  if(event.button!==0)return;
  const [x,y]=point(event);
  if(kind==="layers"){
   const layerId=(event.target as Element).closest("[data-layer]")?.getAttribute("data-layer");
   if(tool==="text"||tool==="rect"){
    const layer:DesignLayer={id:uid("layer"),name:tool==="text"?"新文字":"色块",kind:tool==="text"?"text":"shape",x,y,width:tool==="text"?45:20,height:tool==="text"?8:20,text:tool==="text"?"输入文字":undefined,fontSize:30,fill:color,visible:true,locked:false,opacity:100};commit({...doc,layers:[layer,...doc.layers]});setSelected(layer.id);setTool("pointer");return;
   }
   setSelected(layerId??null);
   if(layerId&&!doc.layers.find(l=>l.id===layerId)?.locked){drag.current={start:[x,y],document:doc,layerId};event.currentTarget.setPointerCapture(event.pointerId);}return;
  }
  if(!annotating&&tool!=="comment")return;
  const markId=(event.target as Element).closest("[data-mark]")?.getAttribute("data-mark");
  if(tool==="eraser"){if(markId)commit({...doc,marks:doc.marks.filter(m=>m.id!==markId)});return;}
  if(tool==="pointer"){setSelected(markId??null);return;}
  const mark:Mark={id:uid("mark"),kind:tool==="pen"?"pen":tool==="rect"?"rect":tool==="comment"?"comment":"text",x,y,color,text:tool==="text"?"修改这里":tool==="comment"?"":"",points:tool==="pen"?[[x,y]]:undefined};
  if(tool==="text"||tool==="comment"){commit({...doc,marks:[...doc.marks,mark]});setSelected(mark.id);return;}
  drag.current={start:[x,y],document:doc,mark};setDraftMark(mark);event.currentTarget.setPointerCapture(event.pointerId);
 };
 const move=(event:PointerEvent<HTMLDivElement>)=>{
  const current=drag.current;if(!current)return;const [x,y]=point(event);
  if(current.layerId){const layer=current.document.layers.find(l=>l.id===current.layerId)!;setDoc({...current.document,layers:current.document.layers.map(l=>l.id===layer.id?{...l,x:Math.max(0,Math.min(100-l.width,layer.x+x-current.start[0])),y:Math.max(0,Math.min(100-l.height,layer.y+y-current.start[1]))}:l)});return;}
  if(current.mark){const mark=current.mark;const next=mark.kind==="pen"?{...mark,points:[...(mark.points??[]),[x,y] as [number,number]]}:{...mark,x:Math.min(x,current.start[0]),y:Math.min(y,current.start[1]),width:Math.abs(x-current.start[0]),height:Math.abs(y-current.start[1])};current.mark=next;setDraftMark(next);}
 };
 const up=()=>{const current=drag.current;if(!current)return;if(current.layerId){setPast(old=>[...old,current.document]);setFuture([]);}else if(current.mark){commit({...doc,marks:[...doc.marks,current.mark]});setSelected(current.mark.id);}drag.current=null;setDraftMark(null);};
 const remove=()=>{if(!selected)return;commit({...doc,marks:doc.marks.filter(m=>m.id!==selected),layers:doc.layers.filter(l=>l.id!==selected||l.locked)});setSelected(null);};
 const reorder=(direction:number)=>{const index=doc.layers.findIndex(l=>l.id===selected),next=index+direction;if(index<0||next<0||next>=doc.layers.length)return;const layers=[...doc.layers];[layers[index],layers[next]]=[layers[next],layers[index]];commit({...doc,layers});};
 const preview=async()=>{
  let src=item.url;
  if(kind==="packaging")src=svgUrl(boxSvg(doc.template,doc.width,doc.height,doc.depth));
  if(kind==="layers"||doc.canvasHeight){
   const response=await fetch((()=>{const src=doc.layers.find(l=>l.kind==="image")?.fill??item.url;return /\/creative\/generated\/perfume-santal-v1\.(png|jpg)$/.test(src)?perfumeArtwork:src;})());const blob=await response.blob();const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});src=svgUrl(layerSvg(doc.layers,data,doc.canvasHeight??1000));
  }
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new window.Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
  const canvas=document.createElement("canvas");canvas.width=kind==="layers"?800:size.width;canvas.height=kind==="layers"?(doc.canvasHeight??1000):kind==="packaging"?Math.round(size.width*540/600):size.height;const ctx=canvas.getContext("2d")!;ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const sx=canvas.width/100,sy=canvas.height/100;
  doc.marks.forEach((m,i)=>{ctx.strokeStyle=m.color;ctx.fillStyle=m.color;ctx.lineWidth=2.5*sx/8;ctx.lineCap="round";ctx.lineJoin="round";
   if(m.kind==="pen"){ctx.beginPath();m.points?.forEach(([x,y],index)=>index?ctx.lineTo(x*sx,y*sy):ctx.moveTo(x*sx,y*sy));ctx.stroke();}
   else if(m.kind==="rect")ctx.strokeRect(m.x*sx,m.y*sy,(m.width??0)*sx,(m.height??0)*sy);
   else if(m.kind==="text"){ctx.font=`${Math.max(16,2.3*sx)}px sans-serif`;ctx.fillText(m.text??"",m.x*sx,m.y*sy);}
   else {ctx.beginPath();ctx.arc(m.x*sx,m.y*sy,1.7*sx,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.font=`bold ${2*sx}px sans-serif`;ctx.textAlign="center";ctx.fillText(String(i+1),m.x*sx,m.y*sy+.7*sx);ctx.textAlign="left";}
  });return canvas.toDataURL("image/png");
 };
 const submit=async()=>{if(busy)return;setBusy(true);try{const notes=doc.marks.map((m,i)=>`标注 ${i+1}（${Math.round(m.x)}%, ${Math.round(m.y)}%）：${m.text||({pen:"手绘选区",rect:"框选区域",text:"文字",comment:"请调整此处"}[m.kind])}`).join("\n");const request=instruction.trim()||(kind==="packaging"?`使用${boxTemplates.find(t=>t.id===doc.template)?.name}重新生成，尺寸 ${doc.width} × ${doc.height} × ${doc.depth}mm。`:kind==="layers"?"按照画布中的图层、文案与布局更新设计。":"请按照图片上的标注调整画面，保持未标注区域不变。");onSubmit({sourceId:active,document:doc,instruction:[request,notes].filter(Boolean).join("\n"),preview:await preview()});onClose();}catch{setInstruction("图片读取失败，请重试。");}finally{setBusy(false);}};
 const close=()=>{onSave(active,doc);onClose();};
 const icon=(label:string,Icon:typeof X,action:()=>void,activeState=false,disabled=false)=><Hint key={label} content={label}><StudioButton aria-label={label} className={activeState?s.active:""} disabled={disabled} onClick={action}><Icon size={18}/></StudioButton></Hint>;
 return <Modal.Backdrop isOpen onOpenChange={open=>{if(!open)close();}} className={`${s.backdrop} ${kind==="image"?s.lightboxBackdrop:""}`}><Modal.Container className={`${s.container} ${kind==="image"?s.lightboxContainer:""}`}><Modal.Dialog aria-label={kind==="layers"?"画布编辑":kind==="packaging"?"纸盒展开图编辑":"图片预览与标注"} className={`${s.dialog} ${kind==="image"?s.lightboxDialog:""}`}><div className={s.keybind} onKeyDown={event=>{if((event.target as HTMLElement).matches("input,textarea"))return;if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="z"){event.preventDefault();if(event.shiftKey)redo();else undo();}if(event.key==="Delete"||event.key==="Backspace"){event.preventDefault();remove();}}}>
  {kind==="image"&&<div className={s.lightboxClose}>{icon("关闭图片编辑",X,close)}</div>}
  {kind!=="image"&&<header className={s.header}><div className={s.identity}>{kind==="layers"?<Layers size={18}/>:kind==="packaging"?<Package size={18}/>:<Maximize2 size={18}/>}<strong>{item.name}</strong><span>{kind==="layers"?"画布编辑":kind==="packaging"?"包装设计":"图片编辑"}</span></div><div className={s.headerActions}><StudioButton onClick={async()=>{setBusy(true);try{const url=await preview();const a=document.createElement("a");a.href=url;a.download=item.name.replace(/\.psd$/i,"")+".png";a.click();}finally{setBusy(false);}}} disabled={busy}><Download size={16}/>下载图片</StudioButton><StudioButton onClick={()=>{onSave(active,doc);onClose();}}><Check size={16}/>保存编辑</StudioButton>{icon("关闭图片编辑",X,close)}</div></header>}
  <div className={`${s.body} ${kind==="image"?s.imageBody:""}`}>
   {kind==="layers"&&<nav className={s.leftTools} aria-label="画布工具">{icon("选择并移动图层",MousePointer2,()=>setTool("pointer"),tool==="pointer")}{icon("添加文字图层",Type,()=>setTool("text"),tool==="text")}{icon("添加形状图层",Square,()=>setTool("rect"),tool==="rect")}</nav>}
   <main className={`${s.stage} ${kind==="image"?s.imageStage:""}`}>
    <div className={s.viewport}><div ref={board} className={`${s.board} ${kind==="layers"?s.portrait:""} ${tool!=="pointer"?s.crosshair:""}`} style={{width:sourceSize?`min(100%, calc(100cqh * ${size.width/size.height}))`:undefined,transform:`scale(${zoom/100})`,aspectRatio:kind==="packaging"?"600 / 540":kind==="layers"?`800 / ${doc.canvasHeight??1000}`:`${size.width} / ${size.height}`}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
     {kind==="layers"||doc.canvasHeight?<svg viewBox={`0 0 800 ${doc.canvasHeight??1000}`} className={s.artwork}><LayerNodes height={doc.canvasHeight??1000} layers={doc.layers}/></svg>:<Image width={800} height={800} unoptimized loading="eager" draggable={false} className={s.artwork} src={kind==="packaging"?svgUrl(boxSvg(doc.template,doc.width,doc.height,doc.depth)):item.url} alt={item.name}/>}
     {kind==="layers"&&selectedLayer&&selectedLayer.visible&&<div className={s.layerSelection} style={{left:`${selectedLayer.x}%`,top:`${selectedLayer.y}%`,width:`${selectedLayer.width}%`,height:`${selectedLayer.height}%`}}><span>{selectedLayer.name}</span><i/><i/><i/><i/></div>}
     {kind!=="layers"&&<svg className={s.markOverlay} viewBox="0 0 100 100" preserveAspectRatio="none">{[...doc.marks,...(draftMark?[draftMark]:[])].map((mark,index)=><g key={mark.id} data-mark={mark.id} className={selected===mark.id?s.selectedMark:""}>{mark.kind==="pen"?<polyline points={mark.points?.map(p=>p.join(",")).join(" ")} fill="none" stroke={mark.color} strokeWidth=".5" strokeLinecap="round" strokeLinejoin="round"/>:mark.kind==="rect"?<rect x={mark.x} y={mark.y} width={mark.width} height={mark.height} rx=".4" fill="transparent" stroke={mark.color} strokeWidth=".5"/>:mark.kind==="text"?<text x={mark.x} y={mark.y} fill={mark.color} fontSize="3.2" fontFamily="sans-serif">{mark.text}</text>:<><circle cx={mark.x} cy={mark.y} r="2.2" fill={mark.color}/><text x={mark.x} y={mark.y+.9} fill="white" textAnchor="middle" fontSize="2.7">{index+1}</text></>}</g>)}</svg>}
    </div></div>
    {kind==="image"&&<div className={s.floatingTools} aria-label={annotating?"标注工具栏":"图片工具栏"}><GripVertical size={16}/>{annotating?<>{icon("选择标注",MousePointer2,()=>setTool("pointer"),tool==="pointer")}{icon("画笔标注",PenLine,()=>setTool("pen"),tool==="pen")}{icon("文字标注",Type,()=>setTool("text"),tool==="text")}{icon("框选标注",Square,()=>setTool("rect"),tool==="rect")}<div className={s.colorPicker}>{colors.slice(0,4).map(c=><StudioButton key={c} aria-label={`标注颜色 ${c}`} aria-pressed={color===c} className={color===c?s.chosenColor:""} style={{background:c}} onClick={()=>setColor(c)}/>)}</div>{icon("擦除标注",Eraser,()=>setTool("eraser"),tool==="eraser")}<i/>{icon("撤销",Undo2,undo,false,!past.length)}{icon("重做",Redo2,redo,false,!future.length)}{icon("结束标注",X,()=>{setAnnotating(false);setTool("pointer");})}</>:<><StudioButton onClick={()=>{setAnnotating(true);setTool("pen");}}><PenLine size={17}/>标注</StudioButton><StudioButton onClick={()=>{setAnnotating(true);setTool("comment");}}><MessageSquarePlus size={17}/>添加评论</StudioButton><StudioButton onClick={()=>setInstruction("移除背景，保留商品主体及边缘细节。 ")}><ScanLine size={17}/>移除背景</StudioButton><StudioButton onClick={()=>{setAnnotating(true);setTool("rect");setInstruction("移除框选区域中的内容，并自然补全背景。");}}><Eraser size={17}/>擦除</StudioButton><StudioButton onClick={()=>setResize(!resize)}><Maximize2 size={17}/>调整大小</StudioButton></>}</div>}
    <footer className={s.viewControls}><div>{icon("缩小画布",ZoomOut,()=>setZoom(Math.max(50,zoom-25)))}<span>{zoom}%</span>{icon("放大画布",ZoomIn,()=>setZoom(Math.min(200,zoom+25)))}{icon("适应画布",Maximize2,()=>setZoom(100))}</div><div>{icon("上一张图片",ChevronLeft,()=>choose(items[(items.findIndex(m=>m.id===active)-1+items.length)%items.length].id))}<span>{items.findIndex(m=>m.id===active)+1} / {items.length}</span>{icon("下一张图片",ChevronRight,()=>choose(items[(items.findIndex(m=>m.id===active)+1)%items.length].id))}</div></footer>
   </main>
   {kind==="image"&&<div className={s.imageComposer}>
    {selectedMark&&<div className={s.inlineMarkNote}><span>标注 {doc.marks.findIndex(mark=>mark.id===selected)+1}</span><StudioInput autoFocus aria-label="标注说明" placeholder="描述这个位置的调整要求…" value={selectedMark.text??""} onChange={e=>commit({...doc,marks:doc.marks.map(mark=>mark.id===selected?{...mark,text:e.target.value}:mark)})}/><StudioButton aria-label="删除当前标注" onClick={remove}><Trash2 size={14}/></StudioButton><StudioButton aria-label="收起标注说明" onClick={()=>setSelected(null)}><Check size={14}/></StudioButton></div>}
    {resize&&<div className={s.inlineResize}><span>图片尺寸</span>{([['width','宽'],['height','高']] as const).map(([key,label])=><label key={key}>{label}<StudioInput aria-label={`图片${label}度`} type="number" min={256} max={4096} value={size[key]} onChange={e=>setSize(old=>({...old,[key]:Math.max(256,Math.min(4096,Number(e.target.value)||256))}))}/></label>)}<span>px</span><StudioButton aria-label="收起图片尺寸" onClick={()=>setResize(false)}><X size={13}/></StudioButton></div>}
    {doc.marks.length>0&&<div className={s.inlineMarks} aria-label="本次图片标注">{doc.marks.map((mark,index)=><StudioButton key={mark.id} aria-pressed={selected===mark.id} onClick={()=>setSelected(mark.id)}><b style={{background:mark.color}}>{index+1}</b><span>{mark.text||"添加标注说明"}</span></StudioButton>)}</div>}
    <StudioTextarea aria-label="图片编辑要求" placeholder="描述希望如何调整这张图片…" value={instruction} onChange={e=>setInstruction(e.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&(event.metaKey||event.ctrlKey)&&!event.nativeEvent.isComposing){event.preventDefault();void submit();}}}/>
    <div className={s.imageComposerFooter}><span>{doc.marks.length?`${doc.marks.length} 处标注`:"当前图片"}<i/>{job.ratio} · {job.quality}</span><StudioButton aria-label="保存图片标注" onClick={()=>{onSave(active,doc);onClose();}}><Check size={14}/></StudioButton><StudioButton className={s.imageSend} aria-label="发送给 AI" disabled={busy||(!instruction.trim()&&!doc.marks.length)} onClick={()=>void submit()}><ArrowUp size={18}/></StudioButton></div>
   </div>}
   {kind!=="image"&&<aside className={s.sidebar}>
    {kind==="packaging"?<><div className={s.sideHeading}><h2>纸盒模板</h2><span>选择盒型</span></div><div className={s.templates}>{boxTemplates.map(template=><StudioButton key={template.id} className={doc.template===template.id?s.selectedTemplate:""} aria-pressed={doc.template===template.id} onClick={()=>commit({...doc,template:template.id})}><Image width={800} height={800} unoptimized loading="eager" src={svgUrl(boxSvg(template.id))} alt=""/><span><strong>{template.name}</strong><small>{template.description}</small></span>{doc.template===template.id&&<Check size={15}/>}</StudioButton>)}</div><h3>包装尺寸 <small>mm</small></h3><div className={s.dimensionInputs}>{([['width','宽'],['height','高'],['depth','深']] as const).map(([key,label])=><label key={key}>{label}<StudioInput type="number" min={10} max={1000} aria-label={`纸盒${label}度`} value={doc[key]} onChange={e=>commit({...doc,[key]:Math.max(10,Math.min(1000,Number(e.target.value)||10))})}/></label>)}</div><p className={s.legend}><span/>裁切线 <i/>折叠线</p></>:<><div className={s.sideHeading}><h2>图层</h2><span>{doc.layers.length} 个图层</span></div><div className={s.layerList}>{doc.layers.map(layer=><div key={layer.id} className={selected===layer.id?s.layerActive:""}><StudioButton className={s.layerName} onClick={()=>setSelected(layer.id)}>{layer.kind==="text"?<Type size={15}/>:layer.kind==="image"?<Layers size={15}/>:<Square size={15}/>}<span>{layer.name}</span></StudioButton><StudioButton aria-label={`${layer.visible?"隐藏":"显示"}${layer.name}`} onClick={()=>commit({...doc,layers:doc.layers.map(l=>l.id===layer.id?{...l,visible:!l.visible}:l)})}>{layer.visible?<Eye size={14}/>:<EyeOff size={14}/>}</StudioButton><StudioButton aria-label={`${layer.locked?"解锁":"锁定"}${layer.name}`} onClick={()=>commit({...doc,layers:doc.layers.map(l=>l.id===layer.id?{...l,locked:!l.locked}:l)})}>{layer.locked?<Lock size={13}/>:<Unlock size={13}/>}</StudioButton></div>)}</div><div className={s.layerActions}>{icon("图层上移",MoveUp,()=>reorder(-1),false,!selected)}{icon("图层下移",MoveDown,()=>reorder(1),false,!selected)}{icon("删除选中图层",Trash2,remove,false,!selected||!!selectedLayer?.locked)}{icon("撤销画布编辑",Undo2,undo,false,!past.length)}{icon("重做画布编辑",Redo2,redo,false,!future.length)}</div>{selectedLayer&&<div className={s.properties}><h3>{selectedLayer.name}</h3>{selectedLayer.kind==="text"&&<label>文字内容<StudioInput aria-label="图层文字内容" value={selectedLayer.text??""} disabled={selectedLayer.locked} onChange={e=>updateLayer({text:e.target.value})}/></label>}<div className={s.dimensionInputs}>{([['x','X'],['y','Y'],['width','宽度'],['height','高度'],['opacity','不透明度']] as const).map(([key,label])=><label key={key}>{label}<StudioInput type="number" aria-label={`图层${label}`} value={Math.round(selectedLayer[key])} min={0} max={100} disabled={selectedLayer.locked} onChange={e=>updateLayer({[key]:Math.max(0,Math.min(100,Number(e.target.value)))})}/></label>)}</div>{selectedLayer.kind==="text"&&<label>字号<StudioInput type="number" min={8} max={160} aria-label="图层字号" value={selectedLayer.fontSize} onChange={e=>updateLayer({fontSize:Math.max(8,Math.min(160,Number(e.target.value)))})}/></label>}{selectedLayer.kind!=="image"&&<div className={s.propertyColors}>{colors.map(c=><StudioButton key={c} aria-label={`图层颜色 ${c}`} style={{background:c}} onClick={()=>updateLayer({fill:c})}/>)}</div>}</div>}</>}
    <div className={s.submit}><StudioTextarea aria-label="图片编辑要求" placeholder={kind==="packaging"?"补充包装设计要求…":kind==="layers"?"描述进一步的创作要求…":"描述希望如何调整这张图片…"} value={instruction} onChange={e=>setInstruction(e.target.value)}/><StudioButton className={s.submitButton} disabled={busy} onClick={()=>void submit()}><WandSparkles size={16}/>{busy?"正在发送…":kind==="packaging"?"使用此模板重新生成":kind==="layers"?"发送画布给 AI":"发送给 AI"}<ArrowUp size={16}/></StudioButton></div>
   </aside>}
  </div>
 </div></Modal.Dialog></Modal.Container></Modal.Backdrop>;
}
