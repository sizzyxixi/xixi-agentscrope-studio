export const FEEDBACK_DURATION = 5000;
export type FeedbackKind = "info" | "success" | "error" | "warning" | "loading" | "plain";
export type Feedback = { id: string; message: string; kind: FeedbackKind; sequence: number };
export const EMPTY_FEEDBACK: readonly Feedback[] = [];

type Clock = { set: (callback: () => void, duration: number) => ReturnType<typeof setTimeout>; clear: (timer: ReturnType<typeof setTimeout>) => void };

/** Each message owns its deadline, independently of hover, focus and navigation. */
export class FeedbackStore {
  private items: readonly Feedback[] = EMPTY_FEEDBACK;
  private listeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private sequence = 0;
  constructor(private clock: Clock = { set: (callback, duration) => setTimeout(callback, duration), clear: timer => clearTimeout(timer) }) {}
  getSnapshot = () => this.items;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }
  publish = (message: string, kind: FeedbackKind = "info", id?: string) => {
    if (!message.trim()) return "";
    const sequence = ++this.sequence;
    const key = id || `feedback-${sequence}`;
    const previous = this.timers.get(key);
    if (previous !== undefined) this.clock.clear(previous);
    this.items = [...this.items.filter(item => item.id !== key), { id: key, message, kind, sequence }];
    // Bound the stack during multi-file uploads without leaving orphan timers.
    while (this.items.length > 5) this.dismiss(this.items[0].id);
    this.timers.set(key, this.clock.set(() => this.dismiss(key), FEEDBACK_DURATION));
    this.emit();
    return key;
  };
  dismiss = (id: string) => {
    const timer = this.timers.get(id);
    if (timer !== undefined) this.clock.clear(timer);
    this.timers.delete(id);
    this.items = this.items.filter(item => item.id !== id);
    this.emit();
  };
  dispose = () => { this.timers.forEach(timer => this.clock.clear(timer)); this.timers.clear(); this.items = EMPTY_FEEDBACK; };
}

export function feedbackKind(message: string): FeedbackKind {
  if (/失败|错误|中断|异常|无法|无效|未成功|未连接|不可用/.test(message)) return "error";
  if (/请先|先保存|不能|最多|已失效|请选择|请输入|请至少/.test(message)) return "warning";
  if (/成功|已保存|已更新|已删除|已复制|已导入|已启用|已停用|已暂停|已恢复|已创建|已启动|已发送|已完成/.test(message)) return "success";
  if (/^(正在|搜索中|加载中|上传中|保存中|读取中|连接中|测试中)/.test(message)) return "loading";
  return "info";
}
