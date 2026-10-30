"use client";
import { useRef, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { useCommerceDemo } from "./CommerceDemoContext";
import { DemoModal, MediaThumb } from "./CommercePanels";
import { FieldLabel, StudioButton, StudioForm, StudioInput, StudioTextarea } from "./StudioControls";
import { uid, type Product, type Sku, type Media } from "./commerce-demo-data";
import s from "./commerce-demo.module.css";

const fields = [["name","SKU 名称"],["code","SKU 编码"],["color","颜色"],["spec","规格"],["dimensions","产品尺寸"],["packagingDimensions","包装尺寸"],["profile","基础档案 · 材质与外观"],["craftsmanship","工艺细节精解"],["selling","营销与卖点"]] as const;
export function SkuDossier({product}:{product:Product}) {
 const d=useCommerceDemo();
 const [active,setActive]=useState(product.skus[0]?.id??"");
 const sku=product.skus.find(x=>x.id===active)??product.skus[0];
 const [draft,setDraft]=useState<Sku|null>(null);
 const [kind,setKind]=useState<"image"|"video">("image");
 const [preview,setPreview]=useState<Media|null>(null);
 const upload=useRef<HTMLInputElement>(null);
 const media=sku?d.media.filter(m=>d.links.some(l=>l.productId===product.id&&l.mediaId===m.id&&(l.skuIds.includes(sku.id)||!l.skuIds.length))):[];
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
 return <><div className={s.skuSummary}><div><small>商品信息 · 所有 SKU 共用</small><h2>{product.name}</h2><div className={s.productTags}><span>商品编码　{product.code||"待补充"}</span><span>品牌　{product.brand||"待补充"}</span><span>商品类目　{product.category||"待补充"}</span></div><p>目标受众　{product.audience||"待补充"}</p></div><div className={s.skuSwitcher}>{product.skus.map((x,i)=><StudioButton key={x.id} className={x.id===sku.id?s.active:""} aria-pressed={x.id===sku.id} onClick={()=>setActive(x.id)}><strong>SKU {i+1}</strong><small>{x.code||"待补充编码"}</small><span>{x.color} {x.spec}</span></StudioButton>)}</div></div><div className={s.dossier}><div className={s.dossierMedia}>{(["image","video"] as const).map(type=><section key={type}><div className={s.dossierTitle}><h3>{type==="image"?"商品图片":"商品视频"}</h3><small>最多 {type==="image"?"30 张":"5 条"}</small></div><div className={s.skuMediaGrid}>{media.filter(m=>m.type===type).map((m,i)=><div className={s.skuMediaTile} key={m.id}><StudioButton aria-label={`预览${m.name}`} onClick={()=>setPreview(m)}><MediaThumb item={m}/><small>#{i+1}</small></StudioButton><StudioButton className={s.textButton} onClick={()=>d.setLinks(old=>old.flatMap(l=>{if(l.productId!==product.id||l.mediaId!==m.id)return [l];const remaining=l.skuIds.length?l.skuIds.filter(id=>id!==sku.id):product.skus.filter(x=>x.id!==sku.id).map(x=>x.id);return remaining.length?[{...l,skuIds:remaining}]:[];}))}>移除关联</StudioButton></div>)}<StudioButton className={s.skuUpload} disabled={media.filter(m=>m.type===type).length>=(type==="image"?30:5)} onClick={()=>{setKind(type);if(upload.current){upload.current.accept=type+"/*";upload.current.click();}}}><Plus size={20}/><span>添加{type==="image"?"图片":"视频"}</span><small>上传后可用于后续<br/>内容生成</small></StudioButton></div></section>)}<p className={s.muted}><Upload size={13}/> 素材按当前 SKU 维护，同时收录于个人素材空间。</p></div><div className={s.dossierFields}><div className={s.dossierTitle}><h3>规格与卖点 <small>当前 SKU 的档案信息</small></h3><StudioButton onClick={()=>setDraft({...sku})}>编辑 SKU 档案</StudioButton></div><h4>基础信息</h4><div className={s.specGrid}><div><span>SKU 名称</span><p>{sku.name||product.name}</p></div><div><span>SKU 编码</span><p>{sku.code||"待补充"}</p></div><div><span>颜色</span><p>{sku.color||"待补充"}</p></div><div><span>规格</span><p>{sku.spec||"待补充"}</p></div></div><hr/><h4>规格与属性</h4><div className={s.specGrid}><div><span>产品尺寸</span><p>{sku.dimensions||product.dimensions||"待补充"}</p></div><div><span>包装尺寸</span><p>{sku.packagingDimensions||"待补充"}</p></div></div>{[["基础档案 · 材质与外观",sku.profile||product.material],["工艺细节精解",sku.craftsmanship],["营销与卖点",sku.selling||product.selling]].map(([label,value])=><div className={s.longField} key={label}><span>{label}</span>{value?<details open><summary>展开 / 收起全文</summary><p>{value}</p></details>:<p className={s.muted}>待补充</p>}</div>)}</div></div><StudioInput ref={upload} type="file" hidden multiple onChange={async e=>{const files=Array.from(e.target.files??[]);e.target.value="";await addFiles(files);}}/>{draft&&<DemoModal title="编辑 SKU 档案" wide onClose={()=>setDraft(null)}><StudioForm onSubmit={e=>{e.preventDefault();if(!draft.code.trim())return;if(d.products.some(p=>p.skus.some(x=>x.id!==draft.id&&x.code===draft.code.trim()))){d.setNotice("SKU 编码重复，请检查。");return;}d.setProducts(old=>old.map(p=>p.id===product.id?{...p,skus:p.skus.map(x=>x.id===draft.id?{...draft,code:draft.code.trim()}:x)}:p));setDraft(null);d.setNotice("SKU 档案已保存。");}}><div className={s.formGrid}>{fields.map(([key,label],i)=><FieldLabel key={key}>{label}{i<6?<StudioInput value={draft[key]??""} required={key==="code"} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>:<StudioTextarea rows={4} value={draft[key]??""} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>}</FieldLabel>)}</div><footer><StudioButton onClick={()=>setDraft(null)}>取消</StudioButton><StudioButton className={s.primary} type="submit">保存档案</StudioButton></footer></StudioForm></DemoModal>}{preview&&<DemoModal title={preview.name} onClose={()=>setPreview(null)}><div className={s.largePreview}>{preview.type==="video"?<video controls src={preview.url}/>:<MediaThumb item={preview}/>}</div></DemoModal>}</>;
}
