"use client";

import { useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, CheckCircle2, Search, Video } from 'lucide-react';
import { MaterialModal } from './MaterialLibraryDialogs';
import { FormDialogFooter, formDialogClasses as f } from '@/components/hero-ui/form-dialog';
import { FieldLabel, StudioInput } from './StudioControls';
import { useCommerceDemo } from './CommerceDemoContext';
import { uid } from './commerce-demo-data';
import { skuCode, skuSpec } from './sku-fields';
import { associateMaterial } from './material-product-link';
import s from './material-product-link.module.css';

export function MaterialProductLinkDialog({ mediaId, onClose, onOpenProduct }: { mediaId: string; onClose: () => void; onOpenProduct: (id: string, mediaId?: string) => void }) {
  const d = useCommerceDemo();
  const [query, setQuery] = useState('');
  const [productId, setProductId] = useState('');
  const [common, setCommon] = useState(true);
  const [skuIds, setSkuIds] = useState<string[]>([]);
  const [name, setName] = useState(() => d.media.find(item => item.id === mediaId)?.name || '');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const product = d.products.find(p => p.id === productId);
  const media = d.media.find(item => item.id === mediaId);
  const unavailable = !media || media.placeholder || !media.url || !!d.materialLibrary.metadata[mediaId]?.deletedAt || !!d.materialLibrary.metadata[mediaId]?.purgedAt;
  const products = d.products.filter(p => `${p.name} ${p.id} ${p.code} ${p.externalId || ''} ${p.skus.map(sku => skuCode(sku)).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  const existing = d.links.filter(link => link.mediaId === mediaId && link.status !== '已归档');
  const confirm = () => {
    if (!product || unavailable || !media || !d.collectionReady) { setError('商品或素材已不可用，请重新选择。'); return; }
    if (!name.trim()) { setError('请填写素材名称。'); return; }
    if (!common && !skuIds.length) { setError('请至少选择一个 SKU。'); return; }
    try {
      const scope = common ? [] : skuIds;
      // Validate current data before queuing the state update, then merge against latest links.
      associateMaterial(d.links, product, media, scope, media.type === 'video' ? '商品视频' : '商品图片', 'validate', name);
      const linkId = uid('link');
      d.setLinks(old => associateMaterial(old, product, media, scope, media.type === 'video' ? '商品视频' : '商品图片', linkId, name));
      d.setMaterialLibrary(old => ({ ...old, metadata: { ...old.metadata, [mediaId]: { ...old.metadata[mediaId], collection: true } } }));
      setDone(true); setError(''); d.setNotice('素材已关联到商品，并保留在素材库中。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '关联失败，请重试。'); }
  };
  const resource = media && <div className={s.resource}><Image src={media.type === 'video' ? media.poster || '/creative/video-previews/product-poster-v1.jpg' : media.url} alt={media.name} width={68} height={68} unoptimized/><div><strong>{media.name}</strong><span>{media.type === 'video' ? '视频' : '图片'}</span></div>{media.type === 'video' && <Video size={18}/>}</div>;
  return <MaterialModal title={done ? '关联成功' : '关联商品'} onClose={onClose} wide>
    {done ? <><div className={`${f.body} ${s.success}`}><CheckCircle2 size={34}/><h3>已关联到「{product?.name || '商品'}」</h3><p>{common ? '商品共用 · 全部 SKU' : `所选 ${skuIds.length} 个 SKU`} · {name}</p>{resource}</div><FormDialogFooter><button className={f.secondaryButton} onClick={() => { setDone(false); setProductId(''); setSkuIds([]); setQuery(''); }}>继续关联其他商品</button><button className={f.primaryButton} disabled={!product || unavailable} onClick={() => { if (product) { onOpenProduct(product.id, mediaId); onClose(); } }}>查看商品素材<ArrowUpRight size={15}/></button></FormDialogFooter></> : <>
      <div className={f.body}>{resource}<label className={s.search}><Search size={16}/><input aria-label="搜索关联商品" placeholder="搜索商品名称、ID、编码或 SKU" value={query} onChange={e => { setQuery(e.target.value); setProductId(''); setSkuIds([]); setCommon(true); setError(''); }}/></label>
        <div className={s.products} role="group" aria-label="选择关联商品">{products.map(p => <label key={p.id} className={s.product} data-selected={p.id === productId}><input type="radio" name="material-product" aria-label={`关联到 ${p.name}`} checked={p.id === productId} onChange={() => { setProductId(p.id); setSkuIds([]); setCommon(true); setError(''); }}/><span><strong>{p.name}</strong><small>{p.externalId || p.code} · {p.skus.length} 个 SKU{existing.some(link => link.productId === p.id) ? ' · 已有关联' : ''}</small></span></label>)}{!products.length && <p className={s.empty}>{query ? '没有匹配的商品，请调整关键词。' : <>暂无可关联的商品，请先在商品库导入商品。<button className={f.secondaryButton} onClick={() => { onOpenProduct(''); onClose(); }}>前往商品库</button></>}</p>}</div>
        {product && <div className={s.scope}><h3>适用范围</h3><label><input type="radio" name="material-scope" checked={common} onChange={() => { setCommon(true); setError(''); }}/>商品共用（全部 SKU）</label><label><input type="radio" name="material-scope" checked={!common} onChange={() => { setCommon(false); setError(''); }}/>指定 SKU</label>{!common && <div className={s.skus}>{product.skus.map(sku => <label key={sku.id}><input type="checkbox" aria-label={`关联 SKU ${skuCode(sku)}`} checked={skuIds.includes(sku.id)} onChange={e => { setSkuIds(old => e.target.checked ? [...old, sku.id] : old.filter(id => id !== sku.id)); setError(''); }}/><span>{skuCode(sku)}<small>{skuSpec(sku)}</small></span></label>)}{!product.skus.length && <p className={s.empty}>该商品暂无 SKU，可选择商品共用或先补充 SKU。</p>}</div>}</div>}
        <FieldLabel className={s.field}>素材名称<StudioInput aria-label="关联素材名称" required maxLength={150} value={name} onChange={e => setName(e.target.value)}/></FieldLabel>
        {unavailable && <p role="alert" className={s.error}>素材已不可用，请关闭后重新选择。</p>}{error && <p role="alert" className={s.error}>{error}</p>}
      </div><FormDialogFooter><button className={f.secondaryButton} onClick={onClose}>取消</button><button className={f.primaryButton} disabled={!name.trim() || !product || unavailable || !common && !skuIds.length || !d.collectionReady} onClick={confirm}>确认关联</button></FormDialogFooter>
    </>}
  </MaterialModal>;
}
