/** Provider identity is explicit; compatible gateways can infer the actual model brand. */
export type ModelBrand = "openai" | "anthropic" | "gemini" | "deepseek" | "qwen" | "kimi" | "doubao" | "ollama" | "compatible" | "unknown";
export function modelBrand(provider = "", modelName = ""): ModelBrand {
  const aliases: Record<string, ModelBrand> = { openai: "openai", anthropic: "anthropic", claude: "anthropic", google: "gemini", gemini: "gemini", deepseek: "deepseek", qwen: "qwen", dashscope: "qwen", kimi: "kimi", moonshot: "kimi", doubao: "doubao", volcengine: "doubao", ollama: "ollama" };
  const normalized = provider.trim().toLowerCase();
  if (aliases[normalized]) return aliases[normalized];
  const name = modelName.trim().toLowerCase().split("/").pop() ?? "";
  if (/^(gpt-|chatgpt-|o[134](?:-|$))/.test(name)) return "openai";
  if (/^claude(?:-|$)/.test(name)) return "anthropic";
  if (/^gemini(?:-|$)/.test(name)) return "gemini";
  if (/^deepseek(?:-|$)/.test(name)) return "deepseek";
  if (/^qwen(?:\d|[-.]|$)/.test(name)) return "qwen";
  if (/^(kimi|moonshot)(?:-|$)/.test(name)) return "kimi";
  if (/^doubao(?:-|$)/.test(name)) return "doubao";
  return normalized === "openai-compatible" || normalized === "openai_compatible" ? "compatible" : "unknown";
}
export const modelBrandNames: Record<ModelBrand, string> = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Google Gemini", deepseek: "DeepSeek", qwen: "Qwen", kimi: "Kimi", doubao: "豆包", ollama: "Ollama", compatible: "OpenAI-compatible", unknown: "自定义模型" };
