export const runtime = "nodejs";
export const maxDuration = 300;

type DefaultPayload = {
  id?: string;
};

const serviceBaseUrl = () =>
  process.env.AGENTSCOPE_SERVICE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8790";

const safeJson = async (request: Request): Promise<DefaultPayload> => {
  try {
    return (await request.json()) as DefaultPayload;
  } catch {
    return {};
  }
};

export async function POST(request: Request) {
  const payload = await safeJson(request);

  try {
    const upstream = await fetch(`${serviceBaseUrl()}/model-settings/default`, {
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
