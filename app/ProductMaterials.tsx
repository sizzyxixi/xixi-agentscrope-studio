"use client";

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Images, Plus, Upload, Video, X } from 'lucide-react';
import { FormDialog, FormDialogFooter, formDialogClasses as f } from '@/components/hero-ui/form-dialog';
import { useCommerceDemo } from './CommerceDemoContext';
import { FieldLabel, StudioButton as Button, StudioForm, StudioInput as Input, StudioSelect as Select } from './StudioControls';
import { uid, type Product } from './commerce-demo-data';
import { skuCode, skuSpec } from './sku-fields';
import { associateMaterial } from './material-product-link';
import { productMaterialGroups, type ProductMaterialItem, type ProductMaterialKind } from './product-images';
import { readMaterialUploads, selectMaterialFiles, type MaterialUpload } from './product-material-upload';
import s from './product-materials.module.css';

const typeNames = { all: '全部', image: '图片', video: '视频' };

export function ProductMaterials({ product, initialSku, initialMediaId }: { product: Product; initialSku: string; initialMediaId?: string }) {
  const d = useCommerceDemo();
  const [kind, setKind] = useState<ProductMaterialKind>(() => d.media.find(item => item.id === initialMediaId)?.type === 'video' ? 'video' : 'all');
  const [scope, setScope] = useState(product.skus.some(sku => sku.id === initialSku) ? `sku:${initialSku}` : 'all');
  const [adding, setAdding] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProductMaterialItem | null>(null);
  const focus = useRef<HTMLElement>(null);
  const media = d.media.filter(item => !d.materialLibrary.metadata[item.id]?.deletedAt && !d.materialLibrary.metadata[item.id]?.purgedAt);
  const availableGroups = productMaterialGroups(product, d.links, media);
  const activeScope = availableGroups.some(group => group.id === scope) ? scope : 'all';
  const groups = productMaterialGroups(product, d.links, media, kind, activeScope);
  const focusedGroup = groups.find(group => group.items.some(item => item.media.id === initialMediaId))?.id;
  useEffect(() => { if (initialMediaId) focus.current?.scrollIntoView({ block: 'center' }); }, [initialMediaId]);
  return <>
    <div className={s.toolbar}>
      <div className={s.types} role="group" aria-label="素材类型">{(['all', 'image', 'video'] as const).map(value => <Button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{typeNames[value]}</Button>)}</div>
      <div className={s.actions}><Select aria-label="查看素材分组" value={activeScope} onChange={event => setScope(event.target.value)}><option value="all">查看全部</option>{availableGroups.map(group => <option key={group.id} value={group.id}>{group.skuId ? skuCode(product.skus.find(sku => sku.id === group.skuId)!) : 'SPU 共用'}</option>)}</Select><Button className={s.primary} disabled={!d.collectionReady} onClick={() => setAdding(activeScope === 'all' ? 'spu' : activeScope)}><Plus size={15}/>添加素材</Button></div>
    </div>
    <div className={s.groups}>{groups.map(group => {
      const sku = product.skus.find(sku => sku.id === group.skuId);
      const heading = sku ? `SKU ${skuCode(sku)}` : 'SPU 共用';
      return <section key={group.id} className={s.section} aria-label={`${heading}素材`}>
        <header className={s.groupHeader}><div><h3>{heading}</h3>{sku && <span>{skuSpec(sku)}</span>}</div><Button className={s.addGroup} aria-label={`为${heading}添加素材`} disabled={!d.collectionReady} onClick={() => setAdding(group.id)}><Plus size={14}/>添加素材</Button></header>
        {group.items.length ? <div className={s.grid}>{group.items.map(item => <article key={item.media.id} className={s.card} ref={group.id === focusedGroup && item.media.id === initialMediaId ? focus : undefined} data-highlighted={item.media.id === initialMediaId || undefined}>
          <Button className={s.thumbnail} aria-label={`预览${item.name}`} onClick={() => setPreview(item)}>{item.media.type === 'video' && !item.media.poster ? <span className={s.placeholder}><Video size={30}/></span> : <Image src={item.media.type === 'video' ? item.media.poster! : item.media.url} alt={item.name} width={360} height={300} unoptimized/>}{item.media.type === 'video' && <span className={s.play}><Video size={21}/></span>}</Button>
          <strong className={s.name} title={item.name}>{item.name}</strong>
        </article>)}</div> : <p className={s.empty}>暂无{kind === 'all' ? '素材' : typeNames[kind]}</p>}
      </section>;
    })}{!groups.length && <p className={s.empty}>暂无{kind === 'all' ? '素材' : typeNames[kind]}</p>}</div>
    {adding && <AddProductMaterialDialog product={product} initialScope={adding} onClose={() => setAdding(null)} onAdded={() => { setScope('all'); setKind('all'); setAdding(null); }}/>}
    {preview && <FormDialog title={preview.name} onClose={() => setPreview(null)} wide><div className={s.preview}>{preview.media.type === 'video' ? <video src={preview.media.url} poster={preview.media.poster} controls playsInline/> : <Image src={preview.media.url} alt={preview.name} width={960} height={720} unoptimized/>}</div></FormDialog>}
  </>;
}

