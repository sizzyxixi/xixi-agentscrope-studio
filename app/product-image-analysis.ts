export type ImageAnalysisProgress = { status: 'idle' | 'running' | 'complete'; progress: number; elapsed: number };
const idle: ImageAnalysisProgress = { status: 'idle', progress: 0, elapsed: 0 };

/** The task outlives its dialog; subscribers only control what is visible. */
export class ImageAnalysisTask {
  private snapshot = idle;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private revision = 0;
  private listeners = new Set<() => void>();
  private durationMs: number;
  constructor(durationMs = 4000) { this.durationMs = durationMs; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(snapshot: ImageAnalysisProgress) { this.snapshot = snapshot; this.listeners.forEach(listener => listener()); }
  start = (onComplete: () => void) => {
    if (this.snapshot.status === 'running') return;
    this.cancel();
    const request = this.revision, startedAt = Date.now();
    this.update({ status: 'running', progress: 0, elapsed: 0 });
    const advance = () => {
      if (request !== this.revision) return;
      const duration = Math.max(0, Date.now() - startedAt);
      const progress = Math.min(100, Math.floor(duration / this.durationMs * 100));
      this.update({ status: progress === 100 ? 'complete' : 'running', progress, elapsed: Math.floor(duration / 1000) });
      if (progress < 100) this.timer = setTimeout(advance, 100);
      else { this.timer = null; onComplete(); }
    };
    this.timer = setTimeout(advance, 100);
  };
  cancel = () => {
    this.revision++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.update(idle);
  };
}
