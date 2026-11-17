"use client";

import { useId, useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, CheckCircle2, ChevronDown, ChevronRight, Package, Search, Video } from 'lucide-react';
import { MaterialModal } from './MaterialLibraryDialogs';
import { FormDialogFooter, formDialogClasses as f } from '@/components/hero-ui/form-dialog';
import { useCommerceDemo } from './CommerceDemoContext';
import { uid, type Product } from './commerce-demo-data';
import { productCode, productTitle } from './product-fields';
import { skuCode, skuImageUrls, skuSpec } from './sku-fields';
import { associateMaterial } from './material-product-link';
import { materialProductSuggestions } from './material-product-search';
import s from './material-product-link.module.css';

type Target = { productId: string; skuId?: string };

export function MaterialProductLinkDialog({ mediaId, onClose, onOpenProduct }: { mediaId: string; onClose: () => void; onOpenProduct: (id: string, mediaId?: string) => void }) {
  const d = useCommerceDemo();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState(''), [done, setDone] = useState(false);
  const prefix = useId();
  const product = d.products.find(p => p.id === target?.productId && !p.deleted_at);
  const selectedSku = target?.skuId ? product?.skus.find(sku => sku.id === target.skuId && !sku.deleted_at) : undefined;
  const validTarget = !!product && (!target?.skuId || !!selectedSku);
  const media = d.media.find(item => item.id === mediaId);
  const unavailable = !media || media.placeholder || !media.url || !!d.materialLibrary.metadata[mediaId]?.deletedAt || !!d.materialLibrary.metadata[mediaId]?.purgedAt;
  const suggestions = materialProductSuggestions(d.products, query);
  const visible = suggestions.slice(0, 20);
  const existing = d.links.filter(link => link.mediaId === mediaId && link.status !== '已归档');
  const choose = (next: Target) => { setTarget(next); setError(''); };
  const search = (value: string) => {
    setQuery(value); setTarget(null); setError('');
    setExpanded(new Set(materialProductSuggestions(d.products, value).filter(result => result.matchedSkuIds.length).map(result => result.product.id)));
  };
  const cover = (p: Product) => p.main_image || skuImageUrls(p.skus.find(sku => !sku.deleted_at) || { id: '', code: '', color: '', spec: '' })[0] || d.media.find(item => item.type === 'image' && !item.placeholder && !d.materialLibrary.metadata[item.id]?.deletedAt && !d.materialLibrary.metadata[item.id]?.purgedAt && d.links.some(link => link.productId === p.id && link.mediaId === item.id && link.status !== '已归档'))?.url;
  const confirm = () => {
    if (!validTarget || !product || unavailable || !media || !d.collectionReady) { setError('商品或素材已不可用，请重新选择。'); return; }
    try {
      const scope = selectedSku ? [selectedSku.id] : [];
      // Keep the current source name; this dialog only changes the association target.
      associateMaterial(d.links, product, media, scope, media.type === 'video' ? '商品视频' : '商品图片', 'validate', media.name);
      const linkId = uid('link');
      d.setLinks(old => associateMaterial(old, product, media, scope, media.type === 'video' ? '商品视频' : '商品图片', linkId, media.name));
      d.setMaterialLibrary(old => ({ ...old, metadata: { ...old.metadata, [mediaId]: { ...old.metadata[mediaId], collection: true } } }));
      setDone(true); setError(''); d.setNotice('素材已关联到商品，并保留在素材库中。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '关联失败，请重试。'); }
  };
  const resource = media && <div className={s.resource}><Image src={media.type === 'video' ? media.poster || '/creative/video-previews/product-poster-v1.jpg' : media.url} alt={media.name} width={52} height={52} unoptimized/><div><strong>{media.name}</strong><span>{media.type === 'video' ? '视频' : '图片'}</span></div>{media.type === 'video' && <Video size={18}/>}</div>;
  return <MaterialModal title={done ? '关联成功' : '关联商品'} onClose={onClose} wide className={s.dialog}>
    {done ? <><div className={`${f.body} ${s.success}`}><CheckCircle2 size={34}/><h3>已关联到「{product ? productTitle(product) : '商品'}」</h3><p>{selectedSku ? `SKU ${skuCode(selectedSku)}` : '商品共用'} · {media?.name}</p>{resource}</div><FormDialogFooter><button className={f.secondaryButton} onClick={() => { setDone(false); setTarget(null); setExpanded(new Set()); setQuery(''); }}>继续关联其他商品</button><button className={f.primaryButton} disabled={!validTarget || unavailable} onClick={() => { if (product) { onOpenProduct(product.id, mediaId); onClose(); } }}>查看商品素材<ArrowUpRight size={15}/></button></FormDialogFooter></> : <>
      <div className={f.body}>{resource}<label className={s.search}><Search size={16}/><input aria-label="搜索关联商品" placeholder="输入商品标题、编码或 SKU 货号" autoFocus value={query} onChange={event => search(event.target.value)}/></label>
        <div className={s.resultHeading} aria-live="polite">{query.trim() ? `找到 ${suggestions.length} 个匹配商品，可展开选择 SKU` : '输入关键词后显示匹配商品，支持选择商品共用或单个 SKU'}</div>
        <div className={s.products} role="group" aria-label="关联目标搜索结果">
          {!query.trim() ? <div className={s.empty}><Search size={26}/><strong>输入关键词查找商品</strong><span>可按商品标题、商品编码或 SKU 货号搜索</span></div> : visible.map(({ product: p, matchedSkuIds }, index) => {
            const skus = p.skus.filter(sku => !sku.deleted_at), open = expanded.has(p.id), image = cover(p), panelId = `${prefix}-skus-${index}`;
            return <div key={p.id} className={s.productNode}>
              <div className={s.productRow}>
                <button className={s.expand} type="button" disabled={!skus.length} aria-expanded={open} aria-controls={panelId} aria-label={`${open ? '收起' : '展开'} ${productTitle(p)} 的 SKU`} onClick={() => setExpanded(old => { const next = new Set(old); if (open) next.delete(p.id); else next.add(p.id); return next; })}>{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</button>
                <label className={s.option} data-selected={target?.productId === p.id && !target.skuId}>
                  <input type="radio" name="material-product-target" aria-label={`关联商品 ${productTitle(p)}（商品共用）`} checked={target?.productId === p.id && !target.skuId} onChange={() => choose({ productId: p.id })}/>
                  {image ? <Image src={image} alt="" width={40} height={40} unoptimized/> : <span className={s.productPlaceholder}><Package size={19}/></span>}
                  <span className={s.optionText}><strong>{productTitle(p)}</strong><small>{productCode(p) || '—'} · {skus.length} 个 SKU{existing.some(link => link.productId === p.id) ? ' · 已有关联' : ''}</small></span><span className={s.scopeTag}>商品共用</span>
                </label>
              </div>
              {open && <div className={s.skus} id={panelId}>{skus.map(sku => <label key={sku.id} className={s.skuOption} data-selected={target?.productId === p.id && target.skuId === sku.id} data-matched={matchedSkuIds.includes(sku.id) || undefined}><input type="radio" name="material-product-target" aria-label={`关联 SKU ${skuCode(sku)}`} checked={target?.productId === p.id && target.skuId === sku.id} onChange={() => choose({ productId: p.id, skuId: sku.id })}/><span><strong>{skuCode(sku) || '—'}</strong><small>{skuSpec(sku) || '—'}</small></span></label>)}</div>}
            </div>;
          })}
          {query.trim() && !visible.length && <div className={s.empty}><Search size={26}/><strong>没有匹配的商品</strong><span>请调整商品标题、编码或 SKU 货号后重试</span>{!d.products.some(p => !p.deleted_at) && <button className={f.secondaryButton} onClick={() => { onOpenProduct(''); onClose(); }}>前往商品库</button>}</div>}
        </div>
        {suggestions.length > visible.length && <p className={s.resultHint}>仅显示前 20 个商品，请补充关键词缩小范围。</p>}
        {target && validTarget && <p className={s.selection} aria-live="polite">已选择：{productTitle(product!)} · {selectedSku ? `SKU ${skuCode(selectedSku)}` : '商品共用'}</p>}
        {unavailable && <p role="alert" className={s.error}>素材已不可用，请关闭后重新选择。</p>}{error && <p role="alert" className={s.error}>{error}</p>}
      </div><FormDialogFooter><button className={f.secondaryButton} onClick={onClose}>取消</button><button className={f.primaryButton} disabled={!validTarget || unavailable || !d.collectionReady} onClick={confirm}>确认关联</button></FormDialogFooter>
    </>}
  </MaterialModal>;
}
