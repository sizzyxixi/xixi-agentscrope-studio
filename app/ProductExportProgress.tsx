"use client";
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { StudioButton as Button } from './StudioControls';
import type { useProductExport } from './use-product-export';
import s from './product-export-progress.module.css';

export function ProductExportProgress({ task, retry, dismiss }: ReturnType<typeof useProductExport>) {
  if (!task || typeof document === 'undefined') return null;
  const running = task.status === 'running', success = task.status === 'success', failed = task.status === 'error';
  const title = running ? '导出商品' : success ? '导出成功' : failed ? '导出失败' : '已取消导出';
  return createPortal(<aside key={task.id} className={s.card} aria-label="商品导出任务">
    <div className={s.header}>
      <strong role="status">{title}</strong>
      {!running && <Button className={s.close} aria-label="关闭导出进度" onClick={dismiss}><X size={16}/></Button>}
    </div>
    {running && <>
      <p className={s.count}>{task.productCount} 个商品 · {task.skuCount} 个 SKU</p>
      <div className={s.track} role="progressbar" aria-label="商品导出进度" aria-valuetext="导出中"><span/></div>
    </>}
    {success && <a className={s.filename} href={task.url} download={task.filename}>{task.filename}</a>}
    {failed && <><p className={s.error}>{task.error}</p><Button className={s.retry} onClick={retry}>重试导出</Button></>}
  </aside>, document.body);
}
