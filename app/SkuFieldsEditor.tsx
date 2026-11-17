"use client";
import type { Sku } from './commerce-demo-data';
import { FieldLabel, StudioInput as Input, StudioSelect as Select } from './StudioControls';
import { packageDimensionFields, productDimensionFields, skuFieldValues, skuWeightUnit, type SkuFieldValues } from './sku-fields';
import s from './product-workspace.module.css';

/** SKU fields from products_sku only; no standalone name, color or creative-description fields. */
export function SkuFieldsEditor({ sku, index, onChange }: { sku: Sku; index: number; onChange: (sku: Sku) => void }) {
  const values = skuFieldValues(sku), unit = skuWeightUnit(sku), prefix = `SKU ${index + 1}`;
  const edit = (key: keyof SkuFieldValues, value: string) => onChange({ ...sku, [key]: value });
  const field = (key: keyof SkuFieldValues, label: string, numeric = false) => <FieldLabel key={key}>{label}<Input
    aria-label={`${prefix} ${label}`} required={key === 'sku_code'} value={values[key]} type={numeric ? 'number' : 'text'}
    step={numeric ? '0.01' : undefined} min={numeric ? '0' : undefined}
    max={numeric ? key === 'price' ? '9999999999.99' : '99999999.99' : undefined}
    maxLength={['sku_code', 'source_sku_code', 'spec'].includes(key) ? 255 : key === 'size' ? 150 : undefined}
    onChange={event => edit(key, event.target.value)}/></FieldLabel>;
  return <>
    <fieldset className={s.skuFieldGroup}><legend>规格信息</legend><div className={s.formGrid}>
      {field('sku_code', 'SKU 货号 *')}{field('source_sku_code', '来源原始货号')}
      {field('spec', '规格（货源侧）')}{field('size', '尺寸说明')}
    </div></fieldset>
    <fieldset className={s.skuFieldGroup}><legend>价格与重量</legend><div className={s.formGrid}>
      <FieldLabel>重量<div className={s.weightControl}><Input aria-label={`${prefix} 重量`} type="number" min="0" step="any" value={values.weight} onChange={event => edit('weight', event.target.value)}/><Select aria-label={`${prefix} 重量单位`} value={unit} onChange={event => edit('weight_unit', event.target.value)}>{!['g', 'kg'].includes(unit) && <option value={unit}>{unit}（请核对）</option>}<option>g</option><option>kg</option></Select></div></FieldLabel>
      {field('price', '价格', true)}
    </div></fieldset>
    <fieldset className={s.skuDimensionsFields}><legend>产品尺寸 <span>cm</span></legend><div>{productDimensionFields.map((key, i) => field(key, `产品${['长', '宽', '高'][i]}（cm）`, true))}</div></fieldset>
    <fieldset className={s.skuDimensionsFields}><legend>包装尺寸 <span>cm</span></legend><div>{packageDimensionFields.map((key, i) => field(key, `包装${['长', '宽', '高'][i]}（cm）`, true))}</div></fieldset>
  </>;
}
