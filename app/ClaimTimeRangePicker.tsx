"use client";
import { useId, useState } from 'react';
import { RangeCalendar } from '@heroui/react';
import { I18nProvider } from 'react-aria';
import { CalendarDays, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/hero-ui/popover';
import { claimTimeCalendarValue, type ClaimTimeRange } from './claim-time-range';
import s from './claim-time-range.module.css';

export function ClaimTimeRangePicker({ value, onChange, label = '认领时间' }: { label?: string; value: ClaimTimeRange; onChange: (range: ClaimTimeRange) => void }) {
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const selected = claimTimeCalendarValue(value);
  const apply = (range: ClaimTimeRange) => { onChange(range); setOpen(false); };
  return <div className={s.control}>
    <span hidden id={descriptionId}>{selected ? `${value.from} 至 ${value.to}` : '未选择时间区间'}</span>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button type="button" className={s.trigger} aria-label={`选择${label}区间`} aria-describedby={descriptionId}><span data-empty={!selected}>{selected ? value.from.replaceAll('-', '/') : '开始日期'}</span><span className={s.separator}>—</span><span data-empty={!selected}>{selected ? value.to.replaceAll('-', '/') : '结束日期'}</span><CalendarDays size={14}/></button></PopoverTrigger>
      <PopoverContent className={s.popup} aria-label={`选择${label}区间`} align="start" sideOffset={8}>
        <I18nProvider locale="zh-CN"><RangeCalendar className={s.calendar} aria-label={`${label}范围`} firstDayOfWeek="mon" value={selected} onChange={range => { if (range) apply({ from: range.start.toString(), to: range.end.toString() }); }}>
          <RangeCalendar.Header className={s.calendarHeader}><RangeCalendar.NavButton slot="previous"/><RangeCalendar.Heading/><RangeCalendar.NavButton slot="next"/></RangeCalendar.Header>
          <RangeCalendar.Grid><RangeCalendar.GridHeader>{day => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader><RangeCalendar.GridBody>{date => <RangeCalendar.Cell date={date}/>}</RangeCalendar.GridBody></RangeCalendar.Grid>
        </RangeCalendar></I18nProvider>
      </PopoverContent>
    </Popover>
    {selected && <button type="button" className={s.clear} aria-label={`清除${label}区间`} onClick={() => apply({ from: '', to: '' })}><X size={12}/></button>}
  </div>;
}
