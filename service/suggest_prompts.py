"""Optional next-step suggestions shared by every workspace agent."""
import json

SUGGEST_PROMPTS_POLICY = '''[全局下一步建议展示协议]
回答末尾如有可选的下一步提问或行动引导，必须使用以下结构，不在正文重复引导列表：
<suggest_prompts>[{"prompt":"请帮我整理安装步骤。"},{"prompt":"请审查安装脚本的安全风险。"}]</suggest_prompts>
此区块必须独占回答末尾，不放进 Markdown 代码块。每项只有 prompt，不含 label；prompt 为用户可直接发送的完整请求。提供 1–4 项具体、简洁、与当前上下文相关且互不重复的建议，语言跟随用户当前对话语言。
无需下一步建议时不输出区块，不为了凑数追加问题。技能候选选择、权限授权或执行前必须获得的确认，应在正文询问，不能当成可选建议或据此执行。建议只是候选输入，不代表用户授权。
'''

MARKER = '<suggest_prompts>'


def suggestion_start(text: str) -> int | None:
    # Only recognize a standalone protocol line outside Markdown code fences.
    fenced = False
    offset = 0
    for line in text.splitlines(keepends=True):
        stripped = line.lstrip()
        if stripped.startswith(('```', '~~~')):
            fenced = not fenced
        if not fenced and stripped.startswith(MARKER):
            return offset + len(line) - len(stripped)
        offset += len(line)
    return None


def split_suggest_prompts(text: str, *, completed: bool = False) -> tuple[str, list[dict]]:
    start = suggestion_start(text)
    if start is None:
        return text, []
    body = text[:start].rstrip()
    block = text[start + len(MARKER):]
    if not completed or not block.rstrip().endswith('</suggest_prompts>'):
        return body, []
    try:
        candidates = json.loads(block.rstrip()[:-len('</suggest_prompts>')])
    except (ValueError, TypeError):
        return body, []
    if not isinstance(candidates, list):
        return body, []
    prompts, seen = [], set()
    for item in candidates:
        if not isinstance(item, dict) or not isinstance(item.get('prompt'), str):
            continue
        prompt = item['prompt'].strip()
        if not prompt or len(prompt) > 500 or prompt in seen:
            continue
        seen.add(prompt)
        prompts.append({'prompt': prompt})
        if len(prompts) == 4:
            break
    return body, prompts


def presentation_reply(content: str, parts: list[dict], *, completed: bool = False) -> tuple[str, list[dict]]:
    clean_content, _ = split_suggest_prompts(content)
    clean_parts, prompts = [], []
    for index, part in enumerate(parts):
        if part.get('type') == 'text':
            text, found = split_suggest_prompts(part.get('text', ''), completed=completed)
            clean_parts.append({**part, 'text': text})
            if index == len(parts) - 1:
                prompts = found
        elif part.get('type') != 'data' or part.get('name') != 'suggest_prompts':
            clean_parts.append(part)
    # Only the final text block may provide actionable suggestions.
    if prompts and parts and parts[-1].get('type') == 'text':
        clean_parts.append({'type': 'data', 'name': 'suggest_prompts', 'data': prompts[:4]})
    return clean_content, clean_parts
