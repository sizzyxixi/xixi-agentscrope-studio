import type { Product, Sku } from './commerce-demo-data';
import type { ProductListingTask } from './product-listing';
import { productTitle } from './product-fields';
import { skuCode, skuSpec, skuPrice, skuDimensions, skuWeightUnit } from './sku-fields';
import { productMockSpec } from './product-detail-mocks';

export type DraftAttribute = { name: string; value: string; required?: boolean; options?: string[]; multiline?: boolean; multiple?: boolean };
export type DraftVariant = { id: string; name: string; options: string[] };
export type DraftSku = { id: string; spec: string; sellerSku: string; price: string; salePrice: string; saleFrom: string; saleTo: string; stock: string; weight: string; length: string; width: string; height: string; images: string[] };
export type ListingDraft = {
  category: string; title: string; brand: string; description: string; highlights: string;
  images: string[]; video: string; attributes: DraftAttribute[]; variants: DraftVariant[]; skus: DraftSku[];
  packingList: string; warrantyType: string; warrantyPolicy: string;
};
export const listingEditorSections = ['类目信息', '基本信息', '图片与视频', '类目属性', '商品规格', '价格及库存', '物流与保修'] as const;
export function createListingDraft(task: ProductListingTask, product: Product, sku: Sku, imageUrls: string[]): ListingDraft {
  if (task.draft) { const draft=structuredClone(task.draft); for(const field of draft.attributes) if(['Application Area','Recommended User','Ingredient Preference','Skin Types','Product Feature','Body Care Benefits'].includes(field.name)) field.multiple=true; draft.skus=draft.skus.map(row=>({...row,spec:productMockSpec(product,row.spec)})); draft.variants=draft.variants.map(variant=>({...variant,options:variant.options.map(value=>productMockSpec(product,value))})); return draft; }
  const beauty = /美妆|护理|香|beauty/i.test(product.category_name || product.category);
  const spec = skuSpec(sku);
  const dimensions = skuDimensions(sku, true);
  const weight = sku.weight == null ? '' : String(sku.weight);
  const attributes: DraftAttribute[] = beauty ? [
    { name: 'Place of Origin', value: '', options: ['China', 'Thailand', 'United States'] },
    { name: 'Application Area', value: 'Body', required: true, options: ['Body', 'Arm', 'Face', 'Hand'] },
    { name: 'Recommended User', value: 'All Ages & Gender', options: ['All Ages & Gender', 'Adults'] },
    { name: 'Product Type', value: '', options: ['Body Care', 'Skin Care', 'Fragrance'] },
    { name: 'Warehouse Handling', value: '', options: ['Standard', 'Special Handling'] },
    { name: 'Ingredient Preference', value: product.ingredient || '', options: ['Glycerin', 'Natural', 'Fragrance Free'] },
    { name: 'Shelf Expiry', value: '', options: ['18–36 Months', '12 Months', '24 Months'] },
    { name: 'Skin Types', value: 'All types', options: ['All types', 'Dry', 'Oily', 'Sensitive'] },
    { name: 'Freshness_metric', value: '', options: ['Months', 'Years'] },
    { name: 'Unit Metric', value: 'g', options: ['g', 'ml', 'pcs'] },
    { name: 'Special Claims', value: '', options: ['None', 'Dermatologically Tested'] },
    { name: 'Product Form', value: '', options: ['Gel', 'Cream', 'Liquid', 'Spray'] },
    { name: 'Product Feature', value: '', options: ['Gentle Formula', 'Moisturizing'] },
    { name: 'Body Care Benefits', value: product.efficacy || '', required: true, options: ['Soothing', 'Moisturizing', 'Cleansing'] },
    { name: 'Name (English)', value: task.information?.title || product.title || '' },
    { name: 'English Long Description (optional)', value: '', multiline: true },
    { name: "English what’s in the box", value: '' },
    { name: 'English Short Description', value: '', multiline: true },
    ...(task.site === 'TH' ? ['TH_FDA – License Code', 'TH_FDA – License Document1', 'TH_FDA – License Document2', 'TH_FDA – License Document3', 'TH_MANUFACTURER_NAME – License Code', 'TH_IMPORTER_NAME – License Code'].map((name, i) => ({ name, value: '', required: i === 0 })) : []),
  ] : [
    { name: 'Place of Origin', value: '', options: ['China', 'Thailand', 'United States'] },
    { name: 'Material', value: product.material || '', required: true },
    { name: 'Product Type', value: product.category_name || product.category },
    { name: 'Recommended User', value: product.target_user || product.audience || '' },
    { name: 'Brand', value: product.brand_name || product.brand || 'No Brand' },
    { name: 'Name (English)', value: product.title || '' },
    { name: "English what’s in the box", value: '' },
    { name: 'English Short Description', value: '', multiline: true },
  ];
  for(const field of attributes) if(['Application Area','Recommended User','Ingredient Preference','Skin Types','Product Feature','Body Care Benefits'].includes(field.name)) field.multiple=true;
  return {
    category: product.category_name || product.category || '', title: task.information?.title || product.title || productTitle(product),
    brand: product.brand_name || product.brand || 'No Brand', description: task.information?.description || product.description || product.cn_description || '', highlights: product.selling || '',
    images: [...new Set(imageUrls)].slice(0, 8), video: product.video || '', attributes,
    variants: [{ id: 'main', name: '规格', options: [spec || '默认规格'] }],
    skus: [{ id: sku.id, spec: spec || '默认规格', sellerSku: skuCode(sku), price: task.information?.price || skuPrice(sku), salePrice: '', saleFrom: '', saleTo: '', stock: '', weight: weight && skuWeightUnit(sku) === 'kg' ? String(Number(weight) * 1000) : weight, length: String(dimensions[0] ?? ''), width: String(dimensions[1] ?? ''), height: String(dimensions[2] ?? ''), images: imageUrls.slice(0, 8) }],
    packingList: '', warrantyType: '', warrantyPolicy: '',
  };
}
export function listingDraftIssues(draft: ListingDraft, publish = false) {
  const issues: string[] = [];
  if (!draft.category.trim()) issues.push('请选择商品分类');
  if (!draft.brand.trim()) issues.push('请填写商品品牌');
  if (!draft.skus.length) issues.push('请至少保留一个 SKU');
  if (!draft.title.trim()) issues.push('请填写商品标题');
  if (draft.title.length > 255) issues.push('商品标题不能超过 255 个字符');
  if (publish) {
    if (!draft.images.length) issues.push('请上传至少一张产品图片');
    draft.attributes.filter(field => field.required && !field.value.trim()).forEach(field => issues.push(`请填写 ${field.name}`));
    if (new Set(draft.skus.map(sku=>sku.sellerSku.trim())).size !== draft.skus.length) issues.push('SellerSKU 不能重复');
    if (draft.variants.some(variant=>!variant.name.trim()||variant.options.some(option=>!option.trim())||new Set(variant.options).size!==variant.options.length)) issues.push('请填写完整且不重复的销售规格');
    draft.skus.forEach((sku, index) => {
      if (!sku.sellerSku.trim()) issues.push(`请填写第 ${index + 1} 行 SellerSKU`);
      if (!sku.price.trim() || !Number.isFinite(Number(sku.price)) || Number(sku.price) <= 0) issues.push(`请填写第 ${index + 1} 行有效价格`);
      if (!sku.stock.trim() || !Number.isInteger(Number(sku.stock)) || Number(sku.stock) < 0) issues.push(`请填写第 ${index + 1} 行有效库存`);
      if (!sku.weight.trim() || !Number.isFinite(Number(sku.weight)) || Number(sku.weight) <= 0) issues.push(`请填写第 ${index + 1} 行有效包装重量`);
    });
  }
  for (const sku of draft.skus) {
    if (sku.salePrice && (Number(sku.salePrice) <= 0 || Number(sku.salePrice) >= Number(sku.price))) issues.push('促销价应大于 0 且小于价格');
    if (sku.salePrice && (!sku.saleFrom || !sku.saleTo || sku.saleFrom > sku.saleTo)) issues.push('请填写有效促销日期区间');
  }
  return issues;
}

/** Each specification combination owns one editable SKU row. */
export function changeDraftVariants(draft: ListingDraft, variants: DraftVariant[]): ListingDraft {
  const combinations = variants.reduce<string[][]>((rows, variant) => rows.flatMap(row => variant.options.map(option => [...row, option])), [[]]);
  if (combinations.length > 100) throw Error('规格组合最多支持 100 个');
  const used = new Set<string>();
  const skus = combinations.map((options, index) => {
    const spec = options.join(' / ');
    const matched = draft.skus.find(row => row.spec === spec && !used.has(row.id)) || draft.skus.find((row, i) => i === index && !used.has(row.id));
    if (matched) { used.add(matched.id); return { ...matched, spec }; }
    const template = draft.skus[0];
    return { ...template, id: `draft-variant-${index}-${encodeURIComponent(spec)}`, spec, sellerSku: '', stock: '', images: [] };
  });
  return { ...draft, variants, skus };
}
