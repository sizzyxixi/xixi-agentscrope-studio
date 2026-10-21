import asyncio
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from service.capabilities import ConsoleCapabilities
from service.runtime import (
    AgentScopeRuntime, MAIN_AGENT_NAME, MAIN_PERSONA_DIR, MAIN_PERSONA_FILES,
    ModelSettings, RuntimeConfigError, load_main_persona, sse,
)
from service.store import StudioStore


class StoreFixture:
    def create_store(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "README.md").write_text("# Test project\n项目资料", encoding="utf-8")
        self.store = StudioStore(self.root / "state.sqlite3", self.root)
        self.cap = ConsoleCapabilities(self.store)
        self.user, self.token = self.store.create_user("tester", "testing123")
        self.other, self.other_token = self.store.create_user("otheruser", "testing456")

    def clean_store(self):
        self.store._conn.close()
        self.temp.cleanup()

    def resource(self, kind="skill", **values):
        return self.cap.save(self.user.id, {"kind": kind, "name": "Test resource", "content": "计划与资料", "enabled": True, "config": {}, **values})


class ResourceTests(StoreFixture, unittest.TestCase):
    def setUp(self): self.create_store()
    def tearDown(self): self.clean_store()

    def test_crud_persists_and_never_lists_other_users(self):
        item = self.resource()
        self.assertEqual(self.cap.list(self.other.id), [])
        self.cap.save(self.user.id, {**item, "name": "Updated"}, item["id"])
        reopened = StudioStore(self.store.db_path, self.root)
        try:
            self.assertEqual(ConsoleCapabilities(reopened).get(self.user.id, item["id"])["name"], "Updated")
        finally:
            reopened._conn.close()
        self.cap.delete(self.user.id, item["id"])
        self.assertEqual(self.cap.list(self.user.id), [])

    def test_cross_user_get_update_delete_are_rejected(self):
        item = self.resource()
        for action in (lambda: self.cap.get(self.other.id, item["id"]),
                       lambda: self.cap.save(self.other.id, item, item["id"]),
                       lambda: self.cap.delete(self.other.id, item["id"])):
            with self.assertRaises(ValueError): action()
        self.assertEqual(self.cap.get(self.user.id, item["id"])["name"], item["name"])

    def test_validation_limits_and_immutable_kind(self):
        item = self.resource()
        for values in ({"name": ""}, {"kind": "shell"}, {"content": "a" * 512_001}, {"kind": "skill", "content": "a" * 24_001}):
            with self.assertRaises(ValueError): self.resource(**values)
        with self.assertRaises(ValueError): self.cap.save(self.user.id, {**item, "kind": "memory"}, item["id"])

    def test_context_only_contains_enabled_owned_resources_and_relevant_knowledge(self):
        self.resource("skill", content="用中文回复")
        self.resource("memory", content="偏好简洁")
        self.resource("memory", content="停用记忆", enabled=False)
        self.resource("knowledge", content="销售预算 8000 美元")
        self.resource("knowledge", content="无关数学资料")
        self.cap.save(self.other.id, {"kind": "memory", "name": "private", "content": "其他用户秘密"})
        context = self.cap.context(self.user.id, "销售预算")
        for included in ("用中文回复", "偏好简洁", "销售预算"): self.assertIn(included, context)
        for excluded in ("停用记忆", "其他用户秘密", "无关数学资料"): self.assertNotIn(excluded, context)

    def test_mcp_uses_real_sdk_http_client_only_when_enabled(self):
        item = self.resource("mcp", enabled=False, config={"url": "http://127.0.0.1:8888/mcp", "command": "should-not-run"})
        self.assertEqual(self.cap.mcp_clients(self.user.id), [])
        self.cap.save(self.user.id, {**item, "enabled": True}, item["id"])
        clients = self.cap.mcp_clients(self.user.id)
        self.assertEqual(len(clients), 1)
        self.assertFalse(clients[0].is_stateful)
        self.assertEqual(clients[0].mcp_config.url, "http://127.0.0.1:8888/mcp")
        self.assertNotIn("command", item["config"])
        for url in ("file:///etc/passwd", "http://user:secret@localhost/mcp", "https://"):
            with self.assertRaises(ValueError): self.resource("mcp", config={"url": url})

    def test_workflow_steps_and_schedule_timezone_validation(self):
        item = self.resource("workflow", content="one\n---\ntwo")
        self.assertEqual(item["config"]["steps"], 2)
        with self.assertRaises(ValueError): self.resource("workflow", content="\n---\n".join(["step"] * 11))
        with self.assertRaises(ValueError): self.resource("schedule", config={"next_run": "2026-10-01T10:00"})
        with self.assertRaises(ValueError): self.resource("schedule", config={"frequency": "once", "next_run": "2000-01-01T10:00Z"})
        with self.assertRaises(ValueError): self.resource("schedule", config={"next_run": "2099-01-01T10:00Z", "model_id": "other-account-model"})

    def test_schedule_selection_limits_and_ownership(self):
        skills = [self.resource("skill", name=f"skill {i}") for i in range(4)]
        base = {"frequency": "weekly", "next_run": "2099-01-01T10:00Z", "weekdays": [0, 4]}
        with self.assertRaises(ValueError):
            self.resource("schedule", config={**base, "skill_ids": [item["id"] for item in skills]})
        with self.assertRaises(ValueError):
            self.cap.save(self.other.id, {"kind": "schedule", "name": "other", "content": "run", "config": {**base, "skill_ids": [skills[0]["id"]]}})
        with self.assertRaises(ValueError):
            self.resource("schedule", config={**base, "shop_ids": ["mock-shop"]})
        agent = self.resource("agent", content="专业运营助手", config={"skill_ids": [skills[0]["id"]]})
        task = self.resource("schedule", config={**base, "agent_id": agent["id"], "skill_ids": [skills[0]["id"]]})
        self.assertEqual(task["config"]["agent_id"], agent["id"])
        self.assertEqual(task["config"]["skill_ids"], [skills[0]["id"]])
        self.assertEqual(datetime.fromisoformat(task["config"]["next_run"]).weekday(), 4)
        self.assertNotIn(agent["id"], [item["id"] for item in self.cap.schedule_options(self.other.id)["agents"]])

    def test_shop_multiselect_is_owned_authorized_and_cannot_be_forged_by_crud(self):
        for shop_id, owner, status in (("shop-a", self.user.id, "authorized"), ("shop-b", self.user.id, "authorized"), ("shop-expired", self.user.id, "expired"), ("shop-other", self.other.id, "authorized")):
            config = json.dumps({"authorization_status": status, "country": "US", "mode": "半托管"})
            self.store._conn.execute("INSERT INTO console_resources VALUES (?, ?, 'shop', ?, '', 1, ?, '', '')", (shop_id, owner, shop_id, config))
        self.store._conn.commit()
        base = {"frequency": "daily", "next_run": "2099-01-01T10:00Z"}
        task = self.resource("schedule", config={**base, "shop_ids": ["shop-a", "shop-b"]})
        self.assertEqual(task["config"]["shop_ids"], ["shop-a", "shop-b"])
        for shop_id in ("shop-expired", "shop-other"):
            with self.assertRaises(ValueError):
                self.resource("schedule", config={**base, "shop_ids": [shop_id]})
        with self.assertRaises(ValueError):
            self.resource("shop", config={"authorization_status": "authorized"})

    def test_edit_interval_and_expiration_recomputes_next_run(self):
        task = self.resource("schedule", config={"frequency": "interval", "next_run": "2099-01-01T10:00Z", "interval_value": 1, "interval_unit": "hours"})
        task = self.cap.save(self.user.id, {**task, "config": {**task["config"], "next_run": "2000-01-01T00:00Z"}}, task["id"])
        self.assertEqual(task["config"]["next_run"], "2099-01-01T10:00:00+00:00")
        task = self.cap.save(self.user.id, {**task, "config": {**task["config"], "interval_value": 3, "interval_unit": "hours"}}, task["id"])
        self.assertEqual(task["config"]["interval_value"], 3)

    def test_runtime_toolkit_registers_mcp_and_restores_titles(self):
        runtime = AgentScopeRuntime(self.store); runtime.capabilities = self.cap
        from service.runtime import ModelSettings
        self.resource("mcp", config={"url": "http://127.0.0.1:8888/mcp"})
        session = runtime._create_session("owned", ModelSettings(provider="openai", name="test", api_key="dummy-test-key"), "test", self.user)
        self.assertEqual(len(session.agent.toolkit.tool_groups[0].mcps), 1)
        self.store.ensure_session("owned", self.user.id)
        self.store._conn.execute("UPDATE sessions SET title='Renamed' WHERE id='owned'"); self.store._conn.commit()
        self.assertEqual(runtime.list_sessions(self.user)[0]["title"], "Renamed")


