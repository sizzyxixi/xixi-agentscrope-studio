"use client";
import { useState } from 'react';
import { Download, FileClock, RefreshCw, Trash2 } from 'lucide-react';
import { useCommerceDemo } from './CommerceDemoContext';
import { StudioButton as Button, StudioInput as Input } from './StudioControls';
import type { LinkSource } from './product-import';
import type { ImportMethod } from './ProductImportDialog';
import { sourceIdentity, type CollectionTask } from './collection-service';
import { exportCollectionFailures } from './ProductImportDialog';
import s from './product-import.module.css';

export function unresolvedCollectionFailures(tasks: CollectionTask[]) {
  const seen = new Set<string>();
  return tasks.flatMap(task => task.results.flatMap(result => {
    const key = sourceIdentity(task.source, result);
    if (seen.has(key)) return []; seen.add(key);
    return result.status === '失败' && !result.dismissed && !result.resolved ? [{ task, result, key }] : [];
  }));
}
const date = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });
export function ProductCollectionRecords({ view, onTask, onImport }: { view: 'failure' | 'history'; onTask: (id: string) => void; onImport: (method: ImportMethod) => void }) {
  const d = useCommerceDemo();
  const [selected, setSelected] = useState<string[]>([]), [query, setQuery] = useState(''), [confirm, setConfirm] = useState(false);
  const failures = unresolvedCollectionFailures(d.collectionTasks).filter(({ result, task }) => `${result.input} ${result.code} ${task.source}`.toLowerCase().includes(query.toLowerCase()));
  const selection = failures.filter(row => selected.includes(row.key));
  function remove() { selection.forEach(({ task, result }) => d.dismissCollectionFailure(task.id, result.input)); setSelected([]); setConfirm(false); }
  const busy = (source: CollectionTask['source'], input: string) => d.collectionTasks.some(task => task.source === source && task.phase === 'running' && task.results.some(row => row.input === input));
  return <div className={`${s.records} ${s.body}`}>
    {view === 'failure' ? <>
      <div className={s.recordsToolbar}><Input aria-label="搜索失败记录" value={query} onChange={e => { setQuery(e.target.value); setSelected([]); setConfirm(false); }} placeholder="搜索来源、源标识或原因码"/><span>{failures.length} 条未处理</span><Button disabled={!selection.length} onClick={() => setConfirm(true)}><Trash2 size={13}/>删除 {selection.length || ''}</Button><Button disabled={!failures.length} onClick={() => exportCollectionFailures(failures.map(({ task, result }) => ({ ...task, results: [result] })))}><Download size={13}/>导出失败清单</Button></div>
      {confirm && <div className={s.deletePrompt} role="alert"><span>删除所选的 {selection.length} 条失败记录？</span><Button onClick={() => setConfirm(false)}>取消</Button><Button onClick={remove}>确认删除</Button></div>}
      {failures.length ? <div className={s.tableWrap}><table className={s.table}><thead><tr><th><Input type="checkbox" aria-label="选择全部失败记录" checked={failures.length > 0 && failures.every(row => selected.includes(row.key))} onChange={e => setSelected(e.target.checked ? failures.map(row => row.key) : [])}/></th><th>采集类型</th><th>源标识</th><th>失败原因</th><th>采集时间</th><th>操作</th></tr></thead><tbody>{failures.map(({ task, result, key }) => <tr key={key}><td><Input type="checkbox" aria-label={`选择${result.input}`} checked={selected.includes(key)} onChange={e => setSelected(old => e.target.checked ? [...old, key] : old.filter(id => id !== key))}/></td><td>{task.source === 'Excel' ? 'Excel 导入' : task.source === '识图' ? '识图采集' : `${task.source} 链接采集`}</td><td><span className={s.truncate} title={result.input}>{result.input}</span><small className={s.retryHint}>{task.id.slice(0, 8)} · 已自动重试 {result.retries || 0} 次</small></td><td><code>{result.code}</code><br/>{result.message}</td><td>{date(task.createdAt)}</td><td><div className={s.inlineActions}><Button disabled={busy(task.source, result.input)} onClick={() => task.source === 'Excel' || task.source === '识图' ? onImport(task.source === 'Excel' ? 'excel' : 'image') : ['LINK_INVALID', 'PLAT_MISMATCH'].includes(result.code) ? onTask(task.id) : onTask(d.startCollection(result.input, task.source as LinkSource))}><RefreshCw size={12}/>{['LINK_INVALID', 'PLAT_MISMATCH'].includes(result.code) ? '修改' : ['Excel', '识图'].includes(task.source) ? '重新导入' : '重试'}</Button><Button onClick={() => { setSelected([key]); setConfirm(true); }}>删除</Button></div></td></tr>)}</tbody></table></div> : <div className={s.recordsEmpty}><FileClock size={25}/><h3>暂无采集失败记录</h3><p>失败项会保留来源与原因，可在这里重试或删除。</p></div>}
    </> : <>
      <div className={s.recordsToolbar}><strong>采集记录</strong><span>关闭弹窗后，可在这里继续查看任务</span></div>
      {d.collectionTasks.length ? <div className={s.tableWrap}><table className={s.table}><thead><tr><th>采集来源</th><th>提交时间</th><th>总条数</th><th>成功 / 失败</th><th>任务状态</th><th>操作</th></tr></thead><tbody>{d.collectionTasks.map(task => <tr key={task.id}><td>{task.source}<small className={s.retryHint}>{task.id.slice(0, 8)}</small></td><td>{date(task.createdAt)}</td><td>{task.results.length}</td><td>{task.results.filter(row => row.status === '成功').length} / {task.results.filter(row => row.status === '失败').length}</td><td><span className={s.status}>{task.phase === 'running' ? '采集中' : '已完成'}</span></td><td><Button onClick={() => task.source === 'Excel' || task.source === '识图' ? onImport(task.source === 'Excel' ? 'excel' : 'image') : onTask(task.id)}>{['Excel', '识图'].includes(task.source) ? '重新导入' : '查看结果'}</Button></td></tr>)}</tbody></table></div> : <div className={s.recordsEmpty}><FileClock size={25}/><h3>暂无采集任务</h3><p>通过「导入商品」开始链接采集。</p></div>}
    </>}
  </div>;
}
