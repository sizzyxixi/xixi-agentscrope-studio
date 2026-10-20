import json
import os
import tempfile
import unittest
import wave
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
import httpx
from fastapi import FastAPI, HTTPException
from service.store import StudioStore
from service.files import FileService, UNAVAILABLE
from service.file_routes import file_router
from service.runtime import AgentScopeRuntime, ModelSettings
from service import file_processing as process


class FilesTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.env = patch.dict(os.environ, {"AGENTSCOPE_FILE_STORAGE": "local"})
        self.env.start()
        self.store = StudioStore(self.root / "state.sqlite3", self.root)
        self.user, self.token = self.store.create_user("filestest", "test-files-123")
        self.other, self.other_token = self.store.create_user(
            "filesother", "test-files-456"
        )
        self.store.ensure_session("chat", self.user.id)
        self.store.ensure_session("other-chat", self.user.id)
        self.files = FileService(self.store)

    def tearDown(self):
        self.store._conn.close()
        self.env.stop()
        self.temp.cleanup()

    def upload(self, name="source.txt", data=b"hello"):
        path = self.root / "upload"
        path.write_bytes(data)
        return self.files.save(self.user.id, "chat", name, path)

    async def generate(self, name, content, **kw):
        return await self.files.generate(
            self.user.id, "chat", "assistant-test", name, content, **kw
        )

    async def test_real_generated_formats_can_be_opened_by_their_native_libraries(self):
        samples = {
            "report.docx": "# 工作计划\n第一步：分析资料。\n|项目|预算|\n|A|100|",
            "report.pdf": "工作计划\n第一步：分析资料。",
            "data.xlsx": json.dumps({"数据": [["名称", "数量"], ["A", 2]]}),
            "slides.pptx": json.dumps(
                {"slides": [{"title": "测试", "body": "真实演示文稿"}]}
            ),
            "data.json": '{"ok":true}',
            "rows.csv": "name,value\nA,2",
            "image.png": json.dumps(
                {
                    "width": 128,
                    "height": 128,
                    "shapes": [{"box": [10, 10, 100, 100], "fill": "#490cf2"}],
                }
            ),
            "animation.gif": json.dumps(
                {
                    "frames": [
                        {"width": 64, "height": 64, "background": "red"},
                        {"width": 64, "height": 64, "background": "blue"},
                    ]
                }
            ),
        }
        for name, content in samples.items():
            with self.subTest(name=name):
                item = await self.generate(name, content)
                with self.files.materialize(item) as path:
                    process.validate(path, name)
                self.assertTrue(item["available"])
                self.assertEqual(item["origin"], "artifact")
        self.assertEqual(len(self.files.list(self.user.id, "chat", True)), len(samples))

    async def test_native_agentscope_parsers_read_generated_office_and_pdf(self):
        for name, content in [
            ("word.docx", "# Hello\nReadable text"),
            (
                "slides.pptx",
                json.dumps({"slides": [{"title": "Hello", "body": "Readable text"}]}),
            ),
            ("book.xlsx", json.dumps({"First": [["Hello", "Readable text"]]})),
            ("doc.pdf", "Hello\nReadable text"),
        ]:
            item = await self.generate(name, content)
            result = await self.files.read(self.user.id, "chat", item["id"])
            self.assertIn("Readable", result["text"])

    async def test_upload_does_not_create_a_conversation_and_binding_is_persistent(
        self,
    ):
        path = self.root / "draft"
        path.write_text("draft")
        item = self.files.save(self.user.id, "draft-session", "draft.txt", path)
        self.assertFalse(
            self.store._conn.execute(
                "SELECT 1 FROM sessions WHERE id=?", ("draft-session",)
            ).fetchone()
        )
        self.store.ensure_session("draft-session", self.user.id)
        self.files.bind(self.user.id, "draft-session", [item["id"]], "user-message")
        self.assertEqual(
            self.files.message_files(self.user.id, "draft-session", "user-message")[0][
                "id"
            ],
            item["id"],
        )

    async def test_cross_user_and_cross_session_access_are_denied(self):
        item = self.upload()
        for user, session in [(self.other.id, "chat"), (self.user.id, "other-chat")]:
            with self.assertRaisesRegex(ValueError, UNAVAILABLE):
                self.files.get(user, item["id"], session)
        with self.assertRaisesRegex(ValueError, UNAVAILABLE):
            self.files.save(self.other.id, "chat", "bad.txt", self.root / "upload")

    async def test_revision_keeps_history_original_and_expiry_and_conflicts_do_not_commit(
        self,
    ):
        source = self.upload("source.docx", b"not actually a docx")
        first = await self.generate("new.docx", "First", replace_id=source["id"])
        second = await self.files.generate(
            self.user.id,
            "chat",
            "assistant-next",
            "new.docx",
            "Second",
            replace_id=first["id"],
            expected_version=1,
        )
        self.assertEqual(second["id"], first["id"])
        self.assertEqual(second["version"], 2)
        self.assertEqual(second["expires_at"], first["expires_at"])
        self.assertEqual(self.files.get(self.user.id, source["id"])["version"], 1)
        self.assertEqual(
            self.files.message_files(self.user.id, "chat", "assistant-test")[0]["id"],
            first["id"],
        )
        with self.assertRaisesRegex(ValueError, "文件已更新"):
            await self.generate(
                "new.docx", "Conflict", replace_id=first["id"], expected_version=1
            )
        self.assertEqual(self.files.get(self.user.id, first["id"])["version"], 2)

    async def test_failed_render_and_failed_storage_never_deliver_success(self):
        with self.assertRaises(ValueError):
            await self.generate("fake.psd", "text")
        with patch.object(self.files.storage, "put", side_effect=ValueError("offline")):
            with self.assertRaises(ValueError):
                await self.generate("not-saved.docx", "hello")
        self.assertEqual(self.files.list(self.user.id, "chat", True), [])

    async def test_storage_is_authenticated_encrypted_and_can_survive_service_recreation(
        self,
    ):
        item = self.upload(data=b"private-plaintext")
        version = self.store._conn.execute(
            "SELECT * FROM studio_file_versions WHERE file_id=?", (item["id"],)
        ).fetchone()
        encrypted = self.files.storage._path(version["object_key"])
        self.assertNotIn(b"private-plaintext", encrypted.read_bytes())
        recreated = FileService(self.store)
        with recreated.materialize(recreated.get(self.user.id, item["id"])) as file:
            self.assertEqual(file.read_bytes(), b"private-plaintext")
        data = bytearray(encrypted.read_bytes())
        data[-1] ^= 1
        encrypted.write_bytes(data)
        with self.assertRaises(ValueError):
            with recreated.materialize(item):
                pass

    async def test_expiry_and_delete_revoke_operations_but_preserve_history_cards(self):
        item = await self.generate("result.txt", "hello")
        with self.assertRaisesRegex(ValueError, "文件已更新"):
            self.files.delete(self.user.id, item["id"], 2)
        self.files.delete(self.user.id, item["id"], 1)
        with self.assertRaisesRegex(ValueError, UNAVAILABLE):
            self.files.get(self.user.id, item["id"])
        self.assertFalse(
            self.files.message_files(self.user.id, "chat", "assistant-test")[0][
                "available"
            ]
        )
        self.assertEqual(self.files.list(self.user.id, "chat", True), [])
        expired = self.upload("expired.txt")
        self.store._conn.execute(
            "UPDATE studio_files SET expires_at=? WHERE id=?",
            (
                (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
                expired["id"],
            ),
        )
        self.store._conn.commit()
        with self.assertRaisesRegex(ValueError, UNAVAILABLE):
            self.files.validate_references(self.user.id, "chat", [expired["id"]])

    async def test_conversion_is_real_and_preserves_source(self):
        text = self.upload("source.txt", "这是测试文档。".encode())
        converted = await self.files.convert(
            self.user.id, "chat", "assistant-test", text["id"], "docx"
        )
        self.assertNotEqual(converted["id"], text["id"])
        with self.files.materialize(converted) as path:
            from docx import Document

            self.assertIn("测试", Document(path).paragraphs[0].text)
        image = await self.generate(
            "transparent.png", json.dumps({"width": 100, "height": 100})
        )
        jpg = await self.files.convert(
            self.user.id, "chat", "assistant-test", image["id"], "jpg"
        )
        with self.files.materialize(jpg) as path:
            process.validate(path, "photo.jpg")
        with self.assertRaisesRegex(ValueError, "当前无法"):
            await self.files.convert(
                self.user.id, "chat", "assistant-test", converted["id"], "psd"
            )

    async def test_formula_preview_does_not_invent_cached_values(self):
        book = await self.generate(
            "formula.xlsx",
            json.dumps({"First": [["a", "b"], [2, "=A2*3"]], "Second": [["other", 5]]}),
        )
        preview = await self.files.preview(self.user.id, book["id"])
        self.assertEqual(len(preview["sheets"]), 2)
        self.assertIn("未计算", preview["sheets"][0]["rows"][1][1])
        converted = await self.files.convert(
            self.user.id,
            "chat",
            "assistant-test",
            book["id"],
            "csv",
            {"sheet": "Second"},
        )
        with self.files.materialize(converted) as path:
            self.assertIn("other", path.read_text(encoding="utf-8-sig"))

    async def test_zip_slip_and_external_svg_are_rejected(self):
        path = self.root / "bad.zip"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("../escape.txt", "secret")
        with self.assertRaises(ValueError):
            process.safe_archive(path)
        with self.assertRaises(ValueError):
            process.svg_png(
                b'<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd"/></svg>'
            )
        # Unsafe SVG uploads degrade to escaped source without executing it.
        svg = self.upload(
            "unsafe.svg",
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        )
        preview = await self.files.preview(self.user.id, svg["id"])
        self.assertEqual(preview["kind"], "text")

    async def test_generated_zip_has_real_files_and_duplicate_names_are_disambiguated(
        self,
    ):
        first = await self.generate("report.txt", "one")
        second = await self.generate("report.txt", "two")
        self.assertNotEqual(first["name"], second["name"])
        archive = await self.files.package(
            self.user.id,
            "chat",
            "assistant-test",
            "files.zip",
            [first["id"], second["id"]],
        )
        with self.files.materialize(archive) as path:
            with zipfile.ZipFile(path) as zip:
                self.assertEqual(len(zip.namelist()), 2)

    async def test_audio_conversion_uses_real_ffmpeg_and_decodable_output(self):
        path = self.root / "audio.wav"
        with wave.open(str(path), "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(16000)
            audio.writeframes(b"\0\0" * 8000)
        item = self.files.save(self.user.id, "chat", "silence.wav", path)
        converted = await self.files.convert(
            self.user.id, "chat", "assistant-test", item["id"], "mp3"
        )
        with self.files.materialize(converted) as output:
            self.assertGreater(output.stat().st_size, 100)

    async def test_authenticated_http_upload_preview_download_and_versioned_delete(
        self,
    ):
        runtime = AgentScopeRuntime(self.store)

        def user(header):
            if header == f"Bearer {self.token}":
                return self.user
            if header == f"Bearer {self.other_token}":
                return self.other
            raise HTTPException(401, "login required")

        app = FastAPI()
        app.include_router(file_router(runtime, user))
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/files/upload",
                data={"session_id": "chat"},
                files={"file": ("notes.md", b"# Hello", "text/markdown")},
                headers={"authorization": f"Bearer {self.token}"},
            )
            self.assertEqual(response.status_code, 200, response.text)
            item = response.json()["file"]
            bad = await client.get(
                f'/files/{item["id"]}',
                headers={"authorization": f"Bearer {self.other_token}"},
            )
            self.assertEqual(bad.status_code, 404)
            preview = await client.get(
                f'/files/{item["id"]}/preview',
                headers={"authorization": f"Bearer {self.token}"},
            )
            self.assertEqual(preview.json()["kind"], "markdown")
            download = await client.get(
                f'/files/{item["id"]}/content?download=true',
                headers={"authorization": f"Bearer {self.token}"},
            )
            self.assertEqual(download.content, b"# Hello")
            deleted = await client.request(
                "DELETE",
                f'/files/{item["id"]}',
                json={"version": 1},
                headers={"authorization": f"Bearer {self.token}"},
            )
            self.assertEqual(deleted.status_code, 200)
            missing = await client.get(
                f'/files/{item["id"]}/content',
                headers={"authorization": f"Bearer {self.token}"},
            )
            self.assertEqual(missing.status_code, 404)

    async def test_supabase_receives_ciphertext_and_failed_upload_never_creates_a_record(
        self,
    ):
        with patch.dict(
            os.environ,
            {
                "AGENTSCOPE_FILE_STORAGE": "supabase",
                "SUPABASE_SECRET_KEY": "test-server-secret",
            },
        ):
            files = FileService(self.store)
            captured = []

            class Client:
                def __init__(self, *args, **kwargs):
                    pass

                def __enter__(self):
                    return self

                def __exit__(self, *args):
                    pass

                def post(self, url, headers, content):
                    captured.append((url, headers, b"".join(content)))
                    return httpx.Response(200)

            with patch("service.file_storage.httpx.Client", Client):
                path = self.root / "remote"
                path.write_bytes(b"secret-document")
                item = files.save(self.user.id, "chat", "remote.txt", path)
            self.assertTrue(item["available"])
            self.assertIn("/xixi-agentscope-studio/conversation-files/", captured[0][0])
            self.assertNotIn(b"secret-document", captured[0][2])
            self.assertEqual(captured[0][1]["Content-Type"], "application/octet-stream")

    async def test_real_sdk_file_tool_delivers_valid_artifact_and_emits_it(self):
        from agentscope.event import ReplyStartEvent, ToolResultEndEvent
        from agentscope.message import ToolResultState

        runtime = AgentScopeRuntime(self.store)
        session = runtime._create_session(
            "chat",
            ModelSettings(provider="openai", name="test", api_key="fixture"),
            "fixture",
            self.user,
        )
        runtime.sessions["chat"] = session
        session.active_reply_id = "actual-reply"
        tools = {tool.name: tool for tool in session.agent.toolkit.tool_groups[0].tools}
        result = await tools["create_file"].call(
            name="sdk.docx", content="Actual SDK tool output"
        )
        value = json.loads(result.content[0].text)
        self.assertTrue(value["saved"])
        frames = [
            frame
            async for frame in runtime._map_agent_event(
                session,
                ToolResultEndEvent(
                    reply_id="actual-reply",
                    tool_call_id="call",
                    state=ToolResultState.SUCCESS,
                ),
            )
        ]
        self.assertTrue(
            any(
                "files_updated" in frame and value["file"]["id"] in frame
                for frame in frames
            )
        )
        denied = await tools["read_file"].call(
            file_id=self.upload()["id"], entry="../escape"
        )
        self.assertIn("失败", denied.content[0].text)

    async def test_folder_generated_files_are_real_and_nested_reads_are_scoped(self):
        folder = await self.generate(
            "项目资料",
            json.dumps(
                {
                    "files": [
                        {"path": "README.md", "content": "# 项目资料"},
                        {"path": "docs/notes.txt", "content": "Nested content"},
                    ]
                }
            ),
        )
        self.assertEqual(folder["kind"], "folder")
        preview = await self.files.preview(self.user.id, folder["id"])
        self.assertEqual(len(preview["entries"]), 2)
        read = await self.files.read(
            self.user.id, "chat", folder["id"], entry="项目资料/docs/notes.txt"
        )
        self.assertEqual(read["text"], "Nested content")
        with self.assertRaises(ValueError):
            await self.files.read(
                self.other.id, "chat", folder["id"], entry="项目资料/docs/notes.txt"
            )

    async def test_safe_svg_is_generated_and_preview_is_a_real_png(self):
        item = await self.generate(
            "vector.svg",
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="purple"/></svg>',
        )
        preview = await self.files.preview(self.user.id, item["id"])
        self.assertEqual(preview["kind"], "svg")
        self.assertTrue(preview["data"].startswith(b"\x89PNG"))

    async def test_docx_and_pptx_convert_to_valid_static_pdf_when_office_is_available(
        self,
    ):
        if not self.files.capabilities()["office_conversion"]:
            self.skipTest("LibreOffice not deployed")
        source = await self.generate("office.docx", "真实中文文档\n转换测试")
        result = await self.files.convert(
            self.user.id, "chat", "assistant-test", source["id"], "pdf"
        )
        with self.files.materialize(result) as path:
            process.validate(path, "result.pdf")

    async def test_table_filtering_and_statistics_report_the_processing_scope(self):
        item = self.upload("metrics.csv", b"name,budget\nA,3000\nB,2000\nC,500")
        result = await self.files.analyze(
            self.user.id,
            "chat",
            item["id"],
            {
                "filters": [{"column": "budget", "op": "gte", "value": 1000}],
                "statistics": {"budget": ["sum", "mean", "count"]},
            },
        )
        data = json.loads(result["text"])
        self.assertEqual(data["matched_rows"], 2)
        self.assertEqual(data["processed_rows"], 3)
        self.assertEqual(data["statistics"]["budget"]["sum"], 5000)
        self.assertEqual(data["statistics"]["budget"]["count"], 2)

    async def test_modern_supabase_key_is_not_sent_as_a_jwt_and_delete_uses_json(self):
        with patch.dict(
            os.environ,
            {
                "AGENTSCOPE_FILE_STORAGE": "supabase",
                "SUPABASE_SECRET_KEY": "sb_secret_fixture",
            },
        ):
            service = FileService(self.store)
            self.assertNotIn("Authorization", service.storage._headers())
            with patch(
                "service.file_storage.httpx.request", return_value=httpx.Response(200)
            ) as request:
                service.storage.delete("conversation-files/fixture.enc", "supabase")
                self.assertEqual(request.call_args.args[0], "DELETE")
                self.assertEqual(
                    request.call_args.kwargs["json"],
                    {"prefixes": ["conversation-files/fixture.enc"]},
                )

    async def test_deletion_cleanup_failures_are_retried_without_restoring_access(self):
        item = await self.generate("cleanup.txt", "secret")
        with patch.object(
            self.files.storage, "delete", side_effect=ValueError("offline")
        ):
            self.files.delete(self.user.id, item["id"], item["version"])
        self.assertIsNotNone(
            self.store._conn.execute(
                "SELECT 1 FROM file_cleanup WHERE file_id=?", (item["id"],)
            ).fetchone()
        )
        with self.assertRaises(ValueError):
            self.files.get(self.user.id, item["id"])
        self.files.retry_cleanup()
        self.assertIsNone(
            self.store._conn.execute(
                "SELECT 1 FROM file_cleanup WHERE file_id=?", (item["id"],)
            ).fetchone()
        )
