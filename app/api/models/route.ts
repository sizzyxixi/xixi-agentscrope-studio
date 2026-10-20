export const runtime = "edge";

type ModelPayload = {
  id?: string;
  provider?: string;
  displayName?: string;
  modelName?: string;
  endpoint?: string;
  apiKey?: string;
  makeDefault?: boolean;
};

const serviceBaseUrl = () =>
  process.env.AGENTSCOPE_SERVICE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8790";

const safeJson = async (request: Request): Promise<ModelPayload> => {
  try {
    return (await request.json()) as ModelPayload;
  } catch {
    return {};
  }
};

export async function GET(request: Request) {
  try {
    const upstream = await fetch(`${serviceBaseUrl()}/model-settings`, {
      headers: {
        accept: "application/json",
        authorization: request.headers.get("authorization") ?? "",
      },
    });
    const data = await upstream.json();
    return Response.json(data, { status: upstream.status });
  } catch {
    return Response.json({ models: [], detail: "AgentScope service 未连接。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const payload = await safeJson(request);

  try {
    const upstream = await fetch(`${serviceBaseUrl()}/model-settings`, {
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

const forwardMutation = async (request: Request, method: "PUT" | "DELETE") => {
  const payload = await safeJson(request);

  try {
    const upstream = await fetch(`${serviceBaseUrl()}/model-settings`, {
      method,
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
};

export async function PUT(request: Request) {
  return forwardMutation(request, "PUT");
}

export async function DELETE(request: Request) {
  return forwardMutation(request, "DELETE");
}
