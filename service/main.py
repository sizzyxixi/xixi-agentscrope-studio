import asyncio
import json
import os
import logging
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
SERVERLESS = os.getenv("AGENTSCOPE_SERVERLESS") == "1"
if SERVERLESS:
    os.environ.setdefault("AGENTSCOPE_STATE_DB", "/tmp/agentscope/state.sqlite3")
    if not os.getenv("DATABASE_URL"):
        raise RuntimeError("DATABASE_URL is required for a durable serverless deployment.")
    for key in ("AGENTSCOPE_FILE_KEY", "AGENTSCOPE_KNOWLEDGE_KEY", "AGENTSCOPE_CHANNEL_KEY"):
        if not os.getenv(key):
            raise RuntimeError(f"{key} is required for a serverless deployment.")
import uuid
from contextlib import aclosing, asynccontextmanager, suppress

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, StrictBool, Field

from .runtime import AgentScopeRuntime, ApprovalDecision, ModelSettings
from .capabilities import ConsoleCapabilities
from .channels import ChannelService
from .streaming import interruptible_sse


class ModelPayload(BaseModel):
    id: str | None = None
    provider: str | None = None
    name: str | None = None
    endpoint: str | None = None
    api_key: str | None = None


class ApprovalPayload(BaseModel):
    id: str
    approved: bool


class StreamStopRequest(BaseModel):
    request_id: str | None = Field(default=None, min_length=1, max_length=200)


class StreamRequest(BaseModel):
    request_id: str | None = Field(default=None, min_length=1, max_length=200)
    session_id: str
    message: str = ""
    auth_token: str | None = None
    model_id: str | None = None
    model: ModelPayload | None = None
    file_ids: list[str] | None = None
    file_ref_ids: list[str] | None = None
    skill_ids: list[str] | None = None
    mcp_ids: list[str] | None = None
    agent_id: str | None = None
    approval: ApprovalPayload | None = None


class AuthRequest(BaseModel):
    username: str
    password: str


class ModelSettingRequest(BaseModel):
    id: str | None = None
    provider: str
    displayName: str = ""
    modelName: str
    endpoint: str = ""
    apiKey: str = ""
    makeDefault: bool = False


class DefaultModelRequest(BaseModel):
    id: str


class ModelSettingIdRequest(BaseModel):
    id: str


stream_stops: dict[tuple[str, str, str], asyncio.Event] = {}

runtime = AgentScopeRuntime()
capabilities = ConsoleCapabilities(runtime.store, install_defaults=True)
capabilities.runtime = runtime
runtime.capabilities = capabilities


def channel_service():
    service = getattr(runtime, "channels", None)
    if service is None:
        service = ChannelService(runtime, capabilities)
        runtime.channels = service
    return service


@asynccontextmanager
async def lifespan(app):
    if SERVERLESS:
        yield
        return
    runtime.knowledge.migrate_legacy()
    knowledge_worker = asyncio.create_task(runtime.knowledge.worker())
    scheduler = asyncio.create_task(capabilities.scheduler())
    file_maintenance = asyncio.create_task(runtime.files.maintenance())
    channels = channel_service()
    await channels.startup()
    try:
        yield
    finally:
        knowledge_worker.cancel()
        with suppress(asyncio.CancelledError):
            await knowledge_worker
        await runtime.knowledge.close()
        file_maintenance.cancel()
        with suppress(asyncio.CancelledError):
            await file_maintenance
        scheduler.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler
        await channels.close()
        if getattr(runtime, "channels", None) is channels:
            del runtime.channels
        await capabilities.close()


app = FastAPI(title="AgentScope Studio Service", lifespan=lifespan)

from .file_maintenance import maintenance_router
app.include_router(maintenance_router(runtime.files))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {**runtime.health(), "deployment": "demo" if SERVERLESS else "persistent", "database": runtime.store.backend}


def token_from_authorization(authorization: str | None) -> str | None:
    if not authorization:
        return None
    prefix = "Bearer "
    if authorization.startswith(prefix):
        return authorization[len(prefix) :].strip()
    return authorization.strip() or None


