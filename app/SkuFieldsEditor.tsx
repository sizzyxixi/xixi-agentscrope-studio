"use client";
import type { Sku } from './commerce-demo-data';
import { FieldLabel, StudioInput as Input, StudioSelect as Select } from './StudioControls';
import { packageDimensionFields, productDimensionFields, skuFieldValues, skuWeightUnit, type SkuFieldValues } from './sku-fields';
import s from './sku-archive.module.css';

/** Compact SKU facts; obsolete size prose stays out of the editable field allowlist. */
export function SkuFieldsEditor({ sku, index, onChange }: { sku: Sku; index: number; onChange: (sku: Sku) => void }) {
  const values = skuFieldValues(sku), unit = skuWeightUnit(sku), prefix = `SKU ${index + 1}`;
  const edit = (key: keyof SkuFieldValues, value: string) => onChange({ ...sku, [key]: value });
  const field = (key: keyof SkuFieldValues, label: string, numeric = false, visibleLabel = label, compact = false) => <FieldLabel key={key}>{compact ? <span className={s.dimensionAxis} aria-hidden="true">{visibleLabel}</span> : visibleLabel}<Input
    aria-label={`${prefix} ${label}`} required={key === 'sku_code'} value={values[key]} type={numeric ? 'number' : 'text'}
    step={numeric ? '0.01' : undefined} min={numeric ? '0' : undefined}
    max={numeric ? key === 'price' ? '9999999999.99' : '99999999.99' : undefined}
    maxLength={['sku_code', 'source_sku_code', 'spec'].includes(key) ? 255 : undefined}
    onChange={event => edit(key, event.target.value)}/></FieldLabel>;
  const dimensions = (packaged: boolean) => <fieldset className={s.dimensionInputs}><legend>{packaged ? '包装尺寸' : '产品尺寸'}<span>cm</span></legend><div>{(packaged ? packageDimensionFields : productDimensionFields).map((key, i) => field(key, `${packaged ? '包装' : '产品'}${['长', '宽', '高'][i]}（cm）`, true, ['长', '宽', '高'][i], true))}</div></fieldset>;
  return <div className={s.editor}>
    {field('sku_code', 'SKU 货号 *')}{field('source_sku_code', '来源原始货号')}
    <div className={s.specInput}>{field('spec', '规格（货源侧）')}</div>
    {field('price', '价格', true)}
    <FieldLabel>重量<div className={s.weightControl}><Input aria-label={`${prefix} 重量`} type="number" min="0" step="any" value={values.weight} onChange={event => edit('weight', event.target.value)}/><Select aria-label={`${prefix} 重量单位`} value={unit} onChange={event => edit('weight_unit', event.target.value)}>{!['g', 'kg'].includes(unit) && <option value={unit}>{unit}（请核对）</option>}<option>g</option><option>kg</option></Select></div></FieldLabel>
    {dimensions(false)}{dimensions(true)}
  </div>;
}
