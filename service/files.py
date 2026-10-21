"""Tenant/session scoped file identities, immutable versions and validated delivery."""

from __future__ import annotations
import asyncio
import hashlib
import importlib.util
import json
import mimetypes
import os
import shutil
import tempfile
import uuid
import zipfile
from contextlib import contextmanager, ExitStack
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath
from .file_storage import ObjectStorage
from . import file_processing as processing
from .store import utc_now

UNAVAILABLE = "文件暂无法查看。"
UPLOAD_EXTENSIONS = (
    processing.TEXT
    | processing.IMAGES
    | processing.AUDIO
    | processing.VIDEO
    | set(
        "pdf doc docx docm odt rtf epub ppt pptx pptm odp csv tsv xls xlsx xlsm ods zip 7z rar tar gz tgz bz2 xz heic heif psd raw cr2 xmind exe dmg apk ico jfif apng mjs cjs mts cts pyi pyw ipynb scss sass less bash zsh fish ksh cc cxx hpp hh cs php rb swift kt kts dart vue svelte astro scala lua r jl pl pm ps1 bat cmd gradle lock diff patch cmake tf hcl proto graphql gql properties".split()
    )
)


class FileService:
    def __init__(self, store):
        self.store = store
        self.storage = ObjectStorage(store.db_path.parent)
        with store._lock:
            store._conn.executescript("""
            CREATE TABLE IF NOT EXISTS file_cleanup (file_id TEXT PRIMARY KEY, pending_json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS studio_files (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
                message_id TEXT, name TEXT NOT NULL, kind TEXT NOT NULL, origin TEXT NOT NULL,
                mime TEXT NOT NULL, size INTEGER NOT NULL, version INTEGER NOT NULL,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL,
                deleted_at TEXT, source_id TEXT, notice TEXT NOT NULL DEFAULT '');
            CREATE INDEX IF NOT EXISTS idx_studio_files_scope ON studio_files(user_id, session_id, updated_at);
            CREATE TABLE IF NOT EXISTS studio_file_deliveries (file_id TEXT NOT NULL, message_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(file_id,message_id));
            INSERT OR IGNORE INTO studio_file_deliveries SELECT id,message_id,created_at FROM studio_files WHERE message_id IS NOT NULL;
            CREATE TABLE IF NOT EXISTS studio_file_versions (
                file_id TEXT NOT NULL, version INTEGER NOT NULL, object_key TEXT NOT NULL,
                storage TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL,
                created_at TEXT NOT NULL, PRIMARY KEY(file_id,version));
            """)

    def assert_scope(self, user_id, session_id):
        row = self.store._conn.execute(
            "SELECT user_id FROM sessions WHERE id=?", (session_id,)
        ).fetchone()
        if row and row["user_id"] != user_id:
            raise ValueError(UNAVAILABLE)
        if (
            not session_id
            or len(session_id) > 150
            or any(c in session_id for c in "/\\\x00")
        ):
            raise ValueError(UNAVAILABLE)

    def get(self, user_id, file_id, session_id=None, *, allow_unavailable=False):
        with self.store._lock:
            row = self.store._conn.execute(
                "SELECT * FROM studio_files WHERE id=? AND user_id=?",
                (file_id, user_id),
            ).fetchone()
        if not row or (session_id is not None and row["session_id"] != session_id):
            raise ValueError(UNAVAILABLE)
        self.assert_scope(user_id, row["session_id"])
        result = dict(row)
        bound_exists = not result["message_id"] or bool(
            self.store._conn.execute(
                "SELECT 1 FROM sessions WHERE id=? AND user_id=?",
                (result["session_id"], user_id),
            ).fetchone()
        )
        result["available"] = (
            bound_exists
            and not result["deleted_at"]
            and datetime.fromisoformat(result["expires_at"])
            > datetime.now(timezone.utc)
        )
        if not result["available"] and not allow_unavailable:
            raise ValueError(UNAVAILABLE)
        return result

    def public(self, record):
        return {
            key: record.get(key)
            for key in (
                "id",
                "session_id",
                "message_id",
                "name",
                "kind",
                "origin",
                "mime",
                "size",
                "version",
                "created_at",
                "updated_at",
                "expires_at",
                "source_id",
                "notice",
                "available",
            )
        }

    def list(self, user_id, session_id, artifacts=False):
        self.assert_scope(user_id, session_id)
        with self.store._lock:
            rows = self.store._conn.execute(
                "SELECT id FROM studio_files WHERE user_id=? AND session_id=? AND deleted_at IS NULL ORDER BY updated_at DESC, name ASC",
                (user_id, session_id),
            ).fetchall()
        items = []
        for row in rows:
            item = self.get(user_id, row["id"], session_id, allow_unavailable=True)
            if item["available"] and (not artifacts or item["origin"] == "artifact"):
                items.append(self.public(item))
        return items

    def message_files(self, user_id, session_id, message_id):
        rows = self.store._conn.execute(
            "SELECT f.id FROM studio_files f JOIN studio_file_deliveries d ON d.file_id=f.id WHERE f.user_id=? AND f.session_id=? AND d.message_id=? ORDER BY d.created_at ASC",
            (user_id, session_id, message_id),
        ).fetchall()
        return [
            self.public(
                self.get(user_id, row["id"], session_id, allow_unavailable=True)
            )
            for row in rows
        ]

    def bind(self, user_id, session_id, ids, message_id):
        self.validate_references(user_id, session_id, ids)
        with self.store._lock:
            for file_id in set(ids):
                self.store._conn.execute(
                    "UPDATE studio_files SET message_id=? WHERE id=? AND user_id=? AND origin='upload' AND message_id IS NULL",
                    (message_id, file_id, user_id),
                )
                self.store._conn.execute(
                    "INSERT OR IGNORE INTO studio_file_deliveries VALUES (?,?,?)",
                    (file_id, message_id, utc_now()),
                )
            self.store._conn.commit()

    def validate_references(self, user_id, session_id, ids):
        if len(ids) > 100:
            raise ValueError("一次最多引用 100 个文件。")
        for file_id in set(ids):
            self.get(user_id, file_id, session_id)

    @contextmanager
    def materialize(self, item, version=None):
        with self.store._lock:
            row = self.store._conn.execute(
                "SELECT object_key,storage FROM studio_file_versions WHERE file_id=? AND version=?",
                (item["id"], version or item["version"]),
            ).fetchone()
        if not row:
            raise ValueError(UNAVAILABLE)
        with self.storage.materialize(row["object_key"], row["storage"]) as plain:
            named = plain.with_name("document" + Path(item["name"]).suffix)
            plain.rename(named)
            yield named

    def save(
        self,
        user_id,
        session_id,
        name,
        path,
        *,
        origin="upload",
        message_id=None,
        replace_id=None,
        expected_version=None,
        source_id=None,
        notice="",
        kind="file",
    ):
        self.assert_scope(user_id, session_id)
        name = name.strip()
        if (
            not name
            or len(name) > 240
            or "/" in name
            or "\\" in name
            or any(ord(c) < 32 for c in name)
        ):
            raise ValueError("文件名无效。")
        if processing.ext(name) not in UPLOAD_EXTENSIONS and name not in {
            "Dockerfile",
            "Makefile",
            ".env",
        }:
            raise ValueError("不支持此文件类型。")
        size = path.stat().st_size
        if size > (
            100_000_000 if processing.ext(name) in processing.IMAGES else 1_000_000_000
        ):
            raise ValueError("文件超出大小限制。")
        previous = self.get(user_id, replace_id, session_id) if replace_id else None
        if previous and (previous["origin"] != "artifact" or origin != "artifact"):
            raise ValueError("用户原件不能被覆盖，请生成衍生文件。")
        if previous and previous["version"] != expected_version:
            raise ValueError("文件已更新，请重试。")
        if previous and processing.ext(name) != processing.ext(previous["name"]):
            raise ValueError("修改文件时不能更改格式，请转换为新文件。")
        # New names are unique within a conversation; updates retain the identity.
        if not previous and origin == "artifact":
            base = Path(name)
            count = 1
            candidate = name
            while self.store._conn.execute(
                "SELECT 1 FROM studio_files WHERE user_id=? AND session_id=? AND name=? AND deleted_at IS NULL",
                (user_id, session_id, candidate),
            ).fetchone():
                count += 1
                candidate = f"{base.stem} ({count}){base.suffix}"
            name = candidate
        identity = previous["id"] if previous else uuid.uuid4().hex
        version = previous["version"] + 1 if previous else 1
        now = utc_now()
        expires = (
            previous["expires_at"]
            if previous
            else (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        )
        key = (
            f"conversation-files/{user_id}/{identity}/{version}-{uuid.uuid4().hex}.enc"
        )
        digest = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(chunk)
        self.storage.put(
            key, path
        )  # No delivery record exists until storage acknowledges success.
        now = utc_now()
        if not previous:
            expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        try:
            with self.store._lock:
                if previous:
                    changed = self.store._conn.execute(
                        "UPDATE studio_files SET name=?,size=?,version=?,updated_at=?,message_id=?,notice=? WHERE id=? AND version=? AND deleted_at IS NULL",
                        (
                            name,
                            size,
                            version,
                            now,
                            message_id,
                            notice,
                            identity,
                            expected_version,
                        ),
                    ).rowcount
                    if not changed:
                        raise ValueError("文件已更新，请重试。")
                else:
                    self.store._conn.execute(
                        "INSERT INTO studio_files (id,user_id,session_id,message_id,name,kind,origin,mime,size,version,created_at,updated_at,expires_at,source_id,notice) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (
                            identity,
                            user_id,
                            session_id,
                            message_id,
                            name,
                            kind,
                            origin,
                            mimetypes.guess_type(name)[0] or "application/octet-stream",
                            size,
                            version,
                            now,
                            now,
                            expires,
                            source_id,
                            notice,
                        ),
                    )
                self.store._conn.execute(
                    "INSERT INTO studio_file_versions VALUES (?,?,?,?,?,?,?)",
                    (
                        identity,
                        version,
                        key,
                        self.storage.mode,
                        digest.hexdigest(),
                        size,
                        now,
                    ),
                )
                if message_id:
                    self.store._conn.execute(
                        "INSERT INTO studio_file_deliveries VALUES (?,?,?) ON CONFLICT(file_id,message_id) DO UPDATE SET created_at=excluded.created_at",
                        (identity, message_id, now),
                    )
                self.store._conn.commit()
        except Exception:
            self.store._conn.rollback()
            self.storage.delete(key, self.storage.mode)
            raise
        return self.public(self.get(user_id, identity, session_id))

    def delete(self, user_id, file_id, version):
        with self.store._lock:
            item = self.get(user_id, file_id)
            if item["kind"] == "folder":
                raise ValueError("文件夹整体删除暂不支持。")
            if version != item["version"]:
                raise ValueError("文件已更新，请重新确认删除。")
            versions = self.store._conn.execute(
                "SELECT object_key,storage FROM studio_file_versions WHERE file_id=?",
                (file_id,),
            ).fetchall()
            # Revoke first. Immutable ciphertext cleanup can be retried independently.
            self.store._conn.execute(
                "UPDATE studio_files SET deleted_at=? WHERE id=? AND version=?",
                (utc_now(), file_id, version),
            )
            self.store._conn.commit()
        failures = []
        for entry in versions:
            try:
                self.storage.delete(entry["object_key"], entry["storage"])
            except Exception:
                failures.append(entry["object_key"])
        if failures:
            # Persist cleanup work, without ever making the file accessible again.
            with self.store._lock:
                self.store._conn.execute(
                    "CREATE TABLE IF NOT EXISTS file_cleanup (file_id TEXT PRIMARY KEY, pending_json TEXT NOT NULL)"
                )
                self.store._conn.execute(
                    "INSERT OR REPLACE INTO file_cleanup VALUES (?,?)",
                    (file_id, json.dumps(failures)),
                )
                self.store._conn.commit()
        return {"deleted": True}

    async def read(self, user_id, session_id, file_id, offset=0, limit=12000, entry=""):
        item = self.get(user_id, file_id, session_id)
        with self.materialize(item) as path:
            if entry:
                if processing.ext(item["name"]) != "zip" and item["kind"] != "folder":
                    raise ValueError("仅 ZIP 或文件夹支持内部文件路径。")
                entries = processing.safe_archive(path)
                target = next(
                    (
                        value
                        for value in entries
                        if value["name"] == entry and not value["directory"]
                    ),
                    None,
                )
                if not target:
                    raise ValueError("目录中没有此文件。")
                with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(
                    path
                ) as archive:
                    local = Path(tmp) / Path(entry).name
                    local.write_bytes(archive.read(entry))
                    result = await processing.extract(
                        local, local.name, offset=max(0, offset), limit=limit
                    )
            else:
                result = await processing.extract(
                    path, item["name"], offset=max(0, offset), limit=limit
                )
        return {"file": self.public(item), **result}

    async def analyze(self, user_id, session_id, file_id, options):
        item = self.get(user_id, file_id, session_id)
        if item["size"] > processing.MAX_PARSE:
            raise ValueError("文件超出当前表格分析范围（32 MB）。")
        import pandas as pd
        import math

        with self.materialize(item) as path:
            suffix = processing.ext(item["name"])
            if suffix in {"csv", "tsv"}:
                text = processing.decode(path.read_bytes())
                import io

                frame = await asyncio.to_thread(
                    pd.read_csv,
                    io.StringIO(text),
                    sep="\t" if suffix == "tsv" else ",",
                    nrows=10001,
                )
            elif suffix in {"xlsx", "xlsm", "xls", "ods"}:
                if suffix in {"xlsx", "xlsm", "ods"}:
                    processing.safe_archive(path)
                frame = await asyncio.to_thread(
                    pd.read_excel, path, sheet_name=options.get("sheet", 0), nrows=10001
                )
            else:
                raise ValueError("此文件不是可分析的表格。")
        truncated = len(frame) > 10000
        frame = frame.iloc[:10000].copy()
        frame.columns = [str(value) for value in frame.columns]
        processed = len(frame)
        for condition in options.get("filters", []):
            column = condition["column"]
            operator = condition.get("op", "eq")
            value = condition.get("value")
            if column not in frame.columns:
                raise ValueError("筛选列不存在。")
            series = frame[column]
            if operator == "eq":
                mask = series.astype(str) == str(value)
            elif operator == "ne":
                mask = series.astype(str) != str(value)
            elif operator == "contains":
                mask = series.astype(str).str.contains(str(value), regex=False)
            else:
                numeric = pd.to_numeric(series, errors="coerce")
                threshold = float(value)
                if not math.isfinite(threshold):
                    raise ValueError("比较值无效。")
                if operator == "gt":
                    mask = numeric > threshold
                elif operator == "gte":
                    mask = numeric >= threshold
                elif operator == "lt":
                    mask = numeric < threshold
                elif operator == "lte":
                    mask = numeric <= threshold
                else:
                    raise ValueError("筛选运算符无效。")
            frame = frame[mask]
        statistics = {}
        for column, operations in options.get("statistics", {}).items():
            if column not in frame.columns:
                raise ValueError("统计列不存在。")
            numbers = pd.to_numeric(frame[column], errors="coerce")
            values = {}
            for operation in operations:
                if operation == "count":
                    result = int(numbers.count())
                elif operation == "sum":
                    result = numbers.sum(min_count=1)
                elif operation == "mean":
                    result = numbers.mean()
                elif operation == "min":
                    result = numbers.min()
                elif operation == "max":
                    result = numbers.max()
                else:
                    raise ValueError("统计运算符无效。")
                values[operation] = None if pd.isna(result) else float(result)
            statistics[column] = values
        payload = {
            "columns": list(frame.columns),
            "rows": json.loads(
                frame.head(500).to_json(
                    orient="values", force_ascii=False, date_format="iso"
                )
            ),
            "matched_rows": len(frame),
            "processed_rows": processed,
            "statistics": statistics,
            "notice": (
                "仅分析前 10000 行，统计范围不是完整文件。"
                if truncated
                else "结果最多展示 500 行；统计基于上述处理范围。"
            ),
        }
        return {
            "file": self.public(item),
            "text": json.dumps(payload, ensure_ascii=False, allow_nan=False),
            "next_offset": None,
            "notice": payload["notice"],
        }

    async def generate(
        self,
        user_id,
        session_id,
        message_id,
        name,
        content,
        replace_id="",
        expected_version=None,
        source_id="",
    ):
        if len(content) > 2_000_000:
            raise ValueError("生成内容超出单次处理范围。")
        if (
            replace_id
            and self.get(user_id, replace_id, session_id)["origin"] == "upload"
        ):
            source_id = replace_id
            replace_id = ""
        if source_id:
            self.get(user_id, source_id, session_id)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / ("output." + processing.ext(name))
            if name.endswith("/") or not processing.ext(name):
                folder = name.rstrip("/")
                if "/" in folder or "\\" in folder or not folder:
                    raise ValueError("文件夹名称无效。")
                data = json.loads(content)
                entries = data.get("files", [])
                if not isinstance(entries, list) or len(entries) > 1000:
                    raise ValueError("文件夹最多 1000 个文件。")
                path = Path(tmp) / "folder.zip"
                with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
                    for entry in entries:
                        entry_path = entry["path"].replace("\\", "/")
                        parts = PurePosixPath(entry_path).parts
                        if (
                            not parts
                            or entry_path.startswith("/")
                            or ".." in parts
                            or len(parts) > 9
                        ):
                            raise ValueError("文件夹内部路径无效。")
                        inner = Path(tmp) / ("output." + processing.ext(entry_path))
                        await asyncio.to_thread(
                            processing.render,
                            Path(entry_path).name,
                            entry.get("content", ""),
                            inner,
                        )
                        processing.validate(inner, Path(entry_path).name)
                        archive.write(inner, f"{folder}/{entry_path}")
                processing.safe_archive(path)
                return self.save(
                    user_id,
                    session_id,
                    folder + ".zip",
                    path,
                    origin="artifact",
                    message_id=message_id,
                    kind="folder",
                )
            assets = {}
            try:
                data = json.loads(content)
            except ValueError:
                data = None

            def image_ids(node):
                if isinstance(node, dict):
                    if "file_id" in node:
                        yield node["file_id"]
                    for value in node.values():
                        yield from image_ids(value)
                elif isinstance(node, list):
                    for value in node:
                        yield from image_ids(value)

            with ExitStack() as stack:
                identities = set(image_ids(data))
                if len(identities) > 20:
                    raise ValueError("单次生成最多使用 20 个图片素材。")
                for identity in identities:
                    image = self.get(user_id, identity, session_id)
                    if image["size"] > processing.MAX_PARSE:
                        raise ValueError("图片素材超过当前 32 MB 处理范围。")
                    if (
                        not image["mime"].startswith("image/")
                        or processing.ext(image["name"]) == "svg"
                    ):
                        raise ValueError("仅支持会话中的普通图片资源。")
                    assets[identity] = stack.enter_context(self.materialize(image))
                await asyncio.to_thread(processing.render, name, content, path, assets)
            await asyncio.to_thread(processing.validate, path, name)
            return await asyncio.to_thread(
                self.save,
                user_id,
                session_id,
                name,
                path,
                origin="artifact",
                message_id=message_id,
                replace_id=replace_id or None,
                expected_version=expected_version,
                source_id=source_id or None,
            )

    async def convert(
        self, user_id, session_id, message_id, file_id, target, options=None
    ):
        item = self.get(user_id, file_id, session_id)
        target = target.lower().lstrip(".")
        if not target.isalnum() or len(target) > 10:
            raise ValueError("目标格式无效。")
        with self.materialize(item) as source, tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / ("output." + target)
            notice = await processing.convert(
                source, item["name"], target, output, options or {}
            )
            return self.save(
                user_id,
                session_id,
                Path(item["name"]).stem + "." + target,
                output,
                origin="artifact",
                message_id=message_id,
                source_id=file_id,
                notice=notice,
            )

    async def package(self, user_id, session_id, message_id, name, file_ids):
        self.validate_references(user_id, session_id, file_ids)
        if not name.lower().endswith(".zip"):
            raise ValueError("打包文件必须为 ZIP 格式。")
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "output.zip"
            used = set()
            total = 0
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
                for identity in file_ids:
                    item = self.get(user_id, identity, session_id)
                    total += item["size"]
                    if total > 256_000_000:
                        raise ValueError("打包内容超出 256 MB 处理范围。")
                    entry = item["name"]
                    index = 1
                    while entry in used:
                        index += 1
                        entry = f'{Path(item["name"]).stem} ({index}){Path(item["name"]).suffix}'
                    used.add(entry)
                    with self.materialize(item) as path:
                        if item["kind"] == "folder":
                            entries = processing.safe_archive(path)
                            with zipfile.ZipFile(path) as folder:
                                for member in entries:
                                    member_name = member["name"]
                                    if member_name in used:
                                        raise ValueError(
                                            "文件夹内部名称冲突，请先另存。"
                                        )
                                    used.add(member_name)
                                    archive.writestr(
                                        member_name, folder.read(member_name)
                                    )
                        else:
                            archive.write(path, entry)
            processing.validate(output, name)
            return self.save(
                user_id,
                session_id,
                name,
                output,
                origin="artifact",
                message_id=message_id,
            )

    async def preview(self, user_id, file_id, version=None):
        item = self.get(user_id, file_id)
        with self.materialize(item, version) as path:
            suffix = processing.ext(item["name"])
            if path.stat().st_size > processing.MAX_PARSE:
                return {
                    "kind": "unavailable",
                    "notice": "仅展示部分内容",
                    "file": self.public(item),
                }
            if suffix in {"csv", "tsv", "xlsx", "xlsm", "ods"}:
                result = await asyncio.to_thread(
                    processing.table_preview, path, item["name"]
                )
            elif suffix == "svg":
                try:
                    return {
                        "kind": "svg",
                        "data": processing.svg_png(path.read_bytes()),
                        "mime": "image/png",
                        "file": self.public(item),
                    }
                except Exception:
                    result = {
                        "kind": "text",
                        "text": processing.decode(path.read_bytes())[
                            : processing.MAX_TEXT
                        ],
                        "notice": "SVG 已按源码展示。",
                    }
            elif suffix in {"zip", "epub"} or item["kind"] == "folder":
                result = {
                    "kind": "directory",
                    "entries": processing.safe_archive(path),
                    "notice": "",
                }
            elif suffix in processing.TEXT:
                result = {
                    "kind": (
                        "html"
                        if suffix in {"html", "htm"}
                        else "markdown" if suffix in {"md", "markdown"} else "text"
                    ),
                    "text": processing.decode(path.read_bytes())[: processing.MAX_TEXT],
                    "notice": (
                        "仅展示部分内容"
                        if path.stat().st_size > processing.MAX_TEXT
                        else ""
                    ),
                }
            elif suffix in {"pptx", "ppt", "odp"}:
                with tempfile.TemporaryDirectory() as tmp:
                    output = Path(tmp) / "preview.pdf"
                    await asyncio.to_thread(
                        processing.office_convert, path, item["name"], "pdf", output
                    )
                    return {
                        "kind": "pdf",
                        "data": output.read_bytes(),
                        "mime": "application/pdf",
                        "file": self.public(item),
                        "notice": "静态预览不包含动画或交互。",
                    }
            elif suffix == "docx":
                processing.safe_archive(path)
                # External relationships are removed from the preview copy only.
                with tempfile.TemporaryDirectory() as tmp:
                    output = Path(tmp) / "safe.docx"
                    from lxml import etree

                    with zipfile.ZipFile(path) as src, zipfile.ZipFile(
                        output, "w", zipfile.ZIP_DEFLATED
                    ) as dst:
                        for entry in src.infolist():
                            data = src.read(entry.filename)
                            if entry.filename.endswith(".rels"):
                                root = etree.fromstring(
                                    data,
                                    etree.XMLParser(
                                        resolve_entities=False, no_network=True
                                    ),
                                )
                                for relation in list(root):
                                    if relation.get("TargetMode") == "External":
                                        root.remove(relation)
                                data = etree.tostring(root)
                            dst.writestr(entry, data)
                    return {
                        "kind": "docx",
                        "data": output.read_bytes(),
                        "mime": item["mime"],
                        "file": self.public(item),
                        "notice": "基础只读预览，复杂排版可能变化。",
                    }
            else:
                result = {
                    "kind": (
                        "media"
                        if suffix
                        in processing.IMAGES
                        | processing.AUDIO
                        | processing.VIDEO
                        | {"pdf"}
                        else "unavailable"
                    )
                }
        if result.get("kind") == "html":
            result["text"] = self.html_resources(user_id, item, result["text"])
        return {**result, "file": self.public(item)}

    def html_resources(self, user_id, item, text):
        from bs4 import BeautifulSoup
        import base64
        from urllib.parse import urlsplit

        soup = BeautifulSoup(text, "html.parser")
        for base in soup.find_all("base"):
            base.decompose()
        for node in soup.find_all(["img", "source", "video", "audio", "link"]):
            attribute = "href" if node.name == "link" else "src"
            target = node.get(attribute, "")
            if not target or target.startswith("data:"):
                continue
            identity = (
                target.removeprefix("studio-file:")
                if target.startswith("studio-file:")
                else None
            )
            if not identity:
                path = urlsplit(target).path
                if (
                    urlsplit(target).scheme
                    or target.startswith("//")
                    or path.startswith("/")
                    or ".." in PurePosixPath(path).parts
                ):
                    continue
                record = self.store._conn.execute(
                    "SELECT id FROM studio_files WHERE user_id=? AND session_id=? AND name=? AND deleted_at IS NULL",
                    (user_id, item["session_id"], path),
                ).fetchone()
                identity = record["id"] if record else None
            if not identity:
                continue
            try:
                resource = self.get(user_id, identity, item["session_id"])
                if resource["size"] > 2_000_000:
                    continue
                with self.materialize(resource) as source:
                    data = source.read_bytes()
                if node.name == "link" and processing.ext(resource["name"]) == "css":
                    style = soup.new_tag("style")
                    style.string = processing.decode(data)
                    node.replace_with(style)
                elif resource["mime"].startswith("image/"):
                    if processing.ext(resource["name"]) == "svg":
                        data = processing.svg_png(data)
                        mime = "image/png"
                    else:
                        mime = resource["mime"]
                    node[attribute] = (
                        f"data:{mime};base64," + base64.b64encode(data).decode()
                    )
            except (ValueError, OSError):
                continue
        return str(soup)

    def thumbnail(self, user_id, file_id):
        item = self.get(user_id, file_id)
        from PIL import Image
        import io

        with self.materialize(item) as path:
            suffix = processing.ext(item["name"])
            if suffix == "svg":
                image = Image.open(io.BytesIO(processing.svg_png(path.read_bytes())))
            elif suffix in processing.IMAGES:
                image = Image.open(path)
            elif suffix in processing.VIDEO:
                import subprocess

                with tempfile.TemporaryDirectory() as tmp:
                    frame = Path(tmp) / "frame.jpg"
                    result = subprocess.run(
                        [
                            processing.ffmpeg(),
                            "-nostdin",
                            "-y",
                            "-ss",
                            "0",
                            "-i",
                            str(path),
                            "-frames:v",
                            "1",
                            "-vf",
                            "scale=512:-1",
                            str(frame),
                        ],
                        capture_output=True,
                        timeout=45,
                    )
                    if result.returncode or not frame.exists():
                        raise ValueError(UNAVAILABLE)
                    image = Image.open(frame)
                    image.load()
            else:
                raise ValueError(UNAVAILABLE)
            image.thumbnail((512, 512))
            output = io.BytesIO()
            image.convert("RGBA").save(output, "PNG")
            return output.getvalue()

    def retry_cleanup(self):
        with self.store._lock:
            pending = self.store._conn.execute(
                "SELECT * FROM file_cleanup LIMIT 100"
            ).fetchall()
        for row in pending:
            remaining = []
            for key in json.loads(row["pending_json"]):
                entry = self.store._conn.execute(
                    "SELECT storage FROM studio_file_versions WHERE object_key=?",
                    (key,),
                ).fetchone()
                try:
                    if entry:
                        self.storage.delete(key, entry["storage"])
                except Exception:
                    remaining.append(key)
            with self.store._lock:
                if remaining:
                    self.store._conn.execute(
                        "UPDATE file_cleanup SET pending_json=? WHERE file_id=?",
                        (json.dumps(remaining), row["file_id"]),
                    )
                else:
                    self.store._conn.execute(
                        "DELETE FROM file_cleanup WHERE file_id=?", (row["file_id"],)
                    )
                self.store._conn.commit()

    async def maintenance(self):
        while True:
            try:
                await asyncio.to_thread(self.retry_cleanup)
            except Exception:
                pass
            await asyncio.sleep(60)

    def capabilities(self):
        return {
            "storage": self.storage.mode,
            "expires_days": 30,
            "preview_max_bytes": processing.MAX_PARSE,
            "vision_input": os.getenv("AGENTSCOPE_FILE_VISION_INPUT", "false").lower()
            == "true",
            "generation": [
                "txt",
                "md",
                "html",
                "code",
                "json",
                "yaml",
                "xml",
                "pdf",
                "docx",
                "pptx",
                "csv",
                "tsv",
                "xlsx",
                "svg",
                "png",
                "jpg",
                "webp",
                "gif",
                "zip",
                "folder",
            ],
            "office_conversion": bool(
                os.getenv("AGENTSCOPE_SOFFICE")
                or shutil.which("soffice")
                or shutil.which("libreoffice")
            ),
            "ocr": bool(
                (os.getenv("AGENTSCOPE_OCR_URL") and os.getenv("AGENTSCOPE_FILE_KEY"))
                or importlib.util.find_spec("rapidocr_onnxruntime")
            ),
            "transcription": bool(importlib.util.find_spec("faster_whisper")),
        }
