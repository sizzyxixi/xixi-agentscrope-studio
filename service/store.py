from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class StoredPlan:
    id: str
    plan: str
    created_at: str


@dataclass(frozen=True)
class KnowledgeHit:
    path: str
    title: str
    snippet: str
    score: int


@dataclass(frozen=True)
class AuthUser:
    id: str
    username: str
    created_at: str = ""


@dataclass(frozen=True)
class ModelSetting:
    id: str
    user_id: str
    provider: str
    display_name: str
    model_name: str
    endpoint: str
    api_key: str
    is_default: bool
    created_at: str
    updated_at: str


class StudioStore:
    """SQLite-backed state and lightweight local-document retrieval.

    This is deliberately small and honest: it only stores data produced by the
    running service and only retrieves snippets from real project files.
    """

    def __init__(
        self,
        db_path: str | Path | None = None,
        project_root: str | Path | None = None,
    ) -> None:
        self.project_root = Path(project_root or Path(__file__).resolve().parents[1])
        self.db_path = Path(
            db_path
            or os.getenv("AGENTSCOPE_STATE_DB")
            or self.project_root / "service" / "state" / "agentscope_studio.sqlite3",
        )
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        database_url = os.getenv("DATABASE_URL", "").strip() if db_path is None else ""
        self.backend = "postgresql" if database_url else "sqlite"
        if database_url:
            from .postgres import PostgresConnection
            self._conn = PostgresConnection(database_url)
            from .token_usage import TokenUsageLedger
            self.token_usage = TokenUsageLedger(self)
        else:
            self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self._conn.row_factory = sqlite3.Row
            self._migrate()

    def _migrate(self) -> None:
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    summary TEXT NOT NULL DEFAULT ''
                )
                """,
            )
            self._ensure_column("sessions", "user_id", "TEXT")
            self._ensure_column("sessions", "title", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column("sessions", "pinned", "INTEGER NOT NULL DEFAULT 0")
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """,
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS auth_tokens (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
                """,
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_onboarding (
                    user_id TEXT PRIMARY KEY,
                    bootstrap_seen_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
                """,
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS model_settings (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    model_name TEXT NOT NULL,
                    endpoint TEXT NOT NULL DEFAULT '',
                    api_key TEXT NOT NULL,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
                """,
            )
            self._conn.execute(
                """
                CREATE INDEX IF NOT EXISTS model_settings_user_idx
                ON model_settings(user_id, is_default DESC, updated_at DESC)
                """,
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS plans (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    plan TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id)
                )
                """,
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id)
                )
                """,
            )
            self._conn.execute(
                """
                CREATE INDEX IF NOT EXISTS messages_session_created_idx
                ON messages(session_id, created_at ASC)
                """,
            )
            self._ensure_column("messages", "parts_json", "TEXT NOT NULL DEFAULT '[]'")
            self._ensure_column("messages", "activity_json", "TEXT")
            self._conn.execute(
                """
                CREATE INDEX IF NOT EXISTS plans_session_created_idx
                ON plans(session_id, created_at DESC)
                """,
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS runtime_events (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    detail TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id)
                )
                """,
            )
            self._conn.execute(
                """
                CREATE INDEX IF NOT EXISTS runtime_events_session_created_idx
                ON runtime_events(session_id, created_at DESC)
                """,
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS knowledge_docs (
                    id TEXT PRIMARY KEY,
                    path TEXT NOT NULL UNIQUE,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    content_hash TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """,
            )
            self._conn.commit()
        self._ensure_column("messages", "resources_json", "TEXT NOT NULL DEFAULT '[]'")
        from .token_usage import TokenUsageLedger
        self.token_usage = TokenUsageLedger(self)

    def has_seen_bootstrap(self, user_id: str) -> bool:
        with self._lock:
            return self._conn.execute(
                "SELECT 1 FROM user_onboarding WHERE user_id = ?", (user_id,),
            ).fetchone() is not None

    def mark_bootstrap_seen(self, user_id: str) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR IGNORE INTO user_onboarding VALUES (?, ?)",
                (user_id, utc_now()),
            )
            self._conn.commit()

    def _ensure_column(self, table: str, column: str, definition: str) -> None:
        columns = {
            row["name"]
            for row in self._conn.execute(f"PRAGMA table_info({table})").fetchall()
        }
        if column not in columns:
            self._conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def ensure_session(self, session_id: str, user_id: str | None = None) -> None:
        now = utc_now()
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO sessions (id, user_id, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
                """,
                (session_id, user_id, now, now),
            )
            if user_id:
                self._conn.execute(
                    "UPDATE sessions SET user_id = ? WHERE id = ? AND user_id IS NULL",
                    (user_id, session_id),
                )
            self._conn.commit()

    def add_plan(self, session_id: str, plan: str) -> StoredPlan:
        self.ensure_session(session_id)
        stored = StoredPlan(id=uuid.uuid4().hex, plan=plan, created_at=utc_now())
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO plans (id, session_id, plan, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (stored.id, session_id, stored.plan, stored.created_at),
            )
            self._touch_session(session_id)
            self._conn.commit()

        return stored

    def list_plans(self, session_id: str, limit: int = 5) -> list[StoredPlan]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT id, plan, created_at
                FROM plans
                WHERE session_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()

        return [
            StoredPlan(
                id=row["id"],
                plan=row["plan"],
                created_at=row["created_at"],
            )
            for row in rows
        ]

    def count_plans(self, session_id: str) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) AS count FROM plans WHERE session_id = ?",
                (session_id,),
            ).fetchone()

        return int(row["count"])

    def add_message(self, session_id: str, role: str, content: str, *, parts: list | None = None, message_id: str | None = None, resources: list | None = None, activity: dict | None = None) -> None:
        content = content.strip()
        if not content and not parts and activity is None:
            return

        self.ensure_session(session_id)
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO messages (id, session_id, role, content, created_at, parts_json, activity_json, resources_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET content=excluded.content, parts_json=excluded.parts_json,
                    activity_json=COALESCE(excluded.activity_json, messages.activity_json)
                """,
                (message_id or uuid.uuid4().hex, session_id, role, content, utc_now(), json.dumps(parts or [], ensure_ascii=False), json.dumps(activity) if activity is not None else None, json.dumps(resources or [], ensure_ascii=False)),
            )
            self._touch_session(session_id)
            self._conn.commit()

    def list_messages(self, session_id: str, limit: int = 100) -> list[dict[str, str]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT id, role, content, created_at, parts_json, activity_json, resources_json
                FROM messages
                WHERE session_id = ?
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()

        return [
            {
                "id": row["id"],
                "role": row["role"],
                "content": row["content"],
                "created_at": row["created_at"],
                "parts": json.loads(row["parts_json"]),
                "resources": json.loads(row["resources_json"]),
                "activity": json.loads(row["activity_json"]) if row["activity_json"] else None,
                "token_usage": self.token_usage.for_message(session_id, row["id"]),
            }
            for row in rows
        ]

    def request_stream_stop(self, session_id: str, request_id: str) -> None:
        # The existing durable event store also delivers cancellation across workers.
        self.save_event(session_id, "stream_stop", {"title": request_id, "detail": "用户请求停止本轮响应。"})

    def stream_stop_requested(self, session_id: str, request_id: str) -> bool:
        with self._lock:
            return self._conn.execute(
                "SELECT id FROM runtime_events WHERE session_id=? AND event_type='stream_stop' AND title=? LIMIT 1",
                (session_id, request_id),
            ).fetchone() is not None

    def save_event(
        self,
        session_id: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        if event_type == "token":
            return

        self.ensure_session(session_id)
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO runtime_events (
                    id,
                    session_id,
                    event_type,
                    title,
                    detail,
                    payload_json,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uuid.uuid4().hex,
                    session_id,
                    event_type,
                    str(payload.get("title", "")),
                    str(payload.get("detail", "")),
                    json.dumps(payload, ensure_ascii=False),
                    utc_now(),
                ),
            )
            self._touch_session(session_id)
            self._conn.commit()

    def sync_knowledge_docs(self) -> int:
        docs = self._collect_project_docs()
        seen_paths = set()
        with self._lock:
            for path in docs:
                relative = path.relative_to(self.project_root).as_posix()
                seen_paths.add(relative)
                content = path.read_text(encoding="utf-8")
                content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
                title = self._extract_title(content) or path.stem
                existing = self._conn.execute(
                    "SELECT content_hash FROM knowledge_docs WHERE path = ?",
                    (relative,),
                ).fetchone()
                if existing and existing["content_hash"] == content_hash:
                    continue

                self._conn.execute(
                    """
                    INSERT INTO knowledge_docs (
                        id,
                        path,
                        title,
                        content,
                        content_hash,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(path) DO UPDATE SET
                        title = excluded.title,
                        content = excluded.content,
                        content_hash = excluded.content_hash,
                        updated_at = excluded.updated_at
                    """,
                    (
                        hashlib.sha1(relative.encode("utf-8")).hexdigest(),
                        relative,
                        title,
                        content,
                        content_hash,
                        utc_now(),
                    ),
                )

            if seen_paths:
                placeholders = ",".join("?" for _ in seen_paths)
                self._conn.execute(
                    f"DELETE FROM knowledge_docs WHERE path NOT IN ({placeholders})",
                    tuple(sorted(seen_paths)),
                )
            else:
                self._conn.execute("DELETE FROM knowledge_docs")

            self._conn.commit()

        return len(seen_paths)

    def search_knowledge(self, query: str, limit: int = 3) -> list[KnowledgeHit]:
        terms = self._query_terms(query)
        if not terms:
            return []

        with self._lock:
            rows = self._conn.execute(
                "SELECT path, title, content FROM knowledge_docs",
            ).fetchall()

        hits: list[KnowledgeHit] = []
        for row in rows:
            title = row["title"]
            content = row["content"]
            haystack = f"{title}\n{content}".lower()
            score = sum(haystack.count(term) for term in terms)
            if score <= 0:
                continue

            hits.append(
                KnowledgeHit(
                    path=row["path"],
                    title=title,
                    snippet=self._snippet(content, terms),
                    score=score,
                ),
            )

        return sorted(hits, key=lambda hit: (-hit.score, hit.path))[:limit]

    def stats(self) -> dict[str, Any]:
        with self._lock:
            sessions = self._conn.execute("SELECT COUNT(*) AS count FROM sessions").fetchone()
            plans = self._conn.execute("SELECT COUNT(*) AS count FROM plans").fetchone()
            messages = self._conn.execute("SELECT COUNT(*) AS count FROM messages").fetchone()
            users = self._conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()
            models = self._conn.execute("SELECT COUNT(*) AS count FROM model_settings").fetchone()
            docs = self._conn.execute("SELECT COUNT(*) AS count FROM knowledge_docs").fetchone()
            events = self._conn.execute("SELECT COUNT(*) AS count FROM runtime_events").fetchone()

        return {
            "db_path": str(self.db_path),
            "sessions": int(sessions["count"]),
            "plans": int(plans["count"]),
            "messages": int(messages["count"]),
            "users": int(users["count"]),
            "model_settings": int(models["count"]),
            "knowledge_docs": int(docs["count"]),
            "runtime_events": int(events["count"]),
        }

    def list_sessions(self, user_id: str | None = None, limit: int = 50, session_id: str | None = None, *, offset: int = 0, include_source: bool = False, group: str | None = None, search: str = "") -> list[dict[str, str | int]]:
        if user_id:
            where_clause = "WHERE sessions.user_id = ?"
            params: tuple[Any, ...] = (user_id, limit)
        else:
            where_clause = "WHERE sessions.user_id IS NULL"
            params = (limit,)
        if session_id is not None:
            where_clause += ' AND sessions.id = ?'
            params = (*params[:-1], session_id, limit)

        source = "EXISTS (SELECT 1 FROM console_runs r LEFT JOIN console_resources cr ON cr.id=r.resource_id AND cr.user_id=r.user_id WHERE r.session_id=sessions.id AND r.user_id=sessions.user_id AND (json_extract(snapshot_json, '$.kind')='schedule' OR cr.kind='schedule'))" if include_source else "0=1"
        run_name = "(SELECT name FROM console_runs WHERE session_id=sessions.id AND user_id=sessions.user_id ORDER BY created_at DESC LIMIT 1)" if include_source else "NULL"
        if group not in (None, "recent", "automation"):
            raise ValueError("Invalid session group")
        if group:
            where_clause += f" AND {'NOT ' if group == 'recent' else ''}({source})"
        if search.strip():
            first_title = "(SELECT SUBSTR(content,1,20) FROM messages m WHERE m.session_id=sessions.id AND m.role='user' ORDER BY m.created_at,m.id LIMIT 1)"
            display_title = f"COALESCE(NULLIF(sessions.title,''), CASE WHEN {source} THEN {run_name} END, {first_title}, '新任务 · 主 Agent')"
            where_clause += f" AND LOWER({display_title}) LIKE LOWER(?) ESCAPE '\\'"
            escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            params = (*params[:-1], f"%{escaped}%", limit)
        with self._lock:
            rows = self._conn.execute(
                f"""
                SELECT
                    sessions.id,
                    sessions.title,
                    sessions.pinned,
                    sessions.created_at,
                    sessions.updated_at,
                    CASE WHEN {source} THEN 'schedule' ELSE '' END AS source_kind,
                    {run_name} AS run_name,
                    (SELECT SUBSTR(content,1,20) FROM messages first_message WHERE first_message.session_id=sessions.id AND role='user' ORDER BY created_at,id LIMIT 1) AS first_user_title,
                    COUNT(messages.id) AS message_count
                FROM sessions
                LEFT JOIN messages ON messages.session_id = sessions.id
                {where_clause}
                GROUP BY sessions.id
                ORDER BY sessions.pinned DESC, sessions.updated_at DESC, sessions.id DESC
                LIMIT ? OFFSET ?
                """,
                (*params, offset),
            ).fetchall()

        return [
            {
                "id": row["id"],
                "title": row["title"],
                "source_kind": row["source_kind"],
                "run_name": row["run_name"],
                "first_user_title": row["first_user_title"],
                "pinned": bool(row["pinned"]),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "message_count": int(row["message_count"]),
            }
            for row in rows
        ]

    def list_events(self, session_id: str, limit: int = 18) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT event_type, payload_json, created_at
                FROM runtime_events
                WHERE session_id = ? AND event_type != 'stream_stop'
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()

        events: list[dict[str, Any]] = []
        for row in reversed(rows):
            try:
                payload = json.loads(row["payload_json"])
            except json.JSONDecodeError:
                payload = {}
            events.append(
                {
                    "event_type": row["event_type"],
                    "payload": payload,
                    "created_at": row["created_at"],
                },
            )

        return events

    def create_user(self, username: str, password: str) -> tuple[AuthUser, str]:
        username = username.strip()
        self._validate_credentials(username, password)
        salt = secrets.token_hex(16)
        password_hash = self._hash_password(password, salt)
        user = AuthUser(id=uuid.uuid4().hex, username=username, created_at=utc_now())

        with self._lock:
            try:
                self._conn.execute(
                    """
                    INSERT INTO users (id, username, password_hash, salt, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (user.id, user.username, password_hash, salt, user.created_at),
                )
            except sqlite3.IntegrityError as error:
                raise ValueError("用户名已存在。") from error

            token = self._create_auth_token(user.id)
            self._conn.commit()

        return user, token

    def login_user(self, username: str, password: str) -> tuple[AuthUser, str]:
        username = username.strip()
        with self._lock:
            row = self._conn.execute(
                """
                SELECT id, username, password_hash, salt, created_at
                FROM users
                WHERE lower(username) = lower(?)
                """,
                (username,),
            ).fetchone()

            if not row:
                raise ValueError("用户名或密码错误。")

            candidate = self._hash_password(password, row["salt"])
            if not hmac.compare_digest(candidate, row["password_hash"]):
                raise ValueError("用户名或密码错误。")

            token = self._create_auth_token(row["id"])
            self._conn.commit()

        return AuthUser(id=row["id"], username=row["username"], created_at=row["created_at"]), token

    def get_user_by_token(self, token: str | None) -> AuthUser | None:
        if not token:
            return None

        with self._lock:
            row = self._conn.execute(
                """
                SELECT users.id, users.username, users.created_at
                FROM auth_tokens
                JOIN users ON users.id = auth_tokens.user_id
                WHERE auth_tokens.token = ?
                """,
                (token,),
            ).fetchone()

        if not row:
            return None

        return AuthUser(id=row["id"], username=row["username"], created_at=row["created_at"])

    def update_username(self, user_id: str, username: str) -> AuthUser:
        username = username.strip()
        self._validate_username(username)
        with self._lock:
            row = self._conn.execute("SELECT created_at FROM users WHERE id=?", (user_id,)).fetchone()
            if not row:
                raise ValueError("用户不存在。")
            duplicate = self._conn.execute("SELECT id FROM users WHERE lower(username)=lower(?) AND id<>?", (username, user_id)).fetchone()
            if duplicate:
                raise ValueError("用户名已存在。")
            try:
                self._conn.execute("UPDATE users SET username=? WHERE id=?", (username, user_id))
                self._conn.commit()
            except sqlite3.IntegrityError as error:
                self._conn.rollback()
                raise ValueError("用户名已存在。") from error
        return AuthUser(id=user_id, username=username, created_at=row["created_at"])

    def change_password(self, user_id: str, password: str, confirm_password: str) -> None:
        if len(password) < 6:
            raise ValueError("新密码至少 6 位。")
        if password != confirm_password:
            raise ValueError("两次输入的密码不一致。")
        salt = secrets.token_hex(16)
        password_hash = self._hash_password(password, salt)
        with self._lock:
            if not self._conn.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone():
                raise ValueError("用户不存在。")
            self._conn.execute("UPDATE users SET password_hash=?,salt=? WHERE id=?", (password_hash, salt, user_id))
            self._conn.commit()

    def create_model_setting(
        self,
        user_id: str,
        provider: str,
        display_name: str,
        model_name: str,
        endpoint: str,
        api_key: str,
        make_default: bool = False,
    ) -> ModelSetting:
        provider = self._normalize_provider(provider)
        display_name = display_name.strip() or model_name.strip()
        model_name = model_name.strip()
        endpoint = endpoint.strip()
        api_key = api_key.strip()

        if not model_name:
            raise ValueError("模型名称不能为空。")
        if not api_key and provider != "ollama":
            raise ValueError("API Key 不能为空。")
        self._validate_model_endpoint(provider, endpoint)

        setting_id = uuid.uuid4().hex
        now = utc_now()
        with self._lock:
            existing_count = self._conn.execute(
                "SELECT COUNT(*) AS count FROM model_settings WHERE user_id = ?",
                (user_id,),
            ).fetchone()["count"]
            is_default = make_default or int(existing_count) == 0
            if is_default:
                self._conn.execute(
                    "UPDATE model_settings SET is_default = 0 WHERE user_id = ?",
                    (user_id,),
                )

            self._conn.execute(
                """
                INSERT INTO model_settings (
                    id,
                    user_id,
                    provider,
                    display_name,
                    model_name,
                    endpoint,
                    api_key,
                    is_default,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    setting_id,
                    user_id,
                    provider,
                    display_name,
                    model_name,
                    endpoint,
                    api_key,
                    1 if is_default else 0,
                    now,
                    now,
                ),
            )
            self._conn.commit()

        return self.get_model_setting(user_id, setting_id)  # type: ignore[return-value]

    def update_model_setting(
        self,
        user_id: str,
        setting_id: str,
        provider: str,
        display_name: str,
        model_name: str,
        endpoint: str,
        api_key: str,
        make_default: bool = False,
    ) -> ModelSetting:
        provider = self._normalize_provider(provider)
        display_name = display_name.strip() or model_name.strip()
        model_name = model_name.strip()
        endpoint = endpoint.strip()
        api_key = api_key.strip()

        if not model_name:
            raise ValueError("模型名称不能为空。")
        self._validate_model_endpoint(provider, endpoint)

        with self._lock:
            existing = self._conn.execute(
                "SELECT api_key FROM model_settings WHERE user_id = ? AND id = ?",
                (user_id, setting_id),
            ).fetchone()
            if not existing:
                raise ValueError("模型配置不存在。")

            resolved_api_key = api_key or existing["api_key"]
            if not resolved_api_key and provider != "ollama":
                raise ValueError("API Key 不能为空。")

            if make_default:
                self._conn.execute(
                    "UPDATE model_settings SET is_default = 0 WHERE user_id = ?",
                    (user_id,),
                )

            self._conn.execute(
                """
                UPDATE model_settings
                SET provider = ?, display_name = ?, model_name = ?, endpoint = ?,
                    api_key = ?, is_default = CASE WHEN ? THEN 1 ELSE is_default END,
                    updated_at = ?
                WHERE user_id = ? AND id = ?
                """,
                (
                    provider,
                    display_name,
                    model_name,
                    endpoint,
                    resolved_api_key,
                    1 if make_default else 0,
                    utc_now(),
                    user_id,
                    setting_id,
                ),
            )
            self._conn.commit()

        return self.get_model_setting(user_id, setting_id)  # type: ignore[return-value]

    def delete_model_setting(self, user_id: str, setting_id: str) -> None:
        with self._lock:
            existing = self._conn.execute(
                "SELECT is_default FROM model_settings WHERE user_id = ? AND id = ?",
                (user_id, setting_id),
            ).fetchone()
            if not existing:
                raise ValueError("模型配置不存在。")

            self._conn.execute(
                "DELETE FROM model_settings WHERE user_id = ? AND id = ?",
                (user_id, setting_id),
            )
            if bool(existing["is_default"]):
                replacement = self._conn.execute(
                    """
                    SELECT id FROM model_settings
                    WHERE user_id = ?
                    ORDER BY updated_at DESC
                    LIMIT 1
                    """,
                    (user_id,),
                ).fetchone()
                if replacement:
                    self._conn.execute(
                        "UPDATE model_settings SET is_default = 1 WHERE id = ?",
                        (replacement["id"],),
                    )
            self._conn.commit()

    def list_model_settings(self, user_id: str) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT id, provider, display_name, model_name, endpoint, api_key,
                       is_default, created_at, updated_at
                FROM model_settings
                WHERE user_id = ?
                ORDER BY is_default DESC, updated_at DESC
                """,
                (user_id,),
            ).fetchall()

        return [self._public_model_setting(row) for row in rows]

    def get_default_model_setting(self, user_id: str) -> ModelSetting | None:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT *
                FROM model_settings
                WHERE user_id = ?
                ORDER BY is_default DESC, updated_at DESC
                LIMIT 1
                """,
                (user_id,),
            ).fetchone()

        return self._model_setting(row) if row else None

    def get_model_setting(self, user_id: str, setting_id: str) -> ModelSetting | None:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT *
                FROM model_settings
                WHERE user_id = ? AND id = ?
                """,
                (user_id, setting_id),
            ).fetchone()

        return self._model_setting(row) if row else None

    def set_default_model_setting(self, user_id: str, setting_id: str) -> None:
        with self._lock:
            exists = self._conn.execute(
                "SELECT id FROM model_settings WHERE user_id = ? AND id = ?",
                (user_id, setting_id),
            ).fetchone()
            if not exists:
                raise ValueError("模型配置不存在。")

            self._conn.execute(
                "UPDATE model_settings SET is_default = 0 WHERE user_id = ?",
                (user_id,),
            )
            self._conn.execute(
                "UPDATE model_settings SET is_default = 1, updated_at = ? WHERE id = ?",
                (utc_now(), setting_id),
            )
            self._conn.commit()

    def _touch_session(self, session_id: str) -> None:
        self._conn.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (utc_now(), session_id),
        )

    def _create_auth_token(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        self._conn.execute(
            """
            INSERT INTO auth_tokens (token, user_id, created_at)
            VALUES (?, ?, ?)
            """,
            (token, user_id, utc_now()),
        )

        return token

    def _validate_username(self, username: str) -> None:
        if not re.fullmatch(r"[A-Za-z0-9]{4,}", username):
            raise ValueError("用户名至少 4 位，只能包含英文和数字。")

    def _validate_credentials(self, username: str, password: str) -> None:
        self._validate_username(username)
        if len(password) < 6:
            raise ValueError("密码至少 6 位。")

    def _hash_password(self, password: str, salt: str) -> str:
        return hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt),
            120_000,
        ).hex()

    def _normalize_provider(self, provider: str) -> str:
        normalized = provider.strip().lower()
        aliases = {
            "moonshot": "kimi",
            "openai_compatible": "openai-compatible",
            "volcengine": "doubao",
            "ark": "doubao",
            "dashscope": "qwen",
            "google": "gemini",
        }
        normalized = aliases.get(normalized, normalized)
        supported = {
            "kimi",
            "deepseek",
            "doubao",
            "openai",
            "anthropic",
            "qwen",
            "gemini",
            "ollama",
            "openai-compatible",
        }
        if normalized not in supported:
            raise ValueError("不支持该模型提供方。")

        return normalized

    def _validate_model_endpoint(self, provider: str, endpoint: str) -> None:
        if provider in {"doubao", "openai-compatible"} and not endpoint:
            raise ValueError("该提供方需要填写 Endpoint。")
        if endpoint and not re.match(r"^https?://", endpoint, re.IGNORECASE):
            raise ValueError("Endpoint 必须以 http:// 或 https:// 开头。")

    def _model_setting(self, row: sqlite3.Row) -> ModelSetting:
        api_key = row["api_key"]
        if api_key == "@environment":
            variable = f"AGENTSCOPE_MODEL_API_KEY_{row['id'].upper()}"
            api_key = os.getenv(variable, "").strip()
            if not api_key:
                raise ValueError("模型环境凭据未配置，请检查服务端环境变量。")
        return ModelSetting(
            id=row["id"],
            user_id=row["user_id"],
            provider=row["provider"],
            display_name=row["display_name"],
            model_name=row["model_name"],
            endpoint=row["endpoint"],
            api_key=api_key,
            is_default=bool(row["is_default"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _public_model_setting(self, row: sqlite3.Row) -> dict[str, Any]:
        api_key = row["api_key"]
        environment_key = api_key == "@environment"
        if environment_key:
            api_key = os.getenv(f"AGENTSCOPE_MODEL_API_KEY_{row['id'].upper()}", "").strip()
        if environment_key:
            preview = "环境变量已配置" if api_key else "环境变量未配置"
        else:
            preview = f"••••{api_key[-4:]}" if len(api_key) >= 4 else ("••••" if api_key else "未设置")
        return {
            "id": row["id"],
            "provider": row["provider"],
            "displayName": row["display_name"],
            "modelName": row["model_name"],
            "endpoint": row["endpoint"],
            "isDefault": bool(row["is_default"]),
            "hasApiKey": bool(api_key),
            "apiKeyPreview": preview,
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def _collect_project_docs(self) -> list[Path]:
        candidates: list[Path] = []
        for pattern in ("README.md", "docs/*.md", "service/README.md"):
            candidates.extend(self.project_root.glob(pattern))

        return sorted(path for path in candidates if path.is_file())

    def _extract_title(self, content: str) -> str | None:
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("# "):
                return stripped[2:].strip()

        return None

    def _query_terms(self, query: str) -> list[str]:
        lowered = query.lower()
        words = re.findall(r"[a-z0-9_+-]{2,}", lowered)
        cjk_runs = re.findall(r"[\u4e00-\u9fff]{2,}", lowered)
        cjk_bigrams = [
            run[index : index + 2]
            for run in cjk_runs
            for index in range(max(len(run) - 1, 0))
        ]
        terms = words + cjk_runs + cjk_bigrams
        seen: set[str] = set()
        unique_terms: list[str] = []
        for term in terms:
            if term not in seen:
                unique_terms.append(term)
                seen.add(term)

        return unique_terms[:20]

    def _snippet(self, content: str, terms: list[str]) -> str:
        lowered = content.lower()
        index = -1
        for term in terms:
            index = lowered.find(term)
            if index >= 0:
                break

        if index < 0:
            return content[:240].replace("\n", " ").strip()

        start = max(index - 90, 0)
        end = min(index + 180, len(content))
        snippet = content[start:end].replace("\n", " ").strip()
        if start > 0:
            snippet = f"…{snippet}"
        if end < len(content):
            snippet = f"{snippet}…"

        return snippet
