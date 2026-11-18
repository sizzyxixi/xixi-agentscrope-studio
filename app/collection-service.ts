import { randomId } from '../lib/browser-id';
import type { Association, Media, Product } from './commerce-demo-data';
import type { ExcelProduct, LinkResult, LinkSource } from './product-import';

export type FieldSource = 'ocr' | 'visual_estimate' | 'category_ref' | 'none' | 'manual';
export type AnalyzedField = { value: string; source: FieldSource; confidence?: number; exact?: boolean };
export type AnalysisResult = { fields: Record<string, AnalyzedField>; warning?: 'NOT_PRODUCT' | 'MULTIPLE_SUBJECTS' | 'LOW_QUALITY' };
export type CollectionSource = LinkSource | 'Excel' | '识图';
export type CollectionTask = { id: string; source: CollectionSource; createdAt: string; phase: 'running' | 'done'; results: (LinkResult & { resolved?: boolean; dismissed?: boolean })[]; duplicates: number };
export type UploadedImage = { url: string; role: string };
export class CollectionError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; this.name = 'CollectionError'; }
}
/** ERP integration boundary. Collection/mapping/OSS/OCR are owned by ERP, never inferred by this UI. */
export interface CollectionAdapter {
  authorization(source: LinkSource): Promise<'authorized' | 'expired' | 'unavailable'>;
  collect(request: { source: LinkSource; sourceId: string; sourceSite?: string; input: string; batch: string; requestId: string }): Promise<ExcelProduct>;
  upload(file: File, request: { batch: string; role: string }): Promise<{ url: string }>;
  analyze(images: UploadedImage[], request: { batch: string; signal: AbortSignal }): Promise<AnalysisResult>;
  prepare(items: ExcelProduct[], request: { batch: string }): Promise<ExcelProduct[]>;
}
const unavailable = async (): Promise<never> => { throw new CollectionError('SERVICE_UNAVAILABLE', '采集服务暂不可用，请稍后重试。'); };
let adapter: CollectionAdapter = { authorization: async () => 'unavailable', collect: unavailable, upload: unavailable, analyze: unavailable, prepare: unavailable };
export function configureCollectionAdapter(value: CollectionAdapter) { adapter = value; }
export function collectionAdapter() { return adapter; }
export const retryable = (code: string) => ['TIMEOUT', 'RATE_LIMIT', 'IMG_FAIL', 'NETWORK_ERROR', 'SERVER_ERROR'].includes(code);
export function collectionError(error: unknown) { return error instanceof CollectionError ? error : new CollectionError('NETWORK_ERROR', error instanceof Error ? error.message : '请求失败，请稍后重试。'); }
export function isStoredImage(url: string) { try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'oss.westmonth.com'; } catch { return false; } }
/** A completed API request alone is not a successful collection. */
export function assertComplete(item: ExcelProduct) {
  const p = item.product;
  if (!p.name?.trim() || p.name.length > 100 || !p.skus.length) throw new CollectionError('DATA_INCOMPLETE', '商品资料不完整，请重新采集。');
  const seen = new Set<string>(), codes = new Set<string>();
  for (const sku of p.skus) {
    const numbers = [sku.weight, ...(sku.dimensions || '').split(/\s*[×x*]\s*/), ...(sku.packagingDimensions || '').split(/\s*[×x*]\s*/)];
    if (!sku.code || codes.has(sku.code) || !sku.spec?.trim() || sku.spec.length > 255 || seen.has(sku.spec) || numbers.length !== 7 || numbers.some(n => !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(n || '') || Number(n) <= 0) || !['g', 'kg'].includes(sku.weightUnit || 'g')) throw new CollectionError('DATA_INCOMPLETE', 'SKU 资料不完整，请重新采集。');
    seen.add(sku.spec); codes.add(sku.code);
    if (!item.images.some(image => image.skuId === sku.id && image.main) || item.images.some(image => image.skuId === sku.id && !isStoredImage(image.url))) throw new CollectionError('IMG_FAIL', '商品图片尚未完成转存，请重试。');
  }
}
export function sourceIdentity(source: CollectionSource, result: Pick<LinkResult, 'sourceId' | 'sourceSite' | 'input'>) { return `${source}:${result.sourceSite || ''}:${result.sourceId || result.input}`; }

/** Recollection replaces source facts by source identity + SKU code; creative work and IDs survive. */
export function mergeCollected(catalog: { products: Product[]; links: Association[]; media: Media[] }, items: ExcelProduct[], mode: 'replace' | 'append', batch: string) {
  const products = [...catalog.products], media: Media[] = [], addedLinks: Association[] = [], remove = new Set<string>(), saved: Product[] = [];
  const now = new Date().toISOString();
  for (const item of items) {
    const source = item.product;
    const index = products.findIndex(p => mode === 'replace' ? !!source.erp?.sourceId && p.erp?.sourceType === source.erp?.sourceType && p.erp?.sourceId === source.erp?.sourceId && p.erp?.sourceSite === source.erp?.sourceSite : p.code === source.code);
    const old = products[index];
    const skus = source.skus.map(sku => ({ ...sku, id: old?.skus.find(previous => previous.code === sku.code)?.id || sku.id, batch }));
    const skuIds = new Set(skus.map(sku => sku.id));
    const product: Product = old ? mode === 'replace' ? { ...old, ...source, id: old.id, category: old.category, audience: old.audience, packaging: old.packaging, creativeBrief: old.creativeBrief, contentVersions: old.contentVersions, skus: [...old.skus.filter(sku => !skuIds.has(sku.id)), ...skus], confirmedSnapshot: undefined } : { ...old, skus: [...old.skus, ...skus], confirmedSnapshot: undefined } : { ...source, skus };
    product.collectedAt = old?.collectedAt || old?.erp?.syncedAt || old?.updatedAt || now; product.listingClaims = old?.listingClaims;
    product.last_gathered_at = now; product.last_gather_batch_no = batch; product.updated_at = now;
    product.updatedAt = now; product.erp = { ...product.erp, batch, syncedAt: now };
    product.activity = [{ id: randomId(), at: now, title: mode === 'replace' && old ? '重新采集商品' : '商品入库', detail: `${source.source} · ${skus.length} 个 SKU · ${batch}` }, ...(old?.activity || [])];
    if (mode === 'replace' && old) for (const link of catalog.links) {
      if (link.productId === old.id && link.collection === '来源素材' && link.location === '参考素材' && link.skuIds.some(id => skuIds.has(id))) remove.add(link.id);
    }
    if (index >= 0) products[index] = product; else products.unshift(product); saved.push(product);
    for (const image of item.images) {
      const sku = source.skus.find(sku => sku.id === image.skuId); const savedSku = skus.find(s => s.code === sku?.code); if (!savedSku) continue;
      const id = randomId();
      media.push({ id, name: `${source.name} · ${image.main ? '商品主图' : savedSku.code}`, url: image.url, type: 'image', source: source.source, space: 'personal', createdAt: now });
      addedLinks.push({ id: randomId(), productId: product.id, mediaId: id, skuIds: [savedSku.id], platform: '通用', site: '通用', language: '无文字', usage: image.main ? '商品主视图' : 'SKU 外观参考', location: '参考素材', collection: '来源素材', status: '草稿', version: 1 });
    }
  }
  return { products, media: [...media, ...catalog.media], links: [...catalog.links.filter(link => !remove.has(link.id)), ...addedLinks], saved };
}
