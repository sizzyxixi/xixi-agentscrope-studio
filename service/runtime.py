import asyncio
import json
import importlib.metadata
import os
import re
import time
from dataclasses import dataclass, field
from contextlib import aclosing
from pathlib import Path
from typing import Any, AsyncIterator

from agentscope.agent import Agent, ContextConfig, ReActConfig
from agentscope.credential import (
    AnthropicCredential,
    DashScopeCredential,
    DeepSeekCredential,
    GeminiCredential,
    MoonshotCredential,
    OllamaCredential,
    OpenAICredential,
)
from agentscope.event import (
    ConfirmResult,
    ModelCallEndEvent,
    ModelCallStartEvent,
    ReplyEndEvent,
    ReplyStartEvent,
    RequireExternalExecutionEvent,
    RequireUserConfirmEvent,
    TextBlockDeltaEvent,
    ThinkingBlockDeltaEvent,
    ToolCallDeltaEvent,
    ToolCallEndEvent,
    ToolCallStartEvent,
    ToolResultEndEvent,
    ToolResultStartEvent,
    ToolResultTextDeltaEvent,
    UserConfirmResultEvent,
)
from agentscope.message import Msg, TextBlock, ToolCallBlock
from agentscope.middleware import MiddlewareBase
from agentscope.model import (
    AnthropicChatModel,
    DashScopeChatModel,
    DeepSeekChatModel,
    GeminiChatModel,
    MoonshotChatModel,
    OllamaChatModel,
    OpenAIChatModel,
)
from agentscope.state import AgentState
from agentscope.tool import FunctionTool, Toolkit, ToolResponse, ToolChunk
from agentscope.permission import PermissionBehavior, PermissionDecision

from .store import AuthUser, KnowledgeHit, ModelSetting, StudioStore, StoredPlan

MAIN_AGENT_NAME = "MoonClaw 助手"
MAIN_PERSONA_DIR = Path(__file__).parent / "personas" / "main"
MAIN_PERSONA_FILES = ("agents.md", "bootstrap.md", "user.md")


class SkillReadTool(FunctionTool):
    """Only for the two authenticated, scope-checked, read-only skill functions."""
    async def check_permissions(self, *_args, **_kwargs):
        return PermissionDecision(behavior=PermissionBehavior.ALLOW, message="读取当前账号已启用且在会话范围内的技能文件。")


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


class RuntimeConfigError(RuntimeError):
    """Raised when the AgentScope runtime lacks required model settings."""


def load_main_persona(directory: Path = MAIN_PERSONA_DIR, *, include_bootstrap: bool = False) -> str:
    """Assemble the shared rules; user-specific data remains in scoped memory."""
    sections = []
    for filename in MAIN_PERSONA_FILES:
        if filename == "bootstrap.md" and not include_bootstrap:
            continue
        try:
            content = (directory / filename).read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError) as error:
            raise RuntimeConfigError("助手配置暂不可用，请联系平台管理员。") from error
        if not content:
            raise RuntimeConfigError("助手配置暂不可用，请联系平台管理员。")
        sections.append(content)
    return "\n\n---\n\n".join(sections)


class BootstrapMiddleware(MiddlewareBase):
    """Attach first-user guidance for this turn without replacing a live agent."""

    def __init__(self) -> None:
        self.content = ""

    async def on_system_prompt(self, agent: Agent, current_prompt: str) -> str:
        return current_prompt + ("\n\n---\n\n" + self.content if self.content else "")


@dataclass
class ModelSettings:
    id: str | None = None
    provider: str | None = None
    name: str | None = None
    endpoint: str | None = None
    api_key: str | None = None


@dataclass
class ApprovalDecision:
    id: str
    approved: bool


@dataclass
class SessionRuntime:
    id: str
    agent: Agent
    model_key: str
    pending_confirmations: dict[str, RequireUserConfirmEvent] = field(default_factory=dict)
    assistant_buffers: dict[str, list[str]] = field(default_factory=dict)
    assistant_parts: dict[str, list[dict]] = field(default_factory=dict)
    bootstrap: BootstrapMiddleware = field(default_factory=BootstrapMiddleware)
    bootstrap_user_id: str | None = None


