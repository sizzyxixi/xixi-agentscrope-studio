import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from service.capabilities import ConsoleCapabilities
from service.runtime import AgentScopeRuntime, ModelSettings
from service.store import StudioStore


class AgentTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = StudioStore(root / "state.db", root)
        self.cap = ConsoleCapabilities(self.store)
        self.user, self.token = self.store.create_user("agenttester", "testing123")
        self.other, self.other_token = self.store.create_user("agentother", "testing456")
        self.agent = self.cap.save(self.user.id, {"kind": "agent", "name": "Data expert", "content": "You are a data expert. Verify every claim.", "config": {"description": "Analyze business data", "avatar": "📊", "max_iters": 12, "context_trigger": 0.6}})

    def tearDown(self):
        self.store._conn.close()
        self.temp.cleanup()

    def test_profiles_are_owned_and_config_is_validated(self):
        self.assertEqual(len(self.cap.agents(self.user.id)), 11)
        self.assertEqual([item["id"] for item in self.cap.agents(self.other.id) if not item["id"].startswith("official-")], ["main"])
        self.assertEqual(self.cap.agents(self.user.id)[0]["builtin"], True)
        for config in ({"max_iters": 0}, {"max_iters": 51}, {"max_iters": True}, {"context_trigger": 0.99}, {"description": "x" * 301}, {"avatar": "unknown"}):
            with self.assertRaises(ValueError):
                self.cap.save(self.user.id, {**self.agent, "config": config}, self.agent["id"])
        reopened = ConsoleCapabilities(self.store)
        self.assertEqual(reopened.get(self.user.id, self.agent["id"])["config"]["max_iters"], 12)

    def test_official_presets_are_shared_but_bind_only_the_current_accounts_resources(self):
        skill = self.cap.save(self.user.id, {"kind": "skill", "name": "My skill", "content": "My instructions"})
        mcp = self.cap.save(self.other.id, {"kind": "mcp", "name": "Other MCP", "config": {"url": "https://example.com/mcp"}})
        first = self.cap.agent(self.user.id, "official-amazon")
        second = self.cap.agent(self.other.id, "official-amazon")
        self.assertTrue(first["builtin"])
        self.assertEqual(first["content"], second["content"])
        self.assertEqual(first["config"]["skill_ids"], [skill["id"]])
        self.assertEqual(second["config"]["skill_ids"], [])
        self.assertEqual(first["config"]["mcp_ids"], [])
        self.assertEqual(second["config"]["mcp_ids"], [mcp["id"]])
        first["config"]["skill_ids"].append("not-real")
        self.assertNotIn("not-real", self.cap.agent(self.user.id, "official-amazon")["config"]["skill_ids"])
        self.assertEqual(len([a for a in self.cap.agents(self.other.id) if a["id"].startswith("official-")]), 9)
        for user in (self.user, self.other):
            with self.assertRaises(ValueError): self.cap.delete(user.id, "official-amazon")
            with self.assertRaises(ValueError): self.cap.save(user.id, {**second, "kind": "agent", "name": "Changed"}, "official-amazon")

    def test_official_preset_chat_snapshot_and_schedule_resolve_without_copying_to_accounts(self):
        preset = self.cap.agent(self.user.id, "official-tiktok")
        self.cap.set_chat_agent(self.user.id, "preset-chat", preset["id"])
        scope = self.cap.session_config(self.user.id, "preset-chat")
        self.assertEqual(scope["agent_prompt"], preset["content"])
        self.assertIn("模拟数据", scope["agent_prompt"])
        self.assertIn("read_file", scope["agent_config"]["tool_ids"])
        schedule = self.cap.save(self.user.id, {"kind": "schedule", "name": "Official task", "content": "Prepare a plan", "config": {"agent_id": preset["id"], "frequency": "daily", "next_run": "2099-01-01T08:30:00+08:00"}})
        self.assertEqual(schedule["config"]["agent_id"], preset["id"])
        self.assertEqual([a["id"] for a in self.cap.list(self.user.id, "agent")], [self.agent["id"]])

    def test_session_snapshot_survives_edits_and_keeps_skill_selection(self):
        skill = self.cap.save(self.user.id, {"kind": "skill", "name": "test", "content": "instructions"})
        self.agent = self.cap.save(self.user.id, {**self.agent, "config": {**self.agent["config"], "skill_ids": [skill["id"]]}}, self.agent["id"])
        self.cap.set_chat_skills(self.user.id, "owned", [skill["id"]])
        self.cap.set_chat_agent(self.user.id, "owned", self.agent["id"])
        self.store.add_message("owned", "user", "first request")
        self.cap.save(self.user.id, {**self.agent, "name": "Renamed", "content": "Changed instructions", "config": {**self.agent["config"], "max_iters": 20}}, self.agent["id"])
        self.cap.set_chat_agent(self.user.id, "owned", self.agent["id"])
        scope = self.cap.session_config(self.user.id, "owned")
        self.assertEqual(scope["agent_name"], "Data expert")
        self.assertEqual(scope["agent_prompt"], self.agent["content"])
        self.assertEqual(scope["agent_config"]["max_iters"], 12)
        self.assertEqual(scope["skill_ids"], [skill["id"]])
        self.cap.set_chat_agent(self.user.id, "fresh", self.agent["id"])
        self.assertEqual(self.cap.session_config(self.user.id, "fresh")["agent_prompt"], "Changed instructions")

    def test_switch_existing_chat_requires_new_session_and_other_users_are_blocked(self):
        self.cap.set_chat_agent(self.user.id, "owned", self.agent["id"])
        self.store.add_message("owned", "user", "first request")
        with self.assertRaises(ValueError): self.cap.set_chat_agent(self.user.id, "owned", "main")
        with self.assertRaises(ValueError): self.cap.set_chat_agent(self.other.id, "owned", "main")
        with self.assertRaises(ValueError): self.cap.set_chat_agent(self.other.id, "other", self.agent["id"])
        for sid in ("channel-protected", "run-protected"):
            with self.assertRaises(ValueError): self.cap.set_chat_agent(self.user.id, sid, "main")
        self.cap.set_chat_agent(self.user.id, "new-chat", "main")
        self.assertEqual(self.cap.session_config(self.user.id, "new-chat")["agent_id"], "main")

    def test_disabled_or_deleted_agents_preserve_history_but_cannot_run(self):
        self.cap.set_chat_agent(self.user.id, "history", self.agent["id"])
        self.store.add_message("history", "user", "keep this message")
        self.cap.save(self.user.id, {**self.agent, "enabled": False}, self.agent["id"])
        with self.assertRaises(ValueError): self.cap.validate_chat_agent(self.user.id, "history", self.agent["id"])
        self.cap.delete(self.user.id, self.agent["id"])
        runtime = AgentScopeRuntime(self.store); runtime.capabilities = self.cap
        history = runtime.list_sessions(self.user)[0]
        self.assertEqual(history["agent_name"], "Data expert")
        self.assertEqual(history["agent_id"], self.agent["id"])
        self.assertEqual(history["messages"][0]["content"], "keep this message")

    def test_runtime_uses_snapshot_in_real_sdk_and_skips_default_bootstrap(self):
        self.cap.set_chat_agent(self.user.id, "custom-chat", self.agent["id"])
        runtime = AgentScopeRuntime(self.store); runtime.capabilities = self.cap
        session = runtime._create_session("custom-chat", ModelSettings(provider="openai", name="test", api_key="fixture"), "test", self.user)
        self.assertEqual(session.agent.name, "Data expert")
        self.assertEqual(session.agent._system_prompt, self.agent["content"])
        self.assertEqual(session.agent.react_config.max_iters, 12)
        self.assertEqual(session.agent.context_config.trigger_ratio, 0.6)
        self.assertFalse(runtime._should_load_bootstrap("custom-chat", self.user))
        self.assertEqual(self.cap.schedule_options(self.user.id)["agents"][1]["id"], self.agent["id"])

    def test_binding_validation_and_effective_skill_mcp_scope(self):
        skill = self.cap.save(self.user.id, {"kind": "skill", "name": "Bound skill", "content": "bound instructions"})
        extra = self.cap.save(self.user.id, {"kind": "skill", "name": "Extra skill", "content": "extra instructions"})
        hidden = self.cap.save(self.user.id, {"kind": "skill", "name": "Hidden skill", "content": "hidden instructions"})
        mcp = self.cap.save(self.user.id, {"kind": "mcp", "name": "Bound MCP", "config": {"url": "https://example.com/mcp"}})
        other_mcp = self.cap.save(self.user.id, {"kind": "mcp", "name": "Other MCP", "config": {"url": "https://example.org/mcp"}})
        foreign = self.cap.save(self.other.id, {"kind": "skill", "name": "Foreign skill", "content": "private"})
        for bindings in ({"skill_ids": [foreign["id"]]}, {"skill_ids": [mcp["id"]]}, {"mcp_ids": [skill["id"]]}, {"skill_ids": [skill["id"]] * 2}, {"skill_ids": ["a"] * 4}, {"tool_ids": ["unknown"]}, {"tool_ids": "search_documents"}):
            with self.assertRaises(ValueError):
                self.cap.save(self.user.id, {**self.agent, "config": bindings}, self.agent["id"])
        bound = self.cap.save(self.user.id, {**self.agent, "config": {**self.agent["config"], "skill_ids": [skill["id"], extra["id"]], "mcp_ids": [mcp["id"]], "tool_ids": ["search_documents"]}}, self.agent["id"])
        self.cap.set_chat_agent(self.user.id, "bindings", bound["id"])
        self.cap.set_chat_skills(self.user.id, "bindings", [extra["id"]])
        context = self.cap.context(self.user.id, "test", "bindings")
        self.assertIn("bound instructions", context)
        self.assertIn("extra instructions", context)
        self.assertNotIn("hidden instructions", context)
        self.assertEqual(self.cap.read_skill(self.user.id, skill["id"], session_id="bindings")["content"], "bound instructions")
        with self.assertRaises(ValueError): self.cap.read_skill(self.user.id, hidden["id"], session_id="bindings")
        clients = self.cap.mcp_clients(self.user.id, "bindings")
        self.assertEqual([client.name for client in clients], [f"mcp_{mcp['id'][:12]}"])
        self.cap.save(self.user.id, {**bound, "config": {**bound["config"], "skill_ids": [], "mcp_ids": [], "tool_ids": []}}, bound["id"])
        self.cap.set_chat_agent(self.user.id, "bindings", bound["id"])
        self.assertIn("bound instructions", self.cap.context(self.user.id, "test", "bindings"))
        self.cap.set_chat_agent(self.user.id, "empty-bindings", bound["id"])
        self.assertEqual(self.cap.mcp_clients(self.user.id, "empty-bindings"), [])
        self.assertNotIn("bound instructions", self.cap.context(self.user.id, "test", "empty-bindings"))
        # Task preferences cannot expand the configured whitelist.
        self.store.ensure_session("run-bound", self.user.id)
        self.cap.set_session_config(self.user.id, "run-bound", {"agent_config": bound["config"], "mcp_ids": [other_mcp["id"]]})
        self.assertEqual(len(self.cap.mcp_clients(self.user.id, "run-bound")), 1)

    async def test_real_sdk_registers_only_selected_builtin_tools(self):
        bound = self.cap.save(self.user.id, {**self.agent, "config": {"tool_ids": ["search_documents"], "skill_ids": [], "mcp_ids": []}}, self.agent["id"])
        self.cap.set_chat_agent(self.user.id, "tool-bindings", bound["id"])
        runtime = AgentScopeRuntime(self.store); runtime.capabilities = self.cap
        session = runtime._create_session("tool-bindings", ModelSettings(provider="openai", name="test", api_key="fixture"), "test", self.user)
        toolkit = session.agent.toolkit
        self.assertIsNotNone(await toolkit.get_tool("search_documents"))
        self.assertIsNotNone(await toolkit.get_tool("read_skill"))
        self.assertIsNotNone(await toolkit.get_tool("list_skill_files"))
        self.assertIsNone(await toolkit.get_tool("save_memory"))
        self.assertIsNone(await toolkit.get_tool("workspace_write_plan"))

    async def test_authenticated_api_stream_binds_agent_before_model(self):
        from service import main
        runtime = AgentScopeRuntime(self.store); runtime.capabilities = self.cap
        seen = []
        async def fake_stream(session_id, message, model=None, approval=None, user=None):
            seen.append(self.cap.session_config(user.id, session_id))
            self.store.add_message(session_id, "user", message)
            yield 'event: done\ndata: {"type":"done","title":"ok","detail":"ok"}\n\n'
        with patch.object(main, "capabilities", self.cap), patch.object(main, "runtime", runtime), patch.object(runtime, "_stream", fake_stream):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
                self.assertEqual((await client.get("/console/agents")).status_code, 401)
                headers = {"authorization": f"Bearer {self.token}"}
                listing = await client.get("/console/agents", headers=headers)
                self.assertEqual(len(listing.json()["agents"]), 11)
                created = await client.post(f"/console/agents/{self.agent['id']}/chat", headers=headers)
                self.assertEqual(created.status_code, 200)
                created_id = created.json()["session_id"]
                self.assertEqual(self.cap.session_config(self.user.id, created_id)["agent_id"], self.agent["id"])
                self.assertIn(created_id, [item["id"] for item in runtime.list_sessions(self.user)])
                switched = await client.put(f"/console/sessions/{created_id}/agent", json={"agent_id": "main"}, headers=headers)
                self.assertEqual(switched.status_code, 200)
                self.assertEqual(self.cap.session_config(self.user.id, created_id)["agent_id"], "main")
                body = {"session_id": "web-chat", "message": "Analyze data", "agent_id": self.agent["id"], "skill_ids": []}
                response = await client.post("/sessions/web-chat/stream", json=body, headers=headers)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(seen[0]["agent_prompt"], self.agent["content"])
                response = await client.post("/sessions/web-chat/stream", json={**body, "agent_id": "main"}, headers=headers)
                self.assertEqual(response.status_code, 400)
                response = await client.put("/console/sessions/web-chat/agent", json={"agent_id": "main"}, headers=headers)
                self.assertEqual(response.status_code, 400)
                response = await client.post("/sessions/another/stream", json={**body, "session_id": "another"}, headers={"authorization": f"Bearer {self.other_token}"})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(len(seen), 1)
