/** Calendar rules retain their IANA zone; absolute instants are always UTC. */
export type CalendarConfig = { frequency: string; next_run: string; start_at?: string; timezone: string; time?: string; weekdays: number[]; month_day?: number; month_days?: number[]; month?: number; end_date: string; end_at?: string };
export const userTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export function toZoneInput(value: string, zone: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (key: string) => parts.find(item => item.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function zonedISO(value: string, zone: string) {
  const wall = Date.parse(`${value}:00Z`);
  let utc = wall;
  for (let i = 0; i < 3; i++) utc += wall - Date.parse(`${toZoneInput(new Date(utc).toISOString(), zone)}:00Z`);
  const result = new Date(utc).toISOString();
  if (toZoneInput(result, zone) !== value) throw new Error("该时间在当前时区不存在，请重新选择。");
  return result;
}
export function projectSchedule<T extends CalendarConfig>(config: T, zone: string): T {
  if (config.timezone === zone) return { ...config };
  const source = config.timezone;
  const anchor = toZoneInput(config.next_run, source);
  const clock = config.time ?? anchor.slice(11);
  const reference = new Date(`${anchor.slice(0, 10)}T12:00:00Z`);
  const project = (day: Date) => toZoneInput(zonedISO(`${day.toISOString().slice(0, 10)}T${clock}`, source), zone);
  const local = project(reference);
  const weekday = (day: Date) => (day.getUTCDay() + 6) % 7;
  const weekdays = config.weekdays.map(day => {
    const date = new Date(reference); date.setUTCDate(date.getUTCDate() + day - weekday(reference));
    return weekday(new Date(`${project(date).slice(0, 10)}T12:00Z`));
  }).sort((a, b) => a - b);
  const monthDays = (config.month_days ?? [config.month_day ?? Number(anchor.slice(8, 10))]).map(day => {
    // Use a real occurrence month for each selected date, including 29–31.
    const date = new Date(reference); date.setUTCDate(1);
    while (new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate() < day) date.setUTCMonth(date.getUTCMonth() + 1);
    date.setUTCDate(day); return Number(project(date).slice(8, 10));
  }).sort((a, b) => a - b);
  const end = config.end_at || (config.end_date ? new Date(Date.parse(zonedISO(`${config.end_date}T23:59`, source)) + 59999).toISOString() : "");
  let month = config.month, month_day = Number(local.slice(8, 10));
  if (config.frequency === "yearly") {
    let year = reference.getUTCFullYear();
    const annualMonth = config.month ?? reference.getUTCMonth() + 1;
    const annualDay = config.month_day ?? reference.getUTCDate();
    while (new Date(Date.UTC(year, annualMonth, 0)).getUTCDate() < annualDay) year++;
    const date = new Date(Date.UTC(year, annualMonth - 1, annualDay, 12));
    const annual = project(date); month = Number(annual.slice(5, 7)); month_day = Number(annual.slice(8, 10));
  }
  return { ...config, timezone: zone, time: local.slice(11), weekdays, month_days: monthDays, month_day, month, end_at: end, end_date: end ? toZoneInput(end, zone).slice(0, 10) : "" };
}
