"use client";

import Image from "next/image";
import { TemplateFilters } from "./TemplateFilters";
import { templateCategories } from "./template-filtering";
import { TemplateDetailModal } from "./TemplateDetailModal";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Layers3, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/hero-ui/popover";
import { scenes, templateCatalog, type DemoTemplate } from "./commerce-demo-data";
import { FieldLabel, StudioButton, StudioInput, StudioSelect } from "./StudioControls";
import s from "./explore-gallery.module.css";

type Props = { onApply:(template:DemoTemplate)=>void };
const categories=["推荐",...scenes.map(x=>x.name),"技能"];
const styles=["全部","自然极简","品牌质感","节日营销"];
const aspectRatios=["3 / 4","4 / 3","4 / 5","1 / 1","2 / 3","1 / 1","3 / 4","4 / 3"];
const skills=[
  {name:"平台套图",description:"围绕商品信息，组织主视觉、卖点、细节与规格图。",scene:"电商设计",cover:"/creative/generated/fragrance-v1.webp"},
  {name:"A+详情页",description:"将商品卖点与品牌故事编排为连贯的详情页模块。",scene:"电商设计",cover:"/creative/skincare.jpg"},
  {name:"尺寸标注",description:"根据商品尺寸和参考图，整理清晰易读的规格说明。",scene:"电商设计",cover:"/creative/mug.jpg"},
  {name:"商品SKU组合图",description:"组合多个商品规格，呈现配色、款式与套装关系。",scene:"电商设计",cover:"/creative/watch.jpg"},
  {name:"商品场景图",description:"将商品融入日常空间，表达使用方式与生活氛围。",scene:"电商设计",cover:"/creative/generated/interior-v1.webp"},
  {name:"对比说明图",description:"用图像与信息布局呈现商品差异和核心优势。",scene:"电商设计",cover:"/creative/generated/sport-v1.webp"},
];
export function ExploreGallery({onApply}:Props){
  const [category,setCategory]=useState("推荐");
  const [tool,setTool]=useState("全部");
  const [style,setStyle]=useState("全部");
  const [productCategory,setProductCategory]=useState("全部");
  const [platform,setPlatform]=useState("");
  const [query,setQuery]=useState("");
  const [visibleCount,setVisibleCount]=useState(24);
  const [selected,setSelected]=useState<string|null>(null);
  const sceneTools=scenes.find(x=>x.name===category)?.tools??[];
  const filtered=useMemo(()=>{
    const result=templateCatalog.filter(t=>(category==="推荐"||category==="技能"||t.scene===category)&&(tool==="全部"||t.tool===tool)&&(style==="全部"||t.style===style)&&(productCategory==="全部"||t.category===productCategory)&&(!platform||t.platforms.includes(platform))&&(!query||`${t.title}${t.scene}${t.tool}${t.style}${t.category}`.toLowerCase().includes(query.toLowerCase())));
    // Mix tools and scenes in the recommendation feed, rather than repeating every tool in sequence.
    const ordered=category==="推荐"?[...result].sort((a,b)=>feedOrder(a.id)-feedOrder(b.id)):result;
    if(tool!=="全部"||query)return ordered;
    const covers=new Set<string>();
    return ordered.filter(item=>{if(covers.has(item.cover))return false;covers.add(item.cover);return true;});
  },[category,tool,style,productCategory,platform,query]);
  const detail=filtered.find(t=>t.id===selected);
  const detailIndex=filtered.findIndex(t=>t.id===selected);
  const activeFilters=style!=="全部"||productCategory!=="全部"||!!platform;
  const chooseCategory=(value:string)=>{setCategory(value);setTool("全部");setVisibleCount(24);};
  const clearFilters=()=>{setQuery("");setTool("全部");setStyle("全部");setProductCategory("全部");setPlatform("");setVisibleCount(24);};
  const switchDetail=(offset:number)=>{const next=filtered[detailIndex+offset];if(next){setSelected(next.id);}};
  return <section className={s.explore} aria-label="探索灵感">
    <div className={s.navigation}>
      <nav className={s.categories} aria-label="探索分类">{categories.map(name=><StudioButton key={name} aria-pressed={category===name} className={category===name?s.current:""} onClick={()=>chooseCategory(name)}>{name==="技能"&&<Sparkles size={14}/>} {name}</StudioButton>)}</nav>
      <div className={s.search}><Search size={16}/><StudioInput aria-label="搜索灵感" placeholder="搜索灵感" value={query} onChange={e=>{setQuery(e.target.value);setVisibleCount(24);}}/>{query&&<StudioButton aria-label="清除搜索" onClick={()=>setQuery("")}><X size={13}/></StudioButton>}</div>
    </div>
    {category!=="技能"?<>
      <div className={s.filters}>
        <nav className={s.subcategories} aria-label="灵感筛选">{(sceneTools.length?["全部",...sceneTools]:styles).map(name=><StudioButton key={name} aria-pressed={(sceneTools.length?tool:style)===name} className={(sceneTools.length?tool:style)===name?s.selected:""} onClick={()=>{if(sceneTools.length)setTool(name);else setStyle(name);setVisibleCount(24);}}>{name}</StudioButton>)}</nav>
        <div className={s.filterActions}>
          <Popover><PopoverTrigger asChild><StudioButton className={activeFilters?s.filterActive:""} aria-label="筛选灵感"><SlidersHorizontal size={15}/><span>筛选</span>{activeFilters&&<i/>}<ChevronDown size={11}/></StudioButton></PopoverTrigger><PopoverContent className={s.filterPopover} align="end" aria-label="筛选灵感"><FieldLabel>品类<StudioSelect aria-label="灵感品类" value={productCategory} onChange={e=>{setProductCategory(e.target.value);setVisibleCount(24);}}>{["全部",...templateCategories].map(x=><option key={x}>{x}</option>)}</StudioSelect></FieldLabel><FieldLabel>风格<StudioSelect aria-label="灵感风格" value={style} onChange={e=>{setStyle(e.target.value);setVisibleCount(24);}}>{styles.map(x=><option key={x}>{x}</option>)}</StudioSelect></FieldLabel><StudioButton className={s.reset} onClick={clearFilters}>重置筛选</StudioButton></PopoverContent></Popover>
        </div>
      </div>
      <TemplateFilters value={{scene:sceneTools.length?category:"",tool:tool==="全部"?"":tool,platform,category:productCategory==="全部"?"":productCategory}} onChange={next=>{setPlatform(next.platform);setProductCategory(next.category||"全部");setVisibleCount(24);}} showScene={false} showTools={false}/>
      {filtered.length?<><div className={s.masonry}>{filtered.slice(0,visibleCount).map(t=>{const index=templateCatalog.indexOf(t);return <article className={s.card} key={t.id}>
        <StudioButton className={s.imageButton} aria-label={`查看灵感 ${t.title}`} onClick={()=>{setSelected(t.id);}}><Image src={t.cover} alt={t.title} width={560} height={700} unoptimized loading="lazy" style={{aspectRatio:aspectRatios[index%aspectRatios.length]}}/><div className={s.caption}><strong>{t.title}</strong><span>{t.scene} · {t.style}</span></div><span className={s.useHint}>查看创作 <ArrowRight size={13}/></span></StudioButton>
      </article>;})}</div><div className={s.feedFooter}>{filtered.length>visibleCount?<StudioButton onClick={()=>setVisibleCount(n=>n+24)}>加载更多 <ChevronDown size={13}/></StudioButton>:<span>已浏览全部灵感</span>}</div></>:<div className={s.empty}><Search size={27}/><h2>没有匹配的灵感</h2><StudioButton onClick={clearFilters}>浏览全部灵感</StudioButton></div>}
    </>:<div className={s.skills}>{skills.filter(x=>`${x.name}${x.description}`.includes(query)).map(skill=><article key={skill.name}><Image src={skill.cover} alt={skill.name} width={500} height={300} unoptimized/><div><span className={s.skillIcon}><Layers3 size={18}/></span><h2>{skill.name}</h2><p>{skill.description}</p><StudioButton onClick={()=>{const template=templateCatalog.find(t=>t.tool===skill.name);if(template)onApply(template);}}>使用技能 <ArrowRight size={14}/></StudioButton></div></article>)}{!skills.some(x=>`${x.name}${x.description}`.includes(query))&&<div className={s.empty}><p>没有匹配的技能</p><StudioButton onClick={()=>setQuery("")}>清除搜索</StudioButton></div>}</div>}
    {detail&&<TemplateDetailModal key={detail.id} template={detail} onClose={()=>setSelected(null)} onApply={()=>onApply(detail)} onPrevious={detailIndex>0?()=>switchDetail(-1):undefined} onNext={detailIndex<filtered.length-1?()=>switchDetail(1):undefined}/>}
  </section>;
}
function feedOrder(id:string){const [scene,tool,style]=id.replace('tpl-','').split('-').map(Number);return (tool*11+scene*7+style*13)%101;}
