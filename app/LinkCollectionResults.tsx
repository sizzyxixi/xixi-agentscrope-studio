"use client";
import { CheckCircle2, CircleAlert, Download, LoaderCircle } from 'lucide-react';
import type { CollectionTask } from './collection-service';
import { linkCollectionResults, type LinkCollectionFailure } from './link-collection-results';
import { StudioButton as Button } from './StudioControls';
import { ImportMeter } from './ProductImportDialog';
import s from './product-import.module.css';

export function LinkCollectionResults({ task, onRetry, onEdit, onExport }: { task: CollectionTask; onRetry: (row: LinkCollectionFailure) => void; onEdit: (row: LinkCollectionFailure) => void; onExport: () => void }) {
  const { total, success, failed, failures } = linkCollectionResults(task);
  const running = task.phase === 'running', allSucceeded = !running && failed === 0;
  const hasLineNumbers = failures.some(row => row.inputLine !== undefined);
  return <>
    <div className={`${s.linkCollectionOutcome} ${allSucceeded ? s.linkCollectionSuccess : ''}`} data-failed={failed > 0} role="status">
      <span>{running ? <LoaderCircle className={s.spin} size={24}/> : failed ? <CircleAlert size={24}/> : <CheckCircle2 size={32}/>}</span>
      <div><h3>{running ? '正在采集商品资料' : failed ? success ? `成功 ${success} 条，失败 ${failed} 条` : `采集失败，共 ${failed} 条` : `成功采集 ${success} 条`}</h3>{running && <p>已处理 {success + failed} / {total} 条，成功 {success} 条。可关闭弹窗，任务将继续执行。</p>}</div>
    </div>
    {running && <ImportMeter value={total ? ((success + failed) / total) * 100 : 0} label="采集进度"/>}
    {failed > 0 && <>
      <div className={s.linkFailureHeading}><h3>失败记录</h3><Button onClick={onExport}><Download size={13}/>导出失败清单</Button></div>
      <div className={s.tableWrap}><table className={s.table} aria-label="采集失败记录"><thead><tr>{hasLineNumbers && <th>输入行号</th>}<th>失败链接或 ID</th><th>失败原因</th><th>操作</th></tr></thead><tbody>{failures.map(row => <tr key={row.input}>
        {hasLineNumbers && <td>{row.inputLine ?? '—'}</td>}
        <td><span className={s.linkFailureInput}>{row.input}</span></td><td>{row.message || '采集失败，请重试。'}</td>
        <td><Button disabled={running} onClick={() => ['LINK_INVALID', 'PLAT_MISMATCH'].includes(row.code) ? onEdit(row) : onRetry(row)}>{['LINK_INVALID', 'PLAT_MISMATCH'].includes(row.code) ? '修改输入' : '重试'}</Button></td>
      </tr>)}</tbody></table></div>
    </>}
  </>;
}
