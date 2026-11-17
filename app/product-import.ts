import type { Product } from './commerce-demo-data';

export type LinkSource = '1688' | 'Amazon';
export type LinkResult = { input: string; inputLine?: number; sourceId: string; sourceSite?: string; status: '待采集' | '采集中' | '成功' | '失败'; code: string; message: string; title?: string; thumbnail?: string; productId?: string; retries?: number };
export const importColumns = ['父商品编码', '商品标题(中文)', '品牌', '主图URL', '产品描述(中文)', '成分', '功效', '货源', 'SKU货号', '规格(货源侧)', 'SKU图URL', '重量', '重量单位', '价格', '产品尺寸(长 cm)', '产品尺寸(宽 cm)', '产品尺寸(高 cm)', '包装尺寸(长 cm)', '包装尺寸(宽 cm)', '包装尺寸(高 cm)'];
export type ImportIssue = { row: number; code: string; message: string };
export type ImportOrigin = { row: number; parentExplicit: boolean; skuExplicit: boolean };
export type ExcelProduct = { product: Product; images: { skuId: string; url: string; main: boolean }[]; origins?: Record<string, ImportOrigin> };
export const normalizeSpec = (value: string) => value.replace(/[！-～]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ').trim();
export const positive = (value: string) => /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) && Number(value) > 0;
export function validImageUrl(value: string) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !!url.hostname; } catch { return false; } }
export const claimWarning = (value: string) => /治疗|治愈|根治|抗癌|消炎|药到病除|永久美白/i.test(value) ? '包含医疗或绝对化功效表述，请在刊登前核对。' : '';

/** Input validation is deliberately separate from the ERP collection result. */
export function inspectLinks(input: string, source: LinkSource) {
  const values = input.split(/\r?\n/).map((value, index) => ({ value: value.trim(), inputLine: index + 1 })).filter(row => row.value);
  const seen = new Set<string>(); let duplicates = 0;
  const results: LinkResult[] = [];
  for (const { value, inputLine } of values) {
    let sourceId = '', sourceSite = source === 'Amazon' ? 'amazon.com' : '1688.com', code = 'LINK_INVALID';
    let message = '商品链接或 ID 格式不正确，请复制标准商品链接。';
    if (source === '1688' ? /^\d{10}$/.test(value) : /^B0[A-Z0-9]{8}$/i.test(value)) sourceId = value.toUpperCase();
    else try {
      const url = new URL(value); const host = url.hostname.toLowerCase();
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
      const alibaba = /(^|\.)1688\.com$/.test(host);
      const amazon = /(^|\.)amazon\.(com|co\.uk|de|fr|co\.jp|jp|ca|com\.au|au|it|es|com\.mx)$/.test(host);
      if (host === 'qr.1688.com') message = '暂不支持 1688 短链，请去源站复制标准商品链接。';
      else if ((source === '1688' && amazon) || (source === 'Amazon' && alibaba)) { code = 'PLAT_MISMATCH'; message = '链接平台与当前标签不一致，请切换采集来源。'; }
      else if (source === '1688' && alibaba) sourceId = url.pathname.match(/\/(?:offer|product)\/(\d+)\.html?(?:\/|$)/)?.[1] || '';
      else if (source === 'Amazon' && amazon) { sourceId = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase() || ''; sourceSite = host.replace(/^(?:www|m)\./, ''); }
    } catch { /* Keep malformed lines visible, without creating a product. */ }
    const key = sourceId ? `${sourceSite}:${sourceId}` : value;
    if (seen.has(key)) { duplicates++; continue; } seen.add(key);
    results.push({ input: value, inputLine, sourceId, sourceSite, status: sourceId ? '待采集' : '失败', code: sourceId ? '' : code, message: sourceId ? '等待采集' : message });
  }
  if (results.length > 50) throw new Error('单次最多 50 条，请减少输入后重试。');
  return { results, duplicates, emptyLines: input.split(/\r?\n/).filter(value => !value.trim()).length };
}

