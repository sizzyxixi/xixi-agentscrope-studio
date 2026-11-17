import type { Product } from './commerce-demo-data';
import { availableListingShops, type ListingShop } from './listing-shops';
import { claimSkuIds } from './product-management';
import { productTitle, productDescription } from './product-fields';
import { skuCode, skuPrice, skuSpec } from './sku-fields';

export type ListingStatus = 'waiting' | 'preparing' | 'ready' | 'prepare_failed' | 'publishing' | 'publish_failed' | 'published';
export const listingPublishedMessage = '已提交至平台';
export const listingPublishedNotice = '已提交至平台，不代表在售。实际状态可发起会话进行查询';
export const listingStatusNames: Record<ListingStatus, string> = { waiting: '待刊登', preparing: '预刊登信息准备中', ready: '预刊登信息准备完成', prepare_failed: '预刊登信息准备未完成', publishing: '刊登中', publish_failed: '刊登失败', published: '已刊登' };
export function listingTaskPresentation(status: ListingStatus) {
  if (status === 'published') return { label: '已刊登', description: listingPublishedMessage };
  const descriptions: Record<Exclude<ListingStatus, 'published'>, string> = { waiting: '尚未开始准备预刊登信息', preparing: '正在为目标店铺准备刊登信息', ready: '可编辑草稿或直接刊登', prepare_failed: '部分任务失败，可发起对话继续处理', publishing: '正在提交至目标平台', publish_failed: '提交未完成，可发起对话查询或重试' };
  return { label: listingStatusNames[status], description: descriptions[status] };
}
export type PrelistingStepStatus = 'success' | 'running' | 'failed' | 'waiting';
export function prelistingSteps(task: ProductListingTask): { name: string; status: PrelistingStepStatus }[] {
  const names = ['AI 图片', 'AI 标题', '类目属性映射'];
  return names.map((name, index) => ({ name, status: task.prelistingSteps?.[index] ?? (
    ['ready', 'publishing', 'publish_failed', 'published'].includes(task.status) ? 'success' : task.status === 'waiting' ? 'waiting' :
    task.progress >= (index + 1) * 30 ? 'success' : task.progress >= index * 30 ? task.status === 'prepare_failed' ? 'failed' : 'running' : 'waiting'
  ) }));
}
export function listingPublishDisabledReason(task: ProductListingTask) {
  if (task.status === 'publishing') return '正在提交至平台，请勿重复刊登';
  if (task.status === 'published') return '该商品已刊登';
  if (!['ready', 'publish_failed'].includes(task.status) || prelistingSteps(task).some(step => step.status !== 'success')) return '预刊登信息尚未准备完成，完成后可直接刊登';
  return '';
}
export type ListingInformation = { title: string; description: string; skuCode: string; spec: string; price: string; currency: string };
export type ListingReceipt = { success: true; requestId: string; receiptId: string; acceptedAt: string; platformState?: string };
export type ListingRecord = { status: ListingStatus; at: string; message: string; progress: number };
export type ListingMessage = { role: 'user' | 'assistant'; text: string; at: string };
export type ProductListingTask = {
  presentationMock?: true;
  id: string; productId: string; skuId: string; shopId: string; shopName: string; platform: string; site: string;
  status: ListingStatus; progress: number; message: string; createdAt: string; updatedAt: string;
  information?: ListingInformation; publishRequestId?: string; receipt?: ListingReceipt; publishedVia?: 'direct' | 'agent';
  draft?: import('./listing-draft').ListingDraft;
  prelistingSteps?: PrelistingStepStatus[];
  records: ListingRecord[]; messages: ListingMessage[];
};
export type ListingAgentContext = { taskId: string; platform: string; skuCode: string; shopName: string; productName?: string; image?: string; spec?: string; site?: string; shopId?: string; productId?: string; skuId?: string; intent?: 'optimize' };
export const listingAgentPrompt = '帮我查看这个商品的预刊登信息。';
export const listingOptimizationPrompt = '帮我查看此商品的信息，优化并补全资料。';
export const listingContextPrompt = (context: Pick<ListingAgentContext, 'intent'>) => context.intent === 'optimize' ? listingOptimizationPrompt : listingAgentPrompt;
export function listingAgentId(platform: string) {
  const ids: Record<string, string> = { amazon: 'official-amazon', shopee: 'official-shopee', temu: 'official-temu', lazada: 'official-lazada', tiktok: 'official-tiktok', 'tiktok shop': 'official-tiktok', aliexpress: 'official-aliexpress', ebay: 'official-ebay', shopify: 'official-shopify', walmart: 'official-walmart' };
  return ids[platform.toLowerCase()] || `official-${platform.toLowerCase().replace(/\s+/g, '-')}`;
}
export const listingTaskId = (productId: string, skuId: string, shopId: string) => JSON.stringify([productId, skuId, shopId]);

