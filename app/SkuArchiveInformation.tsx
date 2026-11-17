"use client";

import { ChevronDown } from 'lucide-react';
import type { Sku } from './commerce-demo-data';
import { skuArchiveFields, type SkuArchiveFact } from './sku-archive-fields';
import s from './sku-archive.module.css';

function Fields({ fields }: { fields: SkuArchiveFact[] }) {
  return <dl className={s.fields}>{fields.map(field => <div key={field.keys.join('/')} className={field.raw ? s.wide : undefined}><dt>{field.label}</dt><dd>{field.raw && field.value ? <pre>{field.value}</pre> : field.value || '—'}</dd></div>)}</dl>;
}
export function SkuArchiveInformation({ sku }: { sku: Sku }) {
  const { fields, records } = skuArchiveFields(sku);
  return <>
    <Fields fields={fields}/>
    <details className={s.records}><summary>来源与系统记录<ChevronDown size={15}/></summary><Fields fields={records}/></details>
  </>;
}
