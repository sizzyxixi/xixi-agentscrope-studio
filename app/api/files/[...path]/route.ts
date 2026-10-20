export const runtime = "edge";
type Context = { params: Promise<{ path: string[] }> };
async function forward(request: Request, context: Context) {
  const { path } = await context.params;
  const base =
    process.env.AGENTSCOPE_SERVICE_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8790";
  try {
    const headers = new Headers();
    for (const name of ["content-type", "authorization"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const response = await fetch(
      `${base}/files/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`,
      {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method)
          ? undefined
          : request.body,
        signal: request.signal,
      },
    );
    const outgoing = new Headers({
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    });
    for (const name of [
      "content-type",
      "content-disposition",
      "x-file-version",
      "content-security-policy",
    ]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return Response.json(
      { detail: "文件服务暂不可用，请重试。" },
      { status: 503 },
    );
  }
}
export const GET = forward;
export const POST = forward;
export const DELETE = forward;
