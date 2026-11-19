"use client";
import Image from 'next/image';
import { useState } from 'react';
import { ArrowLeft, ChevronDown, Images, Plus } from 'lucide-react';
import { useCommerceDemo } from './CommerceDemoContext';
import { DemoModal } from './CommercePanels';
import { StudioButton as Button } from './StudioControls';
import { uid, type Product, type Sku } from './commerce-demo-data';
import { productReferences } from './product-readiness';
import { productAssets } from './product-images';
import { productFieldValues, productTitle, productCode } from './product-fields';
import { skuCode, skuFieldValues, skuImageUrls, skuPrice, skuSpec } from './sku-fields';
import { removeProductSku, saveProductDraft } from './product-editor';
import { reconcileProductSkus } from './product-preparation';
import { ProductInformation, ProductInformationEditor } from './ProductInformation';
import { SkuArchiveInformation } from './SkuArchiveInformation';
import { SkuFieldsEditor } from './SkuFieldsEditor';
import { ProductMaterials } from './ProductMaterials';
import s from './product-workspace.module.css';
import e from './product-catalog-editing.module.css';
const tabs = ['基础资料', 'SKU 档案', '素材'];
const draftSkus = (product: Product) => product.skus.map(sku => ({ ...structuredClone(sku), ...skuFieldValues(sku) }));

export function ProductDetail({ product, initialSku, initialEditing = false, isNew = false, onBack, onSaved, onCreateVideo }: {
  product: Product; initialSku: string; initialEditing?: boolean; isNew?: boolean; onBack: () => void; onSaved: (product: Product) => void; onCreateVideo: (skuIds: string[]) => void;
}) {
  const d = useCommerceDemo();
  const [editing, setEditing] = useState(initialEditing || isNew);
  const [skus, setSkus] = useState<Sku[]>(() => draftSkus(product));
  const [fields, setFields] = useState(() => productFieldValues(product));
  const [baseline, setBaseline] = useState(() => JSON.stringify([productFieldValues(product), product.skus.map(skuFieldValues)]));
  const [error, setError] = useState('');
  const [pendingLeave, setPendingLeave] = useState<'back' | 'cancel' | null>(null);
  const tab = tabs.includes(d.productTab) ? d.productTab : '基础资料';
  const media = d.media.filter(item => !item.placeholder && item.url && !d.materialLibrary.metadata[item.id]?.deletedAt && !d.materialLibrary.metadata[item.id]?.purgedAt);
  const cover = product.main_image || productReferences(product, d.links, media)[0]?.url || productAssets(product.id, d.links, media).find(item => item.media.type === 'image')?.media.url;
  const dirty = editing && baseline !== JSON.stringify([fields, skus.map(skuFieldValues)]);
  const reset = () => { setSkus(draftSkus(product)); setFields(productFieldValues(product)); setBaseline(JSON.stringify([productFieldValues(product), product.skus.map(skuFieldValues)])); setError(''); };
  const cancel = () => { if (isNew) onBack(); else { reset(); setEditing(false); } };
  const leave = (action: 'back' | 'cancel') => { if (dirty) setPendingLeave(action); else if (action === 'back') onBack(); else cancel(); };
  const save = () => {
    if (!editing || !d.collectionReady) return;
    try {
      const current = d.products.find(item => item.id === product.id && !item.deleted_at);
      if (!isNew && !current) throw new Error('商品已不可用，请返回列表刷新。');
      let source = current || product;
      const removed = new Set(source.skus.filter(sku => !skus.some(item => item.id === sku.id)).map(sku => sku.id));
      for (const id of removed) source = removeProductSku(source, id, d.links).product;
      const saved = saveProductDraft(source, skus, fields, d.products, new Date().toISOString(), isNew);
      const reconciled = reconcileProductSkus(saved, d.links);
      d.setProducts(old => isNew ? [reconciled.product, ...old] : old.map(item => item.id === saved.id ? reconciled.product : item));
      d.setLinks(reconciled.links);
      d.setReferenceSkus(old => old.filter(id => !removed.has(id)));
      setSkus(draftSkus(saved)); setFields(productFieldValues(saved)); setBaseline(JSON.stringify([productFieldValues(saved), saved.skus.map(skuFieldValues)])); setEditing(false); setError('');
      onSaved(reconciled.product); d.setNotice('商品资料已保存。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请重试。'); }
  };
  return <>
    <Button className={s.back} onClick={() => leave('back')}><ArrowLeft size={15}/>商品库<span>/</span><span>{isNew ? '新建商品' : productTitle(product)}</span></Button>
    <header className={s.detailHeading}>{cover ? <Image src={cover} alt={productTitle(product)} width={76} height={76} unoptimized/> : <div className={s.detailImagePlaceholder}><Images size={24}/></div>}<div><h1>{isNew ? '新建商品' : productTitle(product)}</h1>{!isNew && <p>{product.brand_name || product.brand || '—'}<span>·</span>{productCode(product)}<span>·</span>{product.skus.length} 个 SKU</p>}</div>
      <div className={s.detailActions}>{editing ? <><Button onClick={() => leave('cancel')}>取消</Button><Button className={s.primary} type="submit" form="product-detail-form" disabled={!d.collectionReady}>保存</Button></> : <><Button onClick={() => { reset(); setEditing(true); if (tab === '素材') d.setProductTab('基础资料'); }}>编辑资料</Button></>}</div>
    </header>
    <nav className={s.tabs} aria-label="商品详情" role="tablist">{tabs.map((value, index) => <button type="button" key={value} id={`detail-tab-${value}`} role="tab" tabIndex={tab === value ? 0 : -1} disabled={isNew && value === '素材'} aria-selected={tab === value} aria-controls="product-detail-panel" onClick={() => d.setProductTab(value)} onKeyDown={event => {
      const options = isNew ? tabs.slice(0, 2) : tabs;
      const next = event.key === 'ArrowRight' ? (index + 1) % options.length : event.key === 'ArrowLeft' ? (index + options.length - 1) % options.length : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
      if (next < 0) return; event.preventDefault(); d.setProductTab(options[next]); document.getElementById(`detail-tab-${options[next]}`)?.focus();
    }}>{value}</button>)}</nav>
    {error && <p className={e.saveError} role="alert">{error}</p>}
    <form id="product-detail-form" noValidate onSubmit={event => { event.preventDefault(); save(); }}>
      <div id="product-detail-panel" role="tabpanel" aria-labelledby={`detail-tab-${tab}`}>
        {tab === '基础资料' && (editing ? <ProductInformationEditor product={product} values={fields} onChange={setFields}/> : <ProductInformation product={product}/>)}
        {tab === 'SKU 档案' && <SkuArchive product={product} skus={editing ? skus : product.skus} initialSku={initialSku} editing={editing} media={media} onChange={setSkus}/>}
        {tab === '素材' && !isNew && <ProductMaterials key={`${product.id}-${initialSku}-${d.productMaterialFocus?.key || ''}`} product={product} onCreateVideo={onCreateVideo} initialSku={d.productMaterialFocus ? '' : initialSku} initialMediaId={d.productMaterialFocus?.mediaId}/>}
      </div>
    </form>
    {pendingLeave && <DemoModal title="放弃未保存的修改？" onClose={() => setPendingLeave(null)}><p className={s.bodyText}>商品资料尚未保存，确认放弃本次修改？</p><div className={s.modalFooter}><Button onClick={() => setPendingLeave(null)}>继续编辑</Button><Button className={s.primary} onClick={() => { const action = pendingLeave; setPendingLeave(null); if (action === 'back') onBack(); else cancel(); }}>放弃修改</Button></div></DemoModal>}
  </>;
}