export function parseProductTable(table: string[][], batch: string, options: { dataStart?: number } = {}) {
  if (table.length < 2) throw new Error('文件中没有商品数据，请填写模板后重新上传。');
  const normalize = (s: string) => { const value = s.replace(/（/g, '(').replace(/）/g, ')').replace(/[\s*]/g, '').trim(); return value === '售价' ? '价格' : value; };
  const headers = table[0].map(normalize);
  const missing = importColumns.filter(column => !headers.includes(normalize(column)));
  if (missing.length) throw new Error(`缺少模板列：${missing.join('、')}。请下载最新模板。`);
  // The v2.2 workbook contains descriptions + four example rows. CSV is header + data.
  const start = options.dataStart ?? (table[1]?.[0]?.includes('v2.2') ? 6 : 1);
  const inputRows = table.slice(start).map((values, index) => ({ row: index + start + 1, values })).filter(({ values }) => values.some(value => String(value || '').trim()));
  if (inputRows.length > 2000) throw new Error('单次最多 2000 行，请拆分文件后上传。');
  if (!inputRows.length) throw new Error('文件中没有商品数据，请从模板第 7 行开始填写。');
  const groups = new Map<string, { first: Record<string, string>; lines: { row: number; values: Record<string, string> }[] }>();
  const skuCount = new Map<string, number>();
  for (const line of inputRows) {
    const data = Object.fromEntries(importColumns.map(column => [column, String(line.values[headers.indexOf(normalize(column))] || '').trim()]));
    const key = data['父商品编码'] || `IMP-${batch.slice(0, 8)}-${line.row}`;
    const skuCode = data['SKU货号'] || `${key}-R${line.row}`;
    skuCount.set(skuCode, (skuCount.get(skuCode) || 0) + 1);
    if (!groups.has(key)) groups.set(key, { first: data, lines: [] });
    groups.get(key)!.lines.push({ row: line.row, values: data });
  }
  const issues: ImportIssue[] = [], warnings: ImportIssue[] = [], rows: ExcelProduct[] = []; let passed = 0;
  for (const [code, group] of groups) {
    const required = ['商品标题(中文)', '主图URL'].filter(key => !group.first[key]);
    const firstError = required.length ? `组首行缺少${required.join('、')}，该组不导入` : !validImageUrl(group.first['主图URL']) ? '组首行主图 URL 格式不正确，该组不导入' : group.first['商品标题(中文)'].length > 100 ? '商品标题不能超过 100 字，该组不导入' : '';
    if (firstError) { group.lines.forEach(line => issues.push({ row: line.row, code, message: firstError })); continue; }
    const product: Product = { id: `import-${batch}-${group.lines[0].row}`, name: group.first['商品标题(中文)'], cn_title: group.first['商品标题(中文)'], cn_description: group.first['产品描述(中文)'], ingredient: group.first['成分'], efficacy: group.first['功效'], spu_code: code, code, brand: group.first['品牌'], source: 'Excel 导入', category: '', material: group.first['成分'], selling: group.first['功效'], dimensions: '', packaging: '', audience: '', skus: [], erp: { description: group.first['产品描述(中文)'], efficacy: group.first['功效'], supplySource: group.first['货源'], batch } };
    const images: ExcelProduct['images'] = [], origins: Record<string, ImportOrigin> = {}, specs = new Map<string, number>();
    group.lines.forEach(line => { const spec = normalizeSpec(line.values['规格(货源侧)']); specs.set(spec, (specs.get(spec) || 0) + 1); });
    for (const line of group.lines) {
      const get = (key: string) => line.values[key];
      const skuCode = get('SKU货号') || `${code}-R${line.row}`, spec = normalizeSpec(get('规格(货源侧)'));
      const sizes = importColumns.slice(14); const reasons: string[] = [];
      if (!spec) reasons.push('规格不能为空');
      if (spec.length > 255) reasons.push('规格不能超过 255 字');
      if ((specs.get(spec) || 0) > 1) reasons.push('同一父商品下规格重复');
      if (!positive(get('重量'))) reasons.push('重量只填大于 0 的数字，单位选在「重量单位」列');
      if (get('重量单位') && !['g', 'kg'].includes(get('重量单位'))) reasons.push('重量单位仅支持 g / kg');
      if (sizes.some(key => !positive(get(key)))) reasons.push('产品及包装长宽高须填写正数，单位 cm');
      if (get('价格') && (!/^\d+(?:\.\d+)?$/.test(get('价格')) || Number(get('价格')) < 0)) reasons.push('价格须为非负数字');
      if (get('SKU图URL') && !validImageUrl(get('SKU图URL'))) reasons.push('SKU 图 URL 格式不正确');
      if ((skuCount.get(skuCode) || 0) > 1) reasons.push('SKU 货号在文件中重复');
      if (reasons.length) { issues.push({ row: line.row, code, message: reasons.join('；') }); continue; }
      if (line !== group.lines[0] && importColumns.slice(1, 8).some(key => get(key) && get(key) !== group.first[key])) warnings.push({ row: line.row, code, message: '商品级信息已按首行取值' });
      const warning = claimWarning(group.first['功效']); if (warning) warnings.push({ row: line.row, code, message: warning });
      if (!get('父商品编码') && !get('SKU货号')) warnings.push({ row: line.row, code, message: '父商品编码与 SKU 货号均留空，重复上传会新建商品' });
      const skuId = `${product.id}-sku-${line.row}`;
      product.skus.push({ id: skuId, code: skuCode, color: '', spec, weight: get('重量'), weightUnit: get('重量单位') || 'g', price: get('价格'), dimensions: sizes.slice(0, 3).map(get).join(' × '), packagingDimensions: sizes.slice(3).map(get).join(' × ') });
      origins[skuId] = { row: line.row, parentExplicit: !!get('父商品编码'), skuExplicit: !!get('SKU货号') };
      images.push({ skuId, url: group.first['主图URL'], main: true });
      if (get('SKU图URL')) images.push({ skuId, url: get('SKU图URL'), main: false });
      passed++;
    }
    if (product.skus.length) rows.push({ product, images, origins });
  }
  return { rows, issues, warnings, total: inputRows.length, passed, rawRows: table, dataStart: start };
}

/** PRD's two-level Excel deduplication: user SKU first, otherwise explicit parent + spec. */
export function excludeExistingSkus(items: ExcelProduct[], products: Product[]) {
  let skipped = 0;
  const rows = items.flatMap(item => {
    const skus = item.product.skus.filter(sku => {
      const origin = item.origins?.[sku.id];
      const exists = origin?.skuExplicit ? products.some(product => product.skus.some(old => old.code === sku.code)) : origin?.parentExplicit ? products.some(product => product.code === item.product.code && product.skus.some(old => normalizeSpec(old.spec) === sku.spec)) : false;
      if (exists) skipped++; return !exists;
    });
    return skus.length ? [{ ...item, product: { ...item.product, skus }, images: item.images.filter(image => skus.some(sku => sku.id === image.skuId)) }] : [];
  });
  return { rows, skipped };
}
export function checkImageFile(file: Pick<File, 'type' | 'size'>) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return '仅支持 JPG、PNG、WEBP 格式';
  if (file.size > 5 * 1024 * 1024) return '单张图片不能超过 5MB';
  return '';
}
