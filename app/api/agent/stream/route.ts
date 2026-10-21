export const runtime = "nodejs";
export const maxDuration = 300;

type StreamPayload = {
  sessionId?: string;
  requestId?: string;
  message?: string;
  approval?: {
    id: string;
    approved: boolean;
  };
  authToken?: string;
  modelId?: string;
  fileIds?: string[];
  fileRefIds?: string[];
  skillIds?: string[];
  mcpIds?: string[];
  agentId?: string;
  model?: {
    id?: string;
    provider?: string;
    name?: string;
    endpoint?: string;
  };
};

const safeJson = async (request: Request): Promise<StreamPayload> => {
  try {
    return (await request.json()) as StreamPayload;
  } catch {
    return {};
  }
};

const createEvent = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const serviceBaseUrl = () =>
  process.env.AGENTSCOPE_SERVICE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8790";

const offlineStream = (sessionId: string, detail: string) => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          createEvent("state", {
            type: "state",
            title: "AgentScope service offline",
            detail,
            level: "warning",
          }),
        ),
      );
      controller.enqueue(
        encoder.encode(
          createEvent("done", {
            type: "done",
            title: "AgentScope service required",
            detail: `会话 ${sessionId} 已保留；启动 Python AgentScope service 后可继续。`,
          }),
        ),
      );
      controller.close();
    },
  });
};

export async function POST(request: Request) {
  const payload = await safeJson(request);
  const sessionId = payload.sessionId ?? "local";
  const message = payload.message?.trim() ?? "";

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (request.signal.aborted) controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    const upstream = await fetch(`${serviceBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/stream`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        "accept-encoding": "identity",
      },
      body: JSON.stringify({
        session_id: sessionId,
        request_id: payload.requestId,
        message,
        auth_token: payload.authToken,
        model_id: payload.modelId,
        file_ids: payload.fileIds,
        file_ref_ids: payload.fileRefIds,
        skill_ids: payload.skillIds,
        mcp_ids: payload.mcpIds,
        agent_id: payload.agentId,
        approval: payload.approval,
        model: payload.model,
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      request.signal.removeEventListener("abort", abort);
      return new Response(await upstream.text(), { status: upstream.status, headers: { "content-type": "application/json" } });
    }
    if (!upstream.body) {
      request.signal.removeEventListener("abort", abort);
      const detail = `AgentScope service 返回异常：HTTP ${upstream.status}`;
      return new Response(offlineStream(sessionId, detail), {
        headers: streamHeaders,
      });
    }

    const reader = upstream.body.getReader();
    const cleanup = () => request.signal.removeEventListener("abort", abort);
    const body = new ReadableStream<Uint8Array>({
      async pull(output) {
        try {
          const { done, value } = await reader.read();
          if (done) { cleanup(); output.close(); }
          else output.enqueue(value);
        } catch (error) { cleanup(); output.error(error); }
      },
      async cancel(reason) {
        cleanup(); controller.abort();
        await reader.cancel(reason).catch(() => {});
      },
    });
    return new Response(body, { headers: streamHeaders });
  } catch (error) {
    request.signal.removeEventListener("abort", abort);
    if (controller.signal.aborted) return new Response(null, { status: 499 });
    return new Response(
      offlineStream(
        sessionId,
        `无法连接 AgentScope service：${error instanceof Error ? error.message : "unknown error"}`,
      ),
      {
        headers: streamHeaders,
      },
    );
  }
}

const streamHeaders = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "private, no-store, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};
