"use client";

import { useEffect, useRef, useState } from "react";
import { useFiles } from "./file-context";

type Payload = { html: string; arguments: Record<string, unknown>; result: Record<string, unknown>; ui: { csp?: Record<string, string[]> } };

function domains(values: string[] = []) {
  return values.filter(value => /^https?:\/\/(\*\.)?[a-z\d.-]+(?::\d+)?\/?$/i.test(value)).join(" ");
}

// The App has an opaque origin and cannot access the host DOM, cookies or credentials.
export function appDocument(payload: Payload) {
  const csp = payload.ui.csp || {};
  const resources = domains(csp.resourceDomains);
  const policy = `default-src 'none'; script-src 'unsafe-inline' ${resources}; style-src 'unsafe-inline' ${resources}; img-src data: blob: ${resources}; font-src data: ${resources}; media-src data: blob: ${resources}; connect-src ${domains(csp.connectDomains) || "'none'"}; frame-src ${domains(csp.frameDomains) || "'none'"}; base-uri 'none'; form-action 'none'; object-src 'none';`;
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}">${payload.html}`;
}

export function McpApp({ id }: { id: string }) {
  const { token } = useFiles();
  const frame = useRef<HTMLIFrameElement>(null);
  const [payload, setPayload] = useState<Payload>();
  const [error, setError] = useState("");
  const [height, setHeight] = useState(400);
  const [generation, setGeneration] = useState(0);
  const [opened, setOpened] = useState(true);
  const [pending, setPending] = useState<{ name: string; arguments: Record<string, unknown>; finish: (approved: boolean) => void }>();
  const pendingRef = useRef<((approved: boolean) => void) | null>(null);

  useEffect(() => {
    if (!opened) return;
    const abort = new AbortController();
    let active = true;
    let initialized = false;
    let handshake = false;
    let loaded: Payload | undefined;
    let inFlight = false;
    let viewWindow: Window | null = null;
    const send = (message: unknown) => (viewWindow || frame.current?.contentWindow)?.postMessage(message, "*");
    const timeout = setTimeout(() => { if (!initialized && active) setError("App 初始化超时，仍可查看工具文本结果。"); }, 20000);
    fetch(`/api/console/mcp-apps/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` }, signal: abort.signal })
      .then(async response => { if (!response.ok) throw new Error("App 加载失败或连接器已不可用。"); return response.json() as Promise<Payload>; })
      .then(data => { if (active) { loaded = data; setPayload(data); } })
      .catch(reason => { if (active) setError(String(reason)); });

    const receive = async (event: MessageEvent) => {
      if (!active || event.source !== frame.current?.contentWindow || event.origin !== "null") return;
      viewWindow = event.source as Window;
      const message = event.data;
      if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string" || !loaded) return;
      const reply = (result: unknown) => { if (active) send({ jsonrpc: "2.0", id: message.id, result }); };
      const reject = (text: string, code = -32601) => { if (active) send({ jsonrpc: "2.0", id: message.id, error: { code, message: text } }); };
      if (message.method === "ui/initialize") {
        if (message.params?.protocolVersion !== "2026-01-26") { reject("Unsupported MCP Apps protocol", -32602); return; }
        handshake = true;
        reply({ protocolVersion: "2026-01-26", hostInfo: { name: "XIXI", version: "0.1.0" }, hostCapabilities: { serverTools: {} }, hostContext: { displayMode: "inline", availableDisplayModes: ["inline"], platform: "web", theme: document.documentElement.classList.contains("dark") ? "dark" : "light" } });
      } else if (message.method === "ui/notifications/initialized") {
        if (initialized || !handshake) return;
        initialized = true; clearTimeout(timeout); setError("");
        send({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: loaded.arguments } });
        send({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: loaded.result });
      } else if (!initialized) {
        if (message.id !== undefined) reject("App handshake required", -32000);
      } else if (message.method === "ping") reply({});
      else if (message.method === "ui/notifications/size-changed") {
        const value = message.params?.height;
        if (typeof value === "number" && Number.isFinite(value)) setHeight(Math.min(1200, Math.max(150, value)));
      } else if (message.method === "tools/call") {
        if (inFlight) { reject("Another App call is awaiting completion", -32000); return; }
        const { name, arguments: args = {} } = message.params || {};
        if (typeof name !== "string" || !args || Array.isArray(args) || typeof args !== "object") { reject("Invalid tool call", -32602); return; }
        inFlight = true;
        try {
          const approved = await new Promise<boolean>(finish => { pendingRef.current = finish; setPending({ name, arguments: args, finish }); });
          pendingRef.current = null; setPending(undefined);
          if (!approved || !active) { reject("User declined tool call", -32000); return; }
          const response = await fetch(`/api/console/mcp-apps/${encodeURIComponent(id)}/call`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ name, arguments: args, approved: true }), signal: abort.signal });
          if (!response.ok) throw new Error("调用失败，结果可能未知，请检查后再试。");
          reply(await response.json());
        } catch (reason) { reject(String(reason), -32000); }
        finally { inFlight = false; }
      } else if (message.id !== undefined) reject("Host does not support this method");
    };
    window.addEventListener("message", receive);
    return () => {
      if (initialized) send({ jsonrpc: "2.0", id: "teardown", method: "ui/resource-teardown", params: {} });
      active = false; abort.abort(); clearTimeout(timeout); pendingRef.current?.(false); pendingRef.current = null;
      window.removeEventListener("message", receive);
    };
  }, [id, token, generation, opened]);

  function teardown() { frame.current?.contentWindow?.postMessage({ jsonrpc: "2.0", id: "teardown", method: "ui/resource-teardown", params: {} }, "*"); }
  function reopen() { teardown(); setPayload(undefined); setError(""); setPending(undefined); setOpened(true); setGeneration(value => value + 1); }
  return <section aria-label="MCP App" style={{ marginTop: 12 }}>
    <div><button type="button" onClick={() => { if (opened) { teardown(); setPending(undefined); setOpened(false); setPayload(undefined); } else reopen(); }}>{opened ? "关闭 App" : "打开 App"}</button>{opened && <button type="button" onClick={reopen}>重新加载</button>}</div>
    {error && <p role="alert">{error}</p>}
    {pending && <div role="alertdialog" aria-label="确认 App 工具调用"><p>App 请求执行：{pending.name}</p><pre>{JSON.stringify(pending.arguments, null, 2)}</pre><button type="button" onClick={() => pending.finish(true)}>确认执行</button><button type="button" onClick={() => pending.finish(false)}>拒绝</button></div>}
    {opened && payload && <iframe key={generation} ref={frame} title="MCP App" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={appDocument(payload)} style={{ width: "100%", height, border: "1px solid var(--border)", borderRadius: 8 }} />}
  </section>;
}
