import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from agentscope.message import Msg, TextBlock
from agentscope.model import DeepSeekChatModel
from service.runtime import AgentScopeRuntime, ModelSettings
from service.store import StudioStore


class DeepSeekTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = StudioStore(root / "state.db", root)
        self.runtime = AgentScopeRuntime(self.store)

    def tearDown(self):
        self.store._conn.close()
        self.temp.cleanup()

    def test_defaults_and_existing_model_names_are_preserved(self):
        with patch.dict(os.environ, {"DEEPSEEK_MODEL": "", "DEEPSEEK_BASE_URL": ""}):
            model = self.runtime._build_model(ModelSettings(provider="deepseek", api_key="fixture-key"))
            self.assertIsInstance(model, DeepSeekChatModel)
            self.assertEqual(model.model, "deepseek-flash")
            self.assertEqual(str(model.credential.base_url).rstrip("/"), "https://api.deepseek.com")
            for name in ("deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"):
                configured = self.runtime._build_model(ModelSettings(provider="deepseek", name=name, api_key="fixture-key"))
                self.assertEqual(configured.model, name)

    def test_saves_real_provider_models_without_returning_secrets(self):
        user, _ = self.store.create_user("deepseekqa", "testing123")
        other, _ = self.store.create_user("otherdeepseek", "testing456")
        for name in ("deepseek-flash", "deepseek-v4-pro"):
            saved = self.store.create_model_setting(user.id, "DeepSeek", name, name, "https://api.deepseek.com", "fixture-secret-key")
            resolved = self.runtime._resolve_model_settings(ModelSettings(id=saved.id), user)
            self.assertEqual(resolved.provider, "deepseek")
            self.assertEqual(resolved.name, name)
            self.assertEqual(self.runtime._build_model(resolved).model, name)
        listed = self.store.list_model_settings(user.id)
        self.assertEqual(len(listed), 2)
        self.assertNotIn("fixture-secret-key", json.dumps(listed))
        self.assertEqual(self.store.list_model_settings(other.id), [])

    async def test_sdk_stream_request_uses_official_endpoint_and_passes_tools(self):
        captured = []
        def handler(request):
            captured.append(request)
            frames = [
                {"id": "fixture", "object": "chat.completion.chunk", "created": 1, "model": "deepseek-flash", "choices": [{"index": 0, "delta": {"role": "assistant", "content": "测试成功"}, "finish_reason": None}]},
                {"id": "fixture", "object": "chat.completion.chunk", "created": 1, "model": "deepseek-flash", "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]},
            ]
            body = "".join("data: " + json.dumps(frame) + "\n\n" for frame in frames) + "data: [DONE]\n\n"
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=body)
        model = self.runtime._build_model(ModelSettings(provider="deepseek", name="deepseek-flash", endpoint="https://api.deepseek.com", api_key="fixture-api-key"))
        tools = [{"type": "function", "function": {"name": "read_skill", "description": "Read a skill", "parameters": {"type": "object", "properties": {}}}}]
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            model.client_kwargs["http_client"] = client
            stream = await model._call_api(model.model, [Msg(name="user", role="user", content=[TextBlock(text="fixture")])], tools=tools)
            chunks = [chunk async for chunk in stream]
        self.assertEqual(str(captured[0].url), "https://api.deepseek.com/chat/completions")
        self.assertEqual(captured[0].headers["authorization"], "Bearer fixture-api-key")
        payload = json.loads(captured[0].content)
        self.assertEqual(payload["model"], "deepseek-flash")
        self.assertTrue(payload["stream"])
        self.assertEqual(payload["tools"], tools)
        self.assertIn("测试成功", "".join(getattr(block, "text", "") for chunk in chunks for block in chunk.content))
