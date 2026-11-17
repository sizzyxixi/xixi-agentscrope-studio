"use client";
import { ChevronDown } from 'lucide-react';
import type { Product } from './commerce-demo-data';
import { productFieldGroups, type ProductField } from './product-field-groups';
import { editableProductFields, type ProductFieldValues } from './product-fields';
import { productInformationSections, type ProductInformationFact, type ProductInformationSection } from './product-information-fields';
import { FieldLabel, StudioInput as Input, StudioTextarea as Textarea } from './StudioControls';
import s from './product-information.module.css';

const pairs = [
  { label: '产品标题', fields: ['cn_title', 'title'], labels: ['中文产品标题', '英文产品标题'] },
  { label: '产品描述', fields: ['cn_description', 'description'], labels: ['中文描述', '英文描述'] },
] as const;
const optionalKeys = new Set<string>(['ingredient', 'efficacy']);
const editableKeys = new Set<string>(editableProductFields);

function FactValue({ fact }: { fact: ProductInformationFact }) {
  if (fact.specifications?.length) return <div className={s.specifications}>{fact.specifications.map(spec => <div key={spec.name}><span>{spec.name}</span><div>{spec.options.map(option => <span key={option}>{option}</span>)}</div></div>)}</div>;
  if (fact.json && fact.value) return <pre className={s.rawValue}>{fact.value}</pre>;
  if (fact.link && /^https?:\/\//i.test(fact.value)) return <a href={fact.value} target="_blank" rel="noopener noreferrer">查看来源商品 ↗</a>;
  return <>{fact.value || '—'}</>;
}
function Facts({ fields }: { fields: ProductInformationFact[] }) {
  if (!fields.length) return null;
  return <dl className={s.facts}>{fields.map(fact => {
    if (optionalKeys.has(fact.key) && !fact.value.trim()) return null;
    const pair = pairs.find(pair => pair.fields.some(key => key === fact.key));
    if (pair) return fact.key !== pair.fields[0] ? null : <div key={pair.label} className={s.bilingualFact}><dt>{pair.label}</dt><dd className={s.languagePair}>{pair.fields.map((key, index) => <div key={key} lang={index ? 'en' : 'zh-CN'}><span>{index ? 'English' : '中文'}</span><p>{fields.find(field => field.key === key)?.value || '—'}</p></div>)}</dd></div>;
    return <div key={fact.key} className={fact.wide ? s.wide : undefined}><dt>{fact.label}</dt><dd><FactValue fact={fact}/></dd></div>;
  })}</dl>;
}
function MoreInformation({ section }: { section: ProductInformationSection }) {
  return <details className={s.metadata} aria-label={section.title}><summary>{section.title}<ChevronDown size={14}/></summary><Facts fields={section.fields}/></details>;
}

export function ProductInformation({ product }: { product: Product }) {
  const sections = productInformationSections(product);
  return <section className={s.groups} aria-label="商品基础信息">{sections.map(section => section.collapsed ? <MoreInformation key={section.id} section={section}/> : <section key={section.id} className={s.detailGroup} aria-label={section.title}><h2 className={s.informationTitle}>{section.title}</h2><Facts fields={section.fields}/></section>)}</section>;
}

export function ProductInformationEditor({ product, values, onChange }: { product: Product; values: ProductFieldValues; onChange: (values: ProductFieldValues) => void }) {
  const edit = (key: keyof ProductFieldValues, value: string) => onChange({ ...values, [key]: value });
  const definitions = new Map(productFieldGroups.flatMap(group => group.fields).map(field => [field.key, field]));
  const input = (field: ProductField) => <FieldLabel>{field.label}{field.key === 'spu_code' && ' *'}{field.multiline ? <Textarea aria-label={field.label} rows={2} value={values[field.key]} onChange={event => edit(field.key, event.target.value)}/> : <Input aria-label={field.label} required={field.key === 'spu_code'} maxLength={field.key === 'supply_source' ? 255 : undefined} placeholder={field.key === 'supply_source' ? '填写货源平台或供应商' : undefined} value={values[field.key]} onChange={event => edit(field.key, event.target.value)}/>}</FieldLabel>;
  const renderFields = (section: ProductInformationSection) => <div className={s.editFields}>{section.fields.map(fact => {
    if (optionalKeys.has(fact.key) && !fact.value.trim()) return null;
    const pair = pairs.find(pair => pair.fields.some(key => key === fact.key));
    if (pair) return fact.key !== pair.fields[0] ? null : <div key={pair.label} className={`${s.wide} ${s.languageEditors}`}><div className={s.bilingualEditor} role="group" aria-label={pair.label}><span className={s.pairLabel}>{pair.label}</span><div className={s.languagePair}>{pair.fields.map((key, index) => <FieldLabel key={key}>{index ? 'English' : '中文'}{key === 'cn_description' || key === 'description' ? <Textarea aria-label={pair.labels[index]} rows={3} value={values[key]} onChange={event => edit(key, event.target.value)}/> : <Input aria-label={pair.labels[index]} value={values[key]} onChange={event => edit(key, event.target.value)}/>}</FieldLabel>)}</div></div></div>;
    const field = editableKeys.has(fact.key) ? definitions.get(fact.key as keyof ProductFieldValues) : undefined;
    return <div key={fact.key} className={fact.wide ? s.wide : undefined}>{field ? input(field) : <div className={`${s.staticField} ${fact.specifications?.length ? s.inlineStaticField : ''}`}><span>{fact.label}</span><div><FactValue fact={fact}/></div></div>}</div>;
  })}</div>;
  return <div className={s.editorGroups}>{productInformationSections(product).map(section => section.collapsed ? <details key={section.id} className={s.metadata} aria-label={section.title}><summary>{section.title}<ChevronDown size={14}/></summary>{renderFields(section)}</details> : <section key={section.id} className={s.editorGroup} aria-label={section.title}><header><h3>{section.title}</h3></header>{renderFields(section)}</section>)}</div>;
}
