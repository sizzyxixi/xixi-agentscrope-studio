export const runtime = "nodejs";
export const maxDuration = 300;

type StreamPayload = {
  sessionId?: string;
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

  try {
    const upstream = await fetch(`${serviceBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/stream`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        session_id: sessionId,
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
      signal: request.signal,
    });

    if (!upstream.ok) {
      return new Response(await upstream.text(), { status: upstream.status, headers: { "content-type": "application/json" } });
    }
    if (!upstream.body) {
      const detail = `AgentScope service 返回异常：HTTP ${upstream.status}`;
      return new Response(offlineStream(sessionId, detail), {
        headers: streamHeaders,
      });
    }

    return new Response(upstream.body, {
      headers: streamHeaders,
    });
  } catch (error) {
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
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};
