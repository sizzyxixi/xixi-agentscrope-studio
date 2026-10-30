"""Conversation-bound schedule drafts; only the confirmed write tool persists them."""
import copy
import os
import time
import uuid
from datetime import datetime, timezone

from agentscope.message import TextBlock, ToolResultState
from agentscope.permission import PermissionBehavior, PermissionDecision
from agentscope.tool import FunctionTool, ToolChunk
from .scheduling import parse_time

SCHEDULE_POLICY = """[全局对话定时任务]
用户明确要求在未来某时、周期执行任务/提醒/监控时，使用 prepare_scheduled_task，然后调用 create_scheduled_task 触发前端确认卡片。普通立即执行、假设示例、咨询调度机制不创建任务。
先明确任务内容、执行日期/频率及钟点；缺项、多个解释、上午/下午不明、技能候选冲突时先询问，不猜测。时区默认 Asia/Shanghai，用户指定则遵循并在卡片展示。相对日期以运行时当前时间解析，过去的单次时间必须询问新日期。
prepare_scheduled_task 的 config 使用 frequency(once/hourly/interval/daily/weekly/biweekly/monthly/yearly)、带时区 start_at、time(HH:mm)、timezone；每周/双周明确 weekdays(周一=0)，每月明确 month_days，每年明确 month/month_day，interval 用 interval_value(1–24小时)。end_date 可选。技能/MCP/店铺只用真实可访问ID，不擅自绑定或扩大当前智能体权限。
先准备草稿，再用返回的 draft_id 调用 create_scheduled_task；确认按钮是最终授权，文字“确认”不能代替。用户修改时重新准备，旧草稿失效。用户拒绝后停止创建，等待用户的新要求，不得自动重试或换参数绕过拒绝。不要一次并行创建多任务或混入其他写操作，每张卡片只确认一个任务。仅工具返回 saved=true 才能说创建成功；拒绝、过期、失败均不能说已创建。
任务沿用当前智能体及当前模型。定时执行创建独立运行会话，结果在自动化运行记录查看，不承诺短信/系统通知。运行会话不能创建下一层定时任务。若自动调度不可用，必须明确说明，不能承诺届时执行。
"""


class SchedulePrepareTool(FunctionTool):
    async def check_permissions(self, *_args, **_kwargs):
        return PermissionDecision(behavior=PermissionBehavior.ALLOW, message='仅校验定时任务草稿，不保存或执行。')


class ScheduleCreateTool(FunctionTool):
    async def check_permissions(self, *_args, **_kwargs):
        return PermissionDecision(behavior=PermissionBehavior.ASK, message='请核对任务卡片，点击确认后才创建定时任务。')


