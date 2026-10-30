"""Optional next-step suggestions shared by every workspace agent."""
import json
import re

SUGGEST_PROMPTS_POLICY = '''[全局下一步建议展示协议]
默认不生成下一步建议；先完整回答用户当前问题，再判断是否确有必要引导。不要把每次回复都变成新的任务入口。
用户限定“只给三条”“两句话”“仅输出译文”等交付范围时，回答结束即完成，不输出建议区块，也不在正文补同义追问或“我还可以……”；不能以还能执行后续任务为由扩大交付范围。
【判断顺序】用户明确要求不要建议、只给结果或结束对话时，优先遵守；命中下列不引导场景时不输出；其余情况仅在命中引导场景且满足质量条件时输出。不能仅因为“还能继续聊”就生成建议。
【需要引导的场景】
1. 当前目标尚未闭环：已交付方案、分析、初稿或阶段成果，存在紧接该目标的明确可选下一步，例如基于已确认的方案生成实施清单。用户本轮已要求执行的步骤应直接完成，不能留成建议让用户再点一次。
2. 用户处于开放探索或比较阶段，尚未确定后续方向；提供少量有真实差异的深入分析/落地路径，能减少用户组织下一条请求的负担。当前任务必须先做出的选择不属于此类。
3. 用户明确询问“接下来做什么”或要求推荐后续行动。若用户只想要清单/文档/纯文本等指定交付格式，在正文按要求交付，不额外附加按钮。
【不需要引导的场景】
问候、寒暄、致谢、确认收到；简单事实/术语解释/状态查询；翻译、改写、计算等已完整完成的明确任务；最终交付且当前目标已闭环；用户表示满意、停止、取消或拒绝继续；已经给出清晰下一步且重复按钮没有额外价值。
缺少必要信息、需要澄清或排除歧义、选择相似技能、权限授权、定时任务卡片确认等阻塞点；这些必须在正文或专用确认组件处理，不能伪装成可选建议。
思考过程、进度播报、工具执行中、等待用户确认、工具失败/被拒绝、响应中断或任务暂不可执行；说明现状与必要修复步骤即可，不推销新任务。
【每条建议的质量条件】
必须紧扣用户尚未完成的目标，是具体且有信息增益的完整请求，能基于已有上下文继续，不重复本轮已完成内容，不替代本轮本应完成的工作，不假定未提供的数据或平台不具备的能力。不能自行扩大用户目标；用户只要求一份方案、分析或文档时，交付它本身即闭环，不因后续还能实施就追加引导。多个建议必须是不同方向，不将同一路径拆成多条凑数。
不要输出“继续”“了解更多”“需要我帮你做什么”等泛化按钮。通常1–2项，确有多个不同方向时最多4项；没有高质量候选就完全省略。用户刚点过建议也不必再生成新一组，目标完成就结束。
只有符合以上规则时，回答末尾使用以下结构，不在正文重复提问、引导列表或补一句“还需要我做什么吗”：
<suggest_prompts>[{"prompt":"请帮我整理安装步骤。"},{"prompt":"请审查安装脚本的安全风险。"}]</suggest_prompts>
此区块必须独占回答末尾，不放进 Markdown 代码块。每项只有 prompt，不含 label；prompt 为用户可直接发送的完整请求，语言跟随用户当前对话语言。
无需下一步建议时不输出区块，也不在正文改用同样的机械追问。不为了凑数追加问题。建议只是候选输入，不代表用户授权。
'''

MARKER = '<suggest_prompts>'
LIMITED_OUTPUT_POLICY = "[本轮限定交付] 遵守用户原文中的数量与格式；交付所要求的正文后立即结束。省略欢迎语、未发生的状态播报、可选下一步、追问、帮助邀约和收尾。真实工具失败或拒绝仍须在要求的表达范围内如实反馈。"


def suggestions_allowed_for_request(message: str) -> bool:
    """Honor explicit output limits; leave open-ended relevance to the model.

    Ignore quoted examples. This deliberately does not infer business intent.
    """
    text = re.sub(r'```[\s\S]*?```|`[^`]*`|“[^”]*”|‘[^’]*’|"[^"\n]*"', '', message)
    if re.search(r'(?:不要|无需|不需要|不必|别)(?:任何|额外|再|继续)?(?:的)?(?:建议|推荐|追问|引导)|\b(?:no|without)\s+(?:extra\s+)?(?:suggestions|recommendations)\b', text, re.I):
        return False
    # Explicitly requested suggestion buttons are part of the requested result.
    if re.search(r'(?:建议|推荐|下一步|后续).{0,8}(?:按钮|快捷入口)|suggestion\s+buttons', text, re.I):
        return True
    limited = r'(?:只|仅)(?:给|要|需|输出|回答|返回|解释|提供)|\b(?:only|just)\s+(?:give|return|output|answer|provide)\b|\bin\s+(?:one|two|three|\d+)\s+(?:sentences?|lines?|bullet\s+points?)\b'
    return re.search(limited, text, re.I) is None


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


def presentation_reply(content: str, parts: list[dict], *, completed: bool = False, allow_suggestions: bool = True) -> tuple[str, list[dict]]:
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
    # Semantic relevance belongs to the shared policy. Execution state is enforced
    # here, so an accidental suffix cannot turn a failed/blocked reply into actions.
    blocked = any(
        part.get('type') == 'tool-call' and (
            part.get('isError') or part.get('isPreliminary') or part.get('result') is None or
            (part.get('approval') is not None and
             part['approval'].get('approved') is not True)
        ) for part in parts
    )
    has_answer = any(part.get('type') == 'text' and part.get('text', '').strip() for part in clean_parts)
    # Only a substantive, completed final answer may provide actionable suggestions.
    if allow_suggestions and completed and has_answer and not blocked and prompts and parts and parts[-1].get('type') == 'text':
        clean_parts.append({'type': 'data', 'name': 'suggest_prompts', 'data': prompts[:4]})
    return clean_content, clean_parts
