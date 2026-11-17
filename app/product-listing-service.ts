import type { ProductListingTask, ListingInformation, ListingReceipt } from './product-listing';
export interface ProductListingAdapter {
  prepare(task: ProductListingTask, source: ListingInformation, progress: (value: number, message: string) => void, signal: AbortSignal): Promise<ListingInformation>;
  publish(task: ProductListingTask, requestId: string, signal: AbortSignal): Promise<ListingReceipt>;
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
/** Local interaction adapter. It sends nothing to a marketplace or an AI service. */
const frontendAdapter: ProductListingAdapter = {
  async prepare(_task, source, progress, signal) {
    for (const [value, message] of [[20, '正在读取商品与 SKU 资料'], [50, '正在匹配目标店铺刊登信息'], [80, '正在整理预刊登资料'], [100, '预刊登信息已准备完成']] as const) {
      await delay(1200, signal); progress(value, message);
    }
    return { ...source };
  },
  async publish(_task, requestId, signal) { await delay(1800, signal); return { success: true, requestId, receiptId: crypto.randomUUID(), acceptedAt: new Date().toISOString() }; },
};
let adapter: ProductListingAdapter = frontendAdapter;
export const productListingAdapter = () => adapter;
export function configureProductListingAdapter(value: ProductListingAdapter) { adapter = value; }
