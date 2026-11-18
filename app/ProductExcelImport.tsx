"use client";
import { randomId } from '../lib/browser-id';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert, Download, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import { FieldLabel, StudioButton as Button, StudioInput as Input } from './StudioControls';
import { createErrorWorkbook, createProductTemplate } from './product-import-workbook';
import { createExcelImportDemo, createExcelScenario, createExcelStoreResult, type ExcelImportScenario } from './product-import-demo';
import { ProductExcelPreview } from './ProductExcelPreview';
import { downloadImportFile, ImportFooter, ImportMeter, ImportNotice, ImportSteps, type ImportFlowProps } from './ProductImportDialog';
import s from './product-import.module.css';

export function ExcelProductImport({ setBusy, onClose, scenario, onInteract, onStepChange }: ImportFlowProps & { scenario?: ExcelImportScenario; onInteract?: () => void; onStepChange?: (step: number) => void }) {
  const [initial] = useState(() => createExcelScenario(scenario));
  const [step, setStep] = useState(initial.step), [file, setFile] = useState(initial.file), [error, setError] = useState('');
  const [data, setData] = useState(initial.data), [result, setResult] = useState(initial.result);
  const [uploadState, setUploadState] = useState(initial.uploadState);
  const [loading, setLoading] = useState(false), [dragging, setDragging] = useState(false), [allowPartial, setAllowPartial] = useState(false);
  const [progress, setProgress] = useState(0), [batch, setBatch] = useState(() => initial.result ? randomId() : '');
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preview = data?.preview, newSkus = preview?.importable || 0;
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  function move(next: number) { setStep(next); onStepChange?.(next); }

  function upload(file: Pick<File, 'name'>) {
    if (loading) return;
    onInteract?.();
    setError(''); setLoading(true); setBusy(true); setDragging(false); setFile(file.name);
    setData(null); setResult(null); setUploadState('idle'); setAllowPartial(false); setBatch(randomId()); move(1);
    // The prototype uses a fixed preview and deliberately never reads file contents.
    timer.current = setTimeout(() => {
      timer.current = null; setData(createExcelImportDemo()); setLoading(false); setBusy(false);
    }, 1500);
  }
  async function exportErrors(filename = '商品导入错误明细.xlsx', issues = data?.issues) {
    if (!data) return;
    try { downloadImportFile(await createErrorWorkbook(data.rawRows, issues || []), filename); }
    catch { setError('错误明细导出失败，请重试。'); }
  }
  function store() {
    if (!data || loading || !newSkus || data.issues.length && !allowPartial) return;
    onInteract?.();
    if (!batch) setBatch(randomId());
    setBusy(true); setLoading(true); move(2); setProgress(0); setError('');
    const advance = (value: number) => {
      setProgress(value);
      if (value < 100) timer.current = setTimeout(() => advance(value + 25), 300);
      else { timer.current = null; setResult(createExcelStoreResult(data)); move(3); setLoading(false); setBusy(false); }
    };
    // Preview the save states without sending fixture data to ERP or the catalog.
    timer.current = setTimeout(() => advance(25), 300);
  }
  function reset() { onInteract?.(); move(0); setUploadState('idle'); setData(null); setResult(null); setError(''); setAllowPartial(false); setProgress(0); }
  return <>
    <ImportSteps labels={['上传', '校验', '落库', '完成']} current={step}/>
    {step === 0 && uploadState === 'idle' && <div className={s.excelDropzone} data-dragging={dragging}
      onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files[0]) upload(event.dataTransfer.files[0]); }}>
      <span className={s.uploadIcon}><Upload size={28}/></span>
      <h3>拖拽文件到此处</h3>
      <p>支持 XLSX / XLS / CSV · 最多 2000 行 · 文件不超过 20MB</p>
      <div className={s.excelUploadActions}>
        <Button onClick={() => { void createProductTemplate().then(blob => downloadImportFile(blob, '商品导入模板_v2.2.xlsx')).catch(() => setError('模板下载失败，请重试。')); }}><Download size={14}/>下载导入模板</Button>
        <Button className={s.primary} onClick={() => fileRef.current?.click()}>选择本地文件</Button>
      </div>
    </div>}
    {step === 0 && uploadState === 'failed' && <div className={s.uploadOutcome} data-failed={uploadState === 'failed'}>
      <span><CircleAlert size={30}/></span>
      <h3>文件校验失败</h3>
      <p><FileSpreadsheet size={16}/>{file}</p>
      <p>文件格式或模板不符合要求，请使用导入模板重新上传。</p>
      <Button onClick={() => fileRef.current?.click()}>重新上传</Button>
    </div>}
    {step === 1 && !data && <div className={s.processing}><LoaderCircle size={30} className={s.spin}/><h3 role="status">校验中…</h3><p>{file}</p></div>}
    {step === 1 && data && preview && <ProductExcelPreview key={batch} file={file} preview={preview} onUpload={() => fileRef.current?.click()} onErrors={() => void exportErrors()}/>}
    {step === 2 && <div className={s.processing}><LoaderCircle size={30} className={s.spin}/><h3>正在导入商品</h3><ImportMeter value={progress} label="落库进度"/><small>{progress}%</small></div>}
    {step === 3 && data && result && <>
      <div className={s.completion} data-failed={!!result.issues.length} data-outcome={result.outcome}><span>{result.outcome === 'success' ? <CheckCircle2 size={32}/> : <CircleAlert size={32}/>}</span><h2>{result.outcome === 'success' ? '商品导入完成' : result.outcome === 'failed' ? '商品导入失败' : '部分商品导入成功'}</h2><p>已导入 {result.success} 个 SKU，重复跳过 {result.skipped} 行，失败 {result.issues.length} 行。</p><small>批次号：{batch}</small>{!!result.issues.length && <Button className={s.failureExport} onClick={() => void exportErrors('商品导入失败明细.xlsx', result.issues)}><Download size={14}/>导出失败明细</Button>}</div>
    </>}
    {error && <ImportNotice>{error}</ImportNotice>}
    <ImportFooter>{step === 0 ? <Button onClick={onClose}>取消</Button> : step === 1 ? <>
      {!!data?.issues.length && newSkus > 0 && <FieldLabel className={`${s.partial} ${s.footerPartial}`}><Input type="checkbox" checked={allowPartial} onChange={event => setAllowPartial(event.target.checked)}/>仅导入通过行，错误行修正后可重新上传</FieldLabel>}
      <Button disabled={loading} onClick={reset}>上一步</Button><Button disabled={loading || !data || !newSkus || !!data.issues.length && !allowPartial} className={s.primary} onClick={store}>{loading ? '正在校验…' : !newSkus ? '暂无可导入数据' : `确认导入 ${newSkus} 个 SKU`}<ArrowRight size={14}/></Button>
    </> : step === 3 ? <><Button onClick={reset}>继续导入</Button><Button className={s.primary} onClick={onClose}>完成</Button></> : <span className={s.footerHint}>正在保存，请稍候…</span>}</ImportFooter>
    <Input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) upload(file); }}/>
  </>;
}