def require_user(authorization: str | None):
    user = runtime.store.get_user_by_token(token_from_authorization(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="请先登录。")
    return user


def user_payload(user):
    return {"id": user.id, "username": user.username}


@app.post("/auth/register")
async def register(body: AuthRequest):
    try:
        user, token = runtime.store.create_user(body.username, body.password)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"user": user_payload(user), "token": token}


@app.post("/auth/login")
async def login(body: AuthRequest):
    try:
        user, token = runtime.store.login_user(body.username, body.password)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"user": user_payload(user), "token": token}


@app.get("/auth/me")
async def me(authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    return {"user": user_payload(user)}


@app.get("/sessions")
async def list_sessions(authorization: str | None = Header(default=None), limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0), summary: bool = False, group: str | None = Query(default=None, pattern="^(recent|automation)$"), search: str = Query(default="", max_length=200)):
    user = require_user(authorization)
    sessions = runtime.list_sessions(user, limit=limit + 1, offset=offset, summary=summary, **({"group": group, "search": search} if group or search else {}))
    return {"sessions": sessions[:limit], "has_more": len(sessions) > limit, "next_offset": offset + min(limit, len(sessions))}


@app.get("/sessions/{session_id}/messages")
async def list_session_messages(session_id: str, authorization: str | None = Header(default=None)):
    assert_session_owner(require_user(authorization).id, session_id)
    return {"messages": runtime.list_messages(session_id)}


