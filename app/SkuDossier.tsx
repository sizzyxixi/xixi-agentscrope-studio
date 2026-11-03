"use client";
import { useRef, useState } from "react";
import { ChevronDown, Plus, Upload } from "lucide-react";
import { useCommerceDemo } from "./CommerceDemoContext";
import { DemoModal, MediaThumb } from "./CommercePanels";
import { FieldLabel, StudioButton, StudioForm, StudioInput, StudioTextarea } from "./StudioControls";
import { uid, type Product, type Sku, type Media } from "./commerce-demo-data";
import s from "./commerce-demo.module.css";

const fields = [["name","SKU 名称"],["code","SKU 编码"],["color","颜色"],["spec","规格"],["dimensions","产品尺寸"],["packagingDimensions","包装尺寸"],["profile","基础档案 · 材质与外观"],["craftsmanship","工艺细节精解"],["selling","营销与卖点"]] as const;
export function SkuDossier({product}:{product:Product}) {
 const d=useCommerceDemo();
 const sku=product.skus[0];
 const [picker,setPicker]=useState(false);
 const [selected,setSelected]=useState<string[]>([]);
 const [draft,setDraft]=useState<Sku|null>(null);
 const [kind,setKind]=useState<"image"|"video">("image");
 const [preview,setPreview]=useState<Media|null>(null);
 const upload=useRef<HTMLInputElement>(null);
 const media=sku?d.media.filter(m=>d.links.some(l=>l.productId===product.id&&l.location==="参考素材"&&l.mediaId===m.id&&(l.skuIds.includes(sku.id)||!l.skuIds.length))):[];
 async function addFiles(files:File[]) {
  if(!sku)return;
  const existing=media.filter(m=>m.type===kind).length;
  const limit=kind==="image"?30:5;
  let count=existing;
  for(const file of files){
   if(count>=limit){d.setNotice(`每个 SKU 最多 ${limit} ${kind==="image"?"张图片":"条视频"}。`);break;}
   if(!file.type.startsWith(kind+"/")||file.size>20*1024*1024){d.setNotice("请选择对应格式的文件，单文件限 20MB。");continue;}
   try {
    const url=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file);});
    const id=uid("media");
    d.setMedia(old=>[...old,{id,name:file.name,url,type:kind,source:"SKU 上传",space:"personal",createdAt:new Date().toISOString()}]);
    d.setLinks(old=>[...old,{id:uid("link"),mediaId:id,productId:product.id,skuIds:[sku.id],platform:"通用",site:"通用",language:"无文字",usage:kind==="image"?"原始商品图":"商品视频",collection:"SKU 档案",status:"已采用",location:"参考素材",version:1}]);count++;
   }catch{d.setNotice(`无法读取 ${file.name}，请重试。`);}
  }
 }
 if(!sku)return <div className={s.empty}>请先在商品资料中添加 SKU。</div>;
 return <><div className={s.dossier}><div className={s.dossierMedia}>{(["image","video"] as const).map(type=><section key={type}><div className={s.dossierTitle}><h3>{type==="image"?"商品图片":"商品视频"}</h3><small>最多 {type==="image"?"30 张":"5 条"}</small></div><div className={s.skuMediaGrid}>{media.filter(m=>m.type===type).map((m,i)=><div className={s.skuMediaTile} key={m.id}><StudioButton aria-label={`预览${m.name}`} onClick={()=>setPreview(m)}><MediaThumb item={m}/><small>#{i+1}</small></StudioButton><StudioButton className={s.textButton} onClick={()=>d.setLinks(old=>old.flatMap(l=>{if(l.productId!==product.id||l.mediaId!==m.id||l.location!=="参考素材")return [l];const remaining=l.skuIds.length?l.skuIds.filter(id=>id!==sku.id):product.skus.filter(x=>x.id!==sku.id).map(x=>x.id);return remaining.length?[{...l,skuIds:remaining}]:[];}))}>移除关联</StudioButton></div>)}<StudioButton className={s.skuUpload} disabled={media.filter(m=>m.type===type).length>=(type==="image"?30:5)} onClick={()=>{setKind(type);setSelected([]);setPicker(true);}}><Plus size={20}/><span>关联{type==="image"?"图片":"视频"}</span><small>从素材库选择</small></StudioButton></div></section>)}<p className={s.muted}><Upload size={13}/> 此处维护当前 SKU 与参考素材的关联；解除关联不会删除素材库原文件。</p></div><div className={s.dossierFields}><div className={s.dossierTitle}><h3>规格与卖点 <small>当前 SKU 的档案信息</small></h3><StudioButton onClick={()=>setDraft({...sku})}>编辑 SKU 档案</StudioButton></div><dl className={s.compactSpecs}>{[["SKU 名称",sku.name||product.name],["SKU 编码",sku.code],["颜色",sku.color],["规格",sku.spec],["产品尺寸",sku.dimensions||product.dimensions],["包装尺寸",sku.packagingDimensions]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||"待补充"}</dd></div>)}</dl>{[["基础档案 · 材质与外观",sku.profile||product.material],["工艺细节精解",sku.craftsmanship],["营销与卖点",sku.selling||product.selling]].map(([label,value])=><details className={s.longField} key={label} open><summary><span>{label}</span><ChevronDown size={15} aria-hidden="true"/></summary><p className={!value?s.muted:undefined}>{value||"待补充"}</p></details>)}</div></div>{picker&&<DemoModal title={`关联${kind==="image"?"图片":"视频"}`} wide onClose={()=>setPicker(false)}><p className={s.muted}>选择当前 SKU 的参考素材。已有文件通过关联复用，不重复复制。</p><div className={s.mediaGrid}>{d.media.filter(m=>m.type===kind&&!m.placeholder&&!media.some(item=>item.id===m.id)).map(m=><FieldLabel key={m.id}><MediaThumb item={m}/><StudioInput type="checkbox" checked={selected.includes(m.id)} onChange={()=>setSelected(old=>old.includes(m.id)?old.filter(id=>id!==m.id):[...old,m.id])}/>{m.name}</FieldLabel>)}</div><footer><StudioButton onClick={()=>{if(upload.current){upload.current.accept=kind+"/*";upload.current.click();}setPicker(false);}}>上传新素材</StudioButton><StudioButton disabled={!selected.length} onClick={()=>{const limit=kind==="image"?30:5;if(media.filter(m=>m.type===kind).length+selected.length>limit){d.setNotice(`最多关联 ${limit} 份素材`);return;}d.setLinks(old=>[...old,...selected.map(mediaId=>({id:uid("link"),mediaId,productId:product.id,skuIds:[sku.id],platform:"通用",site:"通用",language:"无文字",usage:kind==="image"?"商品参考图":"商品参考视频",collection:"SKU 档案",status:"已采用",location:"参考素材",version:1}))]);setPicker(false);}}>确认关联</StudioButton></footer></DemoModal>}<StudioInput ref={upload} type="file" hidden multiple onChange={async e=>{const files=Array.from(e.target.files??[]);e.target.value="";await addFiles(files);}}/>{draft&&<DemoModal title="编辑 SKU 档案" wide onClose={()=>setDraft(null)}><StudioForm onSubmit={e=>{e.preventDefault();if(!draft.code.trim())return;if(d.products.some(p=>p.skus.some(x=>x.id!==draft.id&&x.code===draft.code.trim()))){d.setNotice("SKU 编码重复，请检查。");return;}d.setProducts(old=>old.map(p=>p.id===product.id?{...p,code:draft.code.trim(),skus:p.skus.map(x=>x.id===draft.id?{...draft,code:draft.code.trim()}:x)}:p));setDraft(null);d.setNotice("SKU 档案已保存。");}}><div className={s.formGrid}>{fields.map(([key,label],i)=><FieldLabel key={key}>{label}{i<6?<StudioInput value={draft[key]??""} required={key==="code"} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>:<StudioTextarea rows={4} value={draft[key]??""} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>}</FieldLabel>)}</div><footer><StudioButton onClick={()=>setDraft(null)}>取消</StudioButton><StudioButton className={s.primary} type="submit">保存档案</StudioButton></footer></StudioForm></DemoModal>}{preview&&<DemoModal title={preview.name} onClose={()=>setPreview(null)}><div className={s.largePreview}>{preview.type==="video"?<video controls src={preview.url}/>:<MediaThumb item={preview}/>}</div></DemoModal>}</>;
}
