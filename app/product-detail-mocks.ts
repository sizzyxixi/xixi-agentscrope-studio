import type { Product } from './commerce-demo-data';

const details: Record<string, { title: string; description: string; keyword: string; supply: string; sourceType?: string; offerId?: string }> = {
  'p-cup': { title: 'Nordic Matte Ceramic Mug', description: 'Matte ceramic mug with a rounded body and a comfortable handle. Available as a single mug or a two-mug set for coffee, tea and everyday use.', keyword: '陶瓷马克杯, 咖啡杯, 哑光杯', supply: 'alibaba', sourceType: 'alibaba', offerId: '840020550702' },
  'mock-p-bottle': { title: 'TRAILDAY Stainless Steel Water Bottle', description: 'Forest-green stainless steel bottle with a screw cap and a matte finish, designed for daily commuting and outdoor use.', keyword: '随行水瓶, 不锈钢水瓶, 户外水具', supply: 'westmonth', sourceType: 'westmonth' },
  'p-skin': { title: 'BOTANIC Everyday Body Care Collection', description: 'Everyday body care collection with simple packaging for bathroom and dressing-table storage. Refer to the product labels for ingredients and usage.', keyword: '身体护理, 日常护理, 保湿乳', supply: 'westmonth', sourceType: 'westmonth' },
  'p-audio': { title: 'JBL Portable Bluetooth Speaker', description: 'Portable cylindrical Bluetooth speaker with a woven exterior, suitable for a home office or living room.', keyword: '蓝牙音箱, 便携音箱, 桌面音箱', supply: 'westmonth', sourceType: 'westmonth' },
  'mock-p-watch': { title: 'MOMENT Minimalist Round Smartwatch', description: 'Round 42 mm watch with a soft silicone strap and a simple design for everyday wear.', keyword: '智能腕表, 圆屏手表, 硅胶表带', supply: 'westmonth' },
  'mock-p-coffee': { title: 'DAYBREAK Whole Bean Coffee 250 g', description: 'Whole bean coffee in a 250 g bag, intended for grinding and pour-over brewing. Refer to the package for roast and origin details.', keyword: '咖啡豆, 手冲咖啡, 整豆', supply: 'westmonth', sourceType: 'westmonth' },
  'mock-p-home': { title: 'WOODFORM Natural Wood Living Room Collection', description: 'Living room furniture collection combining natural wood tones with light upholstery for a simple, relaxed interior.', keyword: '原木家具, 客厅家具, 家居搭配', supply: 'product_group' },
  'p-santal': { title: 'SANTAL Woody Eau de Parfum 50 ml', description: 'A woody fragrance with cedar and amber notes, presented in a compact 50 ml glass bottle.', keyword: '木质香水, 雪松香调, 50ml香水', supply: 'westmonth', sourceType: 'westmonth' },
};

/** Enrich known fixtures only. Explicit empty values and user edits are never overwritten. */
export function fillProductDetailMock(product: Product): Product {
  const detail = details[product.id];
  const legacyFragrance = product.id === 'p-santal' && product.code === 'SANTAL-50' && product.source === '商品资料';
  if (!detail || (!product.mock && !legacyFragrance)) return product;
  const index = Object.keys(details).indexOf(product.id);
  const gatheredAt = `2026-10-${String(30 - index).padStart(2, '0')}T08:30:00Z`;
  const defaults: Partial<Product> = {
    products_id: String(BigInt('900000000627229') + BigInt(index)),
    cn_title: product.name, title: detail.title, cn_description: product.erp?.description ?? product.selling, description: detail.description,
    spu_code: product.code, brand_name: product.brand, category_name: product.category,
    target_user: product.audience, keyword: detail.keyword, remarks: product.erp?.notes ?? '',
    source_type: product.erp?.sourceType ?? detail.sourceType ?? '', supply_source: product.erp?.supplySource ?? detail.supply,
    source_product_id: detail.offerId ?? null, source_url: product.erp?.sourceUrl ?? (detail.offerId ? `https://detail.1688.com/offer/${detail.offerId}.html` : null),
    detail_synced_at: gatheredAt, last_gathered_at: gatheredAt, last_gather_batch_no: `GTH-202610${String(30 - index).padStart(2, '0')}-${String(index + 1).padStart(4, '0')}`,
    created_at: gatheredAt, updated_at: product.updatedAt ?? gatheredAt, status: 1, ai_choose: 0,
  };
  const missing = Object.fromEntries(Object.entries(defaults).filter(([key]) => !Object.hasOwn(product, key)));
  return Object.keys(missing).length ? { ...product, ...missing } : product;
}