/** Claims create separate SKU/shop jobs; no new column is written into products or products_sku. */
export function claimedListingTasks(products: Product[], shops: ListingShop[], existing: ProductListingTask[], now: string) {
  const targets = availableListingShops(shops, products);
  const tasks = existing.map(task => {
    if (task.platform && task.platform !== '其他') return task;
    const claim = products.find(product => product.id === task.productId)?.listingClaims?.find(claim => claim.shopId === task.shopId);
    const configured = targets.find(shop => shop.id === task.shopId)?.platform;
    const named = ['Amazon', 'eBay', 'TikTok Shop', 'Shopify', 'Lazada', 'Shopee', 'AliExpress', 'Walmart', 'Temu'].find(platform => claim?.shopName.toLowerCase().startsWith(platform.toLowerCase()));
    const platform = claim?.platform || (configured !== '其他' ? configured : '') || named;
    return platform ? { ...task, platform } : task;
  }), ids = new Set(tasks.map(task => task.id));
  for (const product of products.filter(product => !product.deleted_at)) for (const claim of product.listingClaims || []) {
    const shop = targets.find(shop => shop.id === claim.shopId);
    for (const skuId of claimSkuIds(product, claim)) {
      if (product.skus.find(sku => sku.id === skuId)?.deleted_at) continue;
      const id = listingTaskId(product.id, skuId, claim.shopId);
      if (ids.has(id)) continue;
      ids.add(id);
      const at = claim.claimedAt || now;
      const named = ['Amazon', 'eBay', 'TikTok Shop', 'Shopify', 'Lazada', 'Shopee', 'AliExpress', 'Walmart', 'Temu'].find(platform => claim.shopName.toLowerCase().startsWith(platform.toLowerCase()));
      const platform = claim.platform || (shop?.platform !== '其他' ? shop?.platform : '') || named || '其他';
      tasks.push({ id, productId: product.id, skuId, shopId: claim.shopId, shopName: shop?.name || claim.shopName, platform, site: shop?.site || claim.site,
        status: 'waiting', progress: 0, message: '认领成功，等待准备预刊登信息', createdAt: at, updatedAt: now,
        records: [{ status: 'waiting', progress: 0, at: now, message: '认领成功，等待准备预刊登信息' }], messages: [] });
    }
  }
  return tasks;
}
export function listingTaskRows(tasks: ProductListingTask[], products: Product[], tab: 'pending' | 'published', query = '', platform = '', filters: { shopId?: string; claimedFrom?: string; claimedTo?: string } = {}) {
  const search = query.trim().toLocaleLowerCase();
  const selectedPlatform = platform.trim().toLocaleLowerCase();
  return tasks.flatMap(task => {
    const product = products.find(product => product.id === task.productId && !product.deleted_at);
    const sku = product?.skus.find(sku => sku.id === task.skuId && !sku.deleted_at);
    if (!product || !sku || (tab === 'published') !== (task.status === 'published' && !!task.receipt?.success)) return [];
    if (selectedPlatform && task.platform.trim().toLocaleLowerCase() !== selectedPlatform) return [];
    if (filters.shopId && task.shopId !== filters.shopId) return [];
    const claimedDay = new Date(task.createdAt).toLocaleDateString('sv-SE');
    if (filters.claimedFrom && claimedDay < filters.claimedFrom || filters.claimedTo && claimedDay > filters.claimedTo) return [];
    if (search && !`${productTitle(product)} ${product.title || ''} ${task.draft?.title || task.information?.title || ''} ${skuCode(sku)} ${skuSpec(sku)} ${task.shopName} ${task.site} ${task.platform}`.toLocaleLowerCase().includes(search)) return [];
    return [{ task, product, sku }];
  });
}
export function listingTaskPlatforms(tasks: ProductListingTask[], products: Product[], tab: 'pending' | 'published') {
  const platforms = new Map<string, string>();
  for (const { task } of listingTaskRows(tasks, products, tab)) {
    const name = task.platform.trim();
    if (name && !platforms.has(name.toLocaleLowerCase())) platforms.set(name.toLocaleLowerCase(), name);
  }
  return [...platforms.values()].sort((a, b) => a.localeCompare(b));
}
export function listingSourceInformation(product: Product, skuId: string, shop?: ListingShop): ListingInformation {
  const sku = product.skus.find(sku => sku.id === skuId)!;
  return { title: product.title || productTitle(product), description: product.description || productDescription(product), skuCode: skuCode(sku), spec: skuSpec(sku), price: skuPrice(sku), currency: shop?.currency || '' };
}
export function recordListingReceipt(task: ProductListingTask, receipt: ListingReceipt, via: 'direct' | 'agent'): ProductListingTask {
  if (receipt.success !== true || typeof receipt.receiptId !== 'string' || !receipt.receiptId.trim() || !task.publishRequestId || receipt.requestId !== task.publishRequestId || typeof receipt.acceptedAt !== 'string' || !receipt.acceptedAt || Number.isNaN(Date.parse(receipt.acceptedAt))) throw new Error('刊登接口尚未返回有效的成功回执。');
  if (task.status === 'published') return task;
  if (!['publishing', 'publish_failed'].includes(task.status)) throw new Error('任务尚未提交刊登请求。');
  const message = listingPublishedMessage;
  return { ...task, status: 'published', progress: 100, message, receipt, publishedVia: via, updatedAt: receipt.acceptedAt,
    records: [...task.records, { status: 'published', progress: 100, at: receipt.acceptedAt, message }] };
}

/** Interrupted requests remain pending until their original request is reconciled. */
export function restoreListingTasks(tasks: ProductListingTask[]): ProductListingTask[] {
  return tasks.filter(task => !task.presentationMock).map(task => task.status === 'publishing' ? { ...task, status: 'publish_failed', progress: 0, message: '上次请求结果待确认，请重试核对' } : task);
}
