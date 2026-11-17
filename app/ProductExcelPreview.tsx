"use client";
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet } from 'lucide-react';
import { StudioButton as Button } from './StudioControls';
import { filterImportPreview, type PreviewFilter, type productImportPreview } from './product-import-preview';
import s from './product-import.module.css';

export function ProductExcelPreview({ preview, file, onUpload, onErrors }: {
  preview: ReturnType<typeof productImportPreview>; file: string; onUpload: () => void; onErrors: () => void;
}) {
  const [filter, setFilter] = useState<PreviewFilter>('全部');
  const [page, setPage] = useState(1);
  const rows = filterImportPreview(preview.rows, filter), pages = Math.max(1, Math.ceil(rows.length / 20));
  const current = Math.min(page, pages), visible = rows.slice((current - 1) * 20, current * 20);
  const filters: [PreviewFilter, number][] = [['全部', preview.rows.length], ['可导入', preview.importable], ['错误', preview.errors], ['重复', preview.duplicates], ['提示', preview.warnings]];
  return <>
    <div className={s.previewFile}><FileSpreadsheet size={21}/><div><strong>{file}</strong><span>共 {preview.rows.length} 行 · {preview.groupCount} 组商品</span></div><Button onClick={onUpload}>重新上传</Button></div>
    <div className={s.previewTools}>
      <div className={s.previewFilters} role="group" aria-label="校验结果筛选">{filters.map(([label, count]) => <Button key={label} aria-pressed={filter === label} data-result={label} onClick={() => { setFilter(label); setPage(1); }}>{label}<span>{count}</span></Button>)}</div>
      {preview.errors > 0 && <Button className={s.errorExport} onClick={onErrors}><Download size={14}/>导出错误行</Button>}
    </div>
    <div className={`${s.tableWrap} ${s.previewTableWrap}`}><table className={`${s.table} ${s.previewTable}`} aria-label="Excel 校验结果"><thead><tr><th>原始行号</th><th>校验结果</th><th>商品 / 父商品编码</th><th>SKU 货号</th><th>规格</th><th>错误 / 提示</th></tr></thead><tbody>
      {visible.map(row => <tr key={row.row}>
        <td className={s.rowNumber}>{row.row}</td>
        <td><span className={s.previewStatus} data-result={row.status}>{row.status}</span></td>
        <td><strong className={s.previewProduct}>{row.title || '未填写标题'}</strong><small className={s.previewCode}>{row.parent || '—'}{row.generatedParent && <span>系统生成</span>}</small></td>
        <td><span className={s.previewCodeValue}>{row.sku || '—'}</span>{row.generatedSku && <small className={s.previewCode}>系统生成</small>}</td>
        <td>{row.spec || '—'}</td>
        <td className={s.previewMessages}>{row.messages.length ? row.messages.map((message, index) => <p key={index}>{message}</p>) : <span className={s.muted}>—</span>}</td>
      </tr>)}
      {!rows.length && <tr><td colSpan={6} className={s.previewEmpty}>{!preview.rows.length ? '文件中没有商品数据，请填写后重新上传' : `没有${filter === '全部' ? '' : filter}记录`}</td></tr>}
    </tbody></table></div>
    <div className={s.previewPagination}><div><span>共 {rows.length} 行</span><Button aria-label="上一页校验结果" disabled={current === 1} onClick={() => setPage(current - 1)}><ChevronLeft size={14}/></Button><span>{current} / {pages}</span><Button aria-label="下一页校验结果" disabled={current === pages} onClick={() => setPage(current + 1)}><ChevronRight size={14}/></Button></div></div>
  </>;
}
