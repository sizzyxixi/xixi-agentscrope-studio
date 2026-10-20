import type { RunActivityStatus } from "@/components/assistant-ui/elements/run-activity";

export type RunTiming = {
  id: string;
  startedAt: number;
  elapsedMs: number;
  sampledAt: number;
  status: RunActivityStatus;
  endedAt?: number | null;
};

export function elapsedRunMs(activity: RunTiming, now = Date.now()) {
  return Math.max(0, activity.elapsedMs) + (activity.status === "running" ? Math.max(0, now - activity.sampledAt) : 0);
}

export function settleRun(activity: RunTiming | null | undefined, status: RunActivityStatus): RunTiming | undefined {
  if (!activity) return undefined;
  const now = Date.now();
  return { ...activity, elapsedMs: elapsedRunMs(activity, now), sampledAt: now, endedAt: now, status };
}
