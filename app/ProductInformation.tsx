"use client";
import { ChevronDown } from 'lucide-react';
import type { Product } from './commerce-demo-data';
import { productFieldGroups, type ProductField } from './product-field-groups';
import { editableProductFields, supplySources, type ProductFieldValues } from './product-fields';
import { productInformationSections, type ProductInformationFact, type ProductInformationSection } from './product-information-fields';
import { FieldLabel, StudioInput as Input, StudioTextarea as Textarea, StudioSelect as Select } from './StudioControls';
import s from './product-information.module.css';

const pairs = [
  { label: '产品标题', fields: ['cn_title', 'title'], labels: ['中文产品标题', '英文产品标题'] },
  { label: '产品描述', fields: ['cn_description', 'description'], labels: ['中文描述', '英文描述'] },
] as const;
const pairedKeys = new Set<string>(pairs.flatMap(pair => [...pair.fields]));
const metadataKeys = new Set<string>(['products_id', 'spu_code', 'brand_name', 'category_name']);
const optionalKeys = new Set<string>(['ingredient', 'efficacy']);
const editableKeys = new Set<string>(editableProductFields);

function FactValue({ fact }: { fact: ProductInformationFact }) {
  if (fact.json && fact.value) return <pre className={s.rawValue}>{fact.value}</pre>;
  if (fact.link && /^https?:\/\//i.test(fact.value)) return <a href={fact.value} target="_blank" rel="noopener noreferrer">查看来源商品 ↗</a>;
  return <>{fact.value || '—'}</>;
}
function Facts({ fields }: { fields: ProductInformationFact[] }) {
  if (!fields.length) return null;
  return <dl className={s.facts}>{fields.map(fact => <div key={fact.key} className={fact.wide && fact.value && (fact.json || fact.value.length > 64) ? s.wide : undefined}><dt>{fact.label}</dt><dd><FactValue fact={fact}/></dd></div>)}</dl>;
}
function MoreInformation({ section }: { section: ProductInformationSection }) {
  return <details className={s.metadata} aria-label={section.title}><summary>{section.title}<ChevronDown size={14}/></summary><Facts fields={section.fields}/></details>;
}

export function ProductInformation({ product }: { product: Product }) {
  const sections = productInformationSections(product), basic = sections[0];
  return <section className={s.groups} aria-label="商品基础信息">
    <section className={s.detailGroup} aria-label="基础信息"><h2 className={s.informationTitle}>基础信息</h2>
      <Facts fields={basic.fields.filter(field => metadataKeys.has(field.key))}/>
      <dl className={s.bilingualFacts}>{pairs.map(pair => <div key={pair.label}><dt>{pair.label}</dt><dd className={s.languagePair}>{pair.fields.map((key, index) => <div key={key} lang={index ? 'en' : 'zh-CN'}><span>{index ? 'English' : '中文'}</span><p>{basic.fields.find(field => field.key === key)?.value || '—'}</p></div>)}</dd></div>)}</dl>
      <Facts fields={basic.fields.filter(field => !metadataKeys.has(field.key) && !pairedKeys.has(field.key) && (!optionalKeys.has(field.key) || !!field.value.trim()))}/>
    </section>
    {sections.slice(1).map(section => section.collapsed ? <MoreInformation key={section.id} section={section}/> : <section key={section.id} className={s.detailGroup} aria-label={section.title}><h3 className={s.informationTitle}>{section.title}</h3><Facts fields={section.fields}/></section>)}
  </section>;
}

export function ProductInformationEditor({ product, values, onChange }: { product: Product; values: ProductFieldValues; onChange: (values: ProductFieldValues) => void }) {
  const edit = (key: keyof ProductFieldValues, value: string) => onChange({ ...values, [key]: value });
  const sections = productInformationSections(product);
  const input = (field: ProductField) => <div key={field.key} className={field.multiline ? s.wide : undefined}><FieldLabel>{field.label}{field.key === 'spu_code' && ' *'}{field.key === 'supply_source' ? <Select aria-label="货源" value={values.supply_source} onChange={event => edit('supply_source', event.target.value)}><option value="">请选择货源</option>{Object.entries(supplySources).map(([key, label]) => <option key={key} value={key}>{label}</option>)}{values.supply_source && !supplySources[values.supply_source] && <option value={values.supply_source}>{values.supply_source}</option>}</Select> : field.multiline ? <Textarea aria-label={field.label} rows={2} value={values[field.key]} onChange={event => edit(field.key, event.target.value)}/> : <Input aria-label={field.label} required={field.key === 'spu_code'} value={values[field.key]} onChange={event => edit(field.key, event.target.value)}/>}</FieldLabel></div>;
  return <div className={s.editorGroups}>{productFieldGroups.map(group => {
    const section = sections.find(section => section.id === group.id)!;
    const visible = group.fields.filter(field => !pairedKeys.has(field.key));
    const readonlyFields = section.fields.filter(field => !editableKeys.has(field.key));
    return <section key={group.id} className={s.editorGroup} aria-label={group.title}>
      <header><h3>{group.title}</h3></header>
      {group.id === 'basic' ? <>
        <div className={s.editFields}><div className={s.staticField}><span>产品 ID</span><strong>{readonlyFields.find(field => field.key === 'products_id')?.value || '—'}</strong></div>{visible.filter(field => metadataKeys.has(field.key)).map(input)}</div>
        <div className={s.languageEditors}>{pairs.map(pair => <fieldset key={pair.label}><legend>{pair.label}</legend><div className={s.languagePair}>{pair.fields.map((key, index) => <FieldLabel key={key}>{index ? 'English' : '中文'}{key === 'cn_description' || key === 'description' ? <Textarea aria-label={pair.labels[index]} rows={3} value={values[key]} onChange={event => edit(key, event.target.value)}/> : <Input aria-label={pair.labels[index]} value={values[key]} onChange={event => edit(key, event.target.value)}/>}</FieldLabel>)}</div></fieldset>)}</div>
        <div className={s.editFields}>{visible.filter(field => !metadataKeys.has(field.key)).map(input)}</div>
        <div className={s.readonlyFields}><Facts fields={readonlyFields.filter(field => field.key !== 'products_id' && (!optionalKeys.has(field.key) || !!field.value.trim()))}/></div>
      </> : <><Facts fields={readonlyFields}/><div className={s.sourceEditor}>{visible.map(input)}</div></>}
    </section>;
  })}{sections.filter(section => section.collapsed).map(section => <MoreInformation key={section.id} section={section}/>)}</div>;
}
