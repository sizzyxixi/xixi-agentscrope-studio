export const runtime = 'nodejs';
export const maxDuration = 300;
type Context = { params: Promise<{ path: string[] }> };
async function forward(request: Request, context: Context) {
  const { path } = await context.params;
  const base = process.env.AGENTSCOPE_SERVICE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8790';
  const headers = new Headers();
  for (const key of ['authorization', 'content-type', 'accept']) { const value = request.headers.get(key); if (value) headers.set(key, value); }
  try {
    // Official collection routes require a trailing slash. The host may have
    // normalized it away, so preserve the upstream route shape explicitly.
    const collection = path.length === 1 && ['agent', 'schedule', 'credential', 'knowledge_bases', 'model', 'tts-model', 'embedding-model', 'chat'].includes(path[0]);
    const suffix = collection || new URL(request.url).pathname.endsWith('/') ? '/' : '';
    const response = await fetch(`${base}/agentscope-service/${path.map(encodeURIComponent).join('/')}${suffix}${new URL(request.url).search}`, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(), signal: request.signal, cache: 'no-store', redirect: 'follow' });
    const outgoing = new Headers({ 'cache-control': 'no-store' });
    for (const key of ['content-type', 'content-disposition']) { const value = response.headers.get(key); if (value) outgoing.set(key, value); }
    // Do not forward framework cookies or a caller-controlled identity header.
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch { return Response.json({ detail: 'AgentScope 服务连接失败，请稍后重试。' }, { status: 503 }); }
}
export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
