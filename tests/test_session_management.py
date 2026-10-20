import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from service.capabilities import ConsoleCapabilities
from service.runtime import AgentScopeRuntime
from service.store import StudioStore


class SessionManagementTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from service import main
        self.main = main
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = StudioStore(root / "state.db", root)
        self.cap = ConsoleCapabilities(self.store)
        self.runtime = AgentScopeRuntime(self.store); self.runtime.capabilities = self.cap
        self.user, token = self.store.create_user("sessionqa", "testing123")
        self.other, other_token = self.store.create_user("otherqa", "testing456")
        self.headers = {"authorization": f"Bearer {token}"}
        self.other_headers = {"authorization": f"Bearer {other_token}"}
        self.patches = [patch.object(main, "runtime", self.runtime), patch.object(main, "capabilities", self.cap)]
        for item in self.patches: item.start()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        for item in reversed(self.patches): item.stop()
        self.store._conn.close()
        self.temp.cleanup()

    async def edit(self, sid, **body):
        return await self.client.put(f"/console/sessions/{sid}", json=body, headers=self.headers)

    async def test_pin_order_unpin_and_rename_persist_after_reopen(self):
        for sid in ("task-old", "task-new"):
            self.store.ensure_session(sid, self.user.id)
            self.store.add_message(sid, "user", sid)
        self.store._conn.execute("UPDATE sessions SET updated_at='2026-01-01' WHERE id='task-old'")
        self.store._conn.execute("UPDATE sessions SET updated_at='2026-02-01' WHERE id='task-new'")
        self.store._conn.commit()
        self.assertEqual(self.runtime.list_sessions(self.user)[0]["id"], "task-new")
        self.assertEqual((await self.edit("task-old", pinned=True)).status_code, 200)
        listed = self.runtime.list_sessions(self.user)
        self.assertEqual(listed[0]["id"], "task-old")
        self.assertTrue(listed[0]["pinned"])
        self.assertEqual((await self.edit("task-old", title="  我的经营分析  ")).status_code, 200)
        self.store.add_message("task-old", "user", "后续消息不覆盖自定义标题")
        reopened = StudioStore(self.store.db_path, self.store.project_root)
        try:
            result = AgentScopeRuntime(reopened).list_sessions(self.user)[0]
            self.assertEqual(result["title"], "我的经营分析")
            self.assertTrue(result["custom_title"])
            self.assertTrue(result["pinned"])
        finally: reopened._conn.close()
        self.assertEqual((await self.edit("task-old", pinned=False)).status_code, 200)
        self.assertFalse(self.runtime.list_sessions(self.user)[0]["pinned"])

    async def test_empty_draft_can_be_saved_but_cannot_claim_other_accounts_or_system_ids(self):
        self.assertEqual((await self.edit("task-draft", pinned=True, create_if_missing=True)).status_code, 200)
        self.assertEqual((await self.edit("task-draft", title="命名空会话")).status_code, 200)
        self.assertEqual(self.runtime.list_sessions(self.user)[0]["title"], "命名空会话")
        for method in ("PUT", "DELETE"):
            response = await self.client.request(method, "/console/sessions/task-draft", headers=self.other_headers, **({"json": {"title": "不能修改", "create_if_missing": True}} if method == "PUT" else {}))
            self.assertEqual(response.status_code, 404)
        for sid in ("run-forged", "channel-forged"):
            self.assertEqual((await self.edit(sid, pinned=True, create_if_missing=True)).status_code, 404)
        self.assertEqual((await self.edit("missing", pinned=True)).status_code, 404)

    async def test_invalid_edits_and_anonymous_requests_are_rejected(self):
        self.store.ensure_session("task-owned", self.user.id)
        for body in ({}, {"title": "  "}, {"title": "a" * 101}):
            self.assertEqual((await self.edit("task-owned", **body)).status_code, 400)
        self.assertEqual((await self.edit("task-owned", pinned="yes")).status_code, 422)
        anonymous = await self.client.put("/console/sessions/task-owned", json={"pinned": True})
        self.assertEqual(anonymous.status_code, 401)

    async def test_delete_removes_only_target_session_and_related_content(self):
        for sid in ("task-delete", "task-keep"):
            self.store.ensure_session(sid, self.user.id)
            self.store.add_message(sid, "user", "fixture")
        self.store.add_plan("task-delete", "fixture plan")
        self.cap.set_session_config(self.user.id, "task-delete", {"skill_ids": []})
        self.runtime.sessions["task-delete"] = SimpleNamespace(pending_confirmations={})
        result = await self.client.delete("/console/sessions/task-delete", headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertNotIn("task-delete", self.runtime.sessions)
        self.assertEqual(self.store.list_messages("task-delete"), [])
        self.assertEqual(self.store.list_plans("task-delete"), [])
        self.assertIsNone(self.cap.session_config(self.user.id, "task-delete"))
        self.assertEqual([session["id"] for session in self.store.list_sessions(self.user.id)], ["task-keep"])
        self.assertEqual((await self.client.delete("/console/sessions/task-delete", headers=self.headers)).status_code, 404)

    async def test_delete_is_blocked_while_streaming_or_waiting_for_approval(self):
        self.store.ensure_session("task-busy", self.user.id)
        lock = asyncio.Lock(); await lock.acquire()
        self.runtime.session_locks["task-busy"] = lock
        self.assertEqual((await self.client.delete("/console/sessions/task-busy", headers=self.headers)).status_code, 409)
        lock.release()
        self.runtime.sessions["task-busy"] = SimpleNamespace(pending_confirmations={"fixture": object()})
        self.assertEqual((await self.client.delete("/console/sessions/task-busy", headers=self.headers)).status_code, 409)