function SkuArchive({ product, skus, initialSku, editing, media, onChange }: { product: Product; skus: Sku[]; initialSku: string; editing: boolean; media: ReturnType<typeof useCommerceDemo>['media']; onChange: (skus: Sku[]) => void }) {
  const d = useCommerceDemo();
  const [expanded, setExpanded] = useState<Set<string>>(new Set([initialSku || skus[0]?.id].filter(Boolean)));
  const add = () => { const id = uid('sku'); onChange([...skus, { id, code: '', spec: '', color: '' }]); setExpanded(old => new Set([...old, id])); };
  return <div className={s.skuArchive}>{!skus.length && <p className={e.emptySkus}>暂无 SKU{editing ? '，可添加 SKU 后继续编辑。' : '。'}</p>}{skus.map((sku, index) => {
    const image = skuImageUrls(sku)[0] || productReferences(product, d.links, media, sku.id)[0]?.url || productAssets(product.id, d.links, media, sku.id).find(item => item.media.type === 'image')?.media.url;
    const open = expanded.has(sku.id);
    return <section className={s.skuAccordion} key={sku.id}>
      <h2><Button className={s.skuAccordionHeader} id={`sku-heading-${sku.id}`} aria-label={`${open ? '收起' : '展开'} SKU ${skuCode(sku) || index + 1}`} aria-expanded={open} aria-controls={`sku-panel-${sku.id}`} onClick={() => setExpanded(old => { const next = new Set(old); if (open) next.delete(sku.id); else next.add(sku.id); return next; })}>
        {image ? <Image src={image} alt={skuCode(sku)} width={52} height={52} unoptimized/> : <span className={s.skuImagePlaceholder}><Images size={20}/></span>}
        <span className={s.skuHeaderCode}>{skuCode(sku) || '新 SKU'}</span><span className={s.skuHeaderSpec}>{skuSpec(sku) || '—'}</span><span className={s.skuHeaderPrice}>价格<strong>{skuPrice(sku).trim() || '—'}</strong></span><ChevronDown size={17} className={open ? s.skuChevronOpen : ''}/>
      </Button></h2>
      <div id={`sku-panel-${sku.id}`} role="region" aria-labelledby={`sku-heading-${sku.id}`} hidden={!open} className={s.skuAccordionBody}>
        {editing ? <><SkuFieldsEditor sku={sku} index={index} onChange={next => onChange(skus.map(item => item.id === sku.id ? next : item))}/><Button className={e.textAction} onClick={() => onChange(skus.filter(item => item.id !== sku.id))}>移除此 SKU</Button></> : <SkuArchiveInformation sku={sku}/>}
      </div>
    </section>;
  })}{editing && <Button className={e.addSku} onClick={add}><Plus size={14}/>添加 SKU</Button>}</div>;
}
