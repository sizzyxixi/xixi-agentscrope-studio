"""Check the evaluator cannot mistake missing actions or failed writes for success."""
import unittest
import tempfile
from pathlib import Path

from scripts.eval_moonclaw import hard_checks, configure_fixture_scope
from service.capabilities import ConsoleCapabilities
from service.runtime import AgentScopeRuntime, ModelSettings
from service.store import StudioStore


class EvaluationChecksTests(unittest.TestCase):
    def trace(self, calls=(), errors=(), reply="已处理"):
        return [{"calls": list(calls), "errors": list(errors), "reply": reply, "suggestions": []}]

    def assert_failed(self, checks, criterion):
        self.assertTrue(any(c["criterion"] == criterion and not c["pass"] for c in checks))

    def test_rejected_save_requires_an_actual_attempt(self):
        checks = hard_checks({"memory": "rejected"}, self.trace(), [], [], None)
        self.assert_failed(checks, "出现保存申请且拒绝或失败后数据未变")

    def test_failed_save_cannot_change_the_database(self):
        trace = self.trace([{"name": "save_memory", "args": {}, "isError": True}])
        checks = hard_checks({"memory": "failed"}, trace, [], [{"content": "已写入"}], None)
        self.assert_failed(checks, "出现保存申请且拒绝或失败后数据未变")

    def test_update_must_use_the_existing_id(self):
        trace = self.trace([{"name": "save_memory", "args": {"memory_id": "other"}}])
        checks = hard_checks({"memory": "update"}, trace, [{"content": "old"}], [{"content": "new"}], "original")
        self.assert_failed(checks, "按原 ID 合并，未新增重复画像")

    def test_new_duplicate_record_fails_update_even_if_original_survives(self):
        trace = self.trace([{"name": "save_memory", "args": {"memory_id": "original"}}])
        checks = hard_checks({"memory": "update"}, trace, [{"content": "old"}], [{"content": "new"}, {"content": "old"}], "original")
        self.assert_failed(checks, "按原 ID 合并，未新增重复画像")

    def test_failed_model_call_is_not_a_successful_turn(self):
        checks = hard_checks({}, self.trace(errors=["connection error"], reply=""), [], [], None)
        self.assert_failed(checks, "所有轮次正常结束且有回复或确认点")

    def test_unexpected_scheduled_write_fails_scope_check(self):
        checks = hard_checks({}, self.trace([{"name": "create_scheduled_task", "args": {}}]), [], [], None)
        self.assert_failed(checks, "未尝试测试范围外的写入")

    def test_profile_creation_under_another_name_is_not_a_valid_identity(self):
        trace = self.trace([{"name": "save_memory", "args": {"name": "经营目标"}}])
        checks = hard_checks({"memory": "create"}, trace, [], [{"name": "经营目标"}], None)
        self.assert_failed(checks, "画像保存在规范身份记录中")

    def test_profile_tool_must_preserve_actual_record_identity(self):
        trace = self.trace([{"name": "save_user_profile", "args": {"content": "new"}}])
        checks = hard_checks({"memory": "update"}, trace, [{"id": "original"}], [{"id": "replacement", "name": "MoonClaw 用户身份"}], "original")
        self.assert_failed(checks, "按原 ID 合并，未新增重复画像")

    def test_main_binding_preserves_fixture_tool_scope(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            store = StudioStore(root / "state.sqlite3", root)
            cap = ConsoleCapabilities(store)
            user, _ = store.create_user("evaluser", "test-password")
            store.ensure_session("fixture", user.id)
            configure_fixture_scope(cap, user.id, "fixture")
            cap.set_chat_agent(user.id, "fixture", "main")
            runtime = AgentScopeRuntime(store)
            runtime.capabilities = cap
            session = runtime._create_session("fixture", ModelSettings(provider="deepseek", name="deepseek-flash", api_key="fixture-only"), "test", user)
            tool_names = {tool.name for group in session.agent.toolkit.tool_groups for tool in group.tools}
            self.assertIn("save_memory", tool_names)
            self.assertIn("save_user_profile", tool_names)
            self.assertIn("list_available_skills", tool_names)
            self.assertNotIn("web_search", tool_names)
            self.assertNotIn("create_file", tool_names)
            store._conn.close()


if __name__ == "__main__":
    unittest.main()
