/** Hide the private presentation suffix, including a marker split across SSE chunks. */
export function suggestionBody(text: string): string {
  const marker = "<suggest_prompts>";
  let fenced = false;
  let offset = 0;
  for (const line of text.split(/(?<=\n)/)) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) fenced = !fenced;
    if (!fenced && (trimmed.startsWith(marker) || (trimmed.startsWith("<") && marker.startsWith(trimmed)))) {
      return text.slice(0, offset).trimEnd();
    }
    offset += line.length;
  }
  return text;
}

export function readSuggestPrompts(value: unknown): { prompt: string }[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    if (!item || typeof item.prompt !== "string") return [];
    const prompt = item.prompt.trim();
    if (!prompt || prompt.length > 500 || seen.has(prompt)) return [];
    seen.add(prompt);
    return [{ prompt }];
  }).slice(0, 4);
}
