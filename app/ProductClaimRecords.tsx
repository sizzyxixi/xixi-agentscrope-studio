"use client";
import { FormDialog, FormDialogFooter } from '@/components/hero-ui/form-dialog';
import { StudioButton as Button } from './StudioControls';
import { useCommerceDemo } from './CommerceDemoContext';
import { skuClaimRecords } from './product-claim-records';
import type { ListingAgentContext } from './product-listing';
import { skuCode } from './sku-fields';
import s from './product-catalog-editing.module.css';

export function ProductClaimRecords({ productId, skuId, onClose, onOpenDraft }: { productId: string; skuId: string; onClose: () => void; onOpenDraft: (context: ListingAgentContext) => void }) {
  const d = useCommerceDemo();
  const product = d.products.find(product => product.id === productId && !product.deleted_at);
  const sku = product?.skus.find(sku => sku.id === skuId && !sku.deleted_at);
  const records = product ? skuClaimRecords(product, skuId, d.listingShops, d.productListing.tasks) : [];
  const date = (value: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
  return <FormDialog title="认领记录" description={sku ? skuCode(sku) : undefined} onClose={onClose} wide className={s.claimDialog}>
    <div className={s.claimBody}><Button className={s.refresh} onClick={() => d.setNotice('认领记录已刷新。')}>刷新记录</Button>
      <div className={s.claimScroll}><table className={s.claimTable} aria-label="SKU 认领记录"><thead><tr><th>平台</th><th>店铺</th><th>SKU ID</th><th>草稿关联</th><th>认领时间</th></tr></thead><tbody>{records.length ? records.map(record => <tr key={record.id}><td>{record.platform || '—'}</td><td>{record.shopName || '—'}{record.site && <small>站点：{record.site}</small>}</td><td>{record.skuId || '—'}</td><td>{record.draft ? <Button className={s.textAction} onClick={() => { onClose(); onOpenDraft(record.draft!); }}>查看草稿</Button> : '—'}</td><td>{date(record.claimedAt)}</td></tr>) : <tr><td className={s.emptyRecords} colSpan={5}>暂无数据</td></tr>}</tbody></table></div>
    </div><FormDialogFooter><Button onClick={onClose}>关闭</Button></FormDialogFooter>
  </FormDialog>;
}
