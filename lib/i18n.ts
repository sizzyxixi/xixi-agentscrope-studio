import english from "./locales/en.json";

export function translate(text: string, language: string): string {
  if (language !== "en") return text;
  const exact = (english as Record<string, string>)[text];
  if (exact !== undefined) return exact;
  const rules: [RegExp, (match: RegExpMatchArray) => string][] = [
    [/^搜索(.+)…$/, match => `Search ${translate(match[1], language)}…`],
    [/^还没有(.+)$/, match => `No ${translate(match[1], language)} yet`],
    [/^新建(.+)$/, match => `New ${translate(match[1], language)}`],
    [/^已读取 (\d+) \/ (\d+) 字符$/, match => `Read ${match[1]} / ${match[2]} characters`],
    [/^(\d+) 字符$/, match => `${match[1]} characters`],
    [/^(\d+) 个步骤$/, match => `${match[1]} steps`],
    [/^每 (\d+) (分钟|小时|天)$/, match => `Every ${match[1]} ${translate(match[2], language).toLowerCase()}`],
    [/^有效至 (.+)$/, match => `Valid until ${match[1]}`],
    [/^下次运行 (.+)$/, match => `Next run ${match[1]}`],
    [/^最近收信 (.+)$/, match => `Last received ${translate(match[1], language)}`],
    [/^移除技能 (.+)$/, match => `Remove skill ${match[1]}`],
    [/^移除附件(.+)$/, match => `Remove attachment ${match[1]}`],
    [/^移除(.+)$/, match => `Remove ${match[1]}`],
    [/^(.+)机器人$/, match => `${translate(match[1], language)} bot`],
    [/^ · (\d+) 次发送尝试$/, match => ` · ${match[1]} delivery attempts`],
  ];
  for (const [pattern, format] of rules) {
    const match = text.match(pattern);
    if (match) return format(match);
  }
  if (/^(每周|每双周) · 周/.test(text)) return text.split(" · ").map(part => part.split("、").map(day => translate(day, language)).join(", ")).join(" · ");
  return text;
}
