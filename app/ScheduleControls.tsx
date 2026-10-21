"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Calendar, DateField, DatePicker, ListBox, NumberField, RangeCalendar, TimeField, Tooltip } from "@heroui/react";
import { parseDate, parseDateTime, parseTime, today } from "@internationalized/date";
import { I18nProvider } from "react-aria-components";
import { CalendarDays, ChevronDown, ChevronUp, ChevronRight, X } from "lucide-react";
import { usePreferences } from "@/components/PreferencesProvider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/hero-ui/popover";
import { frequencyNames } from "./schedule-templates";

export type RepeatConfig = { frequency: string; weekdays: number[]; month_days?: number[]; month_day?: number };
const weekNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const hasSubmenu = (frequency: string) => ["weekly", "biweekly", "monthly"].includes(frequency);

export function RepeatPicker({ value, onChange }: { value: RepeatConfig; onChange: (value: Partial<RepeatConfig>) => void }) {
  const { t, language } = usePreferences();
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState(value.frequency);
  const rightRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const monthly = submenu === "monthly";
  const days = value.month_days ?? [value.month_day ?? new Date().getDate()];
  const selected = monthly ? days : value.weekdays;
  const suffix = value.frequency === "monthly" ? days.slice().sort((a, b) => a - b).map(day => language === "en" ? String(day) : `${day}日`).join("、") : ["weekly", "biweekly"].includes(value.frequency) ? value.weekdays.slice().sort().map(day => t(weekNames[day])).join("、") : "";
  const summary = `${t(frequencyNames[value.frequency] ?? value.frequency)}${suffix ? ` ${suffix}` : ""}`;
  const choose = (frequency: string) => {
    setSubmenu(frequency);
    onChange({ frequency, ...(frequency === "interval" ? { weekdays: [0, 1, 2, 3, 4, 5, 6] } : {}), ...(frequency === "monthly" ? { month_days: days } : {}) });
    if (!hasSubmenu(frequency)) setOpen(false);
  };
  return <Tooltip delay={350}><Tooltip.Trigger role="presentation" tabIndex={-1} className="scheduleControlTooltip"><Popover open={open} onOpenChange={next => { setOpen(next); if (next) setSubmenu(value.frequency); }}>
    <PopoverTrigger className="scheduleControlTrigger" aria-label={t("重复频率")} aria-description={summary}><span>{t("重复")}：{summary}</span><ChevronDown size={15} /></PopoverTrigger>
    <PopoverContent aria-label={t("重复频率")} align="start" className="scheduleRepeatPopup" onEscapeKeyDown={event => event.stopPropagation()}>
      <div className="scheduleRepeatColumns">
        <div ref={leftRef} className="scheduleRepeatMain" role="group" aria-label={t("重复频率")}>
          {Object.entries(frequencyNames).filter(([key]) => key !== "hourly" || value.frequency === "hourly").map(([key, label]) => <Button variant="ghost" id={`schedule-frequency-${key}`} key={key} aria-pressed={value.frequency === key} aria-expanded={hasSubmenu(key) ? submenu === key : undefined} onPress={() => choose(key)} onHoverStart={() => setSubmenu(key)} onKeyDown={event => { const buttons = [...leftRef.current!.querySelectorAll<HTMLButtonElement>("button")]; const index = buttons.findIndex(button => button.id === `schedule-frequency-${key}`); if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus(); } if (event.key === "ArrowRight" && hasSubmenu(key)) { event.preventDefault(); setSubmenu(key); requestAnimationFrame(() => rightRef.current?.querySelector<HTMLElement>('[role="option"]')?.focus()); } }}>{t(label)}{hasSubmenu(key) && <ChevronRight size={15} />}</Button>)}
        </div>
        {hasSubmenu(submenu) && <div ref={rightRef} className="scheduleRepeatSubmenu" onKeyDown={event => { if (event.key === "ArrowLeft") { event.preventDefault(); leftRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus(); } }}><ListBox key={monthly ? "dates" : "weekdays"} aria-label={t(monthly ? "执行日期" : "执行星期")} selectionMode="multiple" selectionBehavior="toggle" disallowEmptySelection selectedKeys={selected.map(String)} onSelectionChange={keys => { if (keys !== "all") { const values = [...keys].map(Number).sort((a, b) => a - b); onChange({ frequency: submenu, ...(monthly ? { month_days: values } : { weekdays: values }) }); } }}>
          {Array.from({ length: monthly ? 31 : 7 }, (_, index) => { const day = monthly ? index + 1 : index; const label = monthly ? language === "en" ? String(day) : `${day}日` : t(weekNames[day]); return <ListBox.Item key={day} id={String(day)} textValue={label}>{label}<ListBox.ItemIndicator /></ListBox.Item>; })}
        </ListBox></div>}
      </div>
    </PopoverContent>
  </Popover></Tooltip.Trigger><Tooltip.Content className="scheduleConfigTooltip">{summary}</Tooltip.Content></Tooltip>;
}