class ChatSchedules:
    def __init__(self, capabilities, user_id, session_id, model_id=''):
        self.cap = capabilities
        self.user_id = user_id
        self.session_id = session_id
        self.model_id = model_id or ''
        self.drafts = {}

    def scope(self):
        if self.session_id.startswith(('run-', 'channel-')):
            raise ValueError('请在普通对话中创建定时任务。')
        with self.cap.store._lock:
            owner = self.cap.store._conn.execute('SELECT user_id FROM sessions WHERE id=?', (self.session_id,)).fetchone()
        if not owner or owner['user_id'] != self.user_id:
            raise ValueError('会话不存在或无权访问。')
        return self.cap.session_config(self.user_id, self.session_id) or {}

    def prepare(self, name: str, prompt: str, config: dict) -> dict:
        scope = self.scope()
        if not isinstance(name, str) or not isinstance(prompt, str) or not isinstance(config, dict):
            raise ValueError('任务名称、提示词或调度配置格式无效。')
        config = copy.deepcopy(config)
        # The model cannot schedule a different agent or account's credentials.
        config.update(agent_id=scope.get('agent_id') or 'main', model_id=self.model_id)
        if not config.get('start_at') or not config.get('frequency'):
            raise ValueError('请先明确首次执行时间和重复频率。')
        for field in {'weekly': ('weekdays',), 'biweekly': ('weekdays',), 'monthly': ('month_days',), 'yearly': ('month', 'month_day')}.get(config['frequency'], ()):
            if field not in config:
                raise ValueError('请先明确重复执行的具体日期。')
        config['next_run'] = config['start_at']
        body = self.cap.save(self.user_id, {'kind': 'schedule', 'name': name, 'content': prompt, 'config': config, 'enabled': True}, validate_only=True)
        draft_id = uuid.uuid4().hex
        body['request_id'] = f'chat-{draft_id}'
        agent = self.cap.agent(self.user_id, config['agent_id'])
        model = self.cap.store.get_model_setting(self.user_id, self.model_id) if self.model_id else None
        preview = {**body, 'agent_name': agent['name'], 'model_name': (model.display_name or model.model_name) if model else '',
                   'skills': [self.cap.get(self.user_id, key)['name'] for key in config.get('skill_ids', [])],
                   'mcps': [self.cap.get(self.user_id, key)['name'] for key in config.get('mcp_ids', [])],
                   'shops': [shop['name'] for shop in self.cap.shop_options(self.user_id) if shop['id'] in config.get('shop_ids', [])],
                   'automatic': os.getenv('AGENTSCOPE_SERVERLESS') != '1'}
        self.drafts.clear()  # A revised proposal supersedes the previous one.
        self.drafts[draft_id] = {'body': body, 'preview': preview, 'expires': time.monotonic() + 900}
        return {'draft_id': draft_id, 'schedule': copy.deepcopy(preview), 'saved': False}

    def preview(self, draft_id):
        if not isinstance(draft_id, str):
            return None
        draft = self.drafts.get(draft_id)
        return copy.deepcopy(draft['preview']) if draft else None

    def discard(self, draft_id):
        self.drafts.pop(draft_id, None)

    def create(self, draft_id: str) -> dict:
        scope = self.scope()
        draft = self.drafts.get(draft_id)
        if not draft or time.monotonic() > draft['expires']:
            raise ValueError('确认已过期，请重新生成任务卡片。')
        if (scope.get('agent_id') or 'main') != draft['body']['config']['agent_id']:
            raise ValueError('智能体已变化，请重新确认。')
        if parse_time(draft['body']['config']['next_run']) <= datetime.now(timezone.utc):
            raise ValueError('卡片中的首次执行时间已过，请重新生成并确认。')
        # Save revalidates all permissions, enabled flags and dates at confirmation time.
        saved = self.cap.save(self.user_id, copy.deepcopy(draft['body']))
        return {'saved': True, 'id': saved['id'], 'name': saved['name'], 'next_run': saved['config']['next_run'], 'automatic': draft['preview']['automatic']}

    def tools(self):
        def respond(action, **kwargs):
            import json
            try:
                result = action(**kwargs)
                return ToolChunk(state=ToolResultState.SUCCESS, content=[TextBlock(text=json.dumps(result, ensure_ascii=False))])
            except (ValueError, TypeError, KeyError) as error:
                return ToolChunk(state=ToolResultState.ERROR, content=[TextBlock(text=str(error))])

        def prepare_scheduled_task(name: str, prompt: str, config: dict) -> ToolChunk:
            """Validate a future/recurring task and return a draft_id; does not create it. Ask for missing dates first. config follows the global scheduling policy."""
            return respond(self.prepare, name=name, prompt=prompt, config=config)

        def create_scheduled_task(draft_id: str) -> ToolChunk:
            """Request user confirmation for a prepared draft. Only after the UI confirmation does this persist the task. Never invent a draft_id."""
            return respond(self.create, draft_id=draft_id)

        return [SchedulePrepareTool(prepare_scheduled_task, is_read_only=True), ScheduleCreateTool(create_scheduled_task, is_read_only=False)]


def schedule_clock():
    return '\n[运行时当前时间 UTC] ' + datetime.now(timezone.utc).isoformat()
