import type { Association, Media, Product } from './commerce-demo-data';

export type ExportProgress = { phase: 'preparing' | 'writing'; completed: number; total: number };
export type ProductExportInput = {
  products: Product[]; links: Association[]; media: Media[]; origin: string;
  skuScopes?: Record<string, string[]>; filename: string;
};
export type ExportRequest = { id: string; input: ProductExportInput };
export type ExportResponse =
  | { id: string; type: 'progress'; progress: ExportProgress }
  | { id: string; type: 'complete'; buffer: ArrayBuffer }
  | { id: string; type: 'error'; message: string };
export type ProductExportTask = ExportProgress & {
  id: string; filename: string; productCount: number; skuCount: number;
  status: 'running' | 'success' | 'error' | 'cancelled'; url?: string; error?: string;
};
export type ExportWorker = {
  postMessage: (request: ExportRequest) => void; terminate: () => void;
  onmessage: ((event: MessageEvent<ExportResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
};
export const productExportMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
type ExportDependencies = {
  createWorker: () => ExportWorker; createId: () => string;
  createUrl: (blob: Blob) => string; revokeUrl: (url: string) => void;
  download: (url: string, filename: string) => void;
};

/** One export at a time, using a snapshot independent of later list edits. */
export class ProductExportController {
  private task: ProductExportTask | null = null;
  private input: ProductExportInput | null = null;
  private worker: ExportWorker | null = null;
  private completionTimer: ReturnType<typeof setTimeout> | null = null;
  private minimumDurationMs: number;
  private listeners = new Set<() => void>();
  private dependencies: ExportDependencies;
  constructor(dependencies: ExportDependencies, minimumDurationMs = 3000) { this.dependencies = dependencies; this.minimumDurationMs = minimumDurationMs; }
  getSnapshot = () => this.task;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(task: ProductExportTask | null) { this.task = task; this.listeners.forEach(listener => listener()); }
  private stopWorker() {
    if (this.worker) {
      this.worker.onmessage = null; this.worker.onerror = null; this.worker.onmessageerror = null;
      this.worker.terminate(); this.worker = null;
    }
  }
  private releaseUrl() { if (this.task?.url) this.dependencies.revokeUrl(this.task.url); }
  private clearCompletion() { if (this.completionTimer !== null) clearTimeout(this.completionTimer); this.completionTimer = null; }
  private fail(message: string) {
    if (this.task?.status !== 'running') return;
    this.clearCompletion(); this.stopWorker(); this.update({ ...this.task, status: 'error', error: message });
  }
  start = (input: ProductExportInput) => {
    if (this.task?.status === 'running' || !input.products.length) return false;
    const startedAt = Date.now();
    this.releaseUrl();
    const skuCount = input.products.reduce((count, product) => count + product.skus.filter(sku => !input.skuScopes?.[product.id] || input.skuScopes[product.id].includes(sku.id)).length, 0);
    const id = this.dependencies.createId();
    this.update({ id, filename: input.filename, productCount: input.products.length, skuCount, status: 'running', phase: 'preparing', completed: 0, total: input.products.length + skuCount });
    this.input = null;
    try {
      this.input = structuredClone(input);
      const worker = this.dependencies.createWorker();
      this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker || this.task?.id !== id || data.id !== id || this.task.status !== 'running') return;
        if (data.type === 'progress') {
          const completed = Math.max(this.task.completed, Math.min(this.task.total, data.progress.completed));
          this.update({ ...this.task, phase: data.progress.phase, completed });
        } else if (data.type === 'error') this.fail(data.message);
        else {
          try {
            if (!data.buffer.byteLength) throw new Error('文件生成失败，请重试。');
            this.stopWorker();
            const complete = () => {
              this.completionTimer = null;
              if (this.task?.id !== id || this.task.status !== 'running') return;
              try {
                const url = this.dependencies.createUrl(new Blob([data.buffer], { type: productExportMime }));
                this.input = null;
                this.update({ ...this.task, status: 'success', completed: this.task.total, url });
                // Keep the filename link available if automatic downloading is blocked.
                try { this.dependencies.download(url, this.task!.filename); } catch {}
              } catch { this.fail('文件生成失败，请重试。'); }
            };
            // Keep fast exports visible for three seconds; slow exports finish when ready.
            const remaining = this.minimumDurationMs - (Date.now() - startedAt);
            if (remaining > 0) this.completionTimer = setTimeout(complete, remaining);
            else complete();
          } catch { this.fail('文件生成失败，请重试。'); }
        }
      };
      worker.onerror = event => { event.preventDefault?.(); this.fail('导出中断，请重试。'); };
      worker.onmessageerror = () => this.fail('导出数据读取失败，请重试。');
      worker.postMessage({ id, input: this.input });
    } catch { this.fail('无法启动导出，请重试。'); }
    return true;
  };
  retry = () => { if (this.input && this.task?.status !== 'running') this.start(this.input); };
  cancel = () => {
    if (this.task?.status !== 'running') return;
    this.clearCompletion(); this.stopWorker(); this.update({ ...this.task, status: 'cancelled' });
  };
  dismiss = () => {
    if (this.task?.status === 'running') return;
    this.releaseUrl(); this.input = null; this.update(null);
  };
  dispose = () => { this.clearCompletion(); this.stopWorker(); this.releaseUrl(); this.input = null; this.task = null; };
}
