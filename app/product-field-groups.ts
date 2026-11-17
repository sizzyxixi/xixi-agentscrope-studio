import type { ProductFieldValues } from './product-fields';

export type ProductField = { key: keyof ProductFieldValues; label: string; multiline?: boolean };
export const productFieldGroups: { id: string; title: string; fields: ProductField[] }[] = [
  { id: 'basic', title: '基础信息', fields: [
    { key: 'spu_code', label: '父商品编码' }, { key: 'brand_name', label: '品牌名称' }, { key: 'category_name', label: '类目名称' },
    { key: 'cn_title', label: '中文产品标题' }, { key: 'title', label: '英文产品标题' },
    { key: 'cn_description', label: '中文描述', multiline: true }, { key: 'description', label: '英文描述', multiline: true },
    { key: 'target_user', label: '目标用户' }, { key: 'keyword', label: '关键字' },
    { key: 'remarks', label: '备注', multiline: true },
  ] },
  { id: 'source', title: '来源信息', fields: [{ key: 'supply_source', label: '货源' }] },
];
