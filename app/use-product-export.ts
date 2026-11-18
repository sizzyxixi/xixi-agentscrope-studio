"use client";
import { randomId } from '../lib/browser-id';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ProductExportController } from './product-export-task';

const serverSnapshot = () => null;
export function useProductExport() {
  const [controller] = useState(() => new ProductExportController({
    createWorker: () => new Worker(new URL('./product-export.worker.ts', import.meta.url), { type: 'module' }),
    createId: () => randomId(),
    createUrl: blob => URL.createObjectURL(blob), revokeUrl: url => URL.revokeObjectURL(url),
    download: (url, filename) => {
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
    },
  }));
  const task = useSyncExternalStore(controller.subscribe, controller.getSnapshot, serverSnapshot);
  useEffect(() => () => controller.dispose(), [controller]);
  return { task, start: controller.start, retry: controller.retry, cancel: controller.cancel, dismiss: controller.dismiss };
}