class PersonaTests(StoreFixture, unittest.TestCase):
    def setUp(self): self.create_store()
    def tearDown(self): self.clean_store()

    def test_bootstrap_is_added_only_for_first_user_turn(self):
        runtime = AgentScopeRuntime(self.store)
        runtime.capabilities = self.cap
        session = runtime._create_session(
            "persona", ModelSettings(provider="openai", name="test", api_key="dummy-test-key"),
            "test", self.user,
        )
        self.assertEqual(session.agent.name, MAIN_AGENT_NAME)
        for filename in ("agents.md", "user.md"):
            self.assertIn(
                (MAIN_PERSONA_DIR / filename).read_text(encoding="utf-8").strip(),
                session.agent._system_prompt,
            )
        guidance = (MAIN_PERSONA_DIR / "bootstrap.md").read_text(encoding="utf-8").strip()
        self.assertNotIn(guidance, session.agent._system_prompt)
        runtime._configure_bootstrap(session, self.user)
        self.assertIn(guidance, asyncio.run(session.agent._get_system_prompt()))
        runtime._finish_bootstrap(session)
        runtime._configure_bootstrap(session, self.user)
        self.assertNotIn(guidance, asyncio.run(session.agent._get_system_prompt()))

    def test_bootstrap_state_survives_restart_and_is_account_scoped(self):
        self.store.mark_bootstrap_seen(self.user.id)
        reopened = StudioStore(self.store.db_path, self.root)
        try:
            runtime = AgentScopeRuntime(reopened)
            self.assertFalse(runtime._should_load_bootstrap("new-chat", self.user))
            self.assertTrue(runtime._should_load_bootstrap("other-chat", self.other))
        finally:
            reopened._conn.close()

    def test_existing_profile_skips_bootstrap_even_after_profile_deletion(self):
        profile = self.resource("memory", name="MoonClaw 用户身份", content="角色：TikTok 运营")
        runtime = AgentScopeRuntime(self.store)
        runtime.capabilities = self.cap
        self.assertFalse(runtime._should_load_bootstrap("chat", self.user))
        self.cap.delete(self.user.id, profile["id"])
        self.assertFalse(runtime._should_load_bootstrap("new-chat", self.user))

    def test_background_approval_and_anonymous_turns_do_not_consume_bootstrap(self):
        runtime = AgentScopeRuntime(self.store)
        self.assertFalse(runtime._should_load_bootstrap("run-test", self.user))
        self.assertFalse(runtime._should_load_bootstrap("chat", self.user, approval=True))
        self.assertFalse(runtime._should_load_bootstrap("chat", None))
        self.assertFalse(self.store.has_seen_bootstrap(self.user.id))
        self.assertTrue(runtime._should_load_bootstrap("normal-chat", self.user))

    def test_returning_users_do_not_require_bootstrap_file(self):
        for filename in ("agents.md", "user.md"):
            (self.root / filename).write_text(filename, encoding="utf-8")
        self.assertIn("agents.md", load_main_persona(self.root))
        with self.assertRaises(RuntimeConfigError):
            load_main_persona(self.root, include_bootstrap=True)

    def test_missing_empty_or_invalid_persona_stops_loading_without_exposing_path(self):
        for filename in MAIN_PERSONA_FILES:
            (self.root / filename).write_text("有效规则", encoding="utf-8")
        for content in (None, b" \n", b"\xff"):
            with self.subTest(content=content):
                path = self.root / "agents.md"
                if content is None:
                    path.unlink()
                else:
                    path.write_bytes(content)
                with self.assertRaises(RuntimeConfigError) as raised:
                    load_main_persona(self.root)
                self.assertNotIn(str(self.root), str(raised.exception))

    def test_persona_files_are_not_part_of_shared_knowledge_index(self):
        project_root = MAIN_PERSONA_DIR.parents[2]
        store = StudioStore(self.root / "index.sqlite3", project_root)
        try:
            store.sync_knowledge_docs()
            indexed = {row[0] for row in store._conn.execute("SELECT path FROM knowledge_docs")}
            self.assertFalse(any("personas/main/" in path for path in indexed))
        finally:
            store._conn.close()


