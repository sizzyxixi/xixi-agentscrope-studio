"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { assertComplete, collectionAdapter, collectionError, mergeCollected, retryable, sourceIdentity, type CollectionTask, type CollectionSource } from './collection-service';
import { inspectLinks, normalizeSpec, type ExcelProduct, type LinkSource } from './product-import';
import type { Association, Media, Product } from './commerce-demo-data';

type Catalog = { products: Product[]; media: Media[]; links: Association[] };
export function useProductCollection(catalog: Catalog, apply: (value: Catalog) => void, notify: (text: string) => void, ready: boolean) {
  const [collectionTasks, setCollectionTasks] = useState<CollectionTask[]>([]);
  const current = useRef(catalog), applying = useRef(apply), notification = useRef(notify), working = useRef(new Set<string>());
  useEffect(() => { current.current = catalog; applying.current = apply; notification.current = notify; }, [catalog, apply, notify]);
  const commitCollection = useCallback((items: ExcelProduct[], mode: 'replace' | 'append', batch: string) => {
    items.forEach(assertComplete);
    const next = mergeCollected(current.current, items, mode, batch);
    current.current = next; applying.current(next); return next.saved;
  }, []);
  const startCollection = useCallback((input: string, source: LinkSource) => {
    const parsed = inspectLinks(input, source); if (!parsed.results.length) throw new Error('请先输入商品链接或商品 ID。');
    const task: CollectionTask = { id: crypto.randomUUID(), source, createdAt: new Date().toISOString(), phase: 'running', results: parsed.results, duplicates: parsed.duplicates };
    setCollectionTasks(old => [task, ...old]); return task.id;
  }, []);
  // This worker belongs to the workspace provider, so closing the dialog does not cancel a task.
  useEffect(() => {
    if (!ready) return;
    for (const task of collectionTasks) {
      if (task.phase !== 'running' || working.current.has(task.id) || !['1688', 'Amazon'].includes(task.source)) continue;
      const source = task.source as LinkSource;
      working.current.add(task.id);
      void (async () => {
        const resultRows = [...task.results];
        for (let i = 0; i < resultRows.length; i++) {
          const result = resultRows[i]; if (result.status === '失败' || result.status === '成功') continue;
          let retries = 0;
          const update = (value: typeof result) => { resultRows[i] = value; setCollectionTasks(old => old.map(t => t.id === task.id ? { ...t, results: t.results.map((row, index) => index === i ? value : row) } : t)); };
          update({ ...result, status: '采集中', message: '正在采集商品资料' });
          for (;;) {
            try {
              const item = await collectionAdapter().collect({ source, sourceId: result.sourceId, sourceSite: result.sourceSite, input: result.input, batch: task.id, requestId: `${task.id}:${i}` });
              const specs = new Set<string>();
              item.product.skus = item.product.skus.map(sku => { let spec = normalizeSpec(sku.spec || '-').slice(0, 255), suffix = 1; const base = spec; while (specs.has(spec)) { const end = `-${++suffix}`; spec = base.slice(0, 255 - end.length) + end; } specs.add(spec); return { ...sku, spec }; });
              item.product.erp = { ...item.product.erp, sourceType: task.source, sourceId: result.sourceId, sourceSite: result.sourceSite, sourceUrl: result.input.startsWith('http') ? result.input : task.source === '1688' ? `https://detail.1688.com/offer/${result.sourceId}.htm` : `https://${result.sourceSite}/dp/${result.sourceId}` };
              item.product.source = `${task.source} 链接采集`; item.product.category = '';
              assertComplete(item); const product = commitCollection([item], 'replace', task.id)[0];
              update({ ...result, status: '成功', code: '', message: '商品资料与图片已入库', title: product.name, productId: product.id, thumbnail: item.images[0]?.url, retries });
              const identity = sourceIdentity(task.source, result);
              setCollectionTasks(old => old.map(t => t.id === task.id ? t : { ...t, results: t.results.map(row => sourceIdentity(t.source, row) === identity && row.status === '失败' ? { ...row, resolved: true } : row) }));
              break;
            } catch (error) {
              const failure = collectionError(error);
              if (!retries && retryable(failure.code)) { retries++; update({ ...result, status: '采集中', message: '正在自动重试', retries }); await new Promise(resolve => setTimeout(resolve, 750 + Math.random() * 750)); continue; }
              update({ ...result, status: '失败', code: failure.code, message: failure.message, retries }); break;
            }
          }
        }
        setCollectionTasks(old => old.map(t => t.id === task.id ? { ...t, phase: 'done' } : t));
        const success = resultRows.filter(row => row.status === '成功').length;
        notification.current(`采集完成：成功 ${success} 条，失败 ${resultRows.length - success} 条。`);
        working.current.delete(task.id);
      })();
    }
  }, [collectionTasks, commitCollection, ready]);
  const dismissCollectionFailure = useCallback((taskId: string, input: string) => setCollectionTasks(old => old.map(task => task.id === taskId ? { ...task, results: task.results.map(result => result.input === input ? { ...result, dismissed: true } : result) } : task)), []);
  const recordImportResult = useCallback((source: CollectionSource, batch: string, result: CollectionTask['results'][number]) => {
    setCollectionTasks(old => {
      const previous = old.map(task => task.id === batch ? { ...task, results: [...task.results.filter(row => row.input !== result.input), result] } : result.status === '成功' ? { ...task, results: task.results.map(row => sourceIdentity(task.source, row) === sourceIdentity(source, result) && row.status === '失败' ? { ...row, resolved: true } : row) } : task);
      return old.some(task => task.id === batch) ? previous : [{ id: batch, source, createdAt: new Date().toISOString(), phase: 'done', duplicates: 0, results: [result] }, ...previous];
    });
  }, []);
  const recordImportFailure = useCallback((source: CollectionSource, batch: string, input: string, code: string, message: string) => recordImportResult(source, batch, { input, sourceId: input, status: '失败', code, message }), [recordImportResult]);
  return { recordImportResult, recordImportFailure, collectionTasks, setCollectionTasks, startCollection, commitCollection, dismissCollectionFailure };
}