class AgentScopeRuntime:
    """Thin AgentScope adapter used by the Web UI.

    The Web UI speaks a compact SSE contract. This runtime keeps that contract
    stable while delegating the agent loop, model streaming, tool calls and
    permission interruption to real AgentScope.
    """

    def __init__(self, store: StudioStore | None = None) -> None:
        self.sessions: dict[str, SessionRuntime] = {}
        self.capabilities = None
        self.session_locks: dict[str, asyncio.Lock] = {}
        self.onboarding_locks: dict[str, asyncio.Lock] = {}
        self.store = store or StudioStore()
        self.store.sync_knowledge_docs()

    def health(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "runtime": "agentscope",
            "version": importlib.metadata.version("agentscope"),
        }

    def list_sessions(self, user: AuthUser | None = None) -> list[dict[str, Any]]:
        sessions = []
        for session in self.store.list_sessions(user.id if user else None):
            messages = self.store.list_messages(str(session["id"]))
            scope = (self.capabilities.session_config(user.id, str(session["id"])) or {}) if user and self.capabilities else {}
            first_user_message = next(
                (message["content"] for message in messages if message["role"] == "user"),
                "",
            )
            title = session.get("title") or (first_user_message[:20] if first_user_message else f"{scope['agent_name']} · 新对话" if scope.get("agent_name") else "新任务 · 主 Agent")
            live = self.sessions.get(str(session["id"]))
            pending = next(iter(live.pending_confirmations.values()), None) if live else None
            sessions.append(
                {
                    "id": session["id"],
                    "title": title,
                    "pinned": bool(session.get("pinned", False)),
                    "custom_title": bool(session.get("title")),
                    "subtitle": "消息渠道 · AgentScope" if str(session["id"]).startswith("channel-") else "AgentScope SQLite state",
                    "created_at": session["created_at"],
                    "updated_at": session["updated_at"],
                    "status": "waiting_approval" if pending else "streaming" if self.session_locks.get(str(session["id"]), asyncio.Lock()).locked() else "ready",
                    "pendingApproval": {"id": pending.id, "toolName": "、".join(call.name for call in pending.tool_calls), "reason": f"确认全部 {len(pending.tool_calls)} 个工具调用", "args": {f"{index + 1}. {call.name}": json.dumps(self._tool_call_args(call), ensure_ascii=False) for index, call in enumerate(pending.tool_calls)}} if pending else None,
                    "messages": messages,
                    "events": self.store.list_events(str(session["id"])),
                    "message_count": session["message_count"],
                    "skill_ids": scope.get("skill_ids", []),
                    "agent_id": scope.get("agent_id", "main"),
                    "agent_name": scope.get("agent_name", MAIN_AGENT_NAME),
                    "agent_avatar": scope.get("agent_avatar", "✦"),
                },
            )

        return sessions

    def list_messages(self, session_id: str) -> list[dict[str, str]]:
        return self.store.list_messages(session_id)

    async def stream(
        self,
        session_id: str,
        message: str,
        model: ModelSettings | None = None,
        approval: ApprovalDecision | None = None,
        user: AuthUser | None = None,
        skill_ids: list[str] | None = None,
        agent_id: str | None = None,
    ) -> AsyncIterator[str]:
        lock = self.session_locks.setdefault(session_id, asyncio.Lock())
        if lock.locked():
            yield sse("done", {"type": "done", "title": "Session busy", "detail": "当前会话正在运行，请等待完成。", "level": "warning"})
            return
        async with lock:
            if agent_id is not None:
                if not user or not self.capabilities or approval:
                    raise ValueError("当前请求不能切换智能体。")
                self.capabilities.set_chat_agent(user.id, session_id, agent_id)
            if skill_ids is not None:
                if not user or not self.capabilities or approval:
                    raise ValueError("当前请求不能修改会话技能。")
                self.capabilities.set_chat_skills(user.id, session_id, skill_ids)
            # Serialize first-user turns across chats until the introduction is delivered.
            if user and not self.store.has_seen_bootstrap(user.id):
                onboarding_lock = self.onboarding_locks.setdefault(user.id, asyncio.Lock())
                async with onboarding_lock, aclosing(self._stream(session_id, message, model, approval, user)) as stream:
                    async for frame in stream:
                        yield frame
            else:
                async with aclosing(self._stream(session_id, message, model, approval, user)) as stream:
                    async for frame in stream:
                        yield frame

    async def _stream(
        self,
        session_id: str,
        message: str,
        model: ModelSettings | None = None,
        approval: ApprovalDecision | None = None,
        user: AuthUser | None = None,
    ) -> AsyncIterator[str]:
        self.store.ensure_session(session_id, user.id if user else None)
        docs_count = self.store.sync_knowledge_docs()
        stored_plans = self.store.list_plans(session_id)
        knowledge_hits = [] if approval else self.store.search_knowledge(message)
        yield self._event(
            session_id,
            "state",
            {
                "type": "state",
                "title": "SQLite state store",
                "detail": "已连接本地 SQLite；会话、工具写入和运行事件会真实持久化。",
                "level": "success",
            },
        )

        yield self._event(
            session_id,
            "memory",
            {
                "type": "memory",
                "title": "Stored session plans",
                "detail": f"当前会话真实保存了 {len(stored_plans)} 条工具写入计划。",
                "level": "info",
            },
        )

        yield self._event(
            session_id,
            "rag",
            {
                "type": "rag",
                "title": "Local project docs",
                "detail": self._rag_detail(docs_count, knowledge_hits),
                "level": "success" if knowledge_hits else "info",
            },
        )

        try:
            session = self._get_or_create_session(session_id, model, user)
            self._configure_bootstrap(session, user, approval=bool(approval))
        except RuntimeConfigError as error:
            if not approval:
                self.store.add_message(session_id, "user", message)
            yield self._event(
                session_id,
                "state",
                {
                    "type": "state",
                    "title": "AgentScope model not configured",
                    "detail": str(error),
                    "level": "warning",
                },
            )
            yield self._event(
                session_id,
                "done",
                {
                    "type": "done",
                    "title": "Waiting for model settings",
                    "detail": "AgentScope 服务已接入；配置模型密钥后即可真实执行。",
                },
            )
            return

        if not approval:
            self.store.add_message(session_id, "user", message)

        yield self._event(
            session_id,
            "agent",
            {
                "type": "agent",
                "title": "AgentScope runtime",
                "detail": f"已恢复会话 {session_id}，真实 AgentScope Agent 正在接管本轮循环。",
                "level": "success",
            },
        )

        if approval:
            pending = session.pending_confirmations.pop(approval.id, None)
            if not pending:
                yield self._event(
                    session.id,
                    "state",
                    {
                        "type": "state",
                        "title": "Approval expired",
                        "detail": "没有找到对应的 AgentScope 确认点，请重新发起任务。",
                        "level": "warning",
                    },
                )
                yield self._event(
                    session.id,
                    "done",
                    {
                        "type": "done",
                        "title": "Loop stopped",
                        "detail": "确认点已失效。",
                    },
                )
                return

            for part in session.assistant_parts.get(pending.reply_id, []):
                if part.get("approval", {}).get("id") == approval.id:
                    part["approval"]["approved"] = approval.approved
            yield self._parts_event(session, pending.reply_id)
            user_input = UserConfirmResultEvent(
                reply_id=pending.reply_id,
                confirm_results=[
                    ConfirmResult(confirmed=approval.approved, tool_call=tool_call)
                    for tool_call in pending.tool_calls
                ],
            )
        else:
            context = self._build_context(stored_plans, knowledge_hits)
            if user and self.capabilities:
                context += "\n\n" + self.capabilities.context(user.id, message, session_id)
            if context:
                message = (
                    "<runtime-context>\n"
                    f"{context}\n"
                    "</runtime-context>\n\n"
                    f"用户消息：{message}"
                )
            user_input = Msg(
                name="user",
                role="user",
                content=[TextBlock(text=message)],
            )

        try:
            async for event in session.agent.reply_stream(user_input):
                async for frame in self._map_agent_event(session, event):
                    yield frame
        except Exception as error:  # AgentScope provider errors must reach the UI.
            detail = self._safe_error_message(error)
            yield self._event(
                session_id,
                "state",
                {
                    "type": "state",
                    "title": "Model call failed",
                    "detail": detail,
                    "level": "warning",
                },
            )
            yield self._event(
                session_id,
                "done",
                {
                    "type": "done",
                    "title": "AgentScope loop stopped",
                    "detail": detail,
                    "level": "warning",
                },
            )
        finally:
            # Preserve partial replies when the client disconnects or cancels.
            for reply_id in list(session.assistant_parts):
                self._finish_reasoning(session, reply_id)
                self._store_reply(session, reply_id)
                if not session.pending_confirmations:
                    session.assistant_parts.pop(reply_id, None)
                    session.assistant_buffers.pop(reply_id, None)

    def _should_load_bootstrap(self, session_id: str, user: AuthUser | None, *, approval: bool = False) -> bool:
        if not user or approval or session_id.startswith(("run-", "channel-")):
            return False
        if self.capabilities and (self.capabilities.session_config(user.id, session_id) or {}).get("agent_id", "main") != "main":
            return False
        if self.store.has_seen_bootstrap(user.id):
            return False
        if self.capabilities and any(
            item["enabled"] and item["name"] == "MoonClaw 用户身份"
            for item in self.capabilities.list(user.id, "memory")
        ):
            # Existing confirmed profiles migrate to the returning-user state.
            self.store.mark_bootstrap_seen(user.id)
            return False
        return True

    def _configure_bootstrap(self, session: SessionRuntime, user: AuthUser | None, *, approval: bool = False) -> None:
        session.bootstrap.content = ""
        session.bootstrap_user_id = None
        if not self._should_load_bootstrap(session.id, user, approval=approval):
            return
        try:
            content = (MAIN_PERSONA_DIR / "bootstrap.md").read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError) as error:
            raise RuntimeConfigError("助手配置暂不可用，请联系平台管理员。") from error
        if not content:
            raise RuntimeConfigError("助手配置暂不可用，请联系平台管理员。")
        session.bootstrap.content = content
        session.bootstrap_user_id = user.id

    def _finish_bootstrap(self, session: SessionRuntime) -> None:
        if session.bootstrap_user_id:
            self.store.mark_bootstrap_seen(session.bootstrap_user_id)
            session.bootstrap_user_id = None
            session.bootstrap.content = ""

    def _get_or_create_session(
        self,
        session_id: str,
        model: ModelSettings | None,
        user: AuthUser | None,
    ) -> SessionRuntime:
        scope = self.capabilities.session_config(user.id, session_id) if user and self.capabilities else None
        if scope and scope.get("model_id"):
            model = ModelSettings(id=scope["model_id"])
        resolved_model = self._resolve_model_settings(model, user)
        model_key = self._model_key(resolved_model)
        if scope:
            model_key += json.dumps(scope, sort_keys=True)
        if user and self.capabilities:
            model_key += json.dumps([(item["id"], item["updated_at"]) for item in self.capabilities.list(user.id, "mcp") if item["enabled"]])
        if (
            session_id not in self.sessions
            or self.sessions[session_id].model_key != model_key
        ):
            self.sessions[session_id] = self._create_session(session_id, resolved_model, model_key, user)

        return self.sessions[session_id]

    def _create_session(
        self,
        session_id: str,
        model: ModelSettings | None,
        model_key: str,
        user: AuthUser | None = None,
    ) -> SessionRuntime:
        self.store.ensure_session(session_id)

        def workspace_write_plan(plan: str) -> ToolResponse:
            """Write a plan into the current task state.

            Args:
                plan: The plan text to persist for this session.
            """

            self.store.add_plan(session_id, plan)
            count = self.store.count_plans(session_id)
            return ToolResponse(
                content=[
                    TextBlock(
                        text=(
                            "计划已写入当前 task state。"
                            f"本会话现在共有 {count} 条计划记录。"
                        ),
                    ),
                ],
            )

        def search_documents(query: str) -> ToolResponse:
            """Search the current user's knowledge and shared project documents.

            Args:
                query: The search terms to retrieve.
            """
            shared = self.store.search_knowledge(query)
            context = self._build_context([], shared)
            if user and self.capabilities:
                context += "\n\n" + self.capabilities.context(user.id, query, session_id)
            return ToolResponse(content=[TextBlock(text=context.strip() or "未检索到相关资料。")])

        def save_memory(name: str, content: str, memory_id: str = "") -> ToolResponse:
            """Save a persistent memory for the current user after permission confirmation.

            Args:
                name: A short name for the memory.
                content: The memory text to save.
                memory_id: An existing memory ID to update, or empty to create.
            """
            if not user or not self.capabilities:
                return ToolResponse(content=[TextBlock(text="请先登录以保存记忆。")])
            item = self.capabilities.save(user.id, {"kind": "memory", "name": name, "content": content, "enabled": True}, memory_id or None)
            return ToolResponse(content=[TextBlock(text=f"记忆已保存：{item['name']}（ID: {item['id']}）。")])

        def read_skill(skill_id: str, path: str = "SKILL.md", offset: int = 0, limit: int = 12000) -> ToolChunk:
            """Read an enabled skill's instructions or referenced UTF-8 file for this conversation.

            Args:
                skill_id: Skill ID from the available skills in runtime context.
                path: Relative file path, initially SKILL.md. Never a host filesystem path.
                offset: Character offset; continue from next_offset until null.
                limit: Maximum characters to read, up to 24000.
            """
            try:
                if not user or not self.capabilities:
                    raise ValueError("请先登录以读取技能。")
                result = self.capabilities.read_skill(user.id, skill_id, path, offset, limit, session_id)
                return ToolChunk(content=[TextBlock(text=json.dumps(result, ensure_ascii=False))])
            except ValueError as error:
                return ToolChunk(content=[TextBlock(text=str(error))])

        def list_skill_files(skill_id: str) -> ToolChunk:
            """List the relative paths bundled with an enabled skill, including references and scripts.

            Args:
                skill_id: Skill ID from the available skills in runtime context.
            """
            try:
                if not user or not self.capabilities:
                    raise ValueError("请先登录以读取技能。")
                result = self.capabilities.skill_files(user.id, skill_id, session_id)
                return ToolChunk(content=[TextBlock(text=json.dumps(result, ensure_ascii=False))])
            except ValueError as error:
                return ToolChunk(content=[TextBlock(text=str(error))])

        toolkit = Toolkit(
            mcps=self.capabilities.mcp_clients(user.id, session_id) if user and self.capabilities else [],
            tools=[
                FunctionTool(search_documents, is_read_only=True),
                SkillReadTool(read_skill, is_read_only=True),
                SkillReadTool(list_skill_files, is_read_only=True),
                FunctionTool(save_memory, is_read_only=False),
                FunctionTool(
                    workspace_write_plan,
                    name="workspace_write_plan",
                    description=(
                        "把主 Agent 的执行计划写入当前 task state。"
                        "处理需要规划、拆解或多步骤执行的复杂任务时使用。"
                        "简单问答、身份引导、管家推荐与边界拒绝无需调用。"
                    ),
                    is_read_only=False,
                ),
            ],
        )

        scope = self.capabilities.session_config(user.id, session_id) if user and self.capabilities else None
        bootstrap = BootstrapMiddleware()
        agent = Agent(
            name=scope.get("agent_name", MAIN_AGENT_NAME) if scope else MAIN_AGENT_NAME,
            system_prompt=scope.get("agent_prompt") or load_main_persona() if scope else load_main_persona(),
            middlewares=[bootstrap],
            model=self._build_model(model),
            toolkit=toolkit,
            state=self._restore_agent_state(session_id),
            context_config=ContextConfig(trigger_ratio=(scope or {}).get("agent_config", {}).get("context_trigger", 0.75), reserve_ratio=0.1),
            react_config=ReActConfig(max_iters=(scope or {}).get("agent_config", {}).get("max_iters", 8), stop_on_reject=False),
        )
        return SessionRuntime(id=session_id, agent=agent, model_key=model_key, bootstrap=bootstrap)

    def _restore_agent_state(self, session_id: str) -> AgentState:
        context: list[Msg] = []
        for message in self.store.list_messages(session_id):
            role = message["role"]
            if role not in {"user", "assistant", "system"}:
                continue
            context.append(
                Msg(
                    id=message["id"],
                    name="user" if role == "user" else MAIN_AGENT_NAME,
                    role=role,
                    content=[TextBlock(text=message["content"])],
                ),
            )

        return AgentState(session_id=session_id, context=context)

    async def test_model_setting(
        self,
        user: AuthUser,
        setting_id: str,
        timeout_seconds: float = 30.0,
    ) -> dict[str, Any]:
        stored = self.store.get_model_setting(user.id, setting_id)
        if not stored:
            raise RuntimeConfigError("模型配置不存在。")

        settings = self._from_stored_model(stored)
        started = time.perf_counter()
        test_agent = Agent(
            name="Model connection test",
            system_prompt="Reply with exactly: OK",
            model=self._build_model(settings),
            react_config=ReActConfig(max_iters=1),
        )
        try:
            await asyncio.wait_for(
                test_agent.reply(
                    Msg(
                        name="user",
                        role="user",
                        content=[TextBlock(text="Connection test. Reply OK.")],
                    ),
                ),
                timeout=timeout_seconds,
            )
        except asyncio.TimeoutError as error:
            raise RuntimeConfigError(f"连接测试超时（{int(timeout_seconds)} 秒）。") from error
        except Exception as error:
            raise RuntimeConfigError(self._safe_error_message(error)) from error

        return {
            "ok": True,
            "provider": stored.provider,
            "modelName": stored.model_name,
            "latencyMs": round((time.perf_counter() - started) * 1000),
        }

    def _resolve_model_settings(
        self,
        model: ModelSettings | None,
        user: AuthUser | None,
    ) -> ModelSettings | None:
        if user and model and model.id:
            stored = self.store.get_model_setting(user.id, model.id)
            if not stored:
                raise RuntimeConfigError("选择的模型配置不存在。")

            return self._from_stored_model(stored)

        if user:
            stored = self.store.get_default_model_setting(user.id)
            if stored:
                return self._from_stored_model(stored)
            raise RuntimeConfigError("请先为当前账号保存一条默认模型配置。")

        return model

    def _from_stored_model(self, stored: ModelSetting) -> ModelSettings:
        return ModelSettings(
            id=stored.id,
            provider=stored.provider,
            name=stored.model_name,
            endpoint=stored.endpoint,
            api_key=stored.api_key,
        )

    def _model_key(self, model: ModelSettings | None) -> str:
        if not model:
            return "env-default"

        return "|".join(
            [
                model.id or "",
                model.provider or "",
                model.name or "",
                model.endpoint or "",
                "key" if model.api_key else "env",
            ],
        )

    def _event(self, session_id: str, event: str, data: dict[str, Any]) -> str:
        self.store.save_event(session_id=session_id, event_type=event, payload=data)
        return sse(event, data)

    def _rag_detail(self, docs_count: int, hits: list[KnowledgeHit]) -> str:
        if not hits:
            return f"已索引 {docs_count} 个真实项目文档；本轮输入未命中相关片段。"

        sources = "；".join(f"{hit.path}（score {hit.score}）" for hit in hits)
        return f"已索引 {docs_count} 个真实项目文档；本轮命中：{sources}"

    def _build_context(self, plans: list[StoredPlan], hits: list[KnowledgeHit]) -> str:
        parts: list[str] = []

        if plans:
            plan_lines = "\n".join(
                f"- {plan.created_at}: {plan.plan}"
                for plan in plans
            )
            parts.append(
                "以下是当前会话真实持久化的近期计划记录，来自 SQLite：\n"
                f"{plan_lines}",
            )

        if hits:
            hit_lines = "\n\n".join(
                f"[{hit.path}] {hit.title}\n{hit.snippet}"
                for hit in hits
            )
            parts.append(
                "以下是从项目真实 Markdown 文档检索到的片段；只可基于片段引用，不要编造：\n"
                f"{hit_lines}",
            )

        return "\n\n".join(parts)

    def _build_model(
        self,
        model: ModelSettings | None,
    ) -> (
        OpenAIChatModel
        | DashScopeChatModel
        | MoonshotChatModel
        | DeepSeekChatModel
        | AnthropicChatModel
        | GeminiChatModel
        | OllamaChatModel
    ):
        provider = (
            (model.provider if model else None)
            or os.getenv("AGENTSCOPE_PROVIDER")
            or "openai"
        ).lower()

        if provider in {"kimi", "moonshot"}:
            api_key = (
                model.api_key
                if model and model.api_key
                else os.getenv("KIMI_API_KEY") or os.getenv("MOONSHOT_API_KEY")
            )
            if not api_key:
                raise RuntimeConfigError("缺少 Kimi/Moonshot API Key。请在模型设置中保存一条 Kimi 配置。")

            return MoonshotChatModel(
                credential=MoonshotCredential(
                    api_key=api_key,
                    base_url=(
                        model.endpoint
                        if model and model.endpoint
                        else os.getenv("KIMI_BASE_URL") or os.getenv("MOONSHOT_BASE_URL")
                    )
                    or "https://api.moonshot.cn/v1",
                ),
                model=(model.name if model and model.name else os.getenv("KIMI_MODEL"))
                or "moonshot-v1-8k",
                stream=True,
            )

        if provider == "deepseek":
            api_key = (
                model.api_key
                if model and model.api_key
                else os.getenv("DEEPSEEK_API_KEY")
            )
            if not api_key:
                raise RuntimeConfigError("缺少 DeepSeek API Key。请在模型设置中保存一条 DeepSeek 配置。")

            return DeepSeekChatModel(
                credential=DeepSeekCredential(
                    api_key=api_key,
                    base_url=(
                        model.endpoint
                        if model and model.endpoint
                        else os.getenv("DEEPSEEK_BASE_URL")
                    )
                    or "https://api.deepseek.com",
                ),
                model=(model.name if model and model.name else os.getenv("DEEPSEEK_MODEL"))
                or "deepseek-flash",
                stream=True,
            )

        if provider == "anthropic":
            api_key = (
                model.api_key
                if model and model.api_key
                else os.getenv("ANTHROPIC_API_KEY")
            )
            if not api_key:
                raise RuntimeConfigError("缺少 Anthropic API Key。请在模型设置中保存一条 Anthropic 配置。")

            return AnthropicChatModel(
                credential=AnthropicCredential(
                    api_key=api_key,
                    base_url=(
                        model.endpoint
                        if model and model.endpoint
                        else os.getenv("ANTHROPIC_BASE_URL")
                    )
                    or None,
                ),
                model=(model.name if model and model.name else os.getenv("ANTHROPIC_MODEL"))
                or "claude-sonnet-4-5",
                stream=True,
            )

        if provider == "doubao":
            api_key = (
                model.api_key
                if model and model.api_key
                else os.getenv("DOUBAO_API_KEY")
            )
            endpoint = (
                model.endpoint
                if model and model.endpoint
                else os.getenv("DOUBAO_BASE_URL")
            )
            if not api_key:
                raise RuntimeConfigError("缺少 Doubao API Key。请在模型设置中保存一条 Doubao 配置。")
            if not endpoint:
                raise RuntimeConfigError("Doubao 需要 OpenAI-compatible Endpoint，请在模型设置中填写。")

            return OpenAIChatModel(
                credential=OpenAICredential(
                    api_key=api_key,
                    base_url=endpoint,
                ),
                model=(model.name if model and model.name else os.getenv("DOUBAO_MODEL"))
                or "",
                stream=True,
            )

        if "dash" in provider or "qwen" in provider:
            api_key = (
                model.api_key
                if model and model.api_key
                else os.getenv("DASHSCOPE_API_KEY") or os.getenv("AGENTSCOPE_API_KEY")
            )
            if not api_key:
                raise RuntimeConfigError("缺少 Qwen/DashScope API Key。")

            return DashScopeChatModel(
                credential=DashScopeCredential(
                    api_key=api_key,
                    base_url=(
                        model.endpoint
                        if model and model.endpoint
                        else os.getenv("DASHSCOPE_BASE_URL")
                    )
                    or "https://dashscope.aliyuncs.com/compatible-mode/v1",
                ),
                model=(
                    (model.name if model and model.name else None)
                    or os.getenv("DASHSCOPE_MODEL")
                    or os.getenv("AGENTSCOPE_MODEL")
                )
                or "qwen-plus",
                stream=True,
            )

        if provider == "gemini":
            api_key = (
                model.api_key
                if model and model.api_key
                else os.getenv("GEMINI_API_KEY")
            )
            if not api_key:
                raise RuntimeConfigError("缺少 Gemini API Key。")

            return GeminiChatModel(
                credential=GeminiCredential(api_key=api_key),
                model=(model.name if model and model.name else os.getenv("GEMINI_MODEL"))
                or "gemini-2.5-flash",
                stream=True,
            )

        if provider == "ollama":
            host = (
                model.endpoint
                if model and model.endpoint
                else os.getenv("OLLAMA_HOST")
            ) or "http://127.0.0.1:11434"
            return OllamaChatModel(
                credential=OllamaCredential(host=host),
                model=(model.name if model and model.name else os.getenv("OLLAMA_MODEL"))
                or "qwen3:8b",
                stream=True,
            )

        if provider in {"openai-compatible", "openai_compatible"}:
            api_key = model.api_key if model and model.api_key else os.getenv("OPENAI_COMPATIBLE_API_KEY")
            endpoint = model.endpoint if model and model.endpoint else os.getenv("OPENAI_COMPATIBLE_BASE_URL")
            if not api_key:
                raise RuntimeConfigError("缺少 OpenAI-compatible API Key。")
            if not endpoint:
                raise RuntimeConfigError("OpenAI-compatible 需要填写 Endpoint。")

            return OpenAIChatModel(
                credential=OpenAICredential(api_key=api_key, base_url=endpoint),
                model=(model.name if model and model.name else os.getenv("OPENAI_COMPATIBLE_MODEL"))
                or "",
                stream=True,
            )

        api_key = (
            model.api_key
            if model and model.api_key
            else os.getenv("OPENAI_API_KEY") or os.getenv("AGENTSCOPE_API_KEY")
        )
        if not api_key:
            raise RuntimeConfigError(
                "缺少 OpenAI API Key。请在模型设置中保存一条 OpenAI 配置，或配置 OPENAI_API_KEY。",
            )

        return OpenAIChatModel(
            credential=OpenAICredential(
                api_key=api_key,
                base_url=(
                    model.endpoint
                    if model and model.endpoint
                    else os.getenv("OPENAI_BASE_URL")
                )
                or "https://api.openai.com/v1",
            ),
            model=(
                (model.name if model and model.name else None)
                or os.getenv("AGENTSCOPE_MODEL")
            )
            or "gpt-4.1-mini",
            stream=True,
        )

    async def _map_agent_event(
        self,
        session: SessionRuntime,
        event: object,
    ) -> AsyncIterator[str]:
        if isinstance(event, ReplyStartEvent):
            yield self._event(
                session.id,
                "agent",
                {
                    "type": "agent",
                    "title": "Reply started",
                    "detail": f"{event.name} 开始执行 Agent Loop。",
                    "level": "info",
                },
            )
            return

        if isinstance(event, ModelCallStartEvent):
            yield self._event(
                session.id,
                "agent",
                {
                    "type": "agent",
                    "title": "Model streaming",
                    "detail": f"AgentScope 正在调用 {event.model_name}。",
                    "level": "info",
                },
            )
            return

        if isinstance(event, TextBlockDeltaEvent):
            session.assistant_buffers.setdefault(event.reply_id, []).append(event.delta)
            self._finish_reasoning(session, event.reply_id)
            parts = session.assistant_parts.setdefault(event.reply_id, [])
            if not parts or parts[-1]["type"] != "text":
                parts.append({"type": "text", "text": ""})
            parts[-1]["text"] += event.delta
            yield sse("token", {"type": "token", "text": event.delta})
            return

        if isinstance(event, ThinkingBlockDeltaEvent):
            parts = session.assistant_parts.setdefault(event.reply_id, [])
            if not parts or parts[-1].get("id") != event.block_id:
                parts.append({"type": "reasoning", "id": event.block_id, "text": "", "timing": {"startedAt": int(time.time() * 1000)}})
            parts[-1]["text"] += event.delta
            yield self._parts_event(session, event.reply_id)
            return

        if isinstance(event, ToolCallStartEvent):
            self._finish_reasoning(session, event.reply_id)
            self._tool_part(session, event.reply_id, event.tool_call_id, event.tool_call_name)
            yield self._parts_event(session, event.reply_id)
            yield self._event(
                session.id,
                "tool",
                {
                    "type": "tool",
                    "title": event.tool_call_name,
                    "detail": f"AgentScope 准备调用工具 {event.tool_call_id}。",
                    "level": "info",
                },
            )
            return

        if isinstance(event, ToolCallDeltaEvent):
            part = self._tool_part(session, event.reply_id, event.tool_call_id)
            part["argsText"] += event.delta
            try:
                args = json.loads(part["argsText"])
                part["args"] = args if isinstance(args, dict) else {"input": args}
            except (ValueError, TypeError):
                pass
            yield self._parts_event(session, event.reply_id)
            yield self._event(
                session.id,
                "tool",
                {
                    "type": "tool",
                    "title": "Tool arguments",
                    "detail": event.delta,
                    "level": "info",
                },
            )
            return

        if isinstance(event, ToolCallEndEvent):
            yield self._parts_event(session, event.reply_id)
            yield self._event(
                session.id,
                "tool",
                {
                    "type": "tool",
                    "title": "Tool call prepared",
                    "detail": f"工具调用 {event.tool_call_id} 参数已生成。",
                    "level": "info",
                },
            )
            return

        if isinstance(event, RequireUserConfirmEvent):
            session.pending_confirmations[event.id] = event
            for index, call in enumerate(event.tool_calls):
                part = self._tool_part(session, event.reply_id, call.id, call.name)
                part["argsText"] = call.input or "{}"
                try:
                    args = json.loads(part["argsText"])
                    part["args"] = args if isinstance(args, dict) else {"input": args}
                except (ValueError, TypeError):
                    pass
                if index == 0:
                    part["approval"] = {"id": event.id, "prompt": f"本次确认包含全部 {len(event.tool_calls)} 个工具调用。确认后全部执行。", "display": "decision"}
            self._store_reply(session, event.reply_id, fallback="Agent 请求调用工具，等待人工确认。")
            yield self._parts_event(session, event.reply_id)
            self._finish_bootstrap(session)
            tool_call = event.tool_calls[0] if event.tool_calls else None
            yield self._event(
                session.id,
                "approval_required",
                {
                    "type": "approval_required",
                    "title": "AgentScope permission checkpoint",
                    "detail": "AgentScope 暂停在工具权限确认点，等待人工批准后继续执行。",
                    "approval": {
                        "id": event.id,
                        "toolName": "、".join(call.name for call in event.tool_calls) or "unknown_tool",
                        "reason": f"本次确认包含 {len(event.tool_calls)} 个工具调用，批准后会执行下面列出的全部调用。",
                        "args": {f"{index + 1}. {call.name}": json.dumps(self._tool_call_args(call), ensure_ascii=False) for index, call in enumerate(event.tool_calls)},
                    },
                },
            )
            return

        if isinstance(event, RequireExternalExecutionEvent):
            yield self._event(
                session.id,
                "state",
                {
                    "type": "state",
                    "title": "External execution required",
                    "detail": "AgentScope 请求外部执行工具；当前版本先暂停，下一步再接外部执行通道。",
                    "level": "warning",
                },
            )
            return

        if isinstance(event, ToolResultStartEvent):
            part = self._tool_part(session, event.reply_id, event.tool_call_id, event.tool_call_name)
            part.pop("approval", None)
            part["isPreliminary"] = True
            yield self._parts_event(session, event.reply_id)
            yield self._event(
                session.id,
                "tool",
                {
                    "type": "tool",
                    "title": event.tool_call_name,
                    "detail": "工具开始执行。",
                    "level": "info",
                },
            )
            return

        if isinstance(event, ToolResultTextDeltaEvent):
            part = self._tool_part(session, event.reply_id, event.tool_call_id)
            part["result"] = (str(part.get("result", "")) + event.delta)[:24000]
            part["isPreliminary"] = True
            yield self._parts_event(session, event.reply_id)
            yield self._event(
                session.id,
                "tool",
                {
                    "type": "tool",
                    "title": "Tool result",
                    "detail": event.delta,
                    "level": "success",
                },
            )
            return

        if isinstance(event, ToolResultEndEvent):
            part = self._tool_part(session, event.reply_id, event.tool_call_id)
            state = self._event_value(event.state).lower()
            part.setdefault("result", {"success": "执行完成。", "denied": "已拒绝工具调用。", "interrupted": "工具执行已中断。"}.get(state, "工具执行失败。"))
            part["isPreliminary"] = False
            part["isError"] = self._event_value(event.state).lower() in {"error", "failed", "denied", "rejected", "interrupted"}
            part["timing"]["completedAt"] = int(time.time() * 1000)
            part.pop("approval", None)
            yield self._parts_event(session, event.reply_id)
            yield self._event(
                session.id,
                "tool",
                {
                    "type": "tool",
                    "title": "Tool finished",
                    "detail": f"工具执行结束：{self._event_value(event.state)}",
                    "level": "success",
                },
            )
            return

        if isinstance(event, ModelCallEndEvent):
            self._finish_reasoning(session, event.reply_id)
            if session.assistant_parts.get(event.reply_id):
                yield self._parts_event(session, event.reply_id)
            yield self._event(
                session.id,
                "agent",
                {
                    "type": "agent",
                    "title": "Model call finished",
                    "detail": f"输入 {event.input_tokens} tokens，输出 {event.output_tokens} tokens。",
                    "level": "success",
                },
            )
            return

        if isinstance(event, ReplyEndEvent):
            if session.pending_confirmations:
                return
            self._finish_reasoning(session, event.reply_id)
            yield self._parts_event(session, event.reply_id)
            self._store_reply(session, event.reply_id)
            session.assistant_buffers.pop(event.reply_id, None)
            session.assistant_parts.pop(event.reply_id, None)
            if self._event_value(event.finished_reason) == "completed":
                self._finish_bootstrap(session)
            yield self._event(
                session.id,
                "done",
                {
                    "type": "done",
                    "title": "AgentScope loop finished",
                    "detail": f"Agent Loop 结束：{self._event_value(event.finished_reason)}",
                    "level": "success" if self._event_value(event.finished_reason) == "completed" else "warning",
                },
            )
            return

    def _finish_reasoning(self, session: SessionRuntime, reply_id: str):
        for part in session.assistant_parts.get(reply_id, []):
            if part["type"] == "reasoning":
                part["timing"].setdefault("completedAt", int(time.time() * 1000))

    def _tool_part(self, session: SessionRuntime, reply_id: str, call_id: str, name: str = "") -> dict:
        parts = session.assistant_parts.setdefault(reply_id, [])
        part = next((item for item in parts if item.get("toolCallId") == call_id), None)
        if part is None:
            part = {"type": "tool-call", "toolCallId": call_id, "toolName": name or "工具调用", "argsText": "", "args": {}, "timing": {"startedAt": int(time.time() * 1000)}}
            parts.append(part)
        if name:
            part["toolName"] = name
        return part

    def _parts_event(self, session: SessionRuntime, reply_id: str) -> str:
        return sse("message_parts", {"type": "message_parts", "parts": session.assistant_parts.get(reply_id, [])})

    def _store_reply(self, session: SessionRuntime, reply_id: str, fallback: str = ""):
        self.store.add_message(session.id, "assistant", "".join(session.assistant_buffers.get(reply_id, [])) or fallback,
                               parts=session.assistant_parts.get(reply_id, []), message_id=f"assistant-{reply_id}")

    def _event_value(self, value: object) -> str:
        return str(getattr(value, "value", value))

    def _safe_error_message(self, error: Exception) -> str:
        detail = str(error).strip() or error.__class__.__name__
        detail = re.sub(r"sk-[A-Za-z0-9_-]{8,}", "sk-***", detail)
        detail = re.sub(
            r"(?i)(api[_ -]?key|authorization)(\s*[:=]\s*)[^\s,;]+",
            r"\1\2***",
            detail,
        )
        return f"模型调用失败：{error.__class__.__name__}: {detail[:300]}"

    def _tool_call_args(self, tool_call: ToolCallBlock | None) -> dict[str, str]:
        if tool_call is None:
            return {}

        args: dict[str, str] = {
            "tool_call_id": tool_call.id,
            "source": "AgentScope RequireUserConfirmEvent",
        }

        if tool_call.input:
            args["input"] = tool_call.input

        return args
