"use client";
import Image from 'next/image';
import { Images, LoaderCircle } from 'lucide-react';
import { useCommerceDemo } from './CommerceDemoContext';
import { StudioButton as Button } from './StudioControls';
import { listingPublishedNotice, listingTaskPresentation, listingTaskRows, type ListingAgentContext, type ProductListingTask } from './product-listing';
import { skuCode, skuImageUrls, skuSpec } from './sku-fields';
import { productAssets } from './product-images';
import s from './product-listing.module.css';

export function ProductListingList({ tab, query, platform, onView, onPreview }: { tab: 'pending' | 'published'; query: string; platform: string; onView: (context: ListingAgentContext) => void; onPreview: (url: string, name: string) => void }) {
  const d = useCommerceDemo();
  const available = d.media.filter(media => !d.materialLibrary.metadata[media.id]?.deletedAt && !d.materialLibrary.metadata[media.id]?.purgedAt);
  const rows = listingTaskRows(d.productListing.tasks, d.products, tab, query, platform);
  const view = (task: ProductListingTask, code: string) => onView({ taskId: task.id, platform: task.platform, skuCode: code, shopName: task.shopName });
  if (!d.collectionReady) return <div className={s.empty}>正在读取刊登记录…</div>;
  return <>
    <div className={s.listHeading}><span>共 {rows.length} 条刊登记录</span>{tab === 'published' && <span>{listingPublishedNotice}</span>}</div>
    {rows.length ? <div className={s.scroll}><table className={s.table} aria-label={tab === 'pending' ? '待刊登 SKU 列表' : '已刊登 SKU 列表'}><thead><tr><th>SKU 货号</th><th>平台</th><th>目标店铺</th><th>{tab === 'pending' ? '状态' : '已刊登'}</th><th>操作</th></tr></thead><tbody>{rows.map(({ task, product, sku }) => {
      const cover = skuImageUrls(sku)[0] || productAssets(product.id, d.links, available, sku.id).find(item => item.media.type === 'image')?.media.url || product.main_image;
      const busy = ['preparing', 'publishing'].includes(task.status);
      const state = listingTaskPresentation(task.status);
      return <tr key={task.id}><td><div className={s.product}>{cover ? <Button className={s.thumb} aria-label={`预览图片 ${skuCode(sku)}`} onClick={() => onPreview(cover, skuCode(sku))}><Image src={cover} alt="" width={46} height={46} unoptimized/></Button> : <span className={s.thumb}><Images size={20}/></span>}<div><strong>{skuCode(sku)}</strong><small>{skuSpec(sku) || '—'}</small></div></div></td><td><span className={s.platform}>{task.platform || '—'}</span></td><td><div className={s.shop}><strong>{task.shopName}</strong><span>站点：{task.site || '—'}</span></div></td><td><div className={s.status} data-status={task.status === 'published' ? 'published' : undefined}><span><strong>{state.label}</strong></span>{tab === 'pending' && <small>{state.description}</small>}{task.receipt && <time dateTime={task.receipt.acceptedAt}>{new Date(task.receipt.acceptedAt).toLocaleString('zh-CN', { hour12: false })}</time>}</div></td><td><div className={s.rowActions}><Button onClick={() => view(task, skuCode(sku))}>去对话</Button>{task.status !== 'published' && <Button disabled={busy || task.status === 'prepare_failed'} aria-busy={task.status === 'publishing'} title={task.status === 'publishing' ? '正在刊登，请稍候' : task.status === 'prepare_failed' ? '请先在对话中重新准备刊登信息' : undefined} onClick={() => void d.productListing.publish(task.id)}>{task.status === 'publishing' && <LoaderCircle size={12} className={s.spin} aria-hidden="true"/>}直接刊登</Button>}</div></td></tr>;
    })}</tbody></table></div> : <div className={s.empty}><Images size={28}/><h3>{query || platform ? '没有匹配的刊登记录' : tab === 'pending' ? '暂无待刊登商品' : '暂无已刊登商品'}</h3><p>{query || platform ? '请调整平台或搜索条件。' : tab === 'pending' ? '认领商品到店铺后，会在这里准备刊登信息。' : '商品提交至平台后会显示在这里。'}</p></div>}

  </>;
}
