export const runtime = "edge";

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const base = process.env.AGENTSCOPE_SERVICE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8790";
  const query = new URL(request.url).search;
  try {
    const response = await fetch(`${base}/console/${path.map(encodeURIComponent).join("/")}${query}`, {
      method: request.method,
      headers: { "content-type": "application/json", authorization: request.headers.get("authorization") ?? "" },
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
      signal: request.signal,
    });
    return new Response(response.body, { status: response.status, headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ detail: "AgentScope 服务未连接，请启动 Python 服务后重试。" }, { status: 503 });
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const DELETE = forward;
