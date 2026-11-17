import type { Association, Media, Product } from './commerce-demo-data';
import { productCode, productIngredient, productEfficacy, productFieldValues, productGatheredAt, productRemarks, productSourceType, productSourceUrl, productSupplySource, productTitle, sourceTypes, supplySources } from './product-fields';
import { skuCode, skuDimensionText, skuDimensions, skuImageUrls, skuPrice, skuSpec, skuWeightUnit } from './sku-fields';
import { productReferences } from './product-readiness';
import { productPreparation } from './product-preparation';
import { productAssets } from './product-images';
import { claimSkuIds, skuLinks } from './product-management';
import type { ExportProgress } from './product-export-task';

function exportTime(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return '';
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

/** Export only the caller's visible products and available assets; SKU expansion is presentation only. */
export async function createProductExport(products: Product[], links: Association[], media: Media[], origin: string, skuScopes?: Record<string, string[]>, onProgress?: (progress: ExportProgress) => void) {
  if (!products.length) throw new Error('当前没有可导出的商品。');
  const exportSkus = (product: Product) => product.skus.filter(sku => !skuScopes?.[product.id] || skuScopes[product.id].includes(sku.id));
  const total = products.length + products.reduce((count, product) => count + exportSkus(product).length, 0);
  let completed = 0;
  const interval = Math.max(1, Math.ceil(total / 100));
  onProgress?.({ phase: 'preparing', completed, total });
  const advance = () => {
    completed++;
    if (completed % interval === 0 || completed === total) onProgress?.({ phase: 'preparing', completed, total });
  };
  const xlsx = await import('@e965/xlsx');
  const book = xlsx.utils.book_new();
  const available = media.filter(item => !item.placeholder && item.url);
  const url = (value: string) => {
    if (!value) return '';
    try { const parsed = new URL(value, origin); return /^https?:$/.test(parsed.protocol) ? parsed.href : ''; }
    catch { return ''; }
  };
  const scopeLinks = (product: Product) => links.filter(link => link.productId === product.id && (!link.skuIds.length || link.skuIds.some(id => exportSkus(product).some(sku => sku.id === id))));
  const assets = (product: Product, skuId?: string) => {
    const ids = new Set(skuLinks(scopeLinks(product), product.id, skuId).map(link => link.mediaId));
    return available.filter(item => ids.has(item.id));
  };
  const cover = (product: Product, skuId?: string) => url((skuId ? skuImageUrls(product.skus.find(sku => sku.id === skuId)!)[0] || '' : product.main_image || '') || productReferences(product, scopeLinks(product), available, skuId)[0]?.url || productAssets(product.id, scopeLinks(product), available, skuId).find(item => item.media.type === 'image')?.media.url || '');
  const assetUrls = (items: Media[]) => items.map(item => url(item.url)).filter(Boolean).join('\n');
  const productRows = products.map(product => {
    const items = assets(product);
    const scopedClaims = (product.listingClaims || []).filter(claim => exportSkus(product).some(sku => claimSkuIds(product, claim).includes(sku.id)));
    const incomplete = !exportSkus(product).length || exportSkus(product).some(sku => !productPreparation(product, links, available, sku.id).complete);
    advance();
    return [cover(product), product.externalId || product.id, sourceTypes[productSourceType(product)] || productSourceType(product), supplySources[productSupplySource(product)] || productSupplySource(product), productTitle(product),
      productFieldValues(product).brand_name, items.length, assetUrls(items), productSourceUrl(product), incomplete ? '待完善资料' : '资料完整',
      productRemarks(product), exportTime(productGatheredAt(product)),
      scopedClaims.map(claim => `${claim.shopName} · ${claim.site}`).join('\n'), product.id,
      scopedClaims.map(claim => `${claim.shopName}：${exportSkus(product).filter(sku => claimSkuIds(product, claim).includes(sku.id)).map(sku => skuCode(sku)).join('、')}`).join('\n'), productFieldValues(product).cn_title, productFieldValues(product).title, productFieldValues(product).cn_description, productFieldValues(product).description, productIngredient(product), productEfficacy(product), productFieldValues(product).target_user, productFieldValues(product).keyword, productCode(product)];
  });
  const skuRows = products.flatMap(product => exportSkus(product).map(sku => {
    const items = assets(product, sku.id);
    advance();
    return [product.externalId || product.id, productTitle(product), cover(product, sku.id), skuCode(sku),
      skuSpec(sku), items.length, assetUrls(items), product.id, (product.listingClaims || []).filter(claim => claimSkuIds(product, claim).includes(sku.id)).map(claim => `${claim.shopName} · ${claim.site}`).join('\n'), sku.weight || '', skuWeightUnit(sku), skuPrice(sku), skuDimensionText(sku), skuDimensionText(sku, true), sku.source_sku_code || '', sku.size || '', ...skuDimensions(sku), ...skuDimensions(sku, true), sku.variants == null ? '' : JSON.stringify(sku.variants), sku.spec_id || '', sku.batch_no || sku.batch || ''];
  }));
  const tables = [
    { name: '商品清单', headers: ['主图链接', 'ID', '采集类型', '货源', '标题', '品牌', '素材数量', '素材链接', '源链接', '资料状态', '备注', '采集时间（北京时间）', '目标店铺', '内部商品ID', '认领SKU范围', '中文产品标题', '英文产品标题', '中文描述', '英文描述', '成分', '功效', '目标用户', '关键字', '父商品编码'], rows: productRows, widths: [45, 24, 20, 24, 42, 20, 12, 60, 45, 18, 36, 26, 48, 30, 60, 42, 42, 60, 60, 30, 30, 30, 30, 24] },
    { name: 'SKU清单', headers: ['商品ID', '商品标题', '主图链接', 'SKU货号', '规格', '素材数量', '素材链接', '内部商品ID', '认领店铺', '重量', '重量单位', '价格', '产品尺寸', '包装尺寸', '来源原始货号', '尺寸说明', '产品长（cm）', '产品宽（cm）', '产品高（cm）', '包装长（cm）', '包装宽（cm）', '包装高（cm）', '规格下标', '来源规格ID', '采集批次'], rows: skuRows, widths: [24, 42, 45, 26, 36, 12, 60, 30, 48, 12, 12, 14, 28, 28] },
  ];
  onProgress?.({ phase: 'writing', completed, total });
  for (const table of tables) {
    const sheet = xlsx.utils.aoa_to_sheet([table.headers, ...table.rows]);
    sheet['!cols'] = table.widths.map(wch => ({ wch }));
    sheet['!autofilter'] = { ref: sheet['!ref']! };
    xlsx.utils.book_append_sheet(book, sheet, table.name);
  }
  return new Blob([xlsx.write(book, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
