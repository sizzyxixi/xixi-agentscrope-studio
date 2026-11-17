"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from './commerce-demo-data';
import type { ListingShop } from './listing-shops';
import { claimedListingTasks, listingSourceInformation, recordListingReceipt, type ProductListingTask, type ListingStatus, type ListingMessage, type ListingReceipt } from './product-listing';
import { productListingAdapter } from './product-listing-service';
import { withListingMocks } from './product-listing-mocks';

export function useProductListing(products: Product[], shops: ListingShop[], ready: boolean) {
  const [tasks, setTasks] = useState<ProductListingTask[]>([]);
  const latest = useRef({ products, shops, tasks });
  useEffect(() => { latest.current = { products, shops, tasks }; }, [products, shops, tasks]);
  const running = useRef(new Map<string, AbortController>());
  const operations = useRef(new Map<string, symbol>());
  const update = useCallback((id: string, change: (task: ProductListingTask) => ProductListingTask) => setTasks(old => old.map(task => task.id === id ? change(task) : task)), []);
  useEffect(() => { const controllers = running.current, tokens = operations.current; return () => { controllers.forEach(controller => controller.abort()); controllers.clear(); tokens.clear(); }; }, []);
  const transition = useCallback((id: string, status: ListingStatus, progress: number, message: string, extra: Partial<ProductListingTask> = {}) => {
    const at = new Date().toISOString();
    update(id, task => ({ ...task, ...extra, status, progress, message, updatedAt: at, records: [...task.records, { status, progress, at, message }] }));
  }, [update]);
  const prepare = useCallback(async (task: ProductListingTask) => {
    if (running.current.has(task.id) || task.status === 'published' || task.presentationMock) return;
    const product = latest.current.products.find(product => product.id === task.productId && !product.deleted_at);
    if (!product?.skus.some(sku => sku.id === task.skuId && !sku.deleted_at)) return;
    const controller = new AbortController(); running.current.set(task.id, controller);
    const operation = Symbol(); operations.current.set(task.id, operation);
    const active = () => !controller.signal.aborted && operations.current.get(task.id) === operation && latest.current.products.some(product => product.id === task.productId && !product.deleted_at && product.skus.some(sku => sku.id === task.skuId && !sku.deleted_at));
    transition(task.id, 'preparing', 0, 'AI 正在为目标店铺准备刊登信息');
    try {
      const information = await productListingAdapter().prepare(task, listingSourceInformation(product, task.skuId, latest.current.shops.find(shop => shop.id === task.shopId)), (value, message) => { if (active()) transition(task.id, 'preparing', Math.max(0, Math.min(99, value)), message); }, controller.signal);
      if (active()) transition(task.id, 'ready', 100, '预刊登信息已准备完成', { information });
    } catch (cause) { if (active()) transition(task.id, 'prepare_failed', task.progress, cause instanceof Error ? cause.message : '预刊登失败，请重试。'); }
    finally { if (operations.current.get(task.id) === operation) { running.current.delete(task.id); operations.current.delete(task.id); } }
  }, [transition]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setTasks(old => {
      const now = new Date().toISOString();
      return withListingMocks(claimedListingTasks(products, shops, old, now), products, now);
    }), 0);
    return () => clearTimeout(timer);
  }, [products, shops, ready]);
  useEffect(() => { if (ready) tasks.filter(task => task.status === 'preparing').forEach(task => { void prepare(task); }); }, [tasks, ready, prepare]);
  const acceptReceipt = useCallback((id: string, receipt: ListingReceipt, via: 'direct' | 'agent') => update(id, task => recordListingReceipt(task, receipt, via)), [update]);
  const publish = useCallback(async (id: string, via: 'direct' | 'agent' = 'direct') => {
    const task = latest.current.tasks.find(task => task.id === id);
    if (!task || task.presentationMock || !['ready', 'publish_failed'].includes(task.status) || running.current.has(id)) return;
    const product = latest.current.products.find(product => product.id === task.productId && !product.deleted_at);
    if (!product?.skus.some(sku => sku.id === task.skuId && !sku.deleted_at)) return;
    const controller = new AbortController(); running.current.set(id, controller);
    const operation = Symbol(); operations.current.set(id, operation);
    const requestId = task.publishRequestId || crypto.randomUUID();
    transition(id, 'publishing', 70, '正在提交刊登请求', { publishRequestId: requestId });
    try {
      const receipt = await productListingAdapter().publish(task, requestId, controller.signal);
      if (controller.signal.aborted || operations.current.get(id) !== operation || !latest.current.products.some(product => product.id === task.productId && !product.deleted_at && product.skus.some(sku => sku.id === task.skuId && !sku.deleted_at))) return;
      // Validate before the React update so malformed success payloads become retryable failures.
      recordListingReceipt({ ...task, status: 'publishing', publishRequestId: requestId }, receipt, via);
      acceptReceipt(id, receipt, via);
    } catch (cause) { if (!controller.signal.aborted && operations.current.get(id) === operation) transition(id, 'publish_failed', 0, cause instanceof Error ? cause.message : '刊登失败，请重试。'); }
    finally { if (operations.current.get(id) === operation) { running.current.delete(id); operations.current.delete(id); } }
  }, [acceptReceipt, transition]);
  const retry = useCallback((id: string) => { const task = latest.current.tasks.find(task => task.id === id); if (task?.status === 'prepare_failed') void prepare(task); else if (task?.status === 'publish_failed') void publish(id); }, [prepare, publish]);
  const message = useCallback((id: string, role: ListingMessage['role'], text: string) => { const at = new Date().toISOString(); update(id, task => ({ ...task, messages: [...task.messages, { role, text, at }] })); }, [update]);
  return { tasks, setTasks, publish, retry, message, acceptReceipt };
}
