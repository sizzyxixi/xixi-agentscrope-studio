"use client";
import { useState } from 'react';
import Image from 'next/image';
import { Download, CheckCircle2, CircleAlert, Video } from 'lucide-react';
import { DemoModal } from './CommercePanels';
import { FormDialog, FormDialogFooter } from '@/components/hero-ui/form-dialog';
import { useCommerceDemo } from './CommerceDemoContext';
import { FieldLabel, StudioInput as Input, StudioTextarea as Textarea, StudioSelect as Select, StudioButton as Button } from './StudioControls';
import { productDescription, productTitle } from './product-fields';
import { type Product } from './commerce-demo-data';
import { availableListingShops, listingCurrencies } from './listing-shops';
import { skuCode, skuSpec } from './sku-fields';
import { claimSkuIds } from './product-management';
import { createListingPackage, listingDraftIssues, listingAssets, type ListingDraft } from './listing-preparation';
import s from './product-workspace.module.css';
export function ListingPreparationDialog({ productId, onClose }: { productId: string; onClose: () => void }) {
  const d = useCommerceDemo();
  const product = d.products.find(p => p.id === productId);
  const shops = availableListingShops(d.listingShops, d.products).filter(shop => product?.listingClaims?.some(claim => claim.shopId === shop.id));
  const media = d.media.filter(item => !item.placeholder && item.url && !d.materialLibrary.metadata[item.id]?.deletedAt && !d.materialLibrary.metadata[item.id]?.purgedAt);
  const initial = (p: Product, shopId: string): ListingDraft => {
    const claim = p.listingClaims?.find(item => item.shopId === shopId);
    const skuIds = claim ? claimSkuIds(p, claim) : [];
    const saved = p.listingDrafts?.find(item => item.shopId === shopId);
    const ids = saved ? saved.skuIds.filter(id => skuIds.includes(id)) : skuIds;
    const candidates = listingAssets(p.id, d.links, media, ids);
    return { shopId, title: saved?.title ?? productTitle(p), description: saved?.description ?? productDescription(p), language: saved?.language || '', currency: saved?.currency || shops.find(shop => shop.id === shopId)?.currency || '', prices: saved?.prices || Object.fromEntries(p.skus.map(sku => [sku.id, ''])), skuIds: ids, mediaIds: saved ? saved.mediaIds : candidates.map(item => item.media.id), updatedAt: saved?.updatedAt || '', exportedAt: saved?.exportedAt };
  };
  const [draft, setDraft] = useState(() => product ? initial(product, shops[0]?.id || '') : null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(() => !!product?.listingDrafts?.some(item => item.shopId === shops[0]?.id));
  if (!product || !draft) return <DemoModal title="刊登资料" onClose={onClose}><p>该商品已不可用。</p></DemoModal>;
  const shop = shops.find(item => item.id === draft.shopId);
  const claim = product.listingClaims?.find(item => item.shopId === draft.shopId);
  const allowed = claim ? claimSkuIds(product, claim) : [];
  const candidates = listingAssets(product.id, d.links, media, draft.skuIds);
  const validMediaIds = new Set(candidates.map(item => item.media.id));
  const issues = listingDraftIssues(product, draft, d.links, media.filter(item => validMediaIds.has(item.id)));
  const change = (next: ListingDraft) => { setDraft({ ...next, exportedAt: undefined }); setSaved(false); setError(''); };
  const persist = (value: ListingDraft) => { const next = { ...value, updatedAt: new Date().toISOString() }; d.setProducts(old => old.map(p => p.id === product.id ? { ...p, listingDrafts: [...(p.listingDrafts || []).filter(item => item.shopId !== next.shopId), next] } : p)); return next; };
  const save = () => { const next = persist(draft); setSaved(true); return next; };
  const close = () => { if (busy) return; if (!saved) persist(draft); onClose(); };
  return <FormDialog title="准备刊登资料" onClose={close} busy={busy} wide className={s.listingFrame}><div className={s.listingBody}>
    <div className={s.listingTarget}><div><strong>{product.name}</strong><span>{product.code} · {draft.skuIds.length} 个 SKU</span></div><FieldLabel>目标店铺<Select value={draft.shopId} disabled={busy} aria-label="刊登目标店铺" onChange={e => { if (!saved) persist(draft); const id = e.target.value; setDraft(initial(product, id)); setSaved(!!product.listingDrafts?.some(item => item.shopId === id)); setError(''); }}>{shops.map(item => <option key={item.id} value={item.id}>{item.name} · {item.site}</option>)}</Select></FieldLabel></div>
    <div className={s.preparationNotice} data-ready={!issues.length}>{issues.length ? <CircleAlert size={18}/> : <CheckCircle2 size={18}/>}<div><strong>{issues.length ? `还有 ${issues.length} 项资料待补充` : '刊登资料已备齐'}</strong><p>{issues.length ? issues.slice(0, 5).join('、') + (issues.length > 5 ? '等' : '') : '导出后可交付对应店铺，平台属性与审核要求请在刊登时核对。'}</p></div></div>
    <div className={s.preparationLinks}><Button className={s.treeLink} disabled={busy} onClick={() => { close(); d.setActiveProduct(product.id); d.setProductTab('SKU 档案'); }}>完善 SKU 档案</Button><Button className={s.treeLink} disabled={busy} onClick={() => { close(); d.setActiveProduct(product.id); d.setProductTab('素材'); }}>准备商品素材</Button></div>
    <div className={s.formGrid}><FieldLabel>内容语言<Select aria-label="内容语言" value={draft.language} disabled={busy} onChange={e => change({ ...draft, language: e.target.value })}><option value="">请选择文案语言</option>{['英语', '中文', '德语', '法语', '日语', '西班牙语'].map(value => <option key={value}>{value}</option>)}</Select></FieldLabel><FieldLabel>价格币种<Select aria-label="价格币种" value={draft.currency} disabled={busy} onChange={e => change({ ...draft, currency: e.target.value })}><option value="">请选择币种</option>{listingCurrencies.map(value => <option key={value}>{value}</option>)}</Select></FieldLabel></div>
    <div className={s.formStack}><FieldLabel>刊登标题<Input aria-label="刊登标题" value={draft.title} disabled={busy} maxLength={500} onChange={e => change({ ...draft, title: e.target.value })}/></FieldLabel><FieldLabel>商品描述<Textarea aria-label="商品描述" rows={4} value={draft.description} disabled={busy} onChange={e => change({ ...draft, description: e.target.value })}/></FieldLabel></div>
    <h3>本次刊登 SKU</h3><div className={s.listingSkus}>{product.skus.filter(sku => allowed.includes(sku.id)).map(sku => <div key={sku.id}><label><input type="checkbox" disabled={busy} checked={draft.skuIds.includes(sku.id)} onChange={e => { const ids = e.target.checked ? [...draft.skuIds, sku.id] : draft.skuIds.filter(id => id !== sku.id); const valid = new Set(listingAssets(product.id, d.links, media, ids).map(item => item.media.id)); change({ ...draft, skuIds: ids, mediaIds: draft.mediaIds.filter(id => valid.has(id)) }); }}/><span><strong>{skuCode(sku)}</strong><small>{skuSpec(sku)}</small></span></label><FieldLabel>刊登价格<Input type="number" min="0" step="0.01" disabled={busy || !draft.skuIds.includes(sku.id)} aria-label={`${skuCode(sku)} 刊登价格`} value={draft.prices[sku.id] || ''} onChange={e => change({ ...draft, prices: { ...draft.prices, [sku.id]: e.target.value } })}/></FieldLabel></div>)}</div>
    <div className={s.sectionTitle}><h3>选用图片与视频</h3><span className={s.muted}>{draft.mediaIds.length} 份</span></div><div className={s.listingAssets}>{candidates.map(item => <button key={item.media.id} disabled={busy} aria-pressed={draft.mediaIds.includes(item.media.id)} onClick={() => change({ ...draft, mediaIds: draft.mediaIds.includes(item.media.id) ? draft.mediaIds.filter(id => id !== item.media.id) : [...draft.mediaIds, item.media.id] })}>{item.media.type === 'video' && !item.media.poster ? <span className={s.videoPlaceholder}><Video size={26}/></span> : <Image src={item.media.type === 'video' ? item.media.poster! : item.media.url} width={120} height={90} alt={item.name} unoptimized/>}<span>{item.name}</span>{item.media.type === 'video' && <Video size={14}/>}</button>)}</div>{draft.mediaIds.some(id => !validMediaIds.has(id)) && <p className={s.notice}>部分已选素材不再适用或已删除。<Button disabled={busy} onClick={() => change({ ...draft, mediaIds: draft.mediaIds.filter(id => validMediaIds.has(id)) })}>移除失效素材</Button></p>}{!candidates.length && <p className={s.bodyText}>暂无适用素材。可保存草稿，返回商品的「素材」中上传或关联图片与视频。</p>}
    <p className={s.bodyText}>请填写对应语言的标题和描述。商品库价格不会自动作为刊登价。草稿按店铺独立保存，关闭窗口或切换店铺时会自动保存修改。导出包含文案、SKU、币种、价格和所选素材原文件；缺口会写入资料清单。导出不会自动上架商品。</p>{error && <p className={s.notice} role="alert">{error}</p>}
    </div><FormDialogFooter className={s.listingFooter}><span>{saved ? draft.exportedAt ? '资料已导出 · 未提交平台' : '草稿已保存' : '关闭时自动保存草稿'}</span><Button disabled={busy || !draft.skuIds.length || !draft.title.trim()} onClick={save}>保存草稿</Button><Button className={s.primary} disabled={busy || !shop || !draft.skuIds.length} onClick={async () => { if (!shop) return; setBusy(true); setError(''); try { const next = save(); const file = await createListingPackage(product, next, shop, d.links, media.filter(item => validMediaIds.has(item.id))); const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = `${product.code}-${shop.platform}-刊登资料.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); const exported = { ...next, exportedAt: new Date().toISOString() }; persist(exported); setDraft(exported); setSaved(true); d.setNotice('刊登资料已导出，尚未提交平台。'); } catch (cause) { setError(cause instanceof Error ? cause.message : '导出失败，请重试。'); } finally { setBusy(false); } }}>{busy ? '正在打包原文件…' : <><Download size={14}/>导出刊登资料</>}</Button></FormDialogFooter></FormDialog>;
}
