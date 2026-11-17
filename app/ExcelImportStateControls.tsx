"use client";
import { StudioButton as Button } from './StudioControls';
import { excelImportScenarios, type ExcelImportScenario } from './product-import-demo';
import s from './product-import.module.css';

export function ExcelImportStateControls({ step, active, onSelect }: { step: number; active: ExcelImportScenario | null; onSelect: (scenario: ExcelImportScenario) => void }) {
  const group=excelImportScenarios[Math.min(step,2)];
  const selected=active || (step===0?'upload-initial':null);
  return <div className={s.stateControls}><h3>状态切换</h3><div className={s.stateGroups}><section role="group" aria-label={`${group.title}状态`}><h4>{group.title}</h4><div>{group.options.map(option => <Button key={option.id} aria-label={`${group.title}：${option.label}`} aria-pressed={selected === option.id} onClick={() => onSelect(option.id)}>{option.label}</Button>)}</div></section></div></div>;
}
