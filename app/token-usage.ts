export type TokenUsage = {
  turn_id: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  call_count: number;
  status: "running" | "waiting" | "complete" | "incomplete";
};

export type TokenActivity = {
  start: string;
  end: string;
  timezone: string;
  data: { date: string; count: number }[];
  total_tokens: number;
  today_tokens: number;
  last_30_days_tokens: number;
  input_tokens: number;
  output_tokens: number;
  call_count: number;
  missing_calls: number;
  undated_calls: number;
};
