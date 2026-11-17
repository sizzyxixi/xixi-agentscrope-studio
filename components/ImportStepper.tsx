"use client";

import { Check } from 'lucide-react';
import s from './import-stepper.module.css';

/** Display-only inverted stepper; the import flow owns navigation and validation. */
export function ImportStepper({ labels, current }: { labels: string[]; current: number }) {
  return <ol className={s.stepper} aria-label="导入步骤">
    {labels.map((label, index) => {
      const status = index < current ? 'complete' : index === current ? 'active' : 'inactive';
      return <li key={label} className={s.step} data-status={status} aria-current={status === 'active' ? 'step' : undefined}>
        <span className={s.indicator} aria-hidden="true">{status === 'complete' ? <Check size={14} strokeWidth={2.2}/> : index + 1}</span>
        <span className={s.title}>{label}</span>
        <span className={s.srOnly}>{status === 'complete' ? '已完成' : status === 'active' ? '当前步骤' : '未开始'}</span>
        {index < labels.length - 1 && <span className={s.separator} data-complete={index < current} aria-hidden="true"/>}
      </li>;
    })}
  </ol>;
}
