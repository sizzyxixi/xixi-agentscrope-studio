"use client";

import { ChevronDown } from 'lucide-react';
import type { Sku } from './commerce-demo-data';
import { skuArchiveFields, type SkuArchiveFact } from './sku-archive-fields';
import s from './sku-archive.module.css';

function Fields({ fields }: { fields: SkuArchiveFact[] }) {
  return <dl className={s.fields}>{fields.map(field => <div key={field.keys.join('/')} className={field.raw || field.keys.includes('spec') ? s.wide : field.keys.some(key => key === 'sku_code' || key === 'source_sku_code') ? s.code : undefined}><dt title={field.hint ? `${field.label}（${field.hint}）` : undefined}>{field.label}</dt><dd>{field.raw && field.value ? <pre>{field.value}</pre> : field.value || '—'}</dd></div>)}</dl>;
}
export function SkuArchiveInformation({ sku }: { sku: Sku }) {
  const { fields, records } = skuArchiveFields(sku);
  return <>
    <Fields fields={fields}/>
    <details className={s.records}><summary>更多资料<ChevronDown size={15}/></summary><Fields fields={records}/></details>
  </>;
}
