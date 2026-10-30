export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return Response.json({ detail: "请求格式错误。" }, { status: 400 }); }
  const base = process.env.AGENTSCOPE_SERVICE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8790";
  try {
    const upstream = await fetch(`${base}/auth/password`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: request.headers.get("authorization") ?? "" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return Response.json(await upstream.json(), { status: upstream.status });
  } catch {
    return Response.json({ detail: "AgentScope service 未连接。" }, { status: 503 });
  }
}
