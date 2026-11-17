"use client";

import { useState, type ReactNode } from 'react';
import { ProgressBar, Tabs } from '@heroui/react';
import { ArrowRight, CircleAlert, Link2, RefreshCw } from 'lucide-react';
import { ImportStepper } from '@/components/ImportStepper';
import { FormDialog, FormDialogFooter, formDialogClasses as f } from '@/components/hero-ui/form-dialog';
import { useCommerceDemo } from './CommerceDemoContext';
import { StudioButton as Button, StudioTextarea as Textarea } from './StudioControls';
import { type CollectionTask } from './collection-service';
import type { Product } from './commerce-demo-data';
import type { LinkSource } from './product-import';
import { ExcelProductImport } from './ProductExcelImport';
import { ImageProductImport } from './ProductImageImport';
import type { ImageImportTask } from './use-image-import-task';
import { ExcelImportStateControls } from './ExcelImportStateControls';
import { LinkImportStateControls } from './LinkImportStateControls';
import { LinkCollectionResults } from './LinkCollectionResults';
import type { LinkCollectionFailure } from './link-collection-results';
import { createLinkImportScenario, retryLinkImportScenario, type LinkImportScenario } from './product-link-import-demo';
import type { ExcelImportScenario } from './product-import-demo';
import s from './product-import.module.css';

