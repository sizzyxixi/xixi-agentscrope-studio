"use client";
import { useState } from 'react';
import { Plus, Store } from 'lucide-react';
import { FormDialog } from '@/components/hero-ui/form-dialog';
import { useCommerceDemo } from './CommerceDemoContext';
import { FieldLabel, StudioInput as Input, StudioSelect as Select, StudioButton as Button, StudioForm } from './StudioControls';
import { availableListingShops, listingCurrencies, shopPlatforms, type ListingShop } from './listing-shops';
import { uid } from './commerce-demo-data';
import s from './product-workspace.module.css';
export function ListingShopsDialog({ onClose }: { onClose: () => void }) {
  const d = useCommerceDemo();
  const shops = availableListingShops(d.listingShops, d.products);
  const fresh = (): ListingShop => ({ id: uid('shop'), name: '', platform: 'Amazon', site: '', currency: 'USD', active: true });
  const [draft, setDraft] = useState<ListingShop | null>(shops.length ? null : fresh);
  const [error, setError] = useState('');
  return <FormDialog title="目标店铺" onClose={onClose}><div className={s.shopDialogBody}><p className={s.bodyText}>管理准备刊登的店铺与市场，用于认领、整理资料和导出。店铺连接与平台发布状态以服务回执为准。</p>
    <div className={s.shopList}>{shops.map(shop => <div key={shop.id}><Store size={18}/><div><strong>{shop.name}</strong><small>{shop.platform} · {shop.site || '市场待设置'}{shop.currency ? ` · ${shop.currency}` : ''}{!shop.active ? ' · 已停用' : ''}</small></div><Button onClick={() => { setDraft({ ...shop }); setError(''); }}>编辑</Button></div>)}</div>
    {!draft && <Button onClick={() => setDraft(fresh())}><Plus size={14}/>添加店铺</Button>}
    {draft && <StudioForm onSubmit={event => { event.preventDefault(); if (!draft.name.trim() || !draft.site.trim()) { setError('请填写店铺名称和站点／市场。'); return; } if (shops.some(shop => shop.id !== draft.id && shop.name.trim() === draft.name.trim() && shop.platform === draft.platform && shop.site.toLowerCase() === draft.site.trim().toLowerCase())) { setError('该店铺和市场已存在。'); return; } const saved = { ...draft, name: draft.name.trim(), site: draft.site.trim() }; d.setListingShops(old => [...old.filter(shop => shop.id !== saved.id), saved]); d.setProducts(old => old.map(product => ({ ...product, listingClaims: product.listingClaims?.map(claim => claim.shopId === saved.id ? { ...claim, shopName: saved.name, site: saved.site } : claim) }))); setDraft(null); setError(''); d.setNotice('目标店铺已保存。'); }}><div className={s.formGrid}><FieldLabel>店铺名称<Input aria-label="店铺名称" required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></FieldLabel><FieldLabel>平台<Select value={draft.platform} onChange={e => setDraft({ ...draft, platform: e.target.value })}>{shopPlatforms.map(value => <option key={value}>{value}</option>)}</Select></FieldLabel><FieldLabel>站点／市场<Input aria-label="站点／市场" required placeholder="例如：美国站" value={draft.site} onChange={e => setDraft({ ...draft, site: e.target.value })}/></FieldLabel><FieldLabel>币种<Select value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value })}><option value="">未设置</option>{listingCurrencies.map(value => <option key={value}>{value}</option>)}</Select></FieldLabel><FieldLabel>状态<Select value={draft.active ? 'active' : 'inactive'} onChange={e => setDraft({ ...draft, active: e.target.value === 'active' })}><option value="active">可认领</option><option value="inactive">停用</option></Select></FieldLabel></div>{error && <p className={s.notice} role="alert">{error}</p>}<div className={s.modalFooter}><Button onClick={() => setDraft(null)}>取消编辑</Button><Button className={s.primary} type="submit">保存店铺</Button></div></StudioForm>}
  </div></FormDialog>;
}
