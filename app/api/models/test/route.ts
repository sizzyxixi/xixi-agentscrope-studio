export const runtime = "nodejs";
export const maxDuration = 300;

const serviceBaseUrl = () =>
  process.env.AGENTSCOPE_SERVICE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8790";

export async function POST(request: Request) {
  let payload: { id?: string } = {};
  try {
    payload = (await request.json()) as { id?: string };
  } catch {
    return Response.json({ detail: "请选择要测试的模型。" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${serviceBaseUrl()}/model-settings/test`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: request.headers.get("authorization") ?? "",
      },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json();
    return Response.json(data, { status: upstream.status });
  } catch {
    return Response.json({ detail: "AgentScope service 未连接。" }, { status: 503 });
  }
}