export type ImportMethod = 'link' | 'excel' | 'image';
export type ImportFlowProps = { setBusy: (value: boolean) => void; onClose: () => void; onOpen: (product: Product) => void };
export function downloadImportFile(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function ImportSteps({ labels, current }: { labels: string[]; current: number }) { return <ImportStepper labels={labels} current={current}/>; }
export function ImportMeter({ value, label }: { value: number; label: string }) { return <ProgressBar value={value} aria-label={label} className={s.meter}><ProgressBar.Track className={s.track}><ProgressBar.Fill className={s.fill}/></ProgressBar.Track></ProgressBar>; }
export function ImportNotice({ children }: { children: ReactNode }) { return <div className={s.notice} role="alert"><CircleAlert size={15}/><div>{children}</div></div>; }
export function ImportFooter({ children }: { children: ReactNode }) { return <FormDialogFooter className={s.footer}>{children}</FormDialogFooter>; }
export function exportCollectionFailures(tasks: CollectionTask[]) {
  const csv = [['采集类型', '输入行号', '失败链接或 ID', '失败原因码', '失败原因', '采集时间', '批次号', '重试次数'], ...tasks.flatMap(task => task.results.filter(r => r.status === '失败' && !r.resolved && !r.dismissed).map(r => [task.source, r.inputLine ?? '', r.input, r.code, r.message, task.createdAt, task.id, String(r.retries || 0)]))].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  downloadImportFile(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), '采集失败清单.csv');
}
export function ProductImportDialog({ method, initialTask, onClose, onOpen, imageTask }: { method: ImportMethod; imageTask: ImageImportTask; initialTask?: string; onClose: () => void; onOpen: (product: Product) => void }) {
  const { collectionTasks } = useCommerceDemo();
  const [busy, setBusy] = useState(false);
  const [excelStep, setExcelStep] = useState(0);
  const [scenario, setScenario] = useState<{id: ExcelImportScenario | null; revision: number}>({id: null, revision: 0});
  const [linkSource, setLinkSource] = useState<LinkSource>(() => collectionTasks.find(task => task.id === initialTask)?.source === 'Amazon' ? 'Amazon' : '1688');
  const [linkScenario, setLinkScenario] = useState<{id: LinkImportScenario | null; revision: number}>({id: initialTask ? null : 'initial', revision: 0});
  const controls = method === 'link' ? <LinkImportStateControls active={linkScenario.id} onSelect={id => setLinkScenario(old => ({id, revision: old.revision + 1}))}/> : method === 'excel' ? <ExcelImportStateControls step={excelStep} active={scenario.id} onSelect={id => { setBusy(false); setExcelStep(id.startsWith('store-')?3:id.startsWith('validation-')?1:0); setScenario(old => ({id, revision: old.revision + 1})); }}/> : undefined;
  return <FormDialog title={{ link: '链接采集', excel: 'Excel 导入', image: '识图采集' }[method]} onClose={onClose} busy={busy} dismissOnBackdrop={method === 'image'} sidePanel={controls} wide className={`${s.importDialog} ${method === 'excel' ? s.excelDialog : ''}`}><div className={`${f.body} ${s.body}`}>
    {method === 'link' ? <LinkImport key={linkScenario.revision} initialTask={linkScenario.id ? undefined : initialTask} initialSource={linkSource} scenario={linkScenario.id || 'initial'} onInteract={() => setLinkScenario(old => old.id ? {...old, id: null} : old)} onSourceChange={setLinkSource} onPreviewChange={id => setLinkScenario(old => ({...old, id}))} onClose={onClose}/> : method === 'excel' ? <ExcelProductImport key={scenario.revision} scenario={scenario.id || undefined} onStepChange={setExcelStep} onInteract={() => setScenario(old => old.id ? {...old, id: null} : old)} setBusy={setBusy} onClose={onClose} onOpen={onOpen}/> : <ImageProductImport task={imageTask} setBusy={setBusy} onClose={onClose} onOpen={onOpen}/>}
  </div></FormDialog>;
}
function LinkImport({ initialTask, initialSource, scenario, onInteract, onSourceChange, onPreviewChange, onClose }: { initialTask?: string; initialSource: LinkSource; scenario: LinkImportScenario; onInteract: () => void; onSourceChange: (source: LinkSource) => void; onPreviewChange: (scenario: LinkImportScenario) => void; onClose: () => void }) {
  const d = useCommerceDemo();
  const initial = d.collectionTasks.find(task => task.id === initialTask);
  const [source, setSource] = useState<LinkSource>(initial?.source === 'Amazon' ? 'Amazon' : initial?.source === '1688' ? '1688' : initialSource);
  const [inputs, setInputs] = useState<Record<LinkSource, string>>({ '1688': '', Amazon: '' });
  const [taskId, setTaskId] = useState(initialTask || '');
  const [error, setError] = useState('');
  const [previewTask, setPreviewTask] = useState(() => createLinkImportScenario(scenario, source));
  const task = previewTask || d.collectionTasks.find(task => task.id === taskId);
  const running = task?.phase === 'running';

  function collect(value = inputs[source]) { onInteract(); setPreviewTask(null); try { setTaskId(d.startCollection(value, source)); setError(''); } catch (e) { setError(e instanceof Error ? e.message : '提交失败，请重试。'); } }
  function retry(row: LinkCollectionFailure) { if (previewTask) { const next = retryLinkImportScenario(previewTask, row.input); setPreviewTask(next); const failures = next.results.filter(result => result.status === '失败').length; onPreviewChange(!failures ? 'success' : failures === next.results.length ? 'failed' : 'partial'); return; } collect(row.input); }
  return <>
    <Tabs selectedKey={source} onSelectionChange={key => { setSource(key as LinkSource); onSourceChange(key as LinkSource); setError(''); if (previewTask) setPreviewTask(createLinkImportScenario(scenario, key as LinkSource)); }} className={s.sourceTabs}><Tabs.List aria-label="采集来源" className={s.sourceList}>{(['1688', 'Amazon'] as const).map(value => <Tabs.Tab id={value} key={value} isDisabled={!!task && !previewTask} className={s.sourceTab}>{value === 'Amazon' ? '亚马逊' : value}<Tabs.Indicator className={s.tabIndicator}/></Tabs.Tab>)}</Tabs.List></Tabs>
    {!task ? <>
      <div className={`${s.help} ${s.linkGuide}`}><Link2 size={16}/><div><p>支持 {source === '1688' ? '1688 标准商品链接或 10 位商品 ID' : '亚马逊多站点商品链接或 B0 开头的 ASIN'}。</p><p>每行一条，单次最多 50 条；空行和重复商品自动忽略。{source === 'Amazon' && '每个 ASIN 仅采集当前变体。'}</p><p>重复采集将更新同一来源下对应 SKU 的商品资料（包括已编辑内容），保留创作素材与渠道内容。</p></div></div>
      <Textarea aria-label="商品链接或 ID" className={s.linkInput} rows={8} value={inputs[source]} onChange={e => setInputs(old => ({ ...old, [source]: e.target.value }))} placeholder={source === '1688' ? 'https://detail.1688.com/offer/6945218330.htm\n6945218330' : 'https://www.amazon.com/dp/B0C7XK2M1P\nB0C7XK2M1P'}/>
      <div className={`${s.inputFoot} ${s.linkInputFoot}`}><span>已填写 {inputs[source].split('\n').filter(value => value.trim()).length} 条</span></div>
      {error && <ImportNotice>{error}</ImportNotice>}
      <ImportFooter><Button onClick={onClose}>取消</Button><Button className={s.primary} disabled={!inputs[source].trim() || !d.collectionReady} onClick={() => collect()}>开始采集<ArrowRight size={14}/></Button></ImportFooter>
    </> : <>
      <LinkCollectionResults task={task} onRetry={retry} onExport={() => exportCollectionFailures([task])} onEdit={row => { setInputs(old => ({ ...old, [source]: row.input })); setTaskId(''); setPreviewTask(null); setError(''); onInteract(); }}/>
      <ImportFooter>{running ? <><span className={s.footerHint}>关闭后可从商品库的采集任务入口查看进度</span><Button onClick={onClose}>后台继续</Button></> : <><Button onClick={() => { setTaskId(''); setPreviewTask(null); setError(''); onInteract(); }}><RefreshCw size={14}/>再采集一次</Button><Button className={s.primary} onClick={onClose}>返回商品库<ArrowRight size={14}/></Button></>}</ImportFooter>
    </>}
  </>;
}
