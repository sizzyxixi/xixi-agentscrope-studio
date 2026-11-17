"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { checkImageFile, normalizeSpec, positive, validImageUrl } from './product-import';
import type { AnalyzedField } from './collection-service';
import { ImageAnalysisTask } from './product-image-analysis';

const MAX_IMAGES = 5;

type ImageSlot = { id: string; file: File; preview: string; url: string; role: string; state: 'uploading' | 'done' | 'failed'; error?: string };
export const fieldKeys = ['code', 'title', 'brand', 'mainUrl', 'description', 'ingredient', 'efficacy', 'source', 'sku', 'spec', 'skuUrl', 'weight', 'unit', 'price', 'productL', 'productW', 'productH', 'packL', 'packW', 'packH'] as const;
export type FieldKey = typeof fieldKeys[number];
type Fields = Record<FieldKey, string>;
export const required = new Set<FieldKey>(['title', 'mainUrl', 'spec', 'weight', 'productL', 'productW', 'productH', 'packL', 'packW', 'packH']);
export const numeric = new Set<FieldKey>(['weight', 'productL', 'productW', 'productH', 'packL', 'packW', 'packH']);
const empty = () => Object.fromEntries(fieldKeys.map(key => [key, key === 'unit' ? 'g' : ''])) as Fields;
async function compress(file: File) {
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    if (scale === 1) return file;
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d'); if (!context) throw new Error('图片处理失败，请重新上传。');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片压缩失败。')), file.type, 0.9));
    return new File([blob], file.name, { type: file.type });
  } finally { image.close(); }
}
export function useImageImportTask() {
  const [batch, setBatch] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState(0), [images, setImages] = useState<ImageSlot[]>([]);
  const [fields, setFields] = useState<Fields>(() => ({ ...empty(), sku: `IMG-${batch.slice(0, 8).toUpperCase()}-01` }));
  const [sources, setSources] = useState<Partial<Record<FieldKey, AnalyzedField>>>({});
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [error, setError] = useState('');
  const [analysisTask] = useState(() => new ImageAnalysisTask());
  const analysis = useSyncExternalStore(analysisTask.subscribe, analysisTask.getSnapshot, analysisTask.getSnapshot);
  const [reading, setReading] = useState(false), [saving, setSaving] = useState(false), [saved, setSaved] = useState<{ name: string; sku: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), urls = useRef<string[]>([]), generation = useRef(0);
  const currentMain = images[0]?.url || '';
  const uploading = images.some(image => image.state === 'uploading');
  const mainReady = images[0]?.state === 'done';
  useEffect(() => () => { generation.current++; analysisTask.cancel(); if (timer.current) clearTimeout(timer.current); urls.current.forEach(url => URL.revokeObjectURL(url)); }, [analysisTask]);
  async function sendImage(slot: ImageSlot) {
    const request = generation.current;
    setImages(old => old.map(image => image.id === slot.id ? { ...image, state: 'uploading', error: '' } : image));
    try {
      // Frontend-only image preparation: keep previews local and never call ERP/OSS.
      const file = await compress(slot.file);
      if (request !== generation.current) return;
      const preview = URL.createObjectURL(file); urls.current.push(preview);
      setImages(old => old.map(image => image.id === slot.id ? { ...image, preview, url: preview, state: 'done' } : image));
    } catch {
      if (request !== generation.current) return;
      setImages(old => old.map(image => image.id === slot.id ? { ...image, state: 'failed', error: '图片无法读取，请重新选择。' } : image));
    }
  }
  async function upload(files: File[]) {
    if (reading || uploading) return;
    setReading(true); setError(''); const next = [...images], messages: string[] = [], pending: ImageSlot[] = [];
    for (const file of files) {
      if (next.length >= MAX_IMAGES) { messages.push('最多上传 5 张图片，超出部分未添加。'); break; }
      const issue = checkImageFile(file); if (issue) { messages.push(`${file.name}：${issue}`); continue; }
      const preview = URL.createObjectURL(file); urls.current.push(preview);
      const slot: ImageSlot = { id: crypto.randomUUID(), file, preview, url: '', role: next.length ? 'other' : 'main', state: 'uploading' };
      next.push(slot); pending.push(slot);
    }
    setImages(next); setError(messages.join('；')); setReading(false);
    await Promise.allSettled(pending.map(slot => sendImage(slot)));
  }
  function analyze() {
    if (reading || uploading || analysisTask.getSnapshot().status === 'running') return;
    if (timer.current) clearTimeout(timer.current);
    // A local reference image lets the interaction be reviewed without selecting a file.
    if (!images.length) setImages([{ id: crypto.randomUUID(), file: new File([], '商品主图.jpg'), preview: '/creative/speaker.jpg', url: '/creative/speaker.jpg', role: 'main', state: 'done' }]);
    setStep(1); setError('');
    analysisTask.start(() => {
      // Fixed frontend preview values; no image recognition or catalog write occurs.
      const preview: Partial<Fields> = { title: '便携式蓝牙音箱', description: '小巧便携，适合桌面、户外及日常使用。', spec: '黑色;标准款', weight: '350', unit: 'g', price: '39.90', productL: '10', productW: '8', productH: '8', packL: '14', packW: '12', packH: '12' };
      setFields(old => ({ ...old, ...Object.fromEntries(Object.entries(preview).filter(([key]) => sources[key as FieldKey]?.source !== 'manual')) }));
      setSources(old => Object.fromEntries(Object.entries(old).filter(([, value]) => value?.source === 'manual')));
      setErrors({}); setStep(2);
    });
  }
  function resetRecognition() { setFields(old => ({ ...empty(), ...Object.fromEntries(Object.entries(old).filter(([key]) => sources[key as FieldKey]?.source === 'manual' || key === 'sku' || key === 'unit')) })); setSources(old => Object.fromEntries(Object.entries(old).filter(([, field]) => field?.source === 'manual'))); setErrors({}); }
  function edit(key: FieldKey, value: string) { setFields(old => ({ ...old, [key]: value })); setSources(old => ({ ...old, [key]: { value, source: 'manual' } })); setErrors(old => ({ ...old, [key]: '' })); }
  function store() {
    if (saving) return;
    const values = { ...fields, mainUrl: currentMain }; const problems: Partial<Record<FieldKey, string>> = {};
    for (const key of required) if (!values[key]?.trim()) problems[key] = '此项必填';
    for (const key of numeric) if (!positive(values[key])) problems[key] = '请填写实测或标注的具体正数';
    for (const key of numeric) if (values[key] && sources[key]?.source && ['visual_estimate', 'category_ref'].includes(sources[key]!.source)) problems[key] = '请核实推断区间并填写具体数字';
    if (!['g', 'kg'].includes(values.unit)) problems.unit = '重量单位仅支持 g / kg';
    if (values.title.length > 100) problems.title = '标题不能超过 100 字';
    if (normalizeSpec(values.spec).length > 255) problems.spec = '规格不能超过 255 字';
    if (values.price && !/^\d+(?:\.\d+)?$/.test(values.price)) problems.price = '价格须为非负数字';
    if (values.skuUrl && !validImageUrl(values.skuUrl)) problems.skuUrl = '请填写有效的图片 URL';
    if (!mainReady) problems.mainUrl = '主图上传未完成，请返回重试';
    setErrors(problems);
    if (Object.keys(problems).length) { setError('请处理标红字段后再确认。'); document.querySelector('[data-import-error="true"] input')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    setSaving(true); setError('');
    timer.current = setTimeout(() => {
      timer.current = null; setSaved({ name: values.title.trim(), sku: values.sku }); setSaving(false);
    }, 1000);
  }

  function cancel() {
    generation.current++; analysisTask.cancel();
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = [];
    const nextBatch = crypto.randomUUID(); setBatch(nextBatch);
    setStep(0); setImages([]); setFields({ ...empty(), sku: `IMG-${nextBatch.slice(0, 8).toUpperCase()}-01` });
    setSources({}); setErrors({}); setError(''); setReading(false); setSaving(false); setSaved(null);
  }
  return { step, setStep, images, setImages, fields, sources, errors, error, setError, reading, saving, saved,
    currentMain, uploading, mainReady, progress: analysis.progress, elapsed: analysis.elapsed,
    upload, sendImage, analyze, resetRecognition, edit, store, cancel };
}
export type ImageImportTask = ReturnType<typeof useImageImportTask>;
