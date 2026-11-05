/** Bound reads so an unavailable service cannot leave a page loading forever. */
export async function consoleApi<T>(token: string, path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = method === "GET" ? setTimeout(() => controller.abort(new DOMException("Read timed out", "TimeoutError")), 20_000) : undefined;
  try {
    const response = await fetch(`/api/console/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    });
    const payload = await response.json() as T & { detail?: string };
    if (!response.ok) throw new Error(payload.detail ?? `请求失败（${response.status}）`);
    return payload;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error("读取超时，请稍后重试。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
