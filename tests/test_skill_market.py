import json
import tempfile
import unittest
from pathlib import Path

from service import skill_market
from service.capabilities import ConsoleCapabilities
from service.runtime import AgentScopeRuntime, ModelSettings
from service.store import StudioStore


class SkillMarketTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = StudioStore(root / "state.db", root)
        self.cap = ConsoleCapabilities(self.store, install_defaults=True)
        self.user, _ = self.store.create_user("skilltester", "testing123")
        self.other, _ = self.store.create_user("skillother", "testing456")

    def tearDown(self):
        self.store._conn.close()
        self.temp.cleanup()

    def test_all_packages_are_installed_once_and_provenance_retained(self):
        items = self.cap.list(self.user.id, "skill")
        self.assertEqual({item["name"] for item in items}, set(skill_market.PACKAGES))
        self.assertEqual(len(self.cap.list(self.user.id, "skill")), 6)
        item = items[0]
        modified = self.cap.save(self.user.id, {**item, "enabled": False, "config": {"package": "../../etc"}}, item["id"])
        self.assertEqual(modified["config"], item["config"])
        self.assertFalse(self.cap.list(self.user.id, "skill")[0]["enabled"])
        self.cap.delete(self.user.id, item["id"])
        self.assertEqual(len(self.cap.list(self.user.id, "skill")), 5)
        reopened = ConsoleCapabilities(self.store, install_defaults=True)
        self.assertEqual(len(reopened.list(self.user.id, "skill")), 5)
        restored = self.cap.install_market_skill(self.user.id, item["config"]["package"])
        self.assertTrue(restored["enabled"])
        self.assertEqual(len(self.cap.list(self.user.id, "skill")), 6)

    def test_context_uses_catalog_and_reads_full_main_and_references(self):
        items = self.cap.list(self.user.id, "skill")
        context = self.cap.context(self.user.id, "用 pdf 技能读取文档")
        self.assertIn("read_skill", context)
        self.assertLess(len(context), 6000)
        for item in items:
            result = self.cap.read_skill(self.user.id, item["id"], limit=500)
            parts = [result["content"]]
            while result["next_offset"] is not None:
                result = self.cap.read_skill(self.user.id, item["id"], offset=result["next_offset"], limit=500)
                parts.append(result["content"])
            self.assertEqual("".join(parts), skill_market.read(item["name"], "SKILL.md"))
        mcp = next(item for item in items if item["name"] == "mcp-builder")
        reference = next(path for path in self.cap.skill_files(self.user.id, mcp["id"]) if path.startswith("reference/") and path.endswith(".md"))
        self.assertTrue(self.cap.read_skill(self.user.id, mcp["id"], reference)["content"])
        self.assertEqual(skill_market.read("pdf", "REFERENCE.md"), skill_market.read("pdf", "./reference.md"))

    def test_permissions_scopes_and_path_traversal(self):
        item = self.cap.list(self.user.id, "skill")[0]
        with self.assertRaises(ValueError): self.cap.read_skill(self.other.id, item["id"])
        self.store.ensure_session("limited", self.user.id)
        self.cap.set_session_config(self.user.id, "limited", {"skill_ids": []})
        with self.assertRaises(ValueError): self.cap.read_skill(self.user.id, item["id"], session_id="limited")
        self.assertNotIn(item["id"], self.cap.context(self.user.id, "test", "limited"))
        for path in ("../runtime.py", "/etc/passwd", "../../.env", "..\\runtime.py"):
            with self.assertRaises(ValueError): self.cap.read_skill(self.user.id, item["id"], path)
        with self.assertRaises(ValueError): self.cap.read_skill(self.user.id, item["id"], offset=-1)
        with self.assertRaises(ValueError): self.cap.read_skill(self.user.id, item["id"], limit=999999)
        self.cap.save(self.user.id, {**item, "enabled": False}, item["id"])
        with self.assertRaises(ValueError): self.cap.read_skill(self.user.id, item["id"])

    def test_custom_skill_cannot_forge_package_access(self):
        item = self.cap.save(self.user.id, {"kind": "skill", "name": "mine", "content": "My instructions", "config": {"package": "pdf"}})
        self.assertEqual(item["config"], {})
        self.assertEqual(self.cap.skill_files(self.user.id, item["id"]), ["SKILL.md"])
        self.assertEqual(self.cap.read_skill(self.user.id, item["id"])["content"], "My instructions")
        with self.assertRaises(ValueError): self.cap.read_skill(self.user.id, item["id"], "LICENSE.txt")

    def test_chat_selection_is_scoped_persistent_and_can_be_cleared(self):
        items = self.cap.list(self.user.id, "skill")
        chosen = items[0]
        self.cap.set_chat_skills(self.user.id, "task-one", [chosen["id"]])
        self.cap.set_chat_skills(self.user.id, "task-two", [])
        context = self.cap.context(self.user.id, "test", "task-one")
        self.assertIn(chosen["id"], context)
        self.assertNotIn(items[1]["id"], context)
        self.assertNotIn(chosen["id"], self.cap.context(self.user.id, "test", "task-two"))
        with self.assertRaises(ValueError): self.cap.read_skill(self.user.id, items[1]["id"], session_id="task-one")
        runtime = AgentScopeRuntime(self.store); runtime.capabilities = self.cap
        sessions = runtime.list_sessions(self.user)
        self.assertEqual(next(item for item in sessions if item["id"] == "task-one")["skill_ids"], [chosen["id"]])
        reopened = ConsoleCapabilities(self.store)
        self.assertEqual(reopened.session_config(self.user.id, "task-one")["skill_ids"], [chosen["id"]])
        self.cap.set_chat_skills(self.user.id, "task-one", [])
        self.assertEqual(self.cap.session_config(self.user.id, "task-one")["skill_ids"], [])
        for ids in ([item["id"] for item in items[:4]], [chosen["id"], chosen["id"]], ["missing"]):
            with self.assertRaises(ValueError): self.cap.set_chat_skills(self.user.id, "task-one", ids)
        with self.assertRaises(ValueError): self.cap.set_chat_skills(self.other.id, "task-one", [chosen["id"]])
        with self.assertRaises(ValueError): self.cap.set_chat_skills(self.user.id, "run-protected", [])
        with self.assertRaises(ValueError): self.cap.set_chat_skills(self.user.id, "channel-protected", [])

    async def test_stream_sends_selected_skills_to_runtime_and_validates_before_model(self):
        import httpx
        from unittest.mock import patch
        from service import main
        _, token = self.store.login_user("skilltester", "testing123")
        items = self.cap.list(self.user.id, "skill")
        runtime = AgentScopeRuntime(self.store); runtime.capabilities = self.cap
        seen = []
        async def fake_stream(session_id, message, model=None, approval=None, user=None):
            seen.append(self.cap.context(user.id, message, session_id))
            yield 'event: done\ndata: {"type":"done","title":"ok","detail":"ok"}\n\n'
        with patch.object(main, "capabilities", self.cap), patch.object(main, "runtime", runtime), patch.object(runtime, "_stream", fake_stream):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
                headers = {"authorization": f"Bearer {token}"}
                body = {"session_id": "task-selected", "message": "test", "skill_ids": [items[0]["id"]]}
                result = await client.post("/sessions/task-selected/stream", headers=headers, json=body)
                self.assertEqual(result.status_code, 200)
                self.assertIn(items[0]["id"], seen[0])
                self.assertNotIn(items[1]["id"], seen[0])
                for ids in ([item["id"] for item in items[:4]], ["missing"]):
                    denied = await client.post("/sessions/task-selected/stream", headers=headers, json={**body, "skill_ids": ids})
                    self.assertEqual(denied.status_code, 400)
                self.assertEqual(len(seen), 1)

    async def test_agent_tools_read_real_skill_content_without_confirmation(self):
        from agentscope.permission import PermissionContext
        item = self.cap.list(self.user.id, "skill")[0]
        runtime = AgentScopeRuntime(self.store)
        runtime.capabilities = self.cap
        self.store.ensure_session("skill-chat", self.user.id)
        session = runtime._create_session("skill-chat", ModelSettings(provider="openai", name="test", api_key="fixture"), "fixture", self.user)
        tools = {tool.name: tool for tool in session.agent.toolkit.tool_groups[0].tools}
        permission = await tools["read_skill"].check_permissions({}, PermissionContext())
        self.assertEqual(permission.behavior.value, "allow")
        result = await tools["read_skill"].call(skill_id=item["id"], limit=100)
        payload = json.loads(result.content[0].text)
        self.assertEqual(payload["content"], item["content"][:100])
        files = await tools["list_skill_files"].call(skill_id=item["id"])
        self.assertIn("SKILL.md", json.loads(files.content[0].text))

    async def test_api_requires_login_and_blocks_other_users_and_bad_paths(self):
        import httpx
        from unittest.mock import patch
        from service import main
        _, token = self.store.login_user("skilltester", "testing123")
        _, other_token = self.store.login_user("skillother", "testing456")
        with patch.object(main, "capabilities", self.cap), patch.object(main, "runtime", AgentScopeRuntime(self.store)):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
                self.assertEqual((await client.get("/console/skill-market")).status_code, 401)
                headers = {"authorization": f"Bearer {token}"}
                market = await client.get("/console/skill-market", headers=headers)
                self.assertEqual(len(market.json()["skills"]), 6)
                resource_id = market.json()["skills"][0]["resource_id"]
                prefix = f"/console/skills/{resource_id}"
                self.assertEqual((await client.get(prefix + "/files", headers=headers)).status_code, 200)
                read = await client.get(prefix + "/read", headers=headers)
                self.assertIn("content", read.json())
                denied = await client.get(prefix + "/read", headers={"authorization": f"Bearer {other_token}"})
                self.assertEqual(denied.status_code, 400)
                invalid = await client.get(prefix + "/read", params={"path": "../runtime.py"}, headers=headers)
                self.assertEqual(invalid.status_code, 400)