function AddProductMaterialDialog({ product, initialScope, onClose, onAdded }: { product: Product; initialScope: string; onClose: () => void; onAdded: (scope: string) => void }) {
  const d = useCommerceDemo();
  const [scope, setScope] = useState(initialScope);
  const [uploads, setUploads] = useState<MaterialUpload[]>([]);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);

  function choose(files: File[]) {
    const { accepted, errors } = selectMaterialFiles(files, uploads);
    const additions = accepted.map(file => {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return { id: uid('media'), file, name: file.name.slice(0, 150), previewUrl };
    });
    setUploads(old => [...old, ...additions]);
    setError(errors.join('\n'));
  }
  function remove(item: MaterialUpload) {
    URL.revokeObjectURL(item.previewUrl); previewUrls.current.delete(item.previewUrl);
    setUploads(old => old.filter(upload => upload.id !== item.id));
  }
  async function save() {
    if (saving || !uploads.length || !d.collectionReady) return;
    setSaving(true); setError('');
    try {
      const items = await readMaterialUploads(uploads, file => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reader.onabort = () => reject(new Error(`${file.name}：文件读取失败，请重新选择。`));
        reader.readAsDataURL(file);
      }));
      const skuIds = scope === 'spu' ? [] : [scope.slice(4)];
      const additions = items.map(item => ({ item, linkId: uid('link') }));
      const linkItems = (links: typeof d.links) => additions.reduce((next, { item, linkId }) => associateMaterial(next, product, item, skuIds, item.type === 'video' ? '商品视频' : '商品图片', linkId, item.name), links);
      linkItems(d.links);
      d.setMedia(old => [...items, ...old]);
      d.setLinks(linkItems);
      d.setMaterialLibrary(old => ({ ...old, metadata: { ...old.metadata, ...Object.fromEntries(items.map(item => [item.id, { ...old.metadata[item.id], collection: true }])) } }));
      d.setNotice(`已添加 ${items.length} 个素材。`); onAdded(scope);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '添加失败，请重试。'); setSaving(false); }
  }
  return <FormDialog title="添加素材" onClose={onClose} busy={saving} className={s.addDialog}>
    <StudioForm id="add-product-material" onSubmit={event => { event.preventDefault(); void save(); }} className={`${f.body} ${s.form}`}>
      <FieldLabel className={s.scopeField}>所属分组<Select aria-label="素材所属分组" disabled={saving} value={scope} onChange={event => setScope(event.target.value)}><option value="spu">SPU 共用</option>{product.skus.map(sku => <option key={sku.id} value={`sku:${sku.id}`}>{skuCode(sku)} · {skuSpec(sku)}</option>)}</Select></FieldLabel>
      <div className={s.assetField}>
        <div className={s.uploadHeader}><span>图片 / 视频</span>{!!uploads.length && <Button disabled={saving} onClick={() => input.current?.click()}><Plus size={14}/>继续添加</Button>}</div>
        <p className={s.uploadHint}>支持一次选择多个文件，也可逐次补充；每个文件不超过 20MB。名称可分别修改。</p>
        {uploads.length ? <div className={s.uploadGrid}>{uploads.map((item, index) => <div key={item.id} className={s.uploadCard}>
          <div className={s.chosen}>{item.file.type.startsWith('video/') ? <video src={item.previewUrl} controls playsInline aria-label={item.name}/> : <Image src={item.previewUrl} alt={item.name} width={320} height={240} unoptimized/>}<Button aria-label={`移除素材 ${index + 1}`} disabled={saving} onClick={() => remove(item)}><X size={14}/></Button></div>
          <FieldLabel>名称<Input aria-label={`素材 ${index + 1} 名称`} required maxLength={150} disabled={saving} value={item.name} placeholder="填写素材名称" onChange={event => setUploads(old => old.map(upload => upload.id === item.id ? { ...upload, name: event.target.value } : upload))}/></FieldLabel>
        </div>)}</div> : <Button className={s.uploadPlaceholder} disabled={saving} onClick={() => input.current?.click()}><Images size={28}/><span><Upload size={14}/>上传图片或视频</span></Button>}
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}
    </StudioForm>
    <input ref={input} hidden aria-label="上传商品素材" type="file" accept="image/*,video/*" multiple disabled={saving} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) choose(files); }}/>
    <FormDialogFooter><Button disabled={saving} onClick={onClose}>取消</Button><Button form="add-product-material" type="submit" className={s.primary} disabled={!uploads.length || uploads.some(item => !item.name.trim()) || saving || !d.collectionReady}>{saving ? '正在添加…' : '确认添加'}</Button></FormDialogFooter>
  </FormDialog>;
}
