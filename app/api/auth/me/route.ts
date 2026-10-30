export const runtime = "nodejs";
export const maxDuration = 300;

const serviceBaseUrl = () =>
  process.env.AGENTSCOPE_SERVICE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8790";

export async function GET(request: Request) {
  try {
    const upstream = await fetch(`${serviceBaseUrl()}/auth/me`, {
      headers: {
        accept: "application/json",
        authorization: request.headers.get("authorization") ?? "",
      },
    });
    const data = await upstream.json();
    return Response.json(data, { status: upstream.status });
  } catch {
    return Response.json({ detail: "AgentScope service 未连接。" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return Response.json({ detail: "请求格式错误。" }, { status: 400 }); }
  try {
    const upstream = await fetch(`${serviceBaseUrl()}/auth/me`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: request.headers.get("authorization") ?? "" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return Response.json(await upstream.json(), { status: upstream.status });
  } catch {
    return Response.json({ detail: "AgentScope service 未连接。" }, { status: 503 });
  }
}
