"use client";

import { FormDialogFooter, formDialogClasses as f } from "@/components/hero-ui/form-dialog";

import Image from "next/image";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Archive, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Building2, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, Ellipsis, FileText, Folder, FolderPlus, Grid2X2, Info, History, ImageIcon, Layers3, List, LoaderCircle, LockKeyhole, Palette, Pencil, Plus, Search, ShieldCheck, Sparkles, Star, Tag, Trash2, Upload, UserRound, UsersRound, Video, X } from "lucide-react";
import { zipSync } from "fflate";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/hero-ui/dropdown-menu";
import { useCommerceDemo } from "./CommerceDemoContext";
import { ArchivePanel } from "./CommercePanels";
import { uid, type Media } from "./commerce-demo-data";
import { formatMaterialDate, isCreation, isInCreationHistory, materialType, mediaSpace, type MaterialBrand, type MaterialModel, type MaterialSpace } from "./material-library-data";
import { ModelDetail } from "./ModelDetail";
import { canPublishModel, modelVisibleInSpace } from "./model-profile";
import { InlineModelName } from "./InlineModelName";
import { MaterialModal, ModelCreator } from "./MaterialLibraryDialogs";
import s from "./material-library.module.css";
import { groupHistoryByDay, matchesHistoryType } from "./material-history";
import { RecycleBinIcon } from "./RecycleBinIcon";
import { Hint } from "@/components/hero-ui/tooltip";
import { StudioInput, StudioSelect } from "./StudioControls";
import { StyleEditor } from "./StyleEditor";
import { styleReference, hasStyleContent } from "./style-schemes";
import { MaterialPreview, supportsMaterialPreview } from "./MaterialPreview";
import { HistoryFileCard } from "./HistoryFileCard";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { isTrashExpired, trashRemaining } from "./material-trash";

type View = "history"|"uploads"|"brands"|"models"|"trash";
type Props = {onCreate:(prompt?:string)=>void;onOpenProduct:(id:string)=>void;onOpenSource?:(id:string)=>void};
const viewNames:Record<View,string>={history:"创作历史",uploads:"素材",brands:"风格",models:"模特",trash:"回收站"};
function TrashRemaining({deletedAt,now}:{deletedAt:string;now:number}) {
  const remaining=trashRemaining(deletedAt,now);
  return remaining?<span className={s.trashRemaining} data-urgent={remaining.urgent||undefined} aria-label={`剩余保留时间 ${remaining.label}`}>{remaining.label}</span>:null;
}
const descriptions:Record<View,string>={history:"对话中的图片、视频和文件，自动归集在这里。",uploads:"常用背景、参考图和文件，保存一次，随时复用。",brands:"保存店铺的视觉基调，在下一次商品创作中沿用。",models:"收藏、上传或定制人物形象，让商品有合适的出镜人物。",trash:"恢复需要的素材，继续保留原来的关联。"};

export function MaterialVisual({media,className=""}:{media:Media;className?:string}) {
  if(media.type==="document")return <div className={`${s.fileVisual} ${className}`}><div className={s.paperSheet}><FileText size={27}/><i/><i/><i/><span>{media.name.split(".").pop()?.toUpperCase()||"FILE"}</span></div></div>;
  if(media.type==="video")return <div className={`${s.videoVisual} ${className}`}><Image src={media.poster||"/creative/video-previews/product-poster-v1.jpg"} alt={media.name} width={600} height={440} unoptimized/><span><Video size={18}/></span></div>;
  return <Image className={className} src={media.url} alt={media.name} width={600} height={500} unoptimized loading="lazy"/>;
}

