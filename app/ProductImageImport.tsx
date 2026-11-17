"use client";
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { ArrowRight, CheckCircle2, ImagePlus, Images, LoaderCircle, RefreshCw, ScanLine, X } from 'lucide-react';
import { StudioButton as Button, StudioInput as Input, StudioSelect as Select, StudioTextarea as Textarea } from './StudioControls';
import { claimWarning, importColumns } from './product-import';
import type { FieldSource } from './collection-service';
import { fieldKeys, required, numeric, type FieldKey, type ImageImportTask } from './use-image-import-task';

import { ImportFooter, ImportMeter, ImportNotice, ImportSteps, type ImportFlowProps } from './ProductImportDialog';
import s from './product-import.module.css';

const MAX_IMAGES = 5;

export function ImageProductImport({ setBusy, onClose, task }: ImportFlowProps & { task: ImageImportTask }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { step, images, setImages, fields, sources, errors, error, reading, saving, saved,
    uploading, mainReady, progress, elapsed, upload, sendImage, analyze, resetRecognition, edit, store, cancel } = task;
  useEffect(() => { setBusy(saving); return () => setBusy(false); }, [saving, setBusy]);
  function cancelAndClose() { cancel(); onClose(); }
  function field(key: FieldKey, index: number) {
    const source: FieldSource = sources[key]?.source || 'none';
    const inferred = ['visual_estimate', 'category_ref'].includes(source), readonly = key === 'sku';
    const value = fields[key], missing = required.has(key) && !value && !readonly;
    const labels: Partial<Record<FieldKey, string>> = { productL: '产品长（cm）', productW: '产品宽（cm）', productH: '产品高（cm）', packL: '包装长（cm）', packW: '包装宽（cm）', packH: '包装高（cm）' };
    const name = labels[key] || importColumns[index];
    const note = readonly ? '只读' : inferred ? 'AI 推断 · 请核对' : source === 'ocr' ? 'OCR 读取' : source === 'manual' ? '已手填' : '';
    return <tr key={key} data-inferred={inferred} data-import-error={!!errors[key] || missing}>
      <th scope="row">{name}{required.has(key) && <span className={s.confirmationRequired}> *</span>}</th>
      <td><div className={s.confirmationControl}>
        {key === 'unit' ? <Select aria-label="重量单位" value={fields.unit} onChange={e => edit(key, e.target.value)}><option>g</option><option>kg</option></Select> : key === 'description' ? <Textarea aria-label={name} rows={3} value={value} onChange={e => edit(key, e.target.value)}/> : <Input aria-label={name} value={value} readOnly={readonly} inputMode={numeric.has(key) || key === 'price' ? 'decimal' : undefined} maxLength={key === 'title' ? 100 : key === 'spec' ? 255 : undefined} aria-invalid={!!errors[key]} onChange={e => edit(key, e.target.value)} placeholder={numeric.has(key) ? '填写具体数字' : key === 'code' ? '留空自动生成' : ''}/>}
        <span className={s.confirmationSource} data-source={source} title={sources[key]?.confidence !== undefined ? `置信度 ${Math.round(Math.max(0, Math.min(1, sources[key]!.confidence!)) * 100)}%` : undefined}>{note}</span>
      </div>{errors[key] && <small className={s.fieldError}>{errors[key]}</small>}</td>
    </tr>;
  }
  const section = (title: string, keys: readonly FieldKey[], optional = false) => <section className={s.confirmationSection}><h3>{title}{optional && <small>选填</small>}</h3><table className={s.confirmationTable} aria-label={`${title}确认表`}><colgroup><col className={s.confirmationLabelColumn}/><col/></colgroup><tbody>{keys.map(key => field(key, fieldKeys.indexOf(key)))}</tbody></table></section>;

  return <>
    <ImportSteps labels={['上传图片', 'AI 分析', '人工确认']} current={saved ? 3 : step}/>
    {saved ? <div className={s.completion}><span><CheckCircle2 size={32}/></span><h2>商品资料已确认</h2><p>{saved.name} · {saved.sku}</p><small>商品图片与资料已确认完成。</small></div> : step === 0 ? <>
      <div className={`${s.help} ${s.imageGuide}`}><Images size={16}/><div><p>每个商品最多上传 5 张图片：1 张主图、4 张辅助图。支持一次选择多张，也可逐张补充；辅助图用于补充尺寸、成分及细节。</p><p>JPG / PNG / WEBP · 每张 ≤5MB · 自动压缩至长边 ≤1600px</p></div></div>
      <div className={s.imageSlots} aria-label="商品图片，最多 5 张">
        {Array.from({ length: MAX_IMAGES }, (_, index) => {
          const image = images[index];
          const label = index === 0 ? '商品主图' : `辅助图 ${index}`;
          return image ? <div className={s.imageSlot} key={image.id}>
            <div>
              <Image src={image.preview} alt={image.file.name} width={160} height={160} unoptimized/>
              <span>{label}{index === 0 && <em className={s.imageRequired} aria-hidden="true">*</em>}</span>
              <Button aria-label={`移除${image.file.name}`} disabled={image.state === 'uploading'} onClick={() => { setImages(old => old.filter(item => item.id !== image.id)); resetRecognition(); }}><X size={13}/></Button>
            </div>
            <small className={s.uploadState} data-failed={image.state === 'failed'}>{image.state === 'done' ? '已上传' : image.state === 'uploading' ? '正在上传…' : image.error}</small>
            {image.state === 'failed' && <Button className={s.textButton} onClick={() => void sendImage(image)}><RefreshCw size={12}/>重新上传</Button>}
          </div> : <div className={s.imageSlot} key={`empty-${index}`}>
            <Button className={s.addImage} aria-label={`上传${label}`} disabled={reading || uploading} onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)); }}>
              <ImagePlus size={24}/><strong>{label}{index === 0 && <em className={s.imageRequired} aria-hidden="true">*</em>}</strong><span>点击或拖拽上传</span>
            </Button>
          </div>;
        })}
      </div>
      {images.slice(1).some(image => image.state === 'failed') && <ImportNotice>部分辅助图上传失败，可重新上传；继续分析时仅使用已上传图片。</ImportNotice>}
    </> : step === 1 ? <div className={s.processing}>
      <ScanLine className={s.pulse} size={34}/><h3 role="status">正在分析商品图片</h3>
      <p>{progress < 35 ? '正在读取商品图片' : progress < 70 ? '正在提取商品信息' : '正在整理商品资料'}</p>
      <ImportMeter value={progress} label="图片分析进度"/>
      <small>{progress}% · 已用时 {elapsed} 秒 · {images.filter(image => image.state === 'done').length} 张图片</small>
    </div> : <>
      {!mainReady && <ImportNotice>主图尚未上传成功，请返回图片步骤重试。商品资料可以继续填写。</ImportNotice>}<div className={s.confirmHeader}><CheckCircle2 size={17}/><span>请核对商品资料。绿色为图片文字识别，橙色为 AI 推断；重量与尺寸请填写实测或标注的具体值。</span></div>
      <div className={s.imageConfirmation}>
        <aside><Image src={images[0].preview} width={230} height={230} alt="商品主图" unoptimized/><strong>商品主图</strong>{images.length > 1 && <div className={s.auxThumbs} aria-label="辅助图片">{images.slice(1).map((image, index) => <Image key={image.id} src={image.preview} alt={`辅助图 ${index + 1}`} width={50} height={50} unoptimized/>)}</div>}</aside>
        <div className={s.confirmationFields}>
          {section('商品信息', fieldKeys.slice(0, 8).filter(key => !['mainUrl', 'ingredient', 'efficacy'].includes(key)))}
          {section('类目属性', ['ingredient', 'efficacy'], true)}
          {section('SKU 与规格', fieldKeys.slice(8))}
        </div>
      </div>
      {claimWarning(fields.efficacy) && <ImportNotice>{claimWarning(fields.efficacy)}</ImportNotice>}
    </>}
    {error && <ImportNotice>{error}</ImportNotice>}
    <ImportFooter>{saved ? <Button className={s.primary} onClick={cancelAndClose}>完成</Button> : step === 0 ? <><Button onClick={cancelAndClose}>取消</Button><Button className={s.primary} disabled={reading || uploading} onClick={analyze}><ScanLine size={14}/>开始分析</Button></> : step === 1 ? <><span className={s.footerHint}>关闭后分析继续，再次打开可查看进度</span><Button onClick={cancelAndClose}>取消</Button></> : <><Button disabled={saving} onClick={cancelAndClose}>取消</Button><Button disabled={saving} className={s.primary} onClick={() => void store()}>{saving && <LoaderCircle className={s.spin} size={14}/>}确认资料<ArrowRight size={14}/></Button></>}</ImportFooter>
    <Input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; void upload(files); }}/>
  </>;
}
