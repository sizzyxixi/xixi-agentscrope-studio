import type { CollectionTask } from './collection-service';
import type { LinkSource } from './product-import';

export const linkImportScenarios = [
  { id: 'initial', label: '初始' }, { id: 'failed', label: '错误' },
  { id: 'partial', label: '部分错误' }, { id: 'success', label: '全部成功' },
] as const;
export type LinkImportScenario = typeof linkImportScenarios[number]['id'];

/** Local presentation fixtures only: never submit these rows to collection or catalog storage. */
export function createLinkImportScenario(scenario: LinkImportScenario, source: LinkSource): CollectionTask | null {
  if (scenario === 'initial') return null;
  const ids = source === '1688' ? ['6945218330', '7284162059', '7638091452'] : ['B0C7XK2M1P', 'B0D6QJ4N8R', 'B0F2KM9T6S'];
  return {
    id: 'LC-20261113-0001', source, createdAt: '2026-11-13T02:00:00Z', phase: 'done', duplicates: 1,
    results: ids.map((sourceId, index) => {
      const failed = scenario === 'failed' || scenario === 'partial' && index === 1;
      const invalid = scenario === 'failed' && index === 0;
      return {
        input: invalid ? 'https://example.com/product/123' : source === '1688' ? `https://detail.1688.com/offer/${sourceId}.htm` : `https://www.amazon.com/dp/${sourceId}`,
        sourceId: invalid ? '' : sourceId, sourceSite: source === '1688' ? '1688.com' : 'amazon.com',
        inputLine: index + 1, status: failed ? '失败' : '成功',
        code: failed ? invalid ? 'LINK_INVALID' : 'TIMEOUT' : '',
        message: failed ? invalid ? '商品链接格式不正确，请复制标准商品链接。' : '采集超时，请稍后重试。' : '商品资料与图片已入库',
      };
    }),
  };
}

export function retryLinkImportScenario(task: CollectionTask, input: string): CollectionTask {
  return { ...task, results: task.results.map(row => row.input === input && row.code === 'TIMEOUT' ? {
    ...row, status: '成功', code: '', message: '商品资料与图片已入库', retries: (row.retries || 0) + 1,
  } : row) };
}