export function ValidityPicker({ start, end, timezone, disabled, onChange }: { start: string; end: string; timezone: string; disabled?: boolean; onChange: (start: string | null, end: string) => void }) {
  const { t, language } = usePreferences();
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState(2);
  useEffect(() => { const media = window.matchMedia("(max-width: 640px)"); const update = () => setMonths(media.matches ? 1 : 2); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const summary = disabled ? t("仅本次") : end ? `${start.replaceAll("-", "/")} — ${end.replaceAll("-", "/")}` : t("长期有效");
  const clear = () => { onChange(null, ""); setOpen(false); };
  return <Tooltip delay={350}><Tooltip.Trigger role="presentation" tabIndex={-1} className="scheduleControlTooltip"><div className="scheduleValidityControl"><Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger disabled={disabled} className="scheduleControlTrigger" aria-label={t("有效期")} aria-description={summary}><span>{t("有效期")}：{summary}</span>{!end && <CalendarDays size={15} />}</PopoverTrigger>
    <PopoverContent aria-label={t("选择有效期")} align="end" className="scheduleValidityPopup" onEscapeKeyDown={event => event.stopPropagation()}>
      <I18nProvider locale={language === "en" ? "en-US" : "zh-CN"}><RangeCalendar aria-label={t("有效期日期范围")} firstDayOfWeek="mon" visibleDuration={{ months }} minValue={today(timezone)} value={end ? { start: parseDate(start), end: parseDate(end) } : null} onChange={range => { if (range) { onChange(range.start.toString(), range.end.toString()); setOpen(false); } }}>
        <RangeCalendar.Header><RangeCalendar.NavButton slot="previous" /><div className="scheduleRangeHeadings">{Array.from({ length: months }, (_, index) => <RangeCalendar.Heading key={index} offset={{ months: index }} />)}</div><RangeCalendar.NavButton slot="next" /></RangeCalendar.Header>
        <div className="scheduleRangeMonths">{Array.from({ length: months }, (_, index) => <RangeCalendar.Grid key={index} offset={{ months: index }}><RangeCalendar.GridHeader>{day => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader><RangeCalendar.GridBody>{date => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody></RangeCalendar.Grid>)}</div>
      </RangeCalendar></I18nProvider>
      <div className="scheduleCalendarFooter"><span>{t("选择开始和结束日期")}</span><Button variant="ghost" size="sm" onPress={clear}>{t("长期有效")}</Button></div>
    </PopoverContent>
  </Popover>{end && !disabled && <Button isIconOnly variant="ghost" size="sm" className="scheduleValidityClear" aria-label={t("清除有效期")} onPress={clear}><X size={14} /></Button>}</div></Tooltip.Trigger><Tooltip.Content className="scheduleConfigTooltip">{summary}</Tooltip.Content></Tooltip>;
}

export function ScheduleClock({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t, language } = usePreferences();
  return <I18nProvider locale={language === "en" ? "en-GB" : "zh-CN"}><TimeField aria-label={t("执行时间")} hourCycle={24} granularity="minute" isRequired value={parseTime(value)} onChange={time => { if (time) onChange(time.toString().slice(0, 5)); }} className="scheduleHeroTime"><TimeField.Group><TimeField.Input>{segment => <TimeField.Segment segment={segment} />}</TimeField.Input></TimeField.Group></TimeField></I18nProvider>;
}

export function ScheduleDateTime({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const { language } = usePreferences();
  return <I18nProvider locale={language === "en" ? "en-GB" : "zh-CN"}><DatePicker aria-label={label} hourCycle={24} granularity="minute" isRequired value={parseDateTime(value)} onChange={date => { if (date) onChange(date.toString().slice(0, 16)); }} className="scheduleHeroDateTime"><DateField.Group><DateField.Input>{segment => <DateField.Segment segment={segment} />}</DateField.Input><DatePicker.Trigger><DatePicker.TriggerIndicator /></DatePicker.Trigger></DateField.Group><DatePicker.Popover data-ui-popup="schedule-date" className="scheduleSingleDatePopup"><Calendar aria-label={label}><Calendar.Header><Calendar.NavButton slot="previous" /><Calendar.Heading /><Calendar.NavButton slot="next" /></Calendar.Header><Calendar.Grid><Calendar.GridHeader>{day => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader><Calendar.GridBody>{date => <Calendar.Cell date={date} />}</Calendar.GridBody></Calendar.Grid></Calendar></DatePicker.Popover></DatePicker></I18nProvider>;
}

export function ScheduleInterval({ value, onChange }: { value: number; onChange: (value: { interval_value: number; interval_unit: string }) => void }) {
  const { t } = usePreferences();
  return <><NumberField aria-label={t("间隔小时数")} minValue={1} maxValue={24} step={1} isRequired value={value} onChange={number => { if (Number.isFinite(number)) onChange({ interval_value: Math.max(1, Math.min(24, number)), interval_unit: "hours" }); }} className="scheduleHeroInterval"><NumberField.Group><NumberField.Input /><div className="scheduleIntervalStepper"><NumberField.IncrementButton aria-label={t("增加间隔小时数")}><ChevronUp size={12} /></NumberField.IncrementButton><NumberField.DecrementButton aria-label={t("减少间隔小时数")}><ChevronDown size={12} /></NumberField.DecrementButton></div></NumberField.Group></NumberField><span>{t("小时")}</span></>;
}