class FakeRuntime:
    def __init__(self, store): self.store, self.calls, self.events, self.hold = store, [], [], False
    def _safe_error_message(self, error): return str(error)
    async def stream(self, session_id, message, **kwargs):
        self.calls.append((session_id, message))
        self.store.add_message(session_id, "user", message)
        if self.hold: await asyncio.sleep(3600)
        event = self.events.pop(0) if self.events else {"type": "done", "title": "Completed"}
        yield sse(event["type"], event)


class ExecutionTests(StoreFixture, unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.create_store()
        self.store.create_model_setting(self.user.id, "openai", "test", "test-model", "", "dummy-test-key", True)
        self.fake = FakeRuntime(self.store); self.cap.runtime = self.fake
    async def asyncTearDown(self):
        await self.cap.close(); self.clean_store()
    async def drain(self):
        await asyncio.gather(*list(self.cap.tasks))

    async def test_bootstrap_first_reply_and_failure_retry_on_cached_agent(self):
        from unittest.mock import patch
        from agentscope.event import ReplyEndEvent
        runtime = AgentScopeRuntime(self.store)
        runtime.capabilities = self.cap
        session = runtime._get_or_create_session("first-chat", None, self.user)
        guidance = (MAIN_PERSONA_DIR / "bootstrap.md").read_text(encoding="utf-8").strip()
        prompts = []
        fail = True

        async def reply_stream(message):
            prompts.append(await session.agent._get_system_prompt())
            if fail:
                raise RuntimeError("test provider unavailable")
            yield ReplyEndEvent(session_id=session.id, reply_id="first-reply", finished_reason="completed")

        with patch.object(session.agent, "reply_stream", reply_stream):
            frames = [frame async for frame in runtime.stream(session.id, "你好", user=self.user)]
            self.assertTrue(any("test provider unavailable" in frame for frame in frames))
            self.assertFalse(self.store.has_seen_bootstrap(self.user.id))
            fail = False
            _ = [frame async for frame in runtime.stream(session.id, "你好", user=self.user)]
            self.assertTrue(self.store.has_seen_bootstrap(self.user.id))
            _ = [frame async for frame in runtime.stream(session.id, "继续", user=self.user)]
        self.assertIn(guidance, prompts[0])
        self.assertIn(guidance, prompts[1])
        self.assertNotIn(guidance, prompts[2])

    async def test_workflow_executes_ordered_steps_in_one_owned_session(self):
        item = self.resource("workflow", content="first\n---\nsecond")
        run = self.cap.start_run(self.user, item["id"])
        with self.assertRaises(ValueError): self.cap.start_run(self.user, item["id"])
        await self.drain()
        self.assertEqual(self.cap.runs(self.user.id)[0]["status"], "success")
        self.assertEqual([message.split("\n")[-1] for _, message in self.fake.calls], ["first", "second"])
        self.assertEqual({session for session, _ in self.fake.calls}, {run["session_id"]})
        self.assertEqual(self.store.list_sessions(self.user.id)[0]["id"], run["session_id"])
        self.assertEqual(self.cap.runs(self.other.id), [])

    async def test_workflow_resumes_next_step_after_approval(self):
        item = self.resource("workflow", content="first\n---\nsecond")
        self.fake.events = [{"type": "approval_required"}]
        run = self.cap.start_run(self.user, item["id"]); await self.drain()
        self.assertEqual(self.cap.runs(self.user.id)[0]["status"], "running")
        self.cap.save(self.user.id, {**item, "content": "changed\n---\nchanged next"}, item["id"])
        self.assertEqual(len(self.fake.calls), 1)
        with self.assertRaises(ValueError): self.cap.start_run(self.user, item["id"])
        self.cap.after_approval(self.user, run["session_id"], True, True); await self.drain()
        self.assertEqual(len(self.fake.calls), 2)
        self.assertIn("second", self.fake.calls[-1][1])
        self.assertEqual(self.cap.runs(self.user.id)[0]["status"], "success")

    async def test_sdk_confirmation_remains_visible_and_lists_all_tools(self):
        from agentscope.event import RequireUserConfirmEvent, ReplyEndEvent
        from agentscope.message import ToolCallBlock
        from service.runtime import ModelSettings
        runtime = AgentScopeRuntime(self.store); runtime.capabilities = self.cap
        self.store.ensure_session("approval-test", self.user.id)
        session = runtime._create_session("approval-test", ModelSettings(provider="openai", name="test", api_key="dummy-test-key"), "test", self.user)
        runtime.sessions[session.id] = session
        event = RequireUserConfirmEvent(reply_id="reply", tool_calls=[ToolCallBlock(id="call1", name="workspace_write_plan", input='{"plan":"test"}'), ToolCallBlock(id="call2", name="save_memory", input='{"name":"test","content":"test"}')])
        frames = [frame async for frame in runtime._map_agent_event(session, event)]
        self.assertIn("save_memory", frames[0]); self.assertIn("workspace_write_plan", frames[0])
        end = ReplyEndEvent(session_id=session.id, reply_id="reply", finished_reason="interrupted")
        self.assertEqual([frame async for frame in runtime._map_agent_event(session, end)], [])
        listed = runtime.list_sessions(self.user)[0]
        self.assertEqual(listed["status"], "waiting_approval")
        self.assertEqual(len(listed["pendingApproval"]["args"]), 2)
        self.assertEqual(listed["messages"][-1]["role"], "assistant")

    async def test_agent_memory_tool_persists_only_to_current_user(self):
        from service.runtime import ModelSettings
        from agentscope.permission import PermissionContext
        runtime = AgentScopeRuntime(self.store); runtime.capabilities = self.cap
        session = runtime._create_session("memory-test", ModelSettings(provider="openai", name="test", api_key="dummy-test-key"), "test", self.user)
        tool = next(tool for tool in session.agent.toolkit.tool_groups[0].tools if tool.name == "save_memory")
        permission = await tool.check_permissions({}, PermissionContext())
        self.assertEqual(permission.behavior.value, "ask")
        await tool.call(name="Reply preference", content="回答简洁")
        self.assertEqual(self.cap.list(self.user.id, "memory")[0]["content"], "回答简洁")
        self.assertEqual(self.cap.list(self.other.id, "memory"), [])

    async def test_rejection_and_model_failure_never_run_next_step(self):
        item = self.resource("workflow", content="first\n---\nsecond")
        self.fake.events = [{"type": "approval_required"}]
        run = self.cap.start_run(self.user, item["id"]); await self.drain()
        self.cap.after_approval(self.user, run["session_id"], False, True)
        self.assertEqual(self.cap.runs(self.user.id)[0]["status"], "failed")
        self.fake.events = [{"type": "done", "level": "warning", "detail": "API unavailable"}]
        self.cap.start_run(self.user, item["id"]); await self.drain()
        self.assertEqual(len(self.fake.calls), 2)
        self.assertEqual(self.cap.runs(self.user.id)[0]["status"], "failed")

    async def test_once_schedule_claims_only_once_and_records_execution(self):
        item = self.resource("schedule", config={"frequency": "once", "next_run": "2099-01-01T10:00Z"})
        config = {**item["config"], "next_run": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()}
        self.store._conn.execute("UPDATE console_resources SET config_json=? WHERE id=?", (json.dumps(config), item["id"])); self.store._conn.commit()
        scheduler = asyncio.create_task(self.cap.scheduler())
        try:
            await asyncio.sleep(.05); await self.drain()
            self.assertFalse(self.cap.get(self.user.id, item["id"])["enabled"])
            self.assertEqual(len(self.fake.calls), 1)
            self.assertEqual(self.cap.runs(self.user.id)[0]["status"], "success")
        finally:
            scheduler.cancel()
            await asyncio.gather(scheduler, return_exceptions=True)

    async def test_scheduled_run_scopes_skills_and_mcp_and_snapshots_agent(self):
        first = self.resource("skill", content="selected method")
        self.resource("skill", content="unselected method")
        chosen = self.resource("mcp", config={"url": "http://127.0.0.1:8888/mcp"})
        self.resource("mcp", config={"url": "http://127.0.0.1:8889/mcp"})
        agent = self.resource("agent", name="运营专家", content="严格依照真实库存输出", config={"skill_ids": [first["id"]], "mcp_ids": [chosen["id"]]})
        task = self.resource("schedule", config={"frequency": "daily", "next_run": "2099-01-01T10:00Z", "skill_ids": [first["id"]], "mcp_ids": [chosen["id"]], "agent_id": agent["id"]})
        run = self.cap.start_run(self.user, task["id"])
        await self.drain()
        scope = self.cap.session_config(self.user.id, run["session_id"])
        self.assertEqual(scope["agent_prompt"], agent["content"])
        self.assertIsNone(self.cap.session_config(self.other.id, run["session_id"]))
        context = self.cap.context(self.user.id, "method", run["session_id"])
        self.assertIn("selected method", context)
        self.assertNotIn("unselected method", context)
        self.assertEqual(len(self.cap.mcp_clients(self.user.id, run["session_id"])), 1)
        self.cap.delete(self.user.id, task["id"])
        self.assertEqual(self.cap.runs(self.user.id)[0]["kind"], "schedule")

    async def test_shutdown_preserves_interrupted_status(self):
        item = self.resource("workflow")
        self.fake.hold = True
        self.cap.start_run(self.user, item["id"])
        await asyncio.sleep(.01); await self.cap.close()
        self.assertEqual(self.cap.runs(self.user.id)[0]["status"], "failed")

    async def test_stop_background_run_checks_owner_and_cancels_task(self):
        item = self.resource("workflow"); self.fake.hold = True
        run = self.cap.start_run(self.user, item["id"])
        await asyncio.sleep(.01)
        with self.assertRaises(ValueError): await self.cap.stop_session_run(self.other.id, run["session_id"])
        self.assertEqual(self.cap.runs(self.user.id)[0]["status"], "running")
        await self.cap.stop_session_run(self.user.id, run["session_id"])
        self.assertEqual(self.cap.runs(self.user.id)[0]["status"], "failed")
        self.assertEqual(self.cap.run_tasks, {})

    async def test_runtime_serializes_session_and_releases_lock_on_cancel(self):
        runtime = AgentScopeRuntime(self.store)
        async def hold(*args, **kwargs):
            yield "first"
            await asyncio.sleep(3600)
        runtime._stream = hold
        stream = runtime.stream("task", "message")
        self.assertEqual(await anext(stream), "first")
        blocked = [frame async for frame in runtime.stream("task", "duplicate")]
        self.assertIn("Session busy", blocked[0])
        await stream.aclose()
        self.assertFalse(runtime.session_locks["task"].locked())


class ApiTests(StoreFixture, unittest.TestCase):
    def setUp(self):
        self.create_store()
        # Import the app with a temporary startup DB; then bind each test's store.
        os.environ.setdefault("AGENTSCOPE_STATE_DB", str(self.root / "initial.sqlite3"))
        from service import main
        from fastapi.testclient import TestClient
        self.main = main
        main.runtime = AgentScopeRuntime(self.store)
        main.capabilities = self.cap; self.cap.runtime = main.runtime; main.runtime.capabilities = self.cap
        self.client = TestClient(main.app)
        self.client.__enter__()
        self.headers = {"authorization": f"Bearer {self.token}"}
        self.other_headers = {"authorization": f"Bearer {self.other_token}"}
    def tearDown(self):
        self.client.__exit__(None, None, None); self.clean_store()

    def test_resources_require_login_and_enforce_ownership(self):
        self.assertEqual(self.client.get("/console/resources").status_code, 401)
        response = self.client.post("/console/resources", headers=self.headers, json={"kind": "memory", "name": "Preference", "content": "用中文"})
        self.assertEqual(response.status_code, 200)
        item = response.json()["resource"]
        self.assertEqual(self.client.get("/console/resources", headers=self.other_headers).json()["resources"], [])
        self.assertEqual(self.client.put(f"/console/resources/{item['id']}", headers=self.other_headers, json=item).status_code, 400)
        self.assertEqual(self.client.delete(f"/console/resources/{item['id']}", headers=self.other_headers).status_code, 404)

    def test_foreground_stop_is_durable_request_scoped_and_owner_checked(self):
        self.store.ensure_session("foreground", self.user.id)
        path = "/console/sessions/foreground/stop"
        self.assertEqual(self.client.post(path, headers=self.other_headers, json={"request_id": "turn-1"}).status_code, 404)
        self.assertFalse(self.store.stream_stop_requested("foreground", "turn-1"))
        self.assertEqual(self.client.post(path, headers=self.headers, json={"request_id": "turn-1"}).status_code, 200)
        self.assertTrue(self.store.stream_stop_requested("foreground", "turn-1"))
        self.assertFalse(self.store.stream_stop_requested("foreground", "turn-2"))

    def test_session_read_rename_delete_and_stream_are_owner_scoped(self):
        self.store.ensure_session("private", self.user.id); self.store.add_message("private", "user", "private message")
        self.assertEqual(self.client.get("/sessions").status_code, 401)
        self.assertEqual(self.client.get("/sessions/private/messages", headers=self.other_headers).status_code, 404)
        self.assertEqual(self.client.post("/sessions/private/stream", headers=self.other_headers, json={"session_id": "private", "message": "intrude"}).status_code, 404)
        self.assertEqual(self.client.put("/console/sessions/private", headers=self.headers, json={"title": "My session"}).status_code, 200)
        self.assertEqual(self.client.get("/sessions", headers=self.headers).json()["sessions"][0]["title"], "My session")
        self.assertEqual(self.client.delete("/console/sessions/private", headers=self.headers).status_code, 200)
        self.assertEqual(self.store.list_messages("private"), [])

    def test_status_and_project_docs_are_real_and_user_scoped(self):
        self.resource("memory")
        status = self.client.get("/console/status", headers=self.headers).json()
        self.assertEqual(status["resources"]["memory"], 1)
        self.assertNotIn("db_path", status)
        docs = self.client.get("/console/project-docs", headers=self.headers).json()["documents"]
        self.assertEqual(docs[0]["path"], "README.md")
        self.assertEqual(self.client.get("/console/project-docs").status_code, 401)


if __name__ == "__main__": unittest.main()
