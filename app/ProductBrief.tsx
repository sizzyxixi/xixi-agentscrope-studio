"use client";
import { useState } from "react";
import { ArrowRight, Check, Circle, FileCheck2, Images, Layers3, Sparkles } from "lucide-react";
import { useCommerceDemo } from "./CommerceDemoContext";
import { StudioButton, StudioSelect, StudioTextarea, FieldLabel } from "./StudioControls";
import { productChecks, productGoals, productReferences, productSignature, type ProductGoal } from "./product-readiness";
import type { Product } from "./commerce-demo-data";
import s from "./product-brief.module.css";

export function ProductBrief({ product, onEdit, onTab, onCreate }: { product: Product; onEdit: () => void; onTab: (tab: string) => void; onCreate: (goal: ProductGoal) => void }) {
  const d = useCommerceDemo();
  const [goal, setGoal] = useState<ProductGoal>("listing");
  const [skuId, setSkuId] = useState(product.skus.length === 1 ? product.skus[0].id : "");
  const [editing, setEditing] = useState(false);
  const [brief, setBrief] = useState(product.creativeBrief || {});
  const activeSku = product.skus.some(sku => sku.id === skuId) ? skuId : "";
  const checks = productChecks(product, d.links, d.media, goal, activeSku);
  const completed = checks.filter(check => check.done).length;
  const references = productReferences(product, d.links, d.media, activeSku);
  const linked = d.links.filter(link => link.productId === product.id);
  const outputs = new Set(linked.filter(link => link.location !== "参考素材" && link.status !== "已归档").map(link => link.mediaId));
  const adopted = new Set(linked.filter(link => link.location !== "参考素材" && link.status === "已采用").map(link => link.mediaId));
  const ready = completed === checks.length && !!activeSku && !product.archived;
  const chosenGoal = productGoals.find(item => item.id === goal)!;

  function start() {
    if (!ready) return;
    d.setReferenceProducts([product.id]); d.setReferenceSkus([activeSku]); d.setReferenceMedia(references.map(item => item.id));
    onCreate(goal);
  }
  return <div className={s.root}>
    <div className={s.hero}><div><span className={s.eyebrow}>PRODUCT WORKSPACE</span><h2>让每次创作，都从准确的商品开始。</h2><p>先确认商品和 SKU，再按目标补齐资料。产物归档后，可继续用于下一次创作。</p></div><span className={s.badge}>本地 Demo · 数据保存在当前浏览器</span></div>
    <div className={s.stats}>
      {[[Layers3, product.skus.length, "商品 SKU"], [Images, references.length, "当前范围参考图"], [Sparkles, outputs.size, "已关联产物"], [FileCheck2, adopted.size, "已采用产物"]].map(([Icon, value, label]) => { const I = Icon as typeof Layers3; return <div key={String(label)}><I size={18}/><strong>{String(value)}</strong><span>{String(label)}</span></div>; })}
    </div>
    <div className={s.layout}><section className={s.panel}><div className={s.title}><div><h3>这次要完成什么？</h3><p>资料要求随创作目标变化</p></div></div>
      <div className={s.goals}>{productGoals.map(item => <StudioButton key={item.id} aria-pressed={goal === item.id} className={goal === item.id ? s.selected : ""} onClick={() => setGoal(item.id)}><strong>{item.title}</strong><span>{item.description}</span></StudioButton>)}</div>
      <FieldLabel>本次使用的 SKU<StudioSelect value={activeSku} onChange={event => setSkuId(event.target.value)}><option value="">请选择一个 SKU</option>{product.skus.map(sku => <option key={sku.id} value={sku.id}>{sku.code} · {sku.color} {sku.spec}</option>)}</StudioSelect></FieldLabel>
      <div className={s.delivery}><small>预期交付</small><strong>{chosenGoal.output}</strong><p>{goal === "packaging" ? "当前支持概念探索，生产展开稿仍需刀模、尺寸及供应商确认。" : goal === "pod" ? "当前支持设计与效果预览，生产文件需按供应商模板另行核对。" : "商品资料与所选参考图随创作任务保留输入快照。"}</p></div>
      <StudioButton className={s.primary} disabled={!ready} onClick={start}>引用商品，开始创作 <ArrowRight size={15}/></StudioButton>
      {!ready && <p className={s.hint}>{product.archived ? "商品已归档，请先恢复。" : !activeSku ? "请先选择本次使用的 SKU。" : "完成右侧资料检查后即可开始。"}</p>}
    </section><section className={s.panel}><div className={s.title}><div><h3>创作准备检查</h3><p>检查资料是否齐备，内容准确性由你确认</p></div><strong>{completed}/{checks.length}</strong></div><progress aria-label="创作资料完成度" className={s.progress} value={completed} max={checks.length}/>
      <div className={s.checks}>{checks.map(check => <div key={check.label}>{check.done ? <Check size={16}/> : <Circle size={16}/>}<span>{check.label}</span><StudioButton onClick={() => check.tab === "基础资料" ? onEdit() : check.tab === "创作概览" ? setEditing(true) : onTab(check.tab)}>{check.done ? "查看" : "去完善"}</StudioButton></div>)}</div>
      <div className={s.facts}><strong>本次商品事实</strong><p>{product.material || "材质待补充"} · {product.skus.find(sku => sku.id === activeSku)?.dimensions || product.dimensions || "尺寸待补充"}</p><p>{product.selling || "卖点待补充"}</p><StudioButton disabled={product.archived} onClick={() => { d.setProducts(old => old.map(item => item.id === product.id ? { ...item, confirmedSnapshot: productSignature(item) } : item)); d.setNotice("已确认当前商品与 SKU 资料；资料修改后需重新核对。"); }}>我已核对商品与 SKU 资料</StudioButton></div>
    </section></div>
    <section className={s.panel}><div className={s.title}><div><h3>创作补充说明</h3><p>用于视频、POD 和品牌表达；生成结果不会自动改写商品资料</p></div><StudioButton disabled={product.archived} onClick={() => { setBrief(product.creativeBrief || {}); setEditing(value => !value); }}>{editing ? "取消编辑" : "编辑说明"}</StudioButton></div>
      {editing ? <><div className={s.fields}>{([["useCase", "使用场景", "例如：户外通勤、桌面办公"], ["customArea", "定制区域", "例如：杯身正面 6 × 8cm；仅做效果预览"], ["restrictions", "设计限制", "例如：保留 LOGO、杯盖结构不变、不添加未经确认的功效"]] as const).map(([key, label, placeholder]) => <FieldLabel key={key}>{label}<StudioTextarea value={brief[key] || ""} placeholder={placeholder} onChange={event => setBrief(old => ({ ...old, [key]: event.target.value }))}/></FieldLabel>)}</div><StudioButton className={s.primary} onClick={() => { d.setProducts(old => old.map(item => item.id === product.id ? { ...item, creativeBrief: brief } : item)); setEditing(false); d.setNotice("创作说明已保存，请重新核对商品资料。"); }}>保存说明</StudioButton></> : <div className={s.fields}>{[["使用场景", product.creativeBrief?.useCase], ["定制区域", product.creativeBrief?.customArea], ["设计限制", product.creativeBrief?.restrictions]].map(([label, value]) => <div key={label}><small>{label}</small><p>{value || "待补充"}</p></div>)}</div>}
    </section>
    <div className={s.footer}><span>参考素材用于说明商品；创作产物按平台、语言、用途和 SKU 归档。</span><StudioButton onClick={() => onTab("商品图")}>查看商品产物 <ArrowRight size={14}/></StudioButton></div>
  </div>;
}
