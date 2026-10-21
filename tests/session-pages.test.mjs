import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../app/use-session-pages.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });

// A deterministic hook dispatcher lets requests settle in arbitrary order,
// including after account/search cleanup, without a browser or live service.
function mount(token = "account-a") {
  const slots = [], effects = [], timers = new Map(), intervals = new Map(), requests = [], received = [];
  let cursor = 0, nextTimer = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(value) {
      const index = cursor++;
      return slots[index] ??= { current: value };
    },
    useEffect(callback, deps) {
      const index = cursor++, previous = slots[index];
      if (!deps || !previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; });
      }
    },
  };
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, require: name => { assert.equal(name, "react"); return react; },
    AbortController, URLSearchParams, document: { visibilityState: "visible" },
    window: {
      queueMicrotask,
      setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
      clearTimeout: id => timers.delete(id),
      setInterval: callback => { intervals.set(++nextTimer, callback); return nextTimer; },
      clearInterval: id => intervals.delete(id),
    },
    fetch: (url, options) => new Promise(resolve => requests.push({ url: new URL(url, "http://test"), options, resolve })),
  });
  const props = { token, search: "", onPage: rows => received.push(...rows) };
  const render = () => {
    cursor = 0;
    const hook = exports.useSessionPages(props);
    for (const effect of effects.splice(0)) effect();
    return hook;
  };
  const start = () => { for (const callback of timers.values()) callback(); timers.clear(); };
  const settle = async (request, count, hasMore, ok = true) => {
    request.resolve({ ok, json: async () => ({ sessions: Array.from({ length: count }, (_, i) => ({ id: `${request.url.searchParams.get("group")}-${i}` })), has_more: hasMore }) });
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  render();
  return { render, props, requests, received, start, settle, intervals };
}

test("each group starts at 10, then loads batches of 20 and rejects duplicate scroll requests", async () => {
  const app = mount(); app.start();
  assert.equal(app.requests.length, 2);
  for (const request of app.requests) {
    assert.equal(request.url.searchParams.get("limit"), "10");
    assert.equal(request.url.searchParams.get("summary"), "true");
    await app.settle(request, 10, true);
  }
  const hook = app.render();
  assert.equal(hook.pages.recent.limit, 10);
  assert.equal(hook.pages.automation.limit, 10);
  const first = hook.loadMore("automation", 10);
  await hook.loadMore("automation", 10);
  assert.equal(app.requests.length, 3);
  assert.equal(app.requests[2].url.searchParams.get("limit"), "20");
  assert.equal(app.requests[2].url.searchParams.get("offset"), "10");
  await app.settle(app.requests[2], 20, true); await first;
  assert.equal(app.render().pages.automation.limit, 30);
  assert.equal(app.render().pages.recent.limit, 10);
  const next = app.render().loadMore("automation", 30);
  await app.settle(app.requests[3], 7, false); await next;
  assert.equal(app.render().pages.automation.limit, 37);
  assert.equal(app.render().pages.automation.hasMore, false);
});

test("an account/search change aborts old responses and resets both groups", async () => {
  const app = mount(); app.start();
  const old = app.requests[0];
  app.props.token = "account-b"; app.props.search = "inventory";
  app.render(); app.start();
  assert.equal(old.options.signal.aborted, true);
  await app.settle(old, 10, true);
  assert.equal(app.received.length, 0);
  assert.equal(app.requests[2].options.headers.authorization, "Bearer account-b");
  assert.equal(app.requests[2].url.searchParams.get("search"), "inventory");
  await app.settle(app.requests[2], 2, false);
  assert.equal(app.render().pages.recent.limit, 10);
  assert.equal(app.render().pages.recent.hasMore, false);
});

test("a failed page keeps loaded rows and can retry the same offset", async () => {
  const app = mount(); app.start();
  for (const request of app.requests) await app.settle(request, 10, true);
  const failed = app.render().loadMore("recent", 10);
  await app.settle(app.requests[2], 0, false, false); await failed;
  assert.equal(app.render().pages.recent.limit, 10);
  assert.equal(app.render().pages.recent.error, true);
  const retry = app.render().loadMore("recent", 10);
  await app.settle(app.requests[3], 20, true); await retry;
  assert.equal(app.render().pages.recent.error, false);
  assert.equal(app.render().pages.recent.limit, 30);
});

test("local history can expand without an authenticated service", async () => {
  const app = mount(""); app.start();
  await app.render().loadMore("recent", 10);
  assert.equal(app.requests.length, 0);
  assert.equal(app.render().pages.recent.limit, 30);
  assert.equal(app.render().pages.recent.expanded, true);
});