@app.get("/model-settings")
async def list_model_settings(authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    return {"models": runtime.store.list_model_settings(user.id)}


@app.post("/model-settings")
async def create_model_setting(
    body: ModelSettingRequest,
    authorization: str | None = Header(default=None),
):
    user = require_user(authorization)
    try:
        runtime.store.create_model_setting(
            user_id=user.id,
            provider=body.provider,
            display_name=body.displayName,
            model_name=body.modelName,
            endpoint=body.endpoint,
            api_key=body.apiKey,
            make_default=body.makeDefault,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"models": runtime.store.list_model_settings(user.id)}


@app.put("/model-settings")
async def update_model_setting(
    body: ModelSettingRequest,
    authorization: str | None = Header(default=None),
):
    user = require_user(authorization)
    if not body.id:
        raise HTTPException(status_code=400, detail="缺少模型配置 ID。")
    try:
        runtime.store.update_model_setting(
            user_id=user.id,
            setting_id=body.id,
            provider=body.provider,
            display_name=body.displayName,
            model_name=body.modelName,
            endpoint=body.endpoint,
            api_key=body.apiKey,
            make_default=body.makeDefault,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    for session in runtime.store.list_sessions(user.id, limit=10000):
        runtime.sessions.pop(str(session["id"]), None)
    return {"models": runtime.store.list_model_settings(user.id)}


@app.delete("/model-settings")
async def delete_model_setting(
    body: ModelSettingIdRequest,
    authorization: str | None = Header(default=None),
):
    user = require_user(authorization)
    try:
        runtime.store.delete_model_setting(user.id, body.id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    for session in runtime.store.list_sessions(user.id, limit=10000):
        runtime.sessions.pop(str(session["id"]), None)
    return {"models": runtime.store.list_model_settings(user.id)}


@app.post("/model-settings/test")
async def test_model_setting(
    body: ModelSettingIdRequest,
    authorization: str | None = Header(default=None),
):
    user = require_user(authorization)
    try:
        return await runtime.test_model_setting(user, body.id)
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/model-settings/default")
async def set_default_model_setting(
    body: DefaultModelRequest,
    authorization: str | None = Header(default=None),
):
    user = require_user(authorization)
    try:
        runtime.store.set_default_model_setting(user.id, body.id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"models": runtime.store.list_model_settings(user.id)}


@app.post("/sessions/{session_id}/stream")
async def stream_session(
    session_id: str,
    body: StreamRequest,
    authorization: str | None = Header(default=None),
):
    request_started = time.monotonic()
    user = require_user(body.auth_token or authorization)
    assert_session_owner(user.id, session_id, allow_new=True)
    if body.agent_id is not None:
        live = runtime.sessions.get(session_id)
        if body.approval or (live and live.pending_confirmations):
            raise HTTPException(status_code=400, detail="工具确认完成前不能切换智能体。")
        try:
            capabilities.validate_chat_agent(user.id, session_id, body.agent_id)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
    if body.skill_ids is not None or body.mcp_ids is not None:
        live = runtime.sessions.get(session_id)
        if body.approval or (live and live.pending_confirmations):
            raise HTTPException(status_code=400, detail="工具确认完成前不能修改本轮能力。")
    if not body.approval and not session_id.startswith(("run-", "channel-")):
        try:
            # Validate both selections before any persistent changes.
            for ids, key in ((body.skill_ids or [], "skill_ids"), (body.mcp_ids or [], "mcp_ids")):
                capabilities.validate_turn_resources(user.id, session_id, ids, key, body.agent_id)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
    if body.file_ids or body.file_ref_ids:
        if body.approval: raise HTTPException(400, "确认工具时不能添加附件。")
        if len(body.file_ids or []) > 20: raise HTTPException(400, "单条消息最多 20 个附件。")
        try: runtime.files.validate_references(user.id, session_id, (body.file_ids or []) + (body.file_ref_ids or []))
        except ValueError as error: raise HTTPException(400, str(error)) from error
    model = (
        ModelSettings(
            id=body.model_id or (body.model.id if body.model else None),
            provider=body.model.provider if body.model else None,
            name=body.model.name if body.model else None,
            endpoint=body.model.endpoint if body.model else None,
            api_key=body.model.api_key if body.model else None,
        )
        if body.model or body.model_id
        else None
    )
    approval = (
        ApprovalDecision(id=body.approval.id, approved=body.approval.approved)
        if body.approval
        else None
    )

    async def stream_with_resume():
        completed, failed_detail = False, ""
        approval_events = []
        measured_stages = set()
        try:
            async with aclosing(runtime.stream(
                session_id=session_id,
                message=body.message,
                model=model,
                approval=approval,
                user=user,
                **({"file_ids": body.file_ids} if body.file_ids is not None else {}),
                **({"file_ref_ids": body.file_ref_ids} if body.file_ref_ids is not None else {}),
                **({"skill_ids": body.skill_ids} if body.skill_ids is not None else {}),
                **({"mcp_ids": body.mcp_ids} if body.mcp_ids is not None else {}),
                **({"agent_id": body.agent_id} if body.agent_id is not None else {}),
            )) as events:
                async for frame in events:

                    data = next((line[6:] for line in frame.splitlines() if line.startswith("data: ")), "{}")
                    event = json.loads(data)
                    stage = "model_start" if event.get("title") == "Model streaming" else "first_token" if event.get("type") == "token" else "first_reasoning" if event.get("type") == "message_parts" else "done" if event.get("type") == "done" else None
                    if stage and stage not in measured_stages:
                        measured_stages.add(stage)
                        logging.getLogger("uvicorn.error").info("chat_stream request=%s stage=%s elapsed_ms=%d", body.request_id or "legacy", stage, (time.monotonic() - request_started) * 1000)
                    if approval:
                        approval_events.append(event)
                    if event.get("type") == "done":
                        completed = True
                        if event.get("level") == "warning":
                            failed_detail = event.get("detail", "执行失败")
                    yield frame
        finally:
            if approval:
                capabilities.after_approval(user, session_id, approval.approved, completed, failed_detail)
                await channel_service().after_approval(user.id, session_id, approval.approved, approval_events)

    request_id = body.request_id or uuid.uuid4().hex
    key = (user.id, session_id, request_id)
    stop = asyncio.Event()

    async def stopped():
        return await asyncio.to_thread(runtime.store.stream_stop_requested, session_id, request_id)

    async def deliver():
        stream_stops[key] = stop
        logging.getLogger("uvicorn.error").info("chat_stream request=%s stage=prepared elapsed_ms=%d", request_id, (time.monotonic() - request_started) * 1000)
        try:
            async with aclosing(interruptible_sse(stream_with_resume(), stop, stopped if body.request_id else None)) as frames:
                async for frame in frames:
                    yield frame
            if stop.is_set():
                yield 'event: done\ndata: ' + json.dumps({"type": "done", "title": "Response stopped", "detail": "用户已停止本轮响应。", "run_status": "cancelled"}) + '\n\n'
        finally:
            logging.getLogger("uvicorn.error").info("chat_stream request=%s stage=%s elapsed_ms=%d", request_id, "stopped" if stop.is_set() else "closed", (time.monotonic() - request_started) * 1000)
            if stream_stops.get(key) is stop:
                stream_stops.pop(key, None)

    return StreamingResponse(
        deliver(), media_type="text/event-stream",
        headers={"Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no"},
    )


def assert_session_owner(user_id: str, session_id: str, allow_new: bool = False):
    with runtime.store._lock:
        row = runtime.store._conn.execute("SELECT user_id FROM sessions WHERE id=?", (session_id,)).fetchone()
    if (not row and not allow_new) or (row and row["user_id"] != user_id):
        raise HTTPException(status_code=404, detail="会话不存在或无权访问。")


class ResourceRequest(BaseModel):
    kind: str
    name: str
    content: str = ""
    enabled: bool = True
    config: dict = {}
    revision: int | None = None
    request_id: str | None = None


@app.get("/console/schedule-templates")
async def console_schedule_templates(authorization: str | None = Header(default=None)):
    require_user(authorization)
    from .schedule_templates import published
    return {"templates": published(runtime.store)}


@app.post("/console/schedule-templates/{template_id}/prepare")
async def prepare_schedule_template(template_id: str, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    from .schedule_templates import prepare
    try:
        return {"template": prepare(capabilities, user.id, template_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/console/related-schedules/{kind}/{resource_id}")
async def console_related_schedules(kind: str, resource_id: str, authorization: str | None = Header(default=None)):
    try:
        return {"resources": capabilities.related_schedules(require_user(authorization).id, kind, resource_id)}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/console/schedule-options")
async def schedule_options(authorization: str | None = Header(default=None)):
    return capabilities.schedule_options(require_user(authorization).id)


@app.get("/console/schedule-page")
async def schedule_page(status: str = Query(default='active', pattern='^(active|paused|ended)$'), page: int = Query(default=1, ge=1), page_size: int = Query(default=20, ge=1, le=100), search: str = Query(default='', max_length=5000), authorization: str | None = Header(default=None)):
    return capabilities.schedule_page(require_user(authorization).id, status, page, page_size, search)


@app.get("/console/agents")
async def console_agents(authorization: str | None = Header(default=None)):
    return {"agents": capabilities.agents(require_user(authorization).id)}


@app.get("/console/chat-resource-options")
async def chat_resource_options(agent_id: str = "main", session_id: str | None = None, authorization: str | None = Header(default=None)):
    try:
        return capabilities.chat_resource_options(require_user(authorization).id, agent_id, session_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/console/agents/{agent_id}/chat")
async def create_agent_chat(agent_id: str, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    session_id = f"task-{uuid.uuid4().hex}"
    try:
        capabilities.validate_chat_agent(user.id, session_id, agent_id)
        capabilities.set_chat_agent(user.id, session_id, agent_id)
        return {"session_id": session_id}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/console/resources")
async def console_resources(kind: str | None = Query(default=None), authorization: str | None = Header(default=None)):
    return {"resources": capabilities.list(require_user(authorization).id, kind)}


@app.get("/console/skill-market")
async def skill_market(authorization: str | None = Header(default=None)):
    return {"skills": capabilities.market(require_user(authorization).id)}


@app.post("/console/skill-market/{slug}/install")
async def install_market_skill(slug: str, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    try:
        return {"resource": capabilities.install_market_skill(user.id, slug)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/console/skills/{resource_id}/files")
async def skill_files(resource_id: str, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    try:
        return {"files": capabilities.skill_files(user.id, resource_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/console/skills/{resource_id}/read")
async def read_skill(resource_id: str, path: str = "SKILL.md", offset: int = Query(default=0, ge=0), limit: int = Query(default=12000, ge=1, le=24000), authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    try:
        return capabilities.read_skill(user.id, resource_id, path, offset, limit)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/console/resources")
async def create_resource(body: ResourceRequest, authorization: str | None = Header(default=None)):
    try:
        return {"resource": capabilities.save(require_user(authorization).id, body.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.put("/console/resources/{resource_id}")
async def update_resource(resource_id: str, body: ResourceRequest, authorization: str | None = Header(default=None)):
    try:
        return {"resource": capabilities.save(require_user(authorization).id, body.model_dump(), resource_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/console/resources/{resource_id}")
async def delete_resource(resource_id: str, authorization: str | None = Header(default=None)):
    try:
        capabilities.delete(require_user(authorization).id, resource_id)
        return {"ok": True}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


class ScheduleStateRequest(BaseModel):
    enabled: StrictBool
    revision: int


@app.post('/console/resources/{resource_id}/schedule-state')
async def schedule_state(resource_id: str, body: ScheduleStateRequest, authorization: str | None = Header(default=None)):
    try:
        return {'resource': capabilities.set_schedule_enabled(require_user(authorization).id, resource_id, body.enabled, body.revision)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/console/resources/{resource_id}/test")
async def test_resource(resource_id: str, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    try:
        return await capabilities.test_mcp(user.id, resource_id)
    except Exception:
        raise HTTPException(status_code=400, detail="MCP 连接失败，请检查服务地址、网络和 Streamable HTTP 协议。") from None


@app.post("/console/resources/{resource_id}/run")
async def run_resource(resource_id: str, authorization: str | None = Header(default=None)):
    from .capabilities import RunRateLimitError
    try:
        run = capabilities.start_run(require_user(authorization), resource_id)
        if SERVERLESS:
            task = capabilities.run_tasks.get(run["id"])
            if task:
                await task
        return {"run": run}
    except RunRateLimitError as error:
        raise HTTPException(status_code=429, detail=str(error), headers={"Retry-After": str(error.retry_after)}) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/console/runs")
async def console_runs(authorization: str | None = Header(default=None), kind: str | None = Query(default=None, pattern='^(schedule|workflow)$')):
    return {"runs": capabilities.runs(require_user(authorization).id, kind)}


@app.get("/console/status")
async def console_status(authorization: str | None = Header(default=None)):
    import importlib.metadata
    user = require_user(authorization)
    resources = capabilities.list(user.id)
    with runtime.store._lock:
        session_count = runtime.store._conn.execute("SELECT COUNT(*) FROM sessions WHERE user_id=?", (user.id,)).fetchone()[0]
        message_count = runtime.store._conn.execute("SELECT COUNT(*) FROM messages JOIN sessions ON sessions.id=messages.session_id WHERE sessions.user_id=?", (user.id,)).fetchone()[0]
    return {"status": "ok", "version": importlib.metadata.version("agentscope"),
        "resources": {kind: sum(item["kind"] == kind for item in resources) for kind in sorted({item["kind"] for item in resources})},
        "sessions": session_count, "messages": message_count,
        "scheduler": "演示版已暂停自动调度，可手动执行" if SERVERLESS else "服务在线时每 5 秒检查到期任务", "runs": capabilities.runs(user.id),
        "token_activity": runtime.store.token_usage.activity(user.id)}


@app.get("/console/project-docs")
async def console_project_docs(authorization: str | None = Header(default=None)):
    require_user(authorization)
    with runtime.store._lock:
        rows = runtime.store._conn.execute("SELECT path, title, content, updated_at FROM knowledge_docs ORDER BY path").fetchall()
    return {"documents": [dict(row) for row in rows]}


class SessionEditRequest(BaseModel):
    title: str | None = None
    pinned: StrictBool | None = None
    create_if_missing: bool = False


class SessionAgentRequest(BaseModel):
    agent_id: str


@app.get('/console/sessions/{session_id}')
async def get_console_session(session_id: str, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    try:
        assert_session_owner(user.id, session_id)
    except HTTPException as error:
        raise HTTPException(status_code=404, detail='会话不可用。') from error
    sessions = runtime.list_sessions(user, session_id=session_id)
    if not sessions:
        raise HTTPException(status_code=404, detail='会话不可用。')
    return {'session': sessions[0]}


@app.put("/console/sessions/{session_id}/agent")
async def select_session_agent(session_id: str, body: SessionAgentRequest, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    assert_session_owner(user.id, session_id, allow_new=True)
    live = runtime.sessions.get(session_id)
    if runtime.session_locks.get(session_id, asyncio.Lock()).locked() or (live and live.pending_confirmations):
        raise HTTPException(status_code=409, detail="当前会话运行中，请完成或停止后再切换智能体。")
    try:
        capabilities.set_chat_agent(user.id, session_id, body.agent_id)
        return {"ok": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/console/sessions/{session_id}/stop")
async def stop_session(session_id: str, body: StreamStopRequest | None = None, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    assert_session_owner(user.id, session_id, allow_new=bool(body and body.request_id))
    if not session_id.startswith(("run-", "channel-")):
        request_id = body.request_id if body else None
        for (owner, identity, running_request), stop in list(stream_stops.items()):
            if owner == user.id and identity == session_id and (not request_id or request_id == running_request):
                stop.set()
        if request_id:
            # Allow stopping during initial setup, before the first model event exists.
            await asyncio.to_thread(runtime.store.ensure_session, session_id, user.id)
            await asyncio.to_thread(runtime.store.request_stream_stop, session_id, request_id)
        return {"ok": True, "stop_requested": True}
    live = runtime.sessions.get(session_id)
    try:
        if channel_service().owns_session(user.id, session_id):
            await channel_service().stop_session(user.id, session_id)
        else:
            await capabilities.stop_session_run(user.id, session_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if live and live.token_turn_id:
        runtime.store.token_usage.phase(live.token_turn_id, "interrupted")
    runtime.sessions.pop(session_id, None)
    return {"ok": True}


@app.put("/console/sessions/{session_id}")
async def rename_session(session_id: str, body: SessionEditRequest, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    if not session_id or len(session_id) > 200:
        raise HTTPException(status_code=400, detail="会话标识无效。")
    if body.title is None and body.pinned is None:
        raise HTTPException(status_code=400, detail="请指定会话标题或置顶状态。")
    if body.title is not None and (not body.title.strip() or len(body.title.strip()) > 100):
        raise HTTPException(status_code=400, detail="标题需为 1–100 个字符。")
    with runtime.store._lock:
        exists = runtime.store._conn.execute("SELECT 1 FROM sessions WHERE id=?", (session_id,)).fetchone()
        allow_new = body.create_if_missing and not session_id.startswith(("run-", "channel-"))
        assert_session_owner(user.id, session_id, allow_new=allow_new)
        if not exists:
            runtime.store.ensure_session(session_id, user.id)
        if body.title is not None:
            runtime.store._conn.execute("UPDATE sessions SET title=? WHERE id=?", (body.title.strip(), session_id))
        if body.pinned is not None:
            runtime.store._conn.execute("UPDATE sessions SET pinned=? WHERE id=?", (int(body.pinned), session_id))
        runtime.store._conn.commit()
    return {"ok": True}


@app.delete("/console/sessions/{session_id}")
async def delete_session(session_id: str, authorization: str | None = Header(default=None)):
    assert_session_owner(require_user(authorization).id, session_id)
    session = runtime.sessions.get(session_id)
    if runtime.session_locks.get(session_id, asyncio.Lock()).locked():
        raise HTTPException(status_code=409, detail="会话正在运行，请先停止。")
    if session and session.pending_confirmations:
        raise HTTPException(status_code=409, detail="请先结束当前运行或确认工具调用。")
    with runtime.store._lock:
        if runtime.store._conn.execute("SELECT 1 FROM console_runs WHERE session_id=? AND status IN ('running','waiting_approval')", (session_id,)).fetchone():
            raise HTTPException(status_code=409, detail="定时任务或工作流正在运行。")
        has_channels = runtime.store._conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='channel_messages'").fetchone()
        if has_channels and runtime.store._conn.execute("SELECT 1 FROM channel_messages WHERE session_id=? AND status IN ('queued','running','waiting_approval')", (session_id,)).fetchone():
            raise HTTPException(status_code=409, detail="渠道会话还有任务未完成，请先停止。")
        if has_channels:
            runtime.store._conn.execute("UPDATE channel_sessions SET active=0 WHERE session_id=?", (session_id,))
        runtime.store._conn.execute("DELETE FROM token_calls WHERE turn_id IN (SELECT id FROM token_turns WHERE session_id=?)", (session_id,))
        runtime.store._conn.execute("DELETE FROM token_messages WHERE session_id=?", (session_id,))
        runtime.store._conn.execute("DELETE FROM token_turns WHERE session_id=?", (session_id,))
        for table in ("messages", "plans", "runtime_events", "execution_scopes", "sessions"):
            column = "id" if table == "sessions" else "session_id"
            runtime.store._conn.execute(f"DELETE FROM {table} WHERE {column}=?", (session_id,))
        runtime.store._conn.commit()
    runtime.sessions.pop(session_id, None)
    return {"ok": True}


@app.get("/console/channels")
async def list_channels(authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    return {"bindings": channel_service().list(user.id), "supported": ["dingtalk", "feishu"]}


@app.put("/console/channels/{platform}")
async def save_channel(platform: str, body: dict, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    try:
        return {"binding": await channel_service().save(user.id, platform, body)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/console/channels/{binding_id}/access")
async def add_channel_access(binding_id: str, body: dict, authorization: str | None = Header(default=None)):
    try:
        return {"access": channel_service().add_access(require_user(authorization).id, binding_id, body)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error



@app.post("/console/channels/{binding_id}/{action}")
async def channel_action(binding_id: str, action: str, body: dict | None = None, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    if SERVERLESS and action in {"enable", "restart"}:
        raise HTTPException(status_code=400, detail="演示版暂不支持钉钉／飞书长连接，配置可以保存。")
    channels = channel_service()
    try:
        channels.get(user.id, binding_id)
        if action == "validate":
            return await channels.validate(user.id, binding_id)
        if action == "enable":
            return {"binding": await channels.enable(user.id, binding_id)}
        if action == "disable":
            return {"binding": await channels.disable(user.id, binding_id)}
        if action == "reconnect":
            await channels.disable(user.id, binding_id)
            return {"binding": await channels.enable(user.id, binding_id)}
        if action == "test-send":
            payload = body or {}
            if payload.get("confirm") is not True:
                raise ValueError("请先核对测试消息内容与接收目标。")
            return await channels.test_send(user.id, binding_id, payload.get("target", ""), payload.get("group") is True)
        raise ValueError("不支持的渠道操作。")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/console/channels/{binding_id}/diagnostics")
async def channel_diagnostics(binding_id: str, authorization: str | None = Header(default=None)):
    try:
        return channel_service().diagnostics(require_user(authorization).id, binding_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/console/channels/{binding_id}/access")
async def channel_access(binding_id: str, authorization: str | None = Header(default=None)):
    try:
        return {"access": channel_service().access(require_user(authorization).id, binding_id)}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.put("/console/channels/{binding_id}/access/{access_id}")
async def update_channel_access(binding_id: str, access_id: str, body: dict, authorization: str | None = Header(default=None)):
    try:
        return {"access": channel_service().update_access(require_user(authorization).id, binding_id, access_id, body.get("status"))}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


from .file_routes import file_router
app.include_router(file_router(runtime, require_user))


# Knowledge management never accepts an owner/scope supplied by the client.
class KnowledgeBaseRequest(BaseModel):
    name: str
    description: str = ""
    enabled: StrictBool = True
    embedding: dict = Field(default_factory=dict)


class KnowledgeDocumentRequest(BaseModel):
    name: str = Field(default="资料.md", max_length=200)
    content: str = Field(default="", max_length=10 * 1024 * 1024)
    base64: str | None = Field(default=None, max_length=14 * 1024 * 1024)


class KnowledgeSearchRequest(BaseModel):
    query: str


def owned_knowledge_call(user, operation, *args):
    from .knowledge import KnowledgeError
    try:
        return operation(user.id, *args)
    except KnowledgeError as error:
        raise HTTPException(status_code=400, detail=str(error)) from None


@app.get("/console/knowledge-bases")
async def knowledge_bases(authorization: str | None = Header(default=None)):
    return runtime.knowledge.listing(require_user(authorization).id)


@app.post("/console/knowledge-bases")
async def create_knowledge_base(body: KnowledgeBaseRequest, authorization: str | None = Header(default=None)):
    return {"knowledge_base": owned_knowledge_call(require_user(authorization), runtime.knowledge.save, body.model_dump())}


@app.put("/console/knowledge-bases/{kb_id}")
async def update_knowledge_base(kb_id: str, body: KnowledgeBaseRequest, authorization: str | None = Header(default=None)):
    return {"knowledge_base": owned_knowledge_call(require_user(authorization), runtime.knowledge.save, body.model_dump(), kb_id)}


@app.delete("/console/knowledge-bases/{kb_id}")
async def delete_knowledge_base(kb_id: str, authorization: str | None = Header(default=None)):
    owned_knowledge_call(require_user(authorization), runtime.knowledge.delete, kb_id)
    return {"ok": True}


@app.get("/console/knowledge-bases/{kb_id}/documents")
async def knowledge_documents(kb_id: str, authorization: str | None = Header(default=None)):
    return {"documents": owned_knowledge_call(require_user(authorization), runtime.knowledge.documents, kb_id)}


@app.post("/console/knowledge-bases/{kb_id}/documents")
async def add_knowledge_document(kb_id: str, body: KnowledgeDocumentRequest, authorization: str | None = Header(default=None)):
    return owned_knowledge_call(require_user(authorization), runtime.knowledge.put_document, kb_id, body.model_dump())


@app.get("/console/knowledge-bases/{kb_id}/documents/{doc_id}")
async def read_knowledge_document(kb_id: str, doc_id: str, authorization: str | None = Header(default=None)):
    return owned_knowledge_call(require_user(authorization), runtime.knowledge.read_document, kb_id, doc_id)


@app.put("/console/knowledge-bases/{kb_id}/documents/{doc_id}")
async def update_knowledge_document(kb_id: str, doc_id: str, body: KnowledgeDocumentRequest, authorization: str | None = Header(default=None)):
    return owned_knowledge_call(require_user(authorization), runtime.knowledge.put_document, kb_id, body.model_dump(), doc_id)


@app.delete("/console/knowledge-bases/{kb_id}/documents/{doc_id}")
async def delete_knowledge_document(kb_id: str, doc_id: str, authorization: str | None = Header(default=None)):
    owned_knowledge_call(require_user(authorization), runtime.knowledge.delete_document, kb_id, doc_id)
    return {"ok": True}


@app.post("/console/knowledge-bases/{kb_id}/reindex")
async def reindex_knowledge_base(kb_id: str, authorization: str | None = Header(default=None)):
    owned_knowledge_call(require_user(authorization), runtime.knowledge.retry, kb_id)
    return {"ok": True}


@app.post("/console/knowledge-bases/{kb_id}/search")
async def test_knowledge_search(kb_id: str, body: KnowledgeSearchRequest, authorization: str | None = Header(default=None)):
    from .knowledge import KnowledgeError
    user = require_user(authorization)
    try:
        return await runtime.knowledge.search(user.id, body.query, kb_id=kb_id, include_official=False)
    except KnowledgeError as error:
        raise HTTPException(status_code=400, detail=str(error)) from None
