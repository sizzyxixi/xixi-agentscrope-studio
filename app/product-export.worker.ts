import { createProductExport } from './product-export';
import type { ExportRequest, ExportResponse } from './product-export-task';

const port = self as unknown as {
  onmessage: ((event: MessageEvent<ExportRequest>) => void) | null;
  postMessage: (message: ExportResponse, transfer?: Transferable[]) => void;
};
port.onmessage = async ({ data: { id, input } }) => {
  try {
    const file = await createProductExport(input.products, input.links, input.media, input.origin, input.skuScopes,
      progress => port.postMessage({ id, type: 'progress', progress }));
    const buffer = await file.arrayBuffer();
    port.postMessage({ id, type: 'complete', buffer }, [buffer]);
  } catch {
    port.postMessage({ id, type: 'error', message: '文件生成失败，请重试。' });
  }
};
