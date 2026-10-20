"""Persistent, user-scoped console capabilities and an in-process scheduler."""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from agentscope.mcp import HttpMCPConfig, MCPClient

from .store import AuthUser, StudioStore, utc_now
from .scheduling import normalize_schedule, next_occurrence, parse_time, within_validity
from . import skill_market


KINDS = {"skill", "mcp", "knowledge", "memory", "workflow", "schedule", "agent"}


class ConsoleCapabilities:
    def __init__(self, store: StudioStore, install_defaults: bool = False):
        self.store = store
        self.install_defaults = install_defaults
        self.tasks: set[asyncio.Task] = set()
        self.run_tasks: dict[str, asyncio.Task] = {}
        self.runtime = None
        with store._lock:
            store._conn.executescript("""
                CREATE TABLE IF NOT EXISTS execution_scopes (session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, config_json TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS skill_market_users (user_id TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS console_resources (
                    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL,
                    name TEXT NOT NULL, content TEXT NOT NULL, enabled INTEGER NOT NULL,
                    config_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS console_resources_owner
                    ON console_resources(user_id, kind);
                CREATE TABLE IF NOT EXISTS console_runs (
                    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, resource_id TEXT NOT NULL,
                    name TEXT NOT NULL, session_id TEXT NOT NULL, status TEXT NOT NULL,
                    detail TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
            """)
            store._conn.commit()
            store._ensure_column("console_runs", "step_index", "INTEGER NOT NULL DEFAULT 0")
            store._ensure_column("console_runs", "snapshot_json", "TEXT NOT NULL DEFAULT '{}'")
            store._conn.commit()

    def _decode(self, row) -> dict:
        value = dict(row)
        value["config"] = json.loads(value.pop("config_json"))
        value["enabled"] = bool(value["enabled"])
        value.pop("user_id", None)
        return value

    def list(self, user_id: str, kind: str | None = None) -> list[dict]:
        if self.install_defaults and kind in (None, "skill"):
            self.ensure_market_skills(user_id)
        with self.store._lock:
            rows = self.store._conn.execute(
                "SELECT * FROM console_resources WHERE user_id = ? "
                "AND (? IS NULL OR kind = ?) ORDER BY updated_at DESC",
                (user_id, kind, kind),
            ).fetchall()
        return [self._decode(row) for row in rows]

    def ensure_market_skills(self, user_id: str):
        """Install once per account; deletion and disabling survive refresh/restart."""
        with self.store._lock:
            if self.store._conn.execute("SELECT 1 FROM skill_market_users WHERE user_id=?", (user_id,)).fetchone():
                return
            packages = skill_market.catalog()
            if len(packages) != len(skill_market.PACKAGES):
                return  # Do not mark a partially downloaded distribution as installed.
            for package in packages:
                self.install_market_skill(user_id, package["slug"])
            self.store._conn.execute("INSERT OR IGNORE INTO skill_market_users VALUES (?)", (user_id,))
            self.store._conn.commit()

    def market(self, user_id: str) -> list[dict]:
        installed = {item["config"].get("package"): item for item in self.list(user_id, "skill")}
        return [{**package, "resource_id": installed.get(package["slug"], {}).get("id"),
                 "enabled": installed.get(package["slug"], {}).get("enabled", False)} for package in skill_market.catalog()]

    def install_market_skill(self, user_id: str, slug: str) -> dict:
        package = next((item for item in skill_market.catalog() if item["slug"] == slug), None)
        if not package:
            raise ValueError("技能包不存在或尚未完整安装。")
        resource_id = "skill-" + uuid.uuid5(uuid.NAMESPACE_URL, f"xixi:{user_id}:anthropics:{slug}").hex
        now = utc_now()
        config = {"package": slug, "source": package["source"], "sha256": package["sha256"]}
        with self.store._lock:
            self.store._conn.execute(
                "INSERT OR IGNORE INTO console_resources VALUES (?,?,?,?,?,?,?,?,?)",
                (resource_id, user_id, "skill", slug, skill_market.read(slug, "SKILL.md"), 1, json.dumps(config), now, now))
            self.store._conn.commit()
        return self.get(user_id, resource_id)

    def available_skill(self, user_id: str, resource_id: str, session_id: str | None = None) -> dict:
        item = self.get(user_id, resource_id)
        scope = self.session_config(user_id, session_id)
        if item["kind"] != "skill" or not item["enabled"] or (scope is not None and "skill_ids" in scope and resource_id not in scope["skill_ids"]):
            raise ValueError("技能不存在、已停用或不在当前会话的技能范围内。")
        return item

    def skill_files(self, user_id: str, resource_id: str, session_id: str | None = None) -> list[str]:
        item = self.available_skill(user_id, resource_id, session_id)
        return skill_market.files(item["config"]["package"]) if item["config"].get("package") else ["SKILL.md"]

    def read_skill(self, user_id: str, resource_id: str, path: str = "SKILL.md", offset: int = 0, limit: int = 12000, session_id: str | None = None) -> dict:
        item = self.available_skill(user_id, resource_id, session_id)
        if offset < 0 or not 1 <= limit <= 24000:
            raise ValueError("offset 需为非负整数，limit 需为 1–24000。")
        if path == "SKILL.md":
            content = item["content"]
        elif item["config"].get("package"):
            content = skill_market.read(item["config"]["package"], path)
        else:
            raise ValueError("自定义技能只有 SKILL.md 文件。")
        end = min(offset + limit, len(content))
        return {"skill_id": resource_id, "name": item["name"], "path": path, "content": content[offset:end],
                "offset": offset, "total": len(content), "next_offset": end if end < len(content) else None}

    def get(self, user_id: str, resource_id: str) -> dict:
        with self.store._lock:
            row = self.store._conn.execute(
                "SELECT * FROM console_resources WHERE user_id = ? AND id = ?",
                (user_id, resource_id),
            ).fetchone()
        if not row:
            raise ValueError("资源不存在或无权访问。")
        return self._decode(row)

    def save(self, user_id: str, body: dict, resource_id: str | None = None) -> dict:
        previous = self.get(user_id, resource_id) if resource_id else None
        kind = body.get("kind", "")
        if kind not in KINDS or (previous and kind != previous["kind"]):
            raise ValueError("资源类型无效。")
        name = body.get("name", "").strip()
        content = body.get("content", "").strip()
        if not name or len(name) > 100:
            raise ValueError("名称需为 1–100 个字符。")
        if len(content.encode("utf-8")) > 512_000:
            raise ValueError("单个文本文件不能超过 500 KB。")
        config = body.get("config", {})
        enabled = bool(body.get("enabled", True))
        if kind in {"skill", "knowledge", "memory", "workflow", "schedule"} and not content:
            raise ValueError("请输入内容或任务提示词。")
        if kind == "skill" and len(content) > 24_000 and not (previous and previous["config"].get("package")):
            raise ValueError("Skill 内容最多 24000 个字符。")
        if kind == "memory" and len(content) > 16_000:
            raise ValueError("单份记忆最多 16000 个字符。")
        if kind == "mcp":
            url = str(config.get("url", "")).strip()
            parsed = urlparse(url)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("MCP 需要有效的 HTTP/HTTPS URL（请勿在 URL 中填写密码）。")
            # HTTP transport only: editing a console resource never starts a local process.
            config = {"url": url, "transport": "streamable-http"}
        elif kind == "workflow":
            steps = [step.strip() for step in content.split("\n---\n") if step.strip()]
            if not 1 <= len(steps) <= 10:
                raise ValueError("工作流需有 1–10 个步骤，使用独立一行 --- 分隔。")
            config = {"steps": len(steps)}
        elif kind == "schedule":
            config = normalize_schedule(config)
            model_id = str(config.get("model_id", ""))
            if model_id and not self.store.get_model_setting(user_id, model_id):
                raise ValueError("模型配置不存在。")
            for key, resource_kind in (("skill_ids", "skill"), ("mcp_ids", "mcp")):
                ids = config.get(key, [])
                if not isinstance(ids, list) or len(ids) > 3 or any(not isinstance(value, str) for value in ids) or len(set(ids)) != len(ids):
                    raise ValueError("技能和 MCP 各最多选择 3 个，不可重复。")
                for value in ids:
                    item = self.get(user_id, value)
                    if item["kind"] != resource_kind or not item["enabled"]:
                        raise ValueError("所选技能或 MCP 不存在或已停用。")
            agent_id = config.get("agent_id", "main")
            if agent_id != "main":
                agent = self.get(user_id, agent_id)
                if agent["kind"] != "agent" or not agent["enabled"]:
                    raise ValueError("所选智能体不存在或已停用。")
            shop_ids = config.get("shop_ids", [])
            if not isinstance(shop_ids, list) or any(not isinstance(value, str) for value in shop_ids) or len(set(shop_ids)) != len(shop_ids):
                raise ValueError("店铺选择无效。")
            available_shops = {shop["id"]: shop for shop in self.shop_options(user_id)}
            for shop_id in shop_ids:
                if shop_id not in available_shops or not available_shops[shop_id]["authorized"]:
                    raise ValueError("所选店铺不存在、无权访问或授权已失效。")
            config = {key: config[key] for key in (
                "frequency", "timezone", "start_at", "next_run", "interval_value", "interval_unit",
                "weekdays", "end_date", "skill_ids", "mcp_ids") if key in config} | {
                "model_id": model_id, "agent_id": agent_id, "shop_ids": shop_ids}
            previous_config = normalize_schedule(previous["config"]) if previous else None
            timing_keys = ("start_at", "frequency", "timezone", "weekdays", "interval_value", "interval_unit", "end_date")
            timing_changed = previous_config is None or any(config.get(key) != previous_config.get(key) for key in timing_keys)
            reenabled = previous and enabled and not previous["enabled"]
            now = datetime.now(timezone.utc)
            if not previous and enabled and parse_time(config["start_at"]) < now:
                raise ValueError("首次运行时间必须在未来。")
            if timing_changed or reenabled:
                floor = parse_time(config["start_at"])
                if previous:
                    floor = max(floor, now)
                due = next_occurrence(config, floor, inclusive=True)
                if due is None:
                    raise ValueError("有效期内没有可执行时间，请调整时间或有效期。")
                config["next_run"] = due.isoformat()
            else:
                # next_run is scheduler-owned: a content edit must not roll it backwards.
                config["next_run"] = previous["config"]["next_run"]
        elif kind == "skill":
            # Client-supplied paths/provenance never grant filesystem access.
            config = previous["config"] if previous else {}
        elif kind == "agent":
            if not content or len(content) > 24000:
                raise ValueError("请填写智能体指令，最多 24000 个字符。")
            description = str(config.get("description", "")).strip()
            avatar = str(config.get("avatar", "✦"))
            max_iters = config.get("max_iters", 8)
            context_trigger = config.get("context_trigger", 0.75)
            if len(description) > 300 or avatar not in ("✦", "🧠", "📊", "🛍️", "✍️", "💻", "🔬", "🌍"):
                raise ValueError("简介最多 300 个字符，请选择预置头像。")
            if type(max_iters) is not int or not 1 <= max_iters <= 50:
                raise ValueError("最大执行轮次需为 1–50 的整数。")
            if type(context_trigger) not in (float, int) or not 0.2 <= context_trigger <= 0.85:
                raise ValueError("上下文压缩阈值需在 20%–85% 之间。")
            config = {"description": description, "avatar": avatar, "max_iters": max_iters, "context_trigger": context_trigger}
        else:
            config = {}
        now = utc_now()
        resource_id = resource_id or uuid.uuid4().hex
        with self.store._lock:
            self.store._conn.execute(
                "INSERT INTO console_resources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, content=excluded.content, "
                "enabled=excluded.enabled, config_json=excluded.config_json, updated_at=excluded.updated_at",
                (resource_id, user_id, kind, name, content, int(enabled), json.dumps(config), now, now),
            )
            self.store._conn.commit()
        return self.get(user_id, resource_id)

    def delete(self, user_id: str, resource_id: str):
        self.get(user_id, resource_id)
        with self.store._lock:
            self.store._conn.execute("DELETE FROM console_resources WHERE user_id=? AND id=?", (user_id, resource_id))
            self.store._conn.commit()

    def context(self, user_id: str, query: str, session_id: str | None = None) -> str:
        """Give enabled skills and memory to the agent, retrieve relevant documents."""
        scope = self.session_config(user_id, session_id)
        sections = []
        skill_sections = []
        if scope and scope.get("shop_ids"):
            selected = {shop["id"]: shop for shop in self.shop_options(user_id)}
            if any(shop_id not in selected or not selected[shop_id]["authorized"] for shop_id in scope["shop_ids"]):
                raise ValueError("任务指定店铺授权已失效，请重新配置任务。")
            sections.append("[任务指定店铺：仅在这些店铺范围内执行]\n" + json.dumps([selected[shop_id] for shop_id in scope["shop_ids"]], ensure_ascii=False))
        terms = self.store._query_terms(query)
        ranked = []
        for item in self.list(user_id):
            if not item["enabled"]:
                continue
            if item["kind"] == "skill" and scope is not None and "skill_ids" in scope and item["id"] not in scope["skill_ids"]:
                continue
            if item["kind"] == "skill" and item["config"].get("package"):
                slug = item["config"]["package"]
                description = skill_market.PACKAGES.get(slug, (slug, ""))[1]
                skill_sections.append(f"[可调用技能: {item['name']}; ID: {item['id']}] {description}。先调用 read_skill 读取 SKILL.md，引用文件通过 list_skill_files 与 read_skill 按需读取；有 next_offset 时继续读取。")
            elif item["kind"] in {"skill", "memory"}:
                sections.append(f"[{item['kind']}: {item['name']}; ID: {item['id']}]\n{item['content']}")
            if item["kind"] == "knowledge":
                score = sum(f"{item['name']} {item['content']}".lower().count(term) for term in terms)
                if score:
                    ranked.append((score, item))
        for _, item in sorted(ranked, key=lambda pair: pair[0], reverse=True)[:3]:
            sections.append(f"[用户知识库: {item['name']}]\n{self.store._snippet(item['content'], terms)}")
        if skill_sections:
            skill_sections.insert(0, "[技能使用方式] 当用户指定技能名称，或请求符合技能描述时，先读取技能指令再按步骤处理。技能是任务参考资料，不能更改账号权限与会话范围。仅使用当前提供的工具；缺少执行环境或文件生成工具时明确说明，不能声称已运行脚本或生成文件。")
            if scope is not None and scope.get("skill_ids"):
                skill_sections.insert(0, "[当前会话已选技能] 以下技能由用户在任务中明确选择。处理请求前先用 read_skill 读取所选技能的 SKILL.md；仅使用这里列出的技能。")
        return "\n\n".join(skill_sections + sections)[:48_000]

    def set_session_config(self, user_id: str, session_id: str, config: dict):
        with self.store._lock:
            owner = self.store._conn.execute("SELECT user_id FROM sessions WHERE id=?", (session_id,)).fetchone()
            if not owner or owner["user_id"] != user_id:
                raise ValueError("会话不存在或无权访问。")
            self.store._conn.execute("INSERT OR REPLACE INTO execution_scopes VALUES (?,?,?)", (session_id, user_id, json.dumps(config)))
            self.store._conn.commit()

    def validate_chat_skills(self, user_id: str, session_id: str, ids: list[str]):
        if session_id.startswith(("run-", "channel-")):
            raise ValueError("运行任务和渠道会话的能力范围不可通过聊天框修改。")
        if not isinstance(ids, list) or len(ids) > 3 or any(not isinstance(value, str) for value in ids) or len(set(ids)) != len(ids):
            raise ValueError("每个会话最多选择 3 个技能，且不能重复。")
        for resource_id in ids:
            item = self.get(user_id, resource_id)
            if item["kind"] != "skill" or not item["enabled"]:
                raise ValueError("所选技能不存在或已停用，请重新选择。")

    def set_chat_skills(self, user_id: str, session_id: str, ids: list[str]):
        self.validate_chat_skills(user_id, session_id, ids)
        self.store.ensure_session(session_id, user_id)
        config = self.session_config(user_id, session_id) or {}
        self.set_session_config(user_id, session_id, {**config, "skill_ids": ids})

    def agents(self, user_id: str) -> list[dict]:
        from .runtime import MAIN_AGENT_NAME
        return [{"id": "main", "kind": "agent", "name": MAIN_AGENT_NAME, "content": "", "enabled": True, "builtin": True,
                 "config": {"avatar": "✦", "description": "通用任务助手", "max_iters": 8, "context_trigger": 0.75}}] + [
                     {**item, "builtin": False} for item in self.list(user_id, "agent")]

    def validate_chat_agent(self, user_id: str, session_id: str, agent_id: str) -> dict:
        if session_id.startswith(("run-", "channel-")):
            raise ValueError("运行任务和渠道会话不能从聊天框切换智能体。")
        agent = next((item for item in self.agents(user_id) if item["id"] == agent_id and item["enabled"]), None)
        if not agent:
            raise ValueError("智能体不存在或已停用，请选择其他智能体。")
        config = self.session_config(user_id, session_id) or {}
        with self.store._lock:
            owner = self.store._conn.execute("SELECT user_id FROM sessions WHERE id=?", (session_id,)).fetchone()
            if owner and owner["user_id"] != user_id:
                raise ValueError("会话不存在或无权访问。")
            sent = self.store._conn.execute("SELECT 1 FROM messages WHERE session_id=? AND role='user' LIMIT 1", (session_id,)).fetchone()
        if sent and config.get("agent_id", "main") != agent_id:
            raise ValueError("已有对话切换智能体时，请新建会话。")
        return agent

    def set_chat_agent(self, user_id: str, session_id: str, agent_id: str):
        from .runtime import load_main_persona
        agent = self.validate_chat_agent(user_id, session_id, agent_id)
        config = self.session_config(user_id, session_id) or {}
        if config.get("agent_id") == agent_id and "agent_prompt" in config:
            return  # Preserve the conversation's original role and execution settings.
        self.store.ensure_session(session_id, user_id)
        self.set_session_config(user_id, session_id, {**config, "agent_id": agent_id, "agent_name": agent["name"],
            "agent_avatar": agent["config"].get("avatar", "✦"), "agent_prompt": agent["content"] if agent_id != "main" else load_main_persona(),
            "agent_config": agent["config"]})

    def session_config(self, user_id: str, session_id: str | None) -> dict | None:
        if not session_id:
            return None
        with self.store._lock:
            explicit = self.store._conn.execute("SELECT config_json FROM execution_scopes WHERE session_id=? AND user_id=?", (session_id, user_id)).fetchone()
            if explicit:
                return json.loads(explicit["config_json"])
            row = self.store._conn.execute("SELECT snapshot_json FROM console_runs WHERE user_id=? AND session_id=?", (user_id, session_id)).fetchone()
        if row:
            item = json.loads(row["snapshot_json"])
            if item.get("kind") == "schedule":
                return item.get("config", {})
        return None

    def shop_options(self, user_id: str) -> list[dict]:
        """Read connector-owned shop resources; ordinary resource CRUD cannot grant shop authorization."""
        shops = []
        for item in self.list(user_id, "shop"):
            config = item["config"]
            authorized = item["enabled"] and config.get("authorization_status") == "authorized"
            if config.get("expires_at"):
                try:
                    authorized = authorized and parse_time(config["expires_at"]) > datetime.now(timezone.utc)
                except ValueError:
                    authorized = False
            shops.append({"id": item["id"], "name": item["name"], "enabled": item["enabled"],
                          "country": config.get("country", ""), "mode": config.get("mode", ""), "authorized": authorized})
        return shops

    def schedule_options(self, user_id: str) -> dict:
        return {"agents": self.agents(user_id),
                "skills": self.list(user_id, "skill"), "mcps": self.list(user_id, "mcp"), "shops": self.shop_options(user_id)}

    def mcp_clients(self, user_id: str, session_id: str | None = None) -> list[MCPClient]:
        scope = self.session_config(user_id, session_id)
        return [MCPClient(
            name=f"mcp_{item['id'][:12]}", is_stateful=False,
            mcp_config=HttpMCPConfig(url=item["config"]["url"], timeout=15), execution_timeout=30,
        ) for item in self.list(user_id, "mcp") if item["enabled"] and (scope is None or "mcp_ids" not in scope or item["id"] in scope["mcp_ids"])]

    async def test_mcp(self, user_id: str, resource_id: str) -> dict:
        item = self.get(user_id, resource_id)
        if item["kind"] != "mcp":
            raise ValueError("请选择 MCP 资源。")
        client = MCPClient(name="connection_test", is_stateful=False,
                           mcp_config=HttpMCPConfig(url=item["config"]["url"], timeout=10))
        async with asyncio.timeout(20):
            tools = await client.list_raw_tools()
        return {"tools": [{"name": tool.name, "description": tool.description or ""} for tool in tools], "message": f"连接成功，发现 {len(tools)} 个工具。"}

    def runs(self, user_id: str) -> list[dict]:
        with self.store._lock:
            rows = self.store._conn.execute("SELECT * FROM console_runs WHERE user_id=? ORDER BY created_at DESC LIMIT 50", (user_id,)).fetchall()
        return [{key: value for key, value in dict(row).items() if key not in {"user_id", "snapshot_json"}} | {"kind": json.loads(row["snapshot_json"]).get("kind", "")} for row in rows]

    def start_run(self, user: AuthUser, resource_id: str) -> dict:
        item = self.get(user.id, resource_id)
        if item["kind"] not in {"workflow", "schedule"}:
            raise ValueError("该资源不能运行。")
        if not self.store.get_default_model_setting(user.id) and not item["config"].get("model_id"):
            raise ValueError("请先在模型设置中配置默认模型。")
        if item["kind"] == "schedule":
            config = item["config"]
            available_shops = {shop["id"]: shop for shop in self.shop_options(user.id)}
            if any(shop_id not in available_shops or not available_shops[shop_id]["authorized"] for shop_id in config.get("shop_ids", [])):
                raise ValueError("任务指定店铺授权已失效，请重新配置任务。")
            for key, kind in (("skill_ids", "skill"), ("mcp_ids", "mcp")):
                for resource_id in config.get(key, []):
                    selected = self.get(user.id, resource_id)
                    if selected["kind"] != kind or not selected["enabled"]:
                        raise ValueError("任务引用的技能或 MCP 已失效，请编辑任务。")
            if config.get("agent_id", "main") != "main":
                agent = self.get(user.id, config["agent_id"])
                if agent["kind"] != "agent" or not agent["enabled"]:
                    raise ValueError("任务智能体已失效，请编辑任务。")
                item["config"]["agent_name"] = agent["name"]
                item["config"]["agent_prompt"] = agent["content"]
                item["config"]["agent_avatar"] = agent["config"].get("avatar", "✦")
                item["config"]["agent_config"] = agent["config"]
        run_id = uuid.uuid4().hex
        session_id = f"run-{run_id}"
        now = utc_now()
        with self.store._lock:
            if self.store._conn.execute("SELECT 1 FROM console_runs WHERE resource_id=? AND status IN ('running','waiting_approval')", (resource_id,)).fetchone():
                raise ValueError("这个任务正在运行或等待确认，请先打开运行会话。")
            self.store._conn.execute("INSERT INTO console_runs (id,user_id,resource_id,name,session_id,status,detail,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (run_id, user.id, resource_id, item["name"], session_id, "running", "准备执行", now, now))
            self.store._conn.execute("UPDATE console_runs SET snapshot_json=? WHERE id=?", (json.dumps(item), run_id))
            self.store._conn.commit()
        self.store.ensure_session(session_id, user.id)
        task = asyncio.create_task(self.execute(user, item, run_id, session_id))
        self.track_task(run_id, task)
        return {"id": run_id, "session_id": session_id, "status": "running"}

    def track_task(self, run_id, task):
        self.run_tasks[run_id] = task
        self.tasks.add(task)
        def finished(done):
            self.tasks.discard(done)
            if self.run_tasks.get(run_id) is done:
                self.run_tasks.pop(run_id, None)
        task.add_done_callback(finished)

    async def stop_session_run(self, user_id, session_id):
        with self.store._lock:
            row = self.store._conn.execute("SELECT id FROM console_runs WHERE user_id=? AND session_id=? AND status IN ('running','waiting_approval')", (user_id, session_id)).fetchone()
        if not row:
            raise ValueError("没有正在运行的后台任务。")
        task = self.run_tasks.pop(row["id"], None)
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        self._finish(row["id"], "interrupted", "用户停止了运行。")

    def _finish(self, run_id: str, status: str, detail: str):
        with self.store._lock:
            self.store._conn.execute("UPDATE console_runs SET status=?, detail=?, updated_at=? WHERE id=?", (status, detail, utc_now(), run_id))
            self.store._conn.commit()

    async def execute(self, user, item, run_id, session_id, start_index=0):
        from .runtime import ModelSettings
        steps = item["content"].split("\n---\n") if item["kind"] == "workflow" else [item["content"]]
        try:
            async with asyncio.timeout(600):
                for index, step in enumerate(steps):
                    if index < start_index:
                        continue
                    with self.store._lock:
                        self.store._conn.execute("UPDATE console_runs SET step_index=? WHERE id=?", (index, run_id))
                        self.store._conn.commit()
                    status, detail, completed = "success", "", False
                    async for frame in self.runtime.stream(session_id, f"[{item['name']} · 步骤 {index + 1}/{len(steps)}]\n{step.strip()}",
                            model=ModelSettings(id=item["config"]["model_id"]) if item["config"].get("model_id") else None, user=user):
                        line = next((line[6:] for line in frame.splitlines() if line.startswith("data: ")), "{}")
                        event = json.loads(line)
                        if event.get("type") == "approval_required":
                            status, detail = "waiting_approval", f"步骤 {index + 1}/{len(steps)} 等待人工确认，请打开运行会话。"
                        if event.get("type") == "done":
                            completed = True
                            if event.get("level") == "warning" or event.get("title") == "Waiting for model settings":
                                status, detail = "failed", event.get("detail", "运行失败")
                    if status != "success":
                        self._finish(run_id, status, detail)
                        return
                    if not completed:
                        self._finish(run_id, "failed", "运行提前结束，未收到完成事件。")
                        return
            self._finish(run_id, "success", f"已完成 {len(steps)} 个步骤")
        except asyncio.CancelledError:
            self._finish(run_id, "interrupted", "服务停止，任务已中断。")
            raise
        except Exception as error:
            self._finish(run_id, "failed", self.runtime._safe_error_message(error))

    def after_approval(self, user, session_id, approved, completed, failed_detail=""):
        with self.store._lock:
            row = self.store._conn.execute("SELECT * FROM console_runs WHERE user_id=? AND session_id=? AND status='waiting_approval'", (user.id, session_id)).fetchone()
        if not row:
            return
        if not approved:
            self._finish(row["id"], "interrupted", "用户拒绝了工具调用，后续步骤停止。")
            return
        if failed_detail:
            self._finish(row["id"], "failed", failed_detail)
            return
        pending = getattr(self.runtime, "sessions", {}).get(session_id)
        if pending and pending.pending_confirmations:
            return
        if not completed:
            return
        try:
            item = self.get(user.id, row["resource_id"])
            item = json.loads(row["snapshot_json"]) or item
        except ValueError:
            self._finish(row["id"], "interrupted", "资源已删除，停止后续步骤。")
            return
        self._finish(row["id"], "running", "确认已完成，继续后续步骤。")
        task = asyncio.create_task(self.execute(user, item, row["id"], session_id, row["step_index"] + 1))
        self.track_task(row["id"], task)

    async def scheduler(self):
        # Persist interrupted state on restart; do not silently rerun unfinished writes.
        with self.store._lock:
            self.store._conn.execute("UPDATE console_runs SET status='interrupted', detail='服务重启，运行或确认点已中断' WHERE status IN ('running','waiting_approval')")
            self.store._conn.commit()
        while True:
            with self.store._lock:
                rows = self.store._conn.execute("SELECT * FROM console_resources WHERE kind='schedule' AND enabled=1").fetchall()
            for row in rows:
                item = self._decode(row)
                due = datetime.fromisoformat(item["config"]["next_run"])
                now = datetime.now(timezone.utc)
                if due > now:
                    continue
                # Claim by comparing persisted next_run: only one scheduler advances it.
                config = dict(item["config"])
                following = None if config["frequency"] == "once" else next_occurrence(config, now)
                expired = not within_validity(config, now)
                if following:
                    config["next_run"] = following.isoformat()
                with self.store._lock:
                    cursor = self.store._conn.execute(
                        "UPDATE console_resources SET config_json=?, enabled=?, updated_at=? WHERE id=? AND enabled=1 AND config_json=?",
                        (json.dumps(config), int(following is not None and not expired), utc_now(), row["id"], row["config_json"]))
                    self.store._conn.commit()
                if not cursor.rowcount or expired:
                    continue
                try:
                    with self.store._lock:
                        user_row = self.store._conn.execute("SELECT id, username FROM users WHERE id=?", (row["user_id"],)).fetchone()
                    if user_row:
                        self.start_run(AuthUser(**dict(user_row)), row["id"])
                except Exception as error:
                    run_id = uuid.uuid4().hex
                    with self.store._lock:
                        self.store._conn.execute("INSERT INTO console_runs (id,user_id,resource_id,name,session_id,status,detail,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (run_id, row["user_id"], row["id"], item["name"], "", "failed", str(error), utc_now(), utc_now()))
                        self.store._conn.commit()
            await asyncio.sleep(5)

    async def close(self):
        tasks = list(self.tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
