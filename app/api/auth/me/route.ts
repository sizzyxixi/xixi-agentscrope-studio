export const runtime = "edge";

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
