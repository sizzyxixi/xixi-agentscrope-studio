export type RepeatConfig = { frequency: string; weekdays: number[]; month_days?: number[]; month_day?: number; month?: number };

/** A different primary frequency starts with no inherited secondary selections. */
export function changeRepeatFrequency(value: RepeatConfig, frequency: string): Partial<RepeatConfig> {
  if (value.frequency === frequency) return { frequency };
  return {
    frequency,
    weekdays: frequency === "interval" ? [0, 1, 2, 3, 4, 5, 6] : [],
    month_days: [],
    month: undefined,
    month_day: undefined,
  };
}
