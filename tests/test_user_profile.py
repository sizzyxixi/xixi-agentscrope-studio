import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from agentscope.permission import PermissionContext
from service.capabilities import ConsoleCapabilities, USER_PROFILE_NAME
from service.runtime import AgentScopeRuntime, ModelSettings
from service.store import StudioStore


class UserProfileTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = StudioStore(root / "state.sqlite3", root)
        self.cap = ConsoleCapabilities(self.store)
        self.user, _ = self.store.create_user("profileuser", "test-password")
        self.other, _ = self.store.create_user("profileother", "test-password")

    def tearDown(self):
        self.store._conn.close()
        self.temp.cleanup()

    def test_fixed_name_reuses_owned_id_and_leaves_other_accounts_untouched(self):
        foreign = self.cap.save_user_profile(self.other.id, "Other profile")
        first = self.cap.save_user_profile(self.user.id, "TikTok：筹备")
        updated = self.cap.save_user_profile(self.user.id, "TikTok：筹备；市场：英国")
        self.assertEqual(first["id"], updated["id"])
        self.assertEqual(updated["name"], USER_PROFILE_NAME)
        self.assertEqual(len(self.cap.list(self.user.id, "memory")), 1)
        self.assertEqual(self.cap.get(self.other.id, foreign["id"])["content"], "Other profile")

    def test_disabled_profile_is_not_reactivated(self):
        profile = self.cap.save_user_profile(self.user.id, "Original")
        self.cap.save(self.user.id, {**profile, "enabled": False}, profile["id"])
        with self.assertRaises(ValueError):
            self.cap.save_user_profile(self.user.id, "New")
        current = self.cap.get(self.user.id, profile["id"])
        self.assertFalse(current["enabled"])
        self.assertEqual(current["content"], "Original")

    def test_duplicate_profiles_are_not_silently_overwritten(self):
        self.cap.save_user_profile(self.user.id, "Original")
        self.cap.save(self.user.id, {"kind": "memory", "name": USER_PROFILE_NAME, "content": "Duplicate"})
        before = self.cap.list(self.user.id, "memory")
        with self.assertRaises(ValueError):
            self.cap.save_user_profile(self.user.id, "New")
        self.assertEqual(before, self.cap.list(self.user.id, "memory"))

    def test_concurrent_creates_share_one_identity_within_current_store(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            ids = list(pool.map(lambda i: self.cap.save_user_profile(self.user.id, f"Revision {i}")["id"], range(8)))
        self.assertEqual(len(set(ids)), 1)
        self.assertEqual(len(self.cap.list(self.user.id, "memory")), 1)

    async def test_tool_requires_confirmation_and_custom_agents_do_not_inherit_it(self):
        runtime = AgentScopeRuntime(self.store)
        runtime.capabilities = self.cap
        model = ModelSettings(provider="deepseek", name="deepseek-flash", api_key="fixture-only")
        try:
            main = runtime._create_session("main-profile", model, "test", self.user)
            tool = await main.agent.toolkit.get_tool("save_user_profile")
            decision = await tool.check_permissions({}, PermissionContext())
            self.assertEqual(decision.behavior.value, "ask")
            await tool.call(content="TikTok：筹备")
            self.assertEqual(self.cap.list(self.user.id, "memory")[0]["name"], USER_PROFILE_NAME)
            self.assertEqual(self.cap.list(self.other.id, "memory"), [])
            custom = self.cap.save(self.user.id, {"kind": "agent", "name": "Custom", "content": "Custom policy"})
            self.cap.set_chat_agent(self.user.id, "custom-profile", custom["id"])
            session = runtime._create_session("custom-profile", model, "test", self.user)
            self.assertIsNone(await session.agent.toolkit.get_tool("save_user_profile"))
        finally:
            await runtime.knowledge.close()
