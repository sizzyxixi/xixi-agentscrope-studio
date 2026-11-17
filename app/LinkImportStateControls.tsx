"use client";
import { StudioButton as Button } from './StudioControls';
import { linkImportScenarios, type LinkImportScenario } from './product-link-import-demo';
import s from './product-import.module.css';

export function LinkImportStateControls({ active, onSelect }: { active: LinkImportScenario | null; onSelect: (scenario: LinkImportScenario) => void }) {
  return <div className={s.stateControls}><h3>状态切换</h3><div className={s.stateGroups}><section role="group" aria-label="链接采集状态"><h4>链接采集</h4><div>{linkImportScenarios.map(option => <Button key={option.id} aria-label={`链接采集：${option.label}`} aria-pressed={active === option.id} onClick={() => onSelect(option.id)}>{option.label}</Button>)}</div></section></div></div>;
}