export async function downloadMaterials(items:Media[]) {
  const results=await Promise.all(items.map(async item=>{const response=await fetch(item.url);if(!response.ok)throw new Error("文件下载失败");return {item,bytes:new Uint8Array(await response.arrayBuffer())};}));
  const files:Record<string,Uint8Array>={};
  results.forEach(({item,bytes},i)=>{const ext=item.type==="image"?(item.url.startsWith("data:image/")?(item.url.match(/^data:image\/(\w+)/)?.[1]??"png").replace("jpeg","jpg"):(item.url.split("?")[0].split(".").pop()||"png")):item.type==="video"?"mp4":"txt";const name=/\.[a-z0-9]{2,5}$/i.test(item.name)?item.name:`${item.name}.${/^[a-z0-9]+$/i.test(ext)?ext:"png"}`;files[files[name]?`${i+1}-${name}`:name]=bytes;});
  const single=results.length===1;
  const bytes=single?results[0].bytes:zipSync(files);
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:single?"application/octet-stream":"application/zip"}));
  const a=document.createElement("a");a.href=url;a.download=single?Object.keys(files)[0]:"素材打包.zip";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function MaterialLibrary({onCreate,onOpenProduct,onOpenSource}:Props) {
  const d=useCommerceDemo();const lib=d.materialLibrary;
  const [space,setSpace]=useState<MaterialSpace>("personal");
  const [view,setView]=useState<View>("history");
  const [batch,setBatch]=useState(false);const [searchOpen,setSearchOpen]=useState(false);const groupStrip=useRef<HTMLDivElement>(null);
  const [type,setType]=useState("全部");const [query,setQuery]=useState("");
  const [quick,setQuick]=useState("all");const [folder,setFolder]=useState("");
  const [page,setPage]=useState(1);const [pageSize,setPageSize]=useState(20);const [pageInput,setPageInput]=useState("");
  const [sort,setSort]=useState("newest");const [layout,setLayout]=useState("grid");
  const [selected,setSelected]=useState<string[]>([]);const [preview,setPreview]=useState<string|null>(null);
  const [styleSource,setStyleSource]=useState<{image:string;name:string}|null>(null);
  const [brandEditor,setBrandEditor]=useState<MaterialBrand|"new"|null>(null);
  const [modelCreator,setModelCreator]=useState<"custom"|"official"|"upload"|null>(null);
  const [modelPreview,setModelPreview]=useState<MaterialModel|null>(null);
  const [confirm,setConfirm]=useState<{ids:string[];kind:"media"|"brand"|"model"|"folder"}|null>(null);
  const [simple,setSimple]=useState<"folder"|"rename"|"renameFile"|"tags"|"organize"|null>(null);const [simpleText,setSimpleText]=useState("");
  const [folderQuery,setFolderQuery]=useState("");const [collapsedFolders,setCollapsedFolders]=useState({personal:false,enterprise:false});
  const [renameMediaId,setRenameMediaId]=useState("");const [renameSuffix,setRenameSuffix]=useState("");
  const [renameFolderId,setRenameFolderId]=useState("");const [moveIds,setMoveIds]=useState<string[]>([]);const [simpleError,setSimpleError]=useState("");
  const [publishIds,setPublishIds]=useState<string[]>([]);const [publishFolder,setPublishFolder]=useState("");const [publishError,setPublishError]=useState("");
  const [archive,setArchive]=useState<string[]>([]);const [dragging,setDragging]=useState(false);
  const [uploads,setUploads]=useState<{name:string;id:string;status:"reading"|"done"|"error";error?:string}[]>([]);
  const [uploadPanel,setUploadPanel]=useState(false);const [showAllFolders,setShowAllFolders]=useState(false);
  const upload=useRef<HTMLInputElement>(null);const search=useRef<HTMLInputElement>(null);const lastSelection=useRef<string|null>(null);
  const canDelete=space==="personal"||d.materialRole==="admin";
  const liveMedia=d.media.filter(m=>mediaSpace(m)===space&&!m.placeholder&&!lib.metadata[m.id]?.deletedAt);
  const folders=lib.folders.filter(f=>f.space===space&&!f.deletedAt);
  const brands=lib.brands.filter(b=>b.space===space&&!b.deletedAt);
  const models=lib.models.filter(m=>modelVisibleInSpace(m,space));
  const deletedMedia=d.media.filter(m=>mediaSpace(m)===space&&lib.metadata[m.id]?.deletedAt&&!lib.metadata[m.id]?.purgedAt&&!isTrashExpired(lib.metadata[m.id]?.deletedAt,d.materialNow));
  const deletedBrands=lib.brands.filter(b=>b.space===space&&b.deletedAt&&!isTrashExpired(b.deletedAt,d.materialNow));
  const deletedModels=lib.models.filter(m=>m.space===space&&m.deletedAt&&!isTrashExpired(m.deletedAt,d.materialNow)&&(space!=="enterprise"||canPublishModel(m)));
  const trashCount=deletedMedia.length+deletedBrands.length+deletedModels.length;
  const currentFolder=folders.find(f=>f.id===folder);
  const scopedMedia=liveMedia.filter(m=>{
    const info=lib.metadata[m.id]??{};
    const inScope=view==="history"?isInCreationHistory(m):(!isCreation(m)||info.collection)&&(!folder||info.folder===folder);
    const searchable=`${m.name} ${info.description??""} ${info.tags?.join(" ")??""} ${d.links.filter(l=>l.mediaId===m.id).map(l=>d.products.find(p=>p.id===l.productId)?.name).join(" ")}`;
    return inScope&&(quick!=="favorite"||m.favorite)&&(quick!=="recent"||info.usedAt)&&searchable.toLowerCase().includes(query.toLowerCase());
  });

  const filtered=scopedMedia.filter(m=>matchesHistoryType(m,type)).sort((a,b)=>view==="history"?Date.parse(b.createdAt)-Date.parse(a.createdAt):sort==="name"?a.name.localeCompare(b.name,"zh"):sort==="oldest"?(lib.metadata[a.id]?.updatedAt??a.createdAt).localeCompare(lib.metadata[b.id]?.updatedAt??b.createdAt):(quick==="recent"?(lib.metadata[b.id]?.usedAt??b.createdAt).localeCompare(lib.metadata[a.id]?.usedAt??a.createdAt):(lib.metadata[b.id]?.updatedAt??b.createdAt).localeCompare(lib.metadata[a.id]?.updatedAt??a.createdAt)));
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
  const currentPage=Math.min(page,pageCount);
  const visibleMedia=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const mediaGroups=view==="history"?groupHistoryByDay(visibleMedia):[{day:"materials",label:"",media:visibleMedia}];
  useEffect(()=>{setPage(1);setSelected([]);setPageInput("");},[view,space,folder,type,query,sort,pageSize]);
  const goToPage=(next:number)=>{setPage(Math.max(1,Math.min(pageCount,next)));setSelected([]);setPageInput("");document.querySelector(`.${view==="uploads"?s.materialFileScroll:s.main}`)?.scrollTo({top:0,behavior:"smooth"});};
  const activeMedia=d.media.find(m=>m.id===preview);
  const pageTitle=folder?currentFolder?.name??"文件夹":view==="uploads"&&space==="enterprise"?"共享素材":viewNames[view];
  const openPreview=(media:Media)=>{if(supportsMaterialPreview(media))setPreview(media.id);else d.setNotice("不支持在线预览，请直接下载文件。");};
  const exitBatch=()=>{setBatch(false);setSelected([]);lastSelection.current=null;};
  const clear=()=>{setBatch(false);setSearchOpen(false);setSelected([]);setQuery("");setType("全部");setQuick("all");setFolder("");};
  const navigate=(next:View)=>{setView(next);if(next==="history")setSpace("personal");clear();};
  const changeSpace=(next:MaterialSpace)=>{setSpace(next);clear();};
  const openFolder=(next:MaterialSpace,id="")=>{changeSpace(next);setFolder(id);};

  const collect=(ids:string[])=>{d.setMaterialLibrary(old=>({...old,metadata:{...old.metadata,...Object.fromEntries(ids.map(id=>[id,{...old.metadata[id],collection:true,updatedAt:new Date().toISOString()}]))}}));setSelected([]);setPreview(null);d.setNotice("已收藏至素材，永久保存。");};
  const select=(id:string,range=false)=>{const start=visibleMedia.findIndex(m=>m.id===lastSelection.current),end=visibleMedia.findIndex(m=>m.id===id);if(range&&start>=0){setSelected(old=>[...new Set([...old,...visibleMedia.slice(Math.min(start,end),Math.max(start,end)+1).map(m=>m.id)])]);}else setSelected(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);lastSelection.current=id;};
  const reference=(ids:string[],continueEditing=false)=>{
    const valid=ids.filter(id=>d.media.some(m=>m.id===id&&!lib.metadata[id]?.deletedAt&&!m.placeholder));
    if(!valid.length){d.setNotice("当前素材暂不可用于创作，请选择可用文件。");return;}
    d.setReferenceMedia(old=>[...new Set([...old,...valid])]);
    d.setMaterialLibrary(old=>({...old,metadata:{...old.metadata,...Object.fromEntries(valid.map(id=>[id,{...old.metadata[id],usedAt:new Date().toISOString()}]))}}));
    setPreview(null);setSelected([]);onCreate(continueEditing?"请基于引用的作品继续修改，保留商品主体，调整画面背景与细节。":undefined);
  };
  const useBrand=(brand:MaterialBrand)=>{if(!hasStyleContent(brand)){d.setNotice("请先补充风格描述或参考图。");return;}d.setLibraryReferences(old=>[...old.filter(x=>x.kind!=="brand"),styleReference(brand)]);onCreate();};
  const useModel=(model:MaterialModel,image?:string)=>{d.setLibraryReferences(old=>[...old.filter(x=>x.kind!=="model"),{id:model.id,kind:"model",name:model.name,summary:model.description,image:image??model.image,images:image?[image]:[model.image,...(model.threeViewImage?[model.threeViewImage]:[])]}]);setModelPreview(null);onCreate();};
  const renameModel=(id:string,name:string)=>{
    d.setMaterialLibrary(old=>({...old,models:old.models.map(model=>model.id===id?{...model,name,updatedAt:new Date().toISOString()}:model)}));
    setModelPreview(old=>old?.id===id?{...old,name}:old);
    d.setNotice("模特名称已更新。");
  };
  const shareResource=(resource:MaterialBrand|MaterialModel,kind:"brand"|"model")=>{
    if(kind==="model"&&!canPublishModel(resource as MaterialModel)){d.setNotice("官方模特不支持发布至企业空间。");return;}
    let sharedBy="我";try{sharedBy=JSON.parse(localStorage.getItem("agentscope-studio-auth-v1")||"null")?.user?.username||"我";}catch{}
    const shared={...resource,id:uid(`shared-${kind}`),space:"enterprise" as const,sharedBy,updatedAt:new Date().toISOString(),deletedAt:undefined};
    d.setMaterialLibrary(old=>kind==="brand"?{...old,brands:[...old.brands,shared as MaterialBrand]}:{...old,models:[...old.models,shared as MaterialModel]});
    d.setNotice("已发布至企业空间，团队成员可查看和编辑。");
  };
  const publish=(ids:string[])=>{setPublishIds(ids);setPublishFolder("");setPublishError("");};
  const confirmPublish=()=>{
    if(publishFolder&&!lib.folders.some(f=>f.id===publishFolder&&f.space==="enterprise"&&!f.deletedAt)){setPublishError("该文件夹已不可用，请重新选择发布位置。");return;}
    const items=d.media.filter(m=>publishIds.includes(m.id)&&mediaSpace(m)==="personal"&&!m.placeholder&&!lib.metadata[m.id]?.deletedAt);
    if(!items.length){setPublishError("所选素材已不可用，请关闭弹窗后重新选择。");return;}
    try{
      const stamp=new Date().toISOString();
      const copies=items.map(m=>({...m,id:uid("shared"),space:"enterprise" as const,source:"成员发布",createdAt:stamp,jobId:undefined}));
      const metadata=Object.fromEntries(copies.map((m,i)=>[m.id,{...lib.metadata[items[i].id],folder:publishFolder||undefined,owner:"我",collection:true,updatedAt:stamp,deletedAt:undefined}]));
      d.setMedia(old=>[...copies,...old]);d.setMaterialLibrary(old=>({...old,metadata:{...old.metadata,...metadata}}));
      d.setNotice(`已发布到企业共享${publishFolder?` / ${lib.folders.find(f=>f.id===publishFolder)?.name}`:""}。`);
      setPublishIds([]);setSelected([]);
    }catch{setPublishError("发布失败，请重试。");}
  };
  const remove=()=>{
    if(!confirm||!canDelete)return;const {ids,kind}=confirm;const stamp=new Date().toISOString();
    if(kind==="folder"){
      d.setMaterialLibrary(old=>({...old,folders:old.folders.filter(item=>!ids.includes(item.id)),metadata:Object.fromEntries(Object.entries(old.metadata).map(([id,meta])=>[id,meta.folder&&ids.includes(meta.folder)?{...meta,folder:undefined}:meta]))}));
      setConfirm(null);setFolder("");d.setNotice("文件夹已删除，素材已移回根目录。");return;
    }
    d.setMaterialLibrary(old=>kind==="media"?{...old,metadata:{...old.metadata,...Object.fromEntries(ids.map(id=>[id,{...old.metadata[id],deletedAt:old.metadata[id]?.deletedAt??stamp}]))}}:kind==="brand"?{...old,brands:old.brands.map(x=>ids.includes(x.id)?{...x,deletedAt:x.deletedAt??stamp}:x)}:{...old,models:old.models.map(x=>ids.includes(x.id)?{...x,deletedAt:x.deletedAt??stamp}:x)});
    if(kind==="media")d.setReferenceMedia(old=>old.filter(id=>!ids.includes(id)));
    if(kind==="brand"||kind==="model")d.setLibraryReferences(old=>old.filter(x=>!ids.includes(x.id)));
    setConfirm(null);setSelected([]);setPreview(null);setFolder("");d.setNotice("已移入回收站，7 天内可恢复。");
  };
  const restore=(id:string,kind:"media"|"brand"|"model")=>{
    const deletedAt=kind==="media"?lib.metadata[id]?.deletedAt:kind==="brand"?lib.brands.find(item=>item.id===id)?.deletedAt:lib.models.find(item=>item.id===id)?.deletedAt;
    if(!deletedAt||isTrashExpired(deletedAt)||lib.metadata[id]?.purgedAt){d.setNotice("资源已到期销毁，无法恢复。");return;}
    if(kind==="media"){
      const item=d.media.find(media=>media.id===id);
      if(item&&isCreation(item)&&!lib.metadata[id]?.collection&&!isInCreationHistory(item)){d.setNotice("文件已超过创作历史保留期限，无法恢复。");return;}
    }
    d.setMaterialLibrary(old=>kind==="media"?{...old,metadata:{...old.metadata,[id]:{...old.metadata[id],deletedAt:undefined,folder:old.folders.some(folder=>folder.id===old.metadata[id]?.folder&&!folder.deletedAt)?old.metadata[id]?.folder:undefined}}}:kind==="brand"?{...old,brands:old.brands.map(x=>x.id===id?{...x,deletedAt:undefined}:x)}:{...old,models:old.models.map(x=>x.id===id?{...x,deletedAt:undefined}:x)});d.setNotice("已恢复到原来的位置。");
  };
  const addFiles=async(files:File[])=>{
    if(!files.length)return;setUploadPanel(true);const target=space;const targetFolder=folder;
    for(const file of files){const id=uid("material");const supported=/^(image|video|audio)\//.test(file.type)||/\.(pdf|docx|xlsx|pptx|txt|md|csv|json|zip|svg)$/i.test(file.name);const error=file.size>20*1024*1024?"文件超过 20MB":!supported?"暂不支持此格式":undefined;setUploads(old=>[...old,{id,name:file.name,status:error?"error":"reading",error}]);if(error)continue;
      try{const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("文件读取失败"));reader.readAsDataURL(file);});d.setMedia(old=>[{id,name:file.name,type:file.type.startsWith("image")?"image":file.type.startsWith("video")?"video":"document",url,source:"用户上传",space:target,createdAt:new Date().toISOString()},...old]);d.setMaterialLibrary(old=>({...old,metadata:{...old.metadata,[id]:{folder:targetFolder||undefined,bytes:file.size,owner:"我",collection:true}}}));setUploads(old=>old.map(x=>x.id===id?{...x,status:"done"}:x));}catch{setUploads(old=>old.map(x=>x.id===id?{...x,status:"error",error:"读取失败，请重新上传"}:x));}
    }
    setView("uploads");setType("全部");setQuery("");setQuick("all");
  };
  const onDrop=(e:DragEvent)=>{e.preventDefault();setDragging(false);void addFiles(Array.from(e.dataTransfer.files));};
  const closeSimple=()=>{setSimple(null);setMoveIds([]);setRenameFolderId("");setRenameMediaId("");setRenameSuffix("");setSimpleError("");};
  const finishSimple=()=>{
    if(simple==="folder"||simple==="rename"){
      const name=simpleText.trim();if(!name){setSimpleError("请填写文件夹名称。");return;}
      const target=simple==="rename"?lib.folders.find(f=>f.id===renameFolderId&&!f.deletedAt):undefined;
      if(simple==="rename"&&!target){setSimpleError("文件夹已不可用，请关闭后重试。");return;}
      const targetSpace=target?.space??space;
      if(lib.folders.some(f=>f.space===targetSpace&&!f.deletedAt&&f.id!==target?.id&&f.name===name)){setSimpleError("已有同名文件夹，请换个名称。");return;}
      d.setMaterialLibrary(old=>({...old,folders:target?old.folders.map(f=>f.id===target.id?{...f,name}:f):[...old.folders,{id:uid("folder"),name,space}]}));d.setNotice(target?"文件夹已重命名。":"文件夹已创建。");
    }
    else if(simple==="renameFile"){
      const item=liveMedia.find(m=>m.id===renameMediaId);
      if(!item){setSimpleError("文件已不可用，请关闭后重试。");return;}
      const name=simpleText.trim();if(!name){setSimpleError("请填写文件名称。");return;}
      if(/[\\/:*?"<>|]/.test(name)){setSimpleError("文件名称不能包含 \\ / : * ? \" < > |。");return;}
      const filename=renameSuffix&&name.toLowerCase().endsWith(renameSuffix.toLowerCase())?name:`${name}${renameSuffix}`;
      d.setMedia(old=>old.map(m=>m.id===renameMediaId?{...m,name:filename}:m));
      d.setMaterialLibrary(old=>({...old,metadata:{...old.metadata,[renameMediaId]:{...old.metadata[renameMediaId],updatedAt:new Date().toISOString()}}}));d.setNotice("文件已重命名。");
    }
    else if(simple==="tags"){const tags=simpleText.split(/[,，]/).map(x=>x.trim()).filter(Boolean);d.setMaterialLibrary(old=>({...old,metadata:{...old.metadata,...Object.fromEntries(selected.map(id=>[id,{...old.metadata[id],tags:[...new Set([...(old.metadata[id]?.tags??[]),...tags])]}]))}}));d.setNotice("标签已更新。");}
    else if(simple==="organize"){
      if(simpleText&&!folders.some(f=>f.id===simpleText)){setSimpleError("目标文件夹已不可用，请重新选择。");return;}
      const ids=moveIds.length?moveIds:selected;
      const valid=ids.filter(id=>liveMedia.some(m=>m.id===id));
      if(!valid.length){setSimpleError("所选文件已不可用，请关闭后重试。");return;}
      d.setMaterialLibrary(old=>({...old,metadata:{...old.metadata,...Object.fromEntries(valid.map(id=>[id,{...old.metadata[id],folder:simpleText||undefined,collection:true,updatedAt:new Date().toISOString()}]))}}));d.setNotice(simpleText?"素材已移动到文件夹。":"素材已移回根目录。");setSelected([]);
    }
    closeSimple();setSimpleText("");
  };
  const total=view==="brands"?brands.length:view==="models"?models.length:view==="trash"?trashCount:filtered.length;
  const topAction=()=>view==="brands"?setBrandEditor("new"):view==="models"?setModelCreator("custom"):upload.current?.click();

  const pagination=<nav className={s.pagination} aria-label={view==="history"?"创作历史分页":"素材分页"}><span className={s.pageTotal}>共 {filtered.length} 项</span><div className={s.pageNumbers}><button aria-label="上一页" disabled={currentPage===1} onClick={()=>goToPage(currentPage-1)}><ChevronLeft size={15}/></button>{Array.from({length:pageCount},(_,i)=>i+1).filter(n=>n===1||n===pageCount||Math.abs(n-currentPage)<=1).map((n,i,nums)=><span key={n}>{i>0&&n-nums[i-1]>1&&<span className={s.pageEllipsis}>…</span>}<button aria-label={`第 ${n} 页`} aria-current={n===currentPage?"page":undefined} onClick={()=>goToPage(n)}>{n}</button></span>)}<button aria-label="下一页" disabled={currentPage===pageCount} onClick={()=>goToPage(currentPage+1)}><ChevronRight size={15}/></button></div><StudioSelect aria-label="每页数量" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option value="10">10 项 / 页</option><option value="20">20 项 / 页</option><option value="50">50 项 / 页</option></StudioSelect><form className={s.pageJump} onSubmit={e=>{e.preventDefault();if(pageInput)goToPage(Number(pageInput));}}><label htmlFor="history-page-jump">跳至</label><input id="history-page-jump" aria-label="跳转页码" type="number" min={1} max={pageCount} value={pageInput} placeholder={String(currentPage)} onChange={e=>setPageInput(e.target.value)}/><span>页</span><button type="submit" disabled={!pageInput}>确定</button></form></nav>;

  return <section className={s.library} aria-label="素材库" onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setSearchOpen(true);requestAnimationFrame(()=>search.current?.focus());}if(e.key==="Escape")setSelected([]);}} onDragOver={e=>{if(e.dataTransfer.types.includes("Files")){e.preventDefault();setDragging(true);}}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}} onDrop={onDrop} onPaste={e=>{if((e.target as HTMLElement).closest("input,textarea,[contenteditable]"))return;const files=Array.from(e.clipboardData.files);if(files.length){e.preventDefault();void addFiles(files);}}}>
    <header className={s.topNavigation}>
      <div className={s.groupNavigation}><nav ref={groupStrip} className={s.groupTabs}  aria-label="素材分组">{([["history","创作历史"],["uploads","素材"],["brands","风格"],["models","模特"]] as const).map(([key,label])=>key==="history"?<span className={s.historyGroup} key={key}><button aria-current={view===key?"page":undefined} onClick={()=>navigate(key)}>{label}</button><Hint content="创作历史中的素材保留 1 年，收藏至素材可永久保存。"><button className={s.retentionTrigger} aria-label="创作历史保存说明"><Info size={14}/></button></Hint></span>:<button key={key} aria-current={view===key?"page":undefined} onClick={()=>navigate(key)}>{label}</button>)}</nav><button className={s.iconButton} aria-label={trashCount?`回收站，${trashCount} 项`:"回收站为空"} title={trashCount?`回收站 · ${trashCount} 项`:"回收站为空"} disabled={!canDelete} onClick={()=>navigate("trash")}><RecycleBinIcon size={18} full={trashCount>0}/></button></div>
    </header>
    <main className={`${s.main} ${view==="uploads"?s.materialMain:""}`}>
    {(view==="brands"||view==="models"||view==="trash")&&<div className={`${s.typeTabs} ${s.scopeTabs}`} role="tablist" aria-label="资源范围">{([["personal","我的"],["enterprise","企业共享"]] as const).map(([key,label])=><button key={key} role="tab" aria-selected={space===key} onClick={()=>changeSpace(key)}>{label}</button>)}</div>}
    {d.materialStorageError&&<p role="alert" className={s.storageWarning}>存储空间不足，部分更改尚未保存。请先下载重要素材，再释放存储空间。</p>}
    {(view==="history"||view==="uploads")&&<><div className={s.fileWorkspace}>{view==="uploads"&&<aside className={s.folderRail} aria-label="素材文件夹">{(lib.folders.filter(f=>!f.deletedAt).length>8||folderQuery)&&<label className={s.folderSearch}><Search size={14}/><StudioInput className={s.folderSearchInput} aria-label="搜索文件夹" placeholder="搜索文件夹" value={folderQuery} onChange={e=>setFolderQuery(e.target.value)}/>{folderQuery&&<button aria-label="清空文件夹搜索" onClick={()=>setFolderQuery("")}><X size={12}/></button>}</label>}{([["personal","我的"],["enterprise","企业共享"]] as const).map(([scope,label])=><section className={s.folderSection} key={scope}><div className={s.folderScopeHeading}><button aria-current={space===scope&&!folder?"page":undefined} onClick={()=>openFolder(scope)}>{scope==="personal"?<UserRound size={16}/>:<Building2 size={16}/>}<strong>{label}</strong></button><button className={s.folderCollapse} aria-label={`${collapsedFolders[scope]?"展开":"收起"}${label}文件夹`} aria-expanded={!collapsedFolders[scope]} aria-controls={`material-folders-${scope}`} onClick={()=>setCollapsedFolders(old=>({...old,[scope]:!old[scope]}))}><ChevronDown size={13}/></button><button className={s.iconButton} aria-label={`在${label}中新建文件夹`} onClick={()=>{openFolder(scope);setCollapsedFolders(old=>({...old,[scope]:false}));setSimple("folder");setSimpleText("");}}><FolderPlus size={16}/></button></div><div id={`material-folders-${scope}`} hidden={collapsedFolders[scope]&&!folderQuery}>{lib.folders.filter(f=>f.space===scope&&!f.deletedAt&&f.name.toLowerCase().includes(folderQuery.toLowerCase())).map(f=><div className={s.folderEntry} key={f.id}><button className={s.folderItem} aria-current={space===scope&&folder===f.id?"page":undefined} onClick={()=>openFolder(scope,f.id)}><Folder size={14}/><span title={f.name}>{f.name}</span></button><DropdownMenu><DropdownMenuTrigger asChild><button className={s.folderMore} aria-label={`管理文件夹 ${f.name}`}><Ellipsis size={15}/></button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onSelect={()=>{setRenameFolderId(f.id);setSimpleText(f.name);setSimpleError("");setSimple("rename");}}><Pencil size={14}/>重命名</DropdownMenuItem><DropdownMenuItem disabled={scope==="enterprise"&&d.materialRole!=="admin"} onSelect={()=>{openFolder(scope,f.id);setConfirm({ids:[f.id],kind:"folder"});}}><Trash2 size={14}/>{scope==="enterprise"&&d.materialRole!=="admin"?"删除文件夹（仅管理员）":"删除文件夹"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>)}</div></section>)}</aside>}<div className={s.fileContents}><div className={s.toolbar}><div className={s.typeTabs} role="tablist" aria-label="素材类型">{["全部","图片","视频","文档","其他"].map(value=><button key={value} role="tab" aria-selected={type===value} onClick={()=>{setType(value);setSelected([]);}}>{value}</button>)}</div><div className={s.toolbarRight}>{view!=="history"&&<StudioSelect className={s.sortSelector} aria-label="素材排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">更新时间倒序</option><option value="oldest">更新时间正序</option></StudioSelect>}<button className={s.secondaryButton} aria-pressed={batch} onClick={()=>{if(batch)exitBatch();else{setBatch(true);setSelected([]);}}}>{batch?"退出批量操作":"批量操作"}</button>{searchOpen?<label className={s.search}><Search size={15}/><input autoFocus ref={search} aria-label="搜索素材" placeholder="搜索素材" value={query} onChange={e=>setQuery(e.target.value)}/><button aria-label="收起搜索" onClick={()=>{setSearchOpen(false);setQuery("");}}><X size={14}/></button></label>:<button className={s.iconButton} aria-label="搜索素材" onClick={()=>setSearchOpen(true)}><Search size={17}/></button>}<div className={s.layoutToggle}><button aria-label="卡片视图" aria-pressed={layout==="grid"} onClick={()=>setLayout("grid")}><Grid2X2 size={16}/></button><button aria-label="列表视图" aria-pressed={layout==="list"} onClick={()=>setLayout("list")}><List size={17}/></button></div>{view==="uploads"&&<button className={s.primaryButton} onClick={()=>upload.current?.click()}><Upload size={15}/>上传素材</button>}</div></div>
    {batch&&<div className={s.batchRow} role="toolbar" aria-label="批量素材操作"><label><input type="checkbox" aria-label={"全选本页"} checked={visibleMedia.length>0&&selected.length===visibleMedia.length} ref={el=>{if(el)el.indeterminate=selected.length>0&&selected.length<visibleMedia.length;}} onChange={e=>setSelected(e.target.checked?visibleMedia.map(m=>m.id):[])}/>{"全选本页"}</label><span>已选择 {selected.length} 项</span><button disabled={!selected.length} onClick={()=>{void downloadMaterials(d.media.filter(m=>selected.includes(m.id))).catch(()=>d.setNotice("下载失败，请重试。"));}}>批量下载</button><button disabled={!selected.length||!canDelete} onClick={()=>setConfirm({ids:selected,kind:"media"})}>批量删除</button>{view==="history"?<button disabled={!selected.length} onClick={()=>collect(selected)}>批量收藏</button>:<button disabled={!selected.length} onClick={()=>{setMoveIds([]);setSimpleError("");setSimple("organize");setSimpleText("");}}>批量移动至</button>}<button disabled={!selected.length} onClick={()=>{reference(selected);exitBatch();}}>批量引用</button><button className={s.exitBatch} onClick={exitBatch}>退出批量操作</button></div>}


    <div className={view==="uploads"?s.materialFileScroll:undefined}>{filtered.length>0?<>{mediaGroups.map(group=><section key={group.day} className={s.dayGroup} aria-label={group.label||undefined}>{group.label&&<h2 className={s.dayHeading}>{group.label}<span>{group.media.length} 项</span></h2>}<div className={`${s.mediaGrid} ${s.historyGrid} ${layout==="list"?s.historyList:""}`}>{group.media.map(m=>{const info=lib.metadata[m.id]??{};const checked=selected.includes(m.id);return <HistoryFileCard key={m.id} media={m} selected={checked} batch={batch} collected={!!info.collection} onSelect={range=>{setBatch(true);select(m.id,range);}} onPreview={()=>openPreview(m)} onReference={()=>reference([m.id])} onDownload={()=>{void downloadMaterials([m]).catch(()=>d.setNotice("下载失败，请稍后重试。"));}} onRename={view==="uploads"?()=>{const suffix=m.name.match(/\.[a-z0-9]{1,8}$/i)?.[0]??"";setRenameMediaId(m.id);setRenameSuffix(suffix);setSimpleText(suffix?m.name.slice(0,-suffix.length):m.name);setSimpleError("");setSimple("renameFile");}:undefined} onMove={view==="uploads"?()=>{setMoveIds([m.id]);setSimpleText(info.folder??"");setSimpleError("");setSimple("organize");}:undefined} onCollect={view==="history"?()=>collect([m.id]):undefined} onPublish={space==="personal"?()=>publish([m.id]):undefined} onDelete={canDelete?()=>setConfirm({ids:[m.id],kind:"media"}):undefined}/>;})}</div></section>)}</>:<div className={s.empty}><div><Search size={28}/></div><h2>{query?"没有找到匹配素材":type!=="全部"?`暂无${type}`:quick==="favorite"?"把常用素材收藏在这里":quick==="recent"?"引用过的素材会出现在这里":view==="history"?"让每次创作都有迹可循":"建立可复用的素材库"}</h2><p>{query?"试试其他名称，或清空当前筛选。":type!=="全部"?"试试其他类型，或切换为全部查看。":view==="history"?"生成的图片、视频与文件会自动归集在这里，收藏喜欢的作品以长期保留。":"上传商品参考、背景和常用文件，按文件夹整理，创作时随时引用。"}</p><button className={s.secondaryButton} onClick={()=>{if(query||type!=="全部"||quick!=="all"){setQuery("");setType("全部");setQuick("all");}else if(view==="history")onCreate();else upload.current?.click();}}>{query||type!=="全部"||quick!=="all"?"清除筛选":view==="history"?"开始创作":"上传素材"}</button></div>}
    </div>{view==="uploads"&&filtered.length>0&&pagination}</div></div></>}
    {(view==="brands"||view==="models")&&<><div className={view==="brands"?s.brandGrid:s.modelGrid}>{space==="personal"&&<button className={s.addCard} onClick={topAction}><span>{view==="brands"?<Palette size={25}/>:<UserRound size={25}/>}</span><small>{view==="brands"?"保存常用的视觉风格，延续内容创作的视觉基调。":"打造专属模特形象，可在图片/视频创作中复用。"}</small><b>{view==="brands"?"创建风格方案":"新建专属模特"}</b></button>}{view==="brands"?brands.map(brand=><article className={s.brandCard} key={brand.id} onClick={event=>{if(!(event.target as Element).closest("button,[data-ui-popup]"))setBrandEditor(brand);}}><div className={s.resourceMenu}><DropdownMenu><DropdownMenuTrigger asChild><button className={s.moreButton} aria-label={`更多操作 ${brand.name}`}><Ellipsis size={18}/></button></DropdownMenuTrigger><DropdownMenuContent align="end" className={s.menu}><DropdownMenuItem onSelect={()=>useBrand(brand)}><ArrowUpRight size={14}/>引用</DropdownMenuItem><DropdownMenuItem onSelect={()=>setBrandEditor(brand)}><Pencil size={14}/>编辑</DropdownMenuItem>{space==="personal"&&<DropdownMenuItem onSelect={()=>shareResource(brand,"brand")}><Building2 size={14}/>发布至企业空间</DropdownMenuItem>}<DropdownMenuSeparator/><DropdownMenuItem disabled={!canDelete} className={s.dangerText} onSelect={()=>setConfirm({ids:[brand.id],kind:"brand"})}><Trash2 size={14}/>删除</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div><button className={s.brandCover} onClick={()=>setBrandEditor(brand)} aria-label={`编辑风格方案 ${brand.name}`}>{brand.referenceImages?.[0]?<Image src={brand.referenceImages[0]} alt={brand.name} width={480} height={300} unoptimized/>:<div className={s.brandCoverPlaceholder}><Palette size={32}/></div>}</button><div className={s.brandCardBody}><div><strong>{brand.name}</strong></div>{brand.prompt&&<p>{brand.prompt}</p>}</div></article>):models.map(model=><article className={s.modelCard} key={model.id} onClick={event=>{if(!(event.target as Element).closest("button,[data-ui-popup]"))setModelPreview(model);}}><div className={s.resourceMenu}><DropdownMenu><DropdownMenuTrigger asChild><button className={s.moreButton} aria-label={`更多操作 ${model.name}`}><Ellipsis size={18}/></button></DropdownMenuTrigger><DropdownMenuContent align="end" className={s.menu}><DropdownMenuItem onSelect={()=>useModel(model)}><ArrowUpRight size={14}/>引用</DropdownMenuItem>{space==="personal"&&canPublishModel(model)&&<DropdownMenuItem onSelect={()=>shareResource(model,"model")}><Building2 size={14}/>发布至企业空间</DropdownMenuItem>}{canDelete&&<><DropdownMenuSeparator/><DropdownMenuItem className={s.dangerText} onSelect={()=>setConfirm({ids:[model.id],kind:"model"})}><Trash2 size={14}/>删除</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu></div><button className={s.modelImage} onClick={()=>setModelPreview(model)} aria-label={`查看模特 ${model.name}`}><Image src={model.image} alt={model.name} width={480} height={630} unoptimized/>{model.source==="official"&&<span className={s.officialBadge}>官方</span>}</button><div className={s.modelCardBody}><InlineModelName name={model.name} onSave={name=>renameModel(model.id,name)}/></div></article>)}</div>{space==="enterprise"&&!(view==="brands"?brands.length:models.length)&&<div className={s.empty}><div>{view==="brands"?<Palette size={28}/>:<UserRound size={28}/>}</div><h2>暂无共享{view==="brands"?"风格方案":"模特"}</h2><p>将我的{view==="brands"?"风格方案":"模特"}共享到企业，团队即可一起使用。</p></div>}</>}
    {view==="trash"&&<div className={s.trashList}>{!trashCount?<div className={s.empty}><div><RecycleBinIcon size={30}/></div><h2>回收站是空的</h2><p>移除的资源会暂存在这里，方便找回。</p></div>:<>{deletedMedia.map(m=><div key={m.id}><div className={s.trashThumb}><MaterialVisual media={m}/></div><span><strong>{m.name}</strong><small>{materialType(m)}</small></span><TrashRemaining deletedAt={lib.metadata[m.id].deletedAt!} now={d.materialNow}/><button className={s.secondaryButton} onClick={()=>restore(m.id,"media")}>恢复</button></div>)}{[...deletedBrands.map(x=>({...x,kind:"brand" as const})),...deletedModels.map(x=>({...x,kind:"model" as const}))].map(x=><div key={x.id}><span className={s.trashResource}>{x.kind==="brand"?<Palette size={22}/>:<UserRound size={22}/>}</span><span><strong>{x.name}</strong><small>{x.kind==="brand"?"风格方案":"模特"}</small></span><TrashRemaining deletedAt={x.deletedAt!} now={d.materialNow}/><button className={s.secondaryButton} onClick={()=>restore(x.id,x.kind)}>恢复</button></div>)}</>}</div>}


    </main>
    {view==="history"&&filtered.length>0&&pagination}
    {dragging&&<div className={s.dropOverlay}><div><Upload size={40}/><h2>松开，即可上传</h2><p>保存到{space==="personal"?"个人空间":"企业共享空间"}{currentFolder?` / ${currentFolder.name}`:""}</p></div></div>}
    <input ref={upload} type="file" hidden multiple accept="image/*,video/*,audio/*,.pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.json,.zip" onChange={e=>{void addFiles(Array.from(e.target.files??[]));e.target.value="";}}/>
    {uploadPanel&&uploads.length>0&&<div className={s.uploadQueue} role="status"><header><strong>{uploads.some(x=>x.status==="reading")?"正在保存文件":`已保存 ${uploads.filter(x=>x.status==="done").length} 份素材`}</strong><button className={s.iconButton} aria-label="收起上传列表" onClick={()=>setUploadPanel(false)}><X size={16}/></button></header>{uploads.slice(-4).map(x=><div key={x.id}><FileText size={15}/><span title={x.name}>{x.name}<small>{x.error??(x.status==="done"?"已保存在当前空间":"正在读取文件…")}</small></span>{x.status==="done"?<Check size={17}/>:x.status==="reading"?<LoaderCircle size={16} className={s.spinner}/>:<span className={s.dangerText}>失败</span>}</div>)}</div>}
    {activeMedia&&<MaterialPreview media={activeMedia} items={filtered} onClose={()=>setPreview(null)} onNavigate={openPreview} onDownload={()=>{void downloadMaterials([activeMedia]).catch(()=>d.setNotice("下载失败，请重试。"));}} onReference={()=>reference([activeMedia.id])} onNotice={d.setNotice} onSaveStyle={activeMedia.type==="image"?()=>{setStyleSource({image:activeMedia.url,name:`${activeMedia.name} · 风格`.slice(0,60)});setPreview(null);setSpace("personal");navigate("brands");setBrandEditor("new");}:undefined}/>}
    {brandEditor&&<StyleEditor scheme={brandEditor==="new"?undefined:brandEditor} space={space} initialImage={styleSource?.image} initialName={styleSource?.name} onClose={()=>{setBrandEditor(null);setStyleSource(null);}}/>}
    {modelCreator&&<ModelCreator space={space} initialTab={modelCreator} onClose={()=>setModelCreator(null)} onUse={useModel}/>}

    {modelPreview&&<ModelDetail key={modelPreview.id} model={modelPreview} onClose={()=>setModelPreview(null)} onSave={name=>renameModel(modelPreview.id,name)} onUse={image=>useModel(modelPreview,image)} onDownload={async (image,label)=>{await downloadMaterials([{id:modelPreview.id,name:`${modelPreview.name} · ${label}`,url:image,type:"image",source:"模特",createdAt:modelPreview.updatedAt}]);}}/>}

    {confirm&&<ConfirmationDialog title={confirm.kind==="folder"?"删除这个文件夹？":"移入回收站？"} description={confirm.kind==="folder"?"文件夹内素材将移回根目录，不会删除素材。文件夹删除后不可恢复。":`所选 ${confirm.ids.length} 项将在回收站保留 7 天，到期自动销毁${confirm.kind==="media"&&d.links.some(l=>confirm.ids.includes(l.mediaId))?"，其中包含已关联商品的素材":""}。`} confirmLabel={confirm.kind==="folder"?"删除":"移入回收站"} onCancel={()=>setConfirm(null)} onConfirm={remove}/>}
    {publishIds.length>0&&<MaterialModal title="发布到企业空间" onClose={()=>setPublishIds([])}><form onSubmit={e=>{e.preventDefault();confirmPublish();}}><div className={`${f.body} ${s.publishDirectory}`}><p>选择发布位置，企业成员可查看和编辑。</p><fieldset className={s.directoryChoices}><legend>企业目录</legend><label className={s.directoryChoice}><input type="radio" name="publish-directory" value="" checked={!publishFolder} onChange={()=>{setPublishFolder("");setPublishError("");}}/><Building2 size={18}/><span><strong>企业共享</strong><small>根目录，不移入文件夹</small></span></label>{lib.folders.filter(f=>f.space==="enterprise"&&!f.deletedAt).map(f=><label className={s.directoryChoice} key={f.id}><input type="radio" name="publish-directory" value={f.id} checked={publishFolder===f.id} onChange={()=>{setPublishFolder(f.id);setPublishError("");}}/><Folder size={18}/><span>{f.name}</span></label>)}</fieldset>{publishError&&<p className={s.publishError} role="alert">{publishError}</p>}</div><FormDialogFooter><button type="button" className={f.secondaryButton} onClick={()=>setPublishIds([])}>取消</button><button type="submit" className={f.primaryButton}>确认发布</button></FormDialogFooter></form></MaterialModal>}
    {simple&&<MaterialModal title={simple==="folder"?"新建文件夹":simple==="rename"?"重命名文件夹":simple==="renameFile"?"重命名文件":simple==="tags"?"添加标签":"移动到文件夹"} onClose={closeSimple}><form onSubmit={e=>{e.preventDefault();finishSimple();}}><div className={f.body}>{simple==="organize"?<fieldset className={s.directoryChoices}><legend>选择目标位置</legend><label className={s.directoryChoice}><input autoFocus type="radio" name="move-directory" checked={!simpleText} onChange={()=>{setSimpleText("");setSimpleError("");}}/><Folder size={18}/><span><strong>{space==="personal"?"我的素材":"企业共享"}</strong><small>根目录，不移入文件夹</small></span></label>{folders.map(f=><label className={s.directoryChoice} key={f.id}><input type="radio" name="move-directory" checked={simpleText===f.id} onChange={()=>{setSimpleText(f.id);setSimpleError("");}}/><Folder size={18}/><span>{f.name}</span></label>)}</fieldset>:<label className={f.field}>{simple==="tags"?"标签，使用逗号分隔":simple==="renameFile"?"文件名称":"文件夹名称"}<input autoFocus aria-label={simple==="tags"?"标签":simple==="renameFile"?"文件名称":"文件夹名称"} maxLength={simple==="tags"||simple==="renameFile"?200:40} value={simpleText} onChange={e=>{setSimpleText(e.target.value);setSimpleError("");}} placeholder={simple==="tags"?"例如：背景, 秋季上新":simple==="renameFile"?"请输入文件名称":"例如：上新常用素材"}/>{simple==="renameFile"&&renameSuffix&&<span className={s.fileSuffix}>文件类型 {renameSuffix}</span>}</label>}{simpleError&&<p className={s.publishError} role="alert">{simpleError}</p>}</div><FormDialogFooter><button type="button" className={f.secondaryButton} onClick={closeSimple}>取消</button><button type="submit" className={f.primaryButton} disabled={simple!=="organize"?!simpleText.trim():(moveIds.length?moveIds:selected).every(id=>(lib.metadata[id]?.folder??"")===simpleText)}>{simple==="organize"?"确认移动":"保存"}</button></FormDialogFooter></form></MaterialModal>}
    {archive.length>0&&<ArchivePanel ids={archive} onClose={()=>setArchive([])} onOpenProduct={onOpenProduct}/>}
  </section>;
}
