import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/model-brand.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { modelBrand } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("explicit providers and aliases keep the configured brand", () => {
  for (const [provider, expected] of [["openai", "openai"], ["anthropic", "anthropic"], ["Google", "gemini"], ["DeepSeek", "deepseek"], ["dashscope", "qwen"], ["Moonshot", "kimi"], ["doubao", "doubao"], ["ollama", "ollama"]]) assert.equal(modelBrand(provider, "custom-name"), expected);
});
test("compatible gateways infer model brands from actual IDs, including namespaced IDs", () => {
  for (const [id, expected] of [["openai/gpt-4.1-mini", "openai"], ["anthropic/claude-sonnet-4-5", "anthropic"], ["google/gemini-2.5-flash", "gemini"], ["deepseek/deepseek-flash", "deepseek"], ["qwen/qwen3-32b", "qwen"], ["moonshotai/kimi-k2", "kimi"]]) assert.equal(modelBrand("openai-compatible", id), expected);
});
test("unknown compatible models do not display a misleading OpenAI logo", () => {
  assert.equal(modelBrand("openai-compatible", "my-private-model"), "compatible");
  assert.equal(modelBrand(undefined, "Custom demo"), "unknown");
  assert.equal(modelBrand("ollama", "qwen3:8b"), "ollama");
});
test("local supplementary logos are SVG assets with the open-source license included", async () => {
  for (const name of ["deepseek-color", "qwen-color", "kimi-color", "doubao-color", "ollama"]) {
    const svg = await readFile(new URL(`../public/model-logos/${name}.svg`, import.meta.url), "utf8");
    assert.match(svg, /<svg\b/);
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|(?:href|src)=["']https?:/i);
  }
  assert.match(await readFile(new URL("../docs/licenses/lobe-icons-MIT.txt", import.meta.url), "utf8"), /MIT License/);
});
