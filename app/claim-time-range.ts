import { parseDate } from '@internationalized/date';
export type ClaimTimeRange = { from: string; to: string };
/** Only a complete range is applied; an unfinished selection never filters the list. */
export function claimTimeCalendarValue(value: ClaimTimeRange) {
  if (!value.from || !value.to) return null;
  try { const start = parseDate(value.from), end = parseDate(value.to); return start.compare(end) <= 0 ? { start, end } : null; } catch { return null; }
}
