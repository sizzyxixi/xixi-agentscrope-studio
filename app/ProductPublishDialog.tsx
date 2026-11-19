"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LoaderCircle, Search, ShoppingBag, Store } from 'lucide-react';
import { FormDialog, FormDialogFooter } from '@/components/hero-ui/form-dialog';
import { consoleApi } from '@/lib/console-api';
import { useCommerceDemo } from './CommerceDemoContext';
import { FieldLabel, StudioButton as Button, StudioInput as Input, StudioSelect as Select } from './StudioControls';
import { authorizedClaimPlatforms, claimShopPage, claimShopsFromResources, filteredClaimShops, resolveClaimScopes, type ClaimScope, type ClaimShop, type ShopResource } from './product-claim';
import { createClaimShopMocks } from './product-claim-mocks';
import s from './product-claim.module.css';

export function ProductPublishDialog({ scopes, token, useMockShops = false, onClose, onConfirm }: { scopes: ClaimScope[]; token: string; useMockShops?: boolean; onClose: () => void; onConfirm: (shop: ClaimShop) => void }) {
  const d = useCommerceDemo();
  const [platform, setPlatform] = useState(''), [query, setQuery] = useState('');
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(6);
  const [selected, setSelected] = useState(''), [shops, setShops] = useState<ClaimShop[]>(() => useMockShops ? createClaimShopMocks() : []);
  const [loading, setLoading] = useState(!!token && !useMockShops), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [submitError, setSubmitError] = useState('');
  useEffect(() => {
    if (useMockShops || !token) return;
    const abort = new AbortController();
    void consoleApi<{ resources: ShopResource[] }>(token, 'resources?kind=shop', 'GET', undefined, abort.signal)
      .then(result => { if (!abort.signal.aborted) { setShops(claimShopsFromResources(result.resources)); setError(''); setLoading(false); } })
      .catch(cause => { if (!abort.signal.aborted) { setError(cause instanceof Error ? cause.message : '店铺读取失败，请重试。'); setLoading(false); } });
    return () => abort.abort();
  }, [token, revision, useMockShops]);
  const resolved = resolveClaimScopes(d.products, scopes), skuCount = resolved.reduce((count, item) => count + item.skuIds.length, 0);
  const platforms = authorizedClaimPlatforms(shops), activePlatform = platforms.includes(platform) ? platform : '';
  const visible = filteredClaimShops(shops, activePlatform, query), view = claimShopPage(shops, activePlatform, query, page, pageSize);
  const target = filteredClaimShops(shops, '').find(shop => shop.id === selected);
  const retry = () => { setLoading(true); setError(''); setSelected(''); setPage(1); setRevision(value => value + 1); };
  return <FormDialog title="刊登商品" onClose={onClose} wide className={s.dialog}>
    <div className={s.body}>
      <div className={s.summary}><span className={s.summaryIcon}><ShoppingBag size={23}/></span><div><p>已选择 <strong>{resolved.length}</strong> 个商品 / <strong>{skuCount}</strong> 个 SKU</p><small>选择一家店铺，带入商品到经营中心继续刊登。</small></div></div>
      {!!platforms.length && <div className={s.filters}>
        <FieldLabel className={s.platform}>平台<Select aria-label="刊登平台" value={activePlatform} disabled={loading} onChange={event => { setPlatform(event.target.value); setPage(1); setSubmitError(''); }}><option value="">全部</option>{platforms.map(value => <option key={value} value={value}>{value}</option>)}</Select></FieldLabel>
        <div className={s.search}><Search size={14}/><Input aria-label="搜索店铺名称" placeholder="搜索店铺名称" value={query} disabled={loading} onChange={event => { setQuery(event.target.value); setPage(1); }}/>{query && <Button aria-label="清空店铺搜索" onClick={() => { setQuery(''); setPage(1); }}>清空</Button>}</div>
      </div>}
      {!!platforms.length && <div className={s.listHeading}><div><strong>选择店铺</strong>{!loading && !error && <span>共 {view.total} 家 · 单选</span>}</div></div>}
      <div className={s.shopArea} aria-busy={loading}>
        {loading ? <div className={s.empty} role="status"><LoaderCircle size={25} className={s.spinner}/><p>正在读取已授权店铺…</p></div> : error ? <div className={s.empty} role="alert"><Store size={29}/><p>店铺读取失败</p><small>{error}</small><Button onClick={retry}>重新加载</Button></div> : !platforms.length ? <div className={s.empty}><span className={s.emptyIcon}><Store size={30}/></span><h3>暂无已授权店铺</h3><p>请先授权店铺，再刊登商品。</p><Link href="/shops" className={s.manage}>去授权店铺<small> →</small></Link></div> : !visible.length ? <div className={s.empty}><Search size={26}/><h3>没有匹配的店铺</h3><Button onClick={() => { setQuery(''); setPage(1); }}>清空搜索</Button></div> : <div className={s.shopGrid} role="radiogroup" aria-label="选择刊登店铺">{view.items.map(shop => <label key={shop.id} className={s.shopCard} data-selected={target?.id === shop.id || undefined}><input type="radio" name="publication-shop" aria-label={`选择店铺 ${shop.platform} ${shop.name} ${shop.site}`} checked={target?.id === shop.id} onChange={() => { setSelected(shop.id); setSubmitError(''); }}/><span className={s.shopIcon}><Store size={19}/></span><span className={s.shopCopy}><strong title={shop.name}>{shop.name}</strong><small>{shop.platform} · 站点：{shop.site || '未提供站点'}</small></span></label>)}</div>}
      </div>
      {!loading && !error && !!view.total && <div className={s.pagination} aria-label="店铺分页"><span>共 {view.total} 家</span><div><Select aria-label="每页店铺数量" value={String(pageSize)} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[6, 12, 24].map(size => <option key={size} value={size}>{size} 家 / 页</option>)}</Select><Button disabled={view.page === 1} onClick={() => setPage(view.page - 1)}>上一页</Button><span aria-live="polite">{view.page} / {view.pageCount}</span><Button disabled={view.page === view.pageCount} onClick={() => setPage(view.page + 1)}>下一页</Button></div></div>}
      {submitError && <p className={s.error} role="alert">{submitError}</p>}
      {!resolved.length && <p className={s.error} role="alert">所选商品或 SKU 已不可用，请返回列表重新选择。</p>}
    </div>
    <FormDialogFooter className={s.footer}><span aria-live="polite">{target ? `已选：${target.name} · ${target.site}` : '请选择一家目标店铺'}</span>{target && <Button className={s.clearSelection} onClick={() => setSelected('')}>取消选择</Button>}<Button onClick={onClose}>取消</Button><Button className={s.primary} disabled={loading || !!error || !resolved.length || !target || !d.collectionReady} onClick={() => { if (!target) return; try { onConfirm(target); } catch (cause) { setSubmitError(cause instanceof Error ? cause.message : '无法前往经营中心，请重试。'); } }}>前往经营中心</Button></FormDialogFooter>
  </FormDialog>;
}
