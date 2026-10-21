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
from .scheduling import normalize_schedule, next_occurrence, parse_time, within_validity, schedule_status
from . import skill_market, schedule_templates
from .agent_catalog import official_agents


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
                CREATE TABLE IF NOT EXISTS schedule_create_requests (
                    user_id TEXT NOT NULL, request_id TEXT NOT NULL, resource_id TEXT NOT NULL,
                    PRIMARY KEY(user_id, request_id)
                );
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
            store._ensure_column("console_runs", "deleted_at", "TEXT")
            store._ensure_column("console_runs", "step_index", "INTEGER NOT NULL DEFAULT 0")
            store._ensure_column("console_runs", "snapshot_json", "TEXT NOT NULL DEFAULT '{}'")
            # Unsupported legacy intervals are paused for explicit user confirmation.
            rows = store._conn.execute("SELECT id,config_json FROM console_resources WHERE kind='schedule'").fetchall()
            import math
            for row in rows:
                config = json.loads(row['config_json'])
                if config.get('frequency') != 'interval':
                    continue
                value, unit = config.get('interval_value', 1), config.get('interval_unit', 'hours')
                hours = value / 60 if unit == 'minutes' else value * 24 if unit == 'days' else value
                if unit != 'hours' or not 1 <= hours <= 24 or config.get('weekdays', list(range(7))) != list(range(7)):
                    config.update(legacy_interval={'value': value, 'unit': unit}, interval_unit='hours', interval_value=max(1, min(24, math.ceil(hours))), weekdays=list(range(7)))
                    config['_revision'] = config.get('_revision', 0) + 1
                    store._conn.execute('UPDATE console_resources SET enabled=0,config_json=? WHERE id=?', (json.dumps(config), row['id']))
            store._conn.commit()

        schedule_templates.install(store)
        self.backfill_skill_categories()

    def backfill_skill_categories(self):
        """Upgrade installed bundled metadata without replacing user instructions."""
        packages = {item["slug"]: item for item in skill_market.catalog()}
        with self.store._lock:
            rows = self.store._conn.execute("SELECT id, content, config_json FROM console_resources WHERE kind='skill'").fetchall()
            for row in rows:
                config = json.loads(row["config_json"])
                package = packages.get(config.get("package"))
                if not package or not package.get("category"):
                    continue
                content = row["content"]
                category = skill_market.content_category(content) or config.get("category") or package["category"]
                if not skill_market.content_category(content):
                    if content.startswith("---\r\n"):
                        content = content.replace("---\r\n", f"---\r\ncategory: {category}\r\n", 1)
                    elif content.startswith("---\n"):
                        content = content.replace("---\n", f"---\ncategory: {category}\n", 1)
                    else:
                        content = f"---\ncategory: {category}\n---\n\n{content}"
                if config.get("category") == category and content == row["content"]:
                    continue
                config["category"] = category
                config["sha256"] = package["sha256"]
                self.store._conn.execute("UPDATE console_resources SET content=?, config_json=? WHERE id=?", (content, json.dumps(config), row["id"]))
            self.store._conn.commit()

    def _decode(self, row) -> dict:
        value = dict(row)
        value["config"] = json.loads(value.pop("config_json"))
        value["enabled"] = bool(value["enabled"])
        value.pop("user_id", None)
        if value['kind'] == 'schedule':
            value['status'] = schedule_status(value)
            value['revision'] = value['config'].get('_revision', 0)
            with self.store._lock:
                value['executing'] = bool(self.store._conn.execute("SELECT 1 FROM console_runs WHERE resource_id=? AND status IN ('running','waiting_approval')", (value['id'],)).fetchone())
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
        config = {"package": slug, "source": package["source"], "sha256": package["sha256"], "category": package["category"]}
        with self.store._lock:
            self.store._conn.execute(
                "INSERT OR IGNORE INTO console_resources VALUES (?,?,?,?,?,?,?,?,?)",
                (resource_id, user_id, "skill", slug, skill_market.read(slug, "SKILL.md"), 1, json.dumps(config), now, now))
            self.store._conn.commit()
        return self.get(user_id, resource_id)

    def configure_market_skill(self, user_id: str, session_id: str, slug: str) -> dict:
        """Bind only a trusted platform package to this user's current agent and session."""
        package = next((item for item in skill_market.catalog() if item["slug"] == slug), None)
        if not package:
            raise ValueError("该技能不在可访问的平台技能市场中，无法使用。")
        resource_id = "skill-" + uuid.uuid5(uuid.NAMESPACE_URL, f"xixi:{user_id}:anthropics:{slug}").hex
        now = utc_now()
        with self.store._lock, self.store._conn:
            owner = self.store._conn.execute("SELECT user_id FROM sessions WHERE id=?", (session_id,)).fetchone()
            if not owner or owner["user_id"] != user_id:
                raise ValueError("会话不存在或无权访问，无法配置技能。")
            scope = self.session_config(user_id, session_id) or {}
            agent_id = scope.get("agent_id", "main")
            agent = self.agent(user_id, agent_id) if agent_id != "main" else None
            if agent and (agent["kind"] != "agent" or not agent["enabled"]):
                raise ValueError("智能体不可用或无配置权限，无法使用该技能。")
            row = self.store._conn.execute("SELECT * FROM console_resources WHERE id=?", (resource_id,)).fetchone()
            if row:
                item = self._decode(row)
                if row["user_id"] != user_id or item["kind"] != "skill" or item["config"].get("package") != slug or item["config"].get("source") != package["source"]:
                    raise ValueError("该技能来源或访问权限无效，无法使用。")
                if not item["enabled"]:
                    raise ValueError("该技能已停用，无法使用；请先在技能管理中启用。")
            else:
                config = {"package": slug, "source": package["source"], "sha256": package["sha256"], "category": package["category"]}
                self.store._conn.execute("INSERT INTO console_resources VALUES (?,?,?,?,?,?,?,?,?)",
                    (resource_id, user_id, "skill", slug, skill_market.read(slug, "SKILL.md"), 1, json.dumps(config), now, now))
            changed = False
            if agent:
                config = {**agent["config"]}
                ids = list(config.get("skill_ids", []))
                if resource_id not in ids:
                    ids.append(resource_id)
                    config["skill_ids"] = ids
                    if not agent.get("builtin"):
                        self.store._conn.execute("UPDATE console_resources SET config_json=?, updated_at=? WHERE id=? AND user_id=?",
                            (json.dumps(config), now, agent_id, user_id))
                    changed = True
                # Add only this verified skill; keep the session's other snapshot fields intact.
                snapshot = {**scope.get("agent_config", {})}
                snapshot_ids = list(snapshot.get("skill_ids", []))
                if resource_id not in snapshot_ids:
                    snapshot_ids.append(resource_id)
                snapshot["skill_ids"] = snapshot_ids
                scope = {**scope, "agent_config": snapshot}
                self.store._conn.execute("INSERT OR REPLACE INTO execution_scopes VALUES (?,?,?)", (session_id, user_id, json.dumps(scope)))
            message = f"已将平台技能“{package['title']}”配置到智能体“{agent['name']}”，当前会话即可使用。" if agent else f"平台技能“{package['title']}”已在当前账号启用，默认助手可以使用。"
            if agent and agent.get("builtin"):
                message = f"已在当前会话中为“{agent['name']}”启用平台技能“{package['title']}”。"
        return {"configured": True, "changed": changed, "skill_id": resource_id, "slug": slug,
                "agent_id": agent_id, "message": message, "user_notice_required": True}

    def available_skill(self, user_id: str, resource_id: str, session_id: str | None = None) -> dict:
        item = self.get(user_id, resource_id)
        scope = self.session_config(user_id, session_id)
        selected = self.bound_resource_ids(scope, "skill_ids")
        if item["kind"] != "skill" or not item["enabled"] or (selected is not None and resource_id not in selected):
            raise ValueError("技能不存在、已停用或不在当前会话的技能范围内。")
        return item

    def list_available_skills(self, user_id: str, session_id: str | None = None, offset: int = 0, limit: int = 50) -> dict:
        if offset < 0 or not 1 <= limit <= 100:
            raise ValueError("技能目录分页参数无效。")
        allowed = self.bound_resource_ids(self.session_config(user_id, session_id), "skill_ids")
        items = [item for item in self.list(user_id, "skill") if item["enabled"] and (allowed is None or item["id"] in allowed)]
        items.sort(key=lambda item: item["id"])
        page = []
        for item in items[offset:offset + limit]:
            slug = item["config"].get("package")
            description = skill_market.PACKAGES.get(slug, (item["name"], ""))[1] if slug else item["content"].replace("\n", " ")[:600]
            page.append({"id": item["id"], "name": item["name"], "description": description})
        end = offset + len(page)
        return {"skills": page, "total": len(items), "next_offset": end if end < len(items) else None}

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
        request_id = body.get('request_id') if body.get('kind') == 'schedule' and not resource_id else None
        if request_id:
            if not isinstance(request_id, str) or len(request_id) > 100:
                raise ValueError('创建请求标识无效。')
            with self.store._lock:
                saved = self.store._conn.execute('SELECT resource_id FROM schedule_create_requests WHERE user_id=? AND request_id=?', (user_id, request_id)).fetchone()
            if saved:
                return self.get(user_id, saved['resource_id'])
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
            if len(content) > 2000:
                raise ValueError('提示词最多2000个字符。')
            if previous and config.get('end_date') != previous['config'].get('end_date') and config.get('end_at') == previous['config'].get('end_at'):
                config = {**config, 'end_at': ''}
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
                    if item["kind"] != resource_kind or not self.schedule_resource_available(item):
                        raise ValueError("所选技能或 MCP 不存在或已停用。")
            agent_id = config.get("agent_id") or "main"
            if agent_id != "main":
                agent = self.agent(user_id, agent_id)
                if agent["kind"] != "agent" or not self.schedule_resource_available(agent):
                    raise ValueError("所选智能体不存在或已停用。")
            scope = {"agent_id": agent_id, "agent_config": self.agent(user_id, agent_id)["config"]}
            for key in ("skill_ids", "mcp_ids"):
                allowed = self.bound_resource_ids(scope, key)
                if allowed is not None and not set(config.get(key, [])).issubset(allowed):
                    raise ValueError("任务指定能力不在智能体配置范围内，请重新选择。")
            shop_ids = config.get("shop_ids", [])
            if not isinstance(shop_ids, list) or any(not isinstance(value, str) for value in shop_ids) or len(set(shop_ids)) != len(shop_ids):
                raise ValueError("店铺选择无效。")
            available_shops = {shop["id"]: shop for shop in self.shop_options(user_id)}
            for shop_id in shop_ids:
                if shop_id not in available_shops or not available_shops[shop_id]["authorized"]:
                    raise ValueError("所选店铺不存在、无权访问或授权已失效。")
            config = {key: config[key] for key in (
                "frequency", "timezone", "start_at", "next_run", "interval_value", "interval_unit",
                "weekdays", "end_date", "end_at", "skill_ids", "mcp_ids", "time", "month_day", "month_days", "month",
                "source_template_id", "source_template_version") if key in config} | {
                "model_id": model_id, "agent_id": agent_id, "shop_ids": shop_ids}
            previous_config = normalize_schedule(previous["config"]) if previous else None
            timing_keys = ("start_at", "frequency", "timezone", "weekdays", "interval_value", "interval_unit", "end_date", "end_at", "time", "month_day", "month_days", "month")
            timing_changed = previous_config is None or any(config.get(key) != previous_config.get(key) for key in timing_keys)
            reenabled = previous and enabled and not previous["enabled"]
            now = datetime.now(timezone.utc)
            if config['frequency'] == 'once' and (not previous or timing_changed) and parse_time(config['start_at']) <= now:
                raise ValueError('单次执行时间必须晚于当前时间。')
            was_ended = previous and previous['status'] == 'ended'
            if was_ended and not timing_changed:
                raise ValueError('任务已结束，请设置新的有效执行时间或截止时间。')
            if reenabled and not within_validity(config, now):
                raise ValueError('任务已超过截止时间，请修改任务设置。')
            if was_ended:
                enabled = True
            if timing_changed or reenabled:
                floor = max(parse_time(config["start_at"]), now)
                due = next_occurrence(config, floor, inclusive=True)
                if due is None:
                    raise ValueError("有效期内没有可执行时间，请调整时间或有效期。")
                config["next_run"] = due.isoformat()
            else:
                # next_run is scheduler-owned: a content edit must not roll it backwards.
                config["next_run"] = previous["config"]["next_run"]
                if previous['config'].get('ended'):
                    config['ended'] = True
            config['_revision'] = (previous['revision'] if previous else 0) + 1
        elif kind == "skill":
            # Client-supplied paths/provenance never grant filesystem access.
            config = dict(previous["config"]) if previous else {}
            category = skill_market.content_category(content)
            if category:
                config["category"] = category
            else:
                config.pop("category", None)
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
            # Custom agents only receive explicitly configured capabilities.
            incoming = body.get("config", {})
            for key, resource_kind in (("skill_ids", "skill"), ("mcp_ids", "mcp")):
                if key not in incoming:
                    config[key] = []
                    continue
                ids = incoming[key]
                if not isinstance(ids, list) or any(not isinstance(value, str) for value in ids) or len(set(ids)) != len(ids):
                    raise ValueError("智能体绑定需为不重复的资源 ID 列表。")
                for selected_id in ids:
                    selected = self.get(user_id, selected_id)
                    if selected["kind"] != resource_kind or not selected["enabled"]:
                        raise ValueError("所选技能或 MCP 连接器不存在或已停用。")
                config[key] = ids
            if "tool_ids" in incoming:
                ids = incoming["tool_ids"]
                allowed = {"web_search", "web_fetch", "search_documents", "save_memory", "workspace_write_plan", "read_file", "create_file", "convert_file", "package_files"}
                if not isinstance(ids, list) or any(not isinstance(value, str) or value not in allowed for value in ids) or len(set(ids)) != len(ids):
                    raise ValueError("请选择有效的内置工具，且不能重复。")
                config["tool_ids"] = ids
            else:
                config["tool_ids"] = []
        else:
            config = {}
        now = utc_now()
        resource_id = resource_id or uuid.uuid4().hex
        with self.store._lock:
            if kind == 'schedule':
                if request_id:
                    saved = self.store._conn.execute('SELECT resource_id FROM schedule_create_requests WHERE user_id=? AND request_id=?', (user_id, request_id)).fetchone()
                    if saved:
                        return self.get(user_id, saved['resource_id'])
                if previous:
                    current = self.store._conn.execute('SELECT config_json FROM console_resources WHERE id=? AND user_id=?', (resource_id, user_id)).fetchone()
                    if not current or json.loads(current['config_json']).get('_revision', 0) != body.get('revision'):
                        raise ValueError('任务已发生变化，请刷新后重新编辑。')
                duplicate = self.store._conn.execute("SELECT 1 FROM console_resources WHERE user_id=? AND kind='schedule' AND name=? AND id<>?", (user_id, name, resource_id)).fetchone()
                if duplicate:
                    raise ValueError('任务名称已存在。')
            self.store._conn.execute(
                "INSERT INTO console_resources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, content=excluded.content, "
                "enabled=excluded.enabled, config_json=excluded.config_json, updated_at=excluded.updated_at",
                (resource_id, user_id, kind, name, content, int(enabled), json.dumps(config), now, now),
            )
            if kind == 'schedule' and request_id:
                self.store._conn.execute('INSERT INTO schedule_create_requests VALUES (?,?,?)', (user_id, request_id, resource_id))
            self.store._conn.commit()
        return self.get(user_id, resource_id)

    def delete(self, user_id: str, resource_id: str):
        item = self.get(user_id, resource_id)
        with self.store._lock:
            self.store._conn.execute("UPDATE console_runs SET snapshot_json=json_set(snapshot_json, '$.kind', ?) WHERE user_id=? AND resource_id=? AND json_extract(snapshot_json, '$.kind') IS NULL", (item['kind'], user_id, resource_id))
            self.store._conn.execute("DELETE FROM console_resources WHERE user_id=? AND id=?", (user_id, resource_id))
            self.store._conn.commit()

    def set_schedule_enabled(self, user_id, resource_id, enabled, revision):
        item = self.get(user_id, resource_id)
        if item['kind'] != 'schedule':
            raise ValueError('请选择定时任务。')
        if item['revision'] != revision:
            raise ValueError('任务已发生变化，请刷新后重新编辑。')
        if enabled:
            if not within_validity(item['config'], datetime.now(timezone.utc)):
                raise ValueError('任务已超过截止时间，请修改任务设置。')
            return self.save(user_id, {**item, 'enabled': True}, resource_id)
        if item['status'] != 'active':
            raise ValueError('仅运行中的任务支持暂停。')
        # Pausing must also work after a bound skill or model is removed.
        with self.store._lock:
            current = self.get(user_id, resource_id)
            if current['revision'] != revision:
                raise ValueError('任务已发生变化，请刷新后重新编辑。')
            config = {**current['config'], '_revision': revision + 1}
            self.store._conn.execute('UPDATE console_resources SET enabled=0, config_json=?, updated_at=? WHERE id=? AND user_id=?', (json.dumps(config), utc_now(), resource_id, user_id))
            self.store._conn.commit()
        return self.get(user_id, resource_id)

    def context(self, user_id: str, query: str, session_id: str | None = None, *, include_knowledge: bool = True) -> str:
        """Give enabled skills and memory to the agent, retrieve relevant documents."""
        scope = self.session_config(user_id, session_id)
        selected_skills = self.bound_resource_ids(scope, "skill_ids")
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
            if item["kind"] == "skill" and selected_skills is not None and item["id"] not in selected_skills:
                continue
            if item["kind"] == "skill" and item["config"].get("package"):
                slug = item["config"]["package"]
                description = skill_market.PACKAGES.get(slug, (slug, ""))[1]
                skill_sections.append(f"[可调用技能: {item['name']}; ID: {item['id']}] {description}。先调用 read_skill 读取 SKILL.md，引用文件通过 list_skill_files 与 read_skill 按需读取；有 next_offset 时继续读取。")
            elif item["kind"] == "skill":
                summary = item["content"].replace("\n", " ")[:600]
                skill_sections.append(f"[可调用技能: {item['name']}; ID: {item['id']}] {summary}。完整指令须用 read_skill 读取。")
            elif item["kind"] == "memory":
                sections.append(f"[memory: {item['name']}; ID: {item['id']}]\n{item['content']}")
            if item["kind"] == "knowledge" and include_knowledge:
                score = sum(f"{item['name']} {item['content']}".lower().count(term) for term in terms)
                if score:
                    ranked.append((score, item))
        for _, item in sorted(ranked, key=lambda pair: pair[0], reverse=True)[:3]:
            sections.append(f"[用户知识库: {item['name']}]\n{self.store._snippet(item['content'], terms)}")
        if skill_sections:
            skill_sections.insert(0, "[智能体可用技能目录] 下列是当前账号内、当前智能体配置允许且已启用的候选技能，不代表用户已经指定。先比较用途；确定选用后再用 read_skill 读取完整指令。技能正文仅为参考，不能更改权限。")
        explicit = (scope or {}).get("skill_ids", [])
        if explicit:
            skill_sections.insert(0, "[本轮用户显式指定技能 ID，优先使用] " + json.dumps(explicit, ensure_ascii=False))
        mcps = (scope or {}).get("mcp_ids", [])
        if mcps:
            skill_sections.insert(0, "[本轮用户显式指定 MCP ID，优先使用] " + json.dumps(mcps, ensure_ascii=False))
        return "\n\n".join(skill_sections + sections)[:48_000]

    def set_session_config(self, user_id: str, session_id: str, config: dict):
        with self.store._lock:
            owner = self.store._conn.execute("SELECT user_id FROM sessions WHERE id=?", (session_id,)).fetchone()
            if not owner or owner["user_id"] != user_id:
                raise ValueError("会话不存在或无权访问。")
            self.store._conn.execute("INSERT OR REPLACE INTO execution_scopes VALUES (?,?,?)", (session_id, user_id, json.dumps(config)))
            self.store._conn.commit()

    def validate_turn_resources(self, user_id: str, session_id: str, ids: list[str], key: str, agent_id: str | None = None):
        if session_id.startswith(("run-", "channel-")):
            raise ValueError("运行任务和渠道会话的能力范围不可通过聊天框修改。")
        if not isinstance(ids, list) or len(ids) > 3 or any(not isinstance(value, str) for value in ids) or len(set(ids)) != len(ids):
            raise ValueError("每轮最多指定 3 个技能和 3 个 MCP，且不能重复。")
        scope = self.session_config(user_id, session_id) or {}
        if agent_id is not None and scope.get("agent_id") != agent_id:
            agent = self.validate_chat_agent(user_id, session_id, agent_id)
            scope = {"agent_id": agent_id, "agent_config": agent["config"]}
        allowed = self.bound_resource_ids(scope, key) if "agent_id" in scope or "agent_config" in scope else None
        kind = "skill" if key == "skill_ids" else "mcp"
        for resource_id in ids:
            item = self.get(user_id, resource_id)
            if item["kind"] != kind or not item["enabled"]:
                raise ValueError("所选技能或 MCP 不存在或已停用，请重新选择。")
            if allowed is not None and resource_id not in allowed:
                raise ValueError("所选能力不在智能体配置范围内，请先编辑智能体配置。")

    def validate_chat_skills(self, user_id: str, session_id: str, ids: list[str]):
        self.validate_turn_resources(user_id, session_id, ids, "skill_ids")

    def set_chat_skills(self, user_id: str, session_id: str, ids: list[str]):
        self.validate_chat_skills(user_id, session_id, ids)
        self.store.ensure_session(session_id, user_id)
        config = self.session_config(user_id, session_id) or {}
        self.set_session_config(user_id, session_id, {**config, "skill_ids": ids})

    def set_chat_resources(self, user_id: str, session_id: str, skills: list[str], mcps: list[str]):
        self.validate_turn_resources(user_id, session_id, skills, "skill_ids")
        self.validate_turn_resources(user_id, session_id, mcps, "mcp_ids")
        self.store.ensure_session(session_id, user_id)
        scope = self.session_config(user_id, session_id) or {}
        self.set_session_config(user_id, session_id, {**scope, "skill_ids": skills, "mcp_ids": mcps})

    def chat_resource_options(self, user_id: str, agent_id: str, session_id: str | None = None) -> dict:
        if session_id:
            # Only read snapshots after an ownership check, including for built-in agents.
            with self.store._lock:
                owner = self.store._conn.execute("SELECT user_id FROM sessions WHERE id=?", (session_id,)).fetchone()
            if owner and owner["user_id"] != user_id:
                raise ValueError("会话不存在或无权访问。")
        scope = self.session_config(user_id, session_id) or {}
        agent = next((item for item in self.agents(user_id) if item["id"] == agent_id and item["enabled"]), None)
        if not agent:
            raise ValueError("智能体不存在或已停用。")
        if scope.get("agent_id") != agent_id:
            scope = {"agent_id": agent_id, "agent_config": agent["config"]}
        result = {}
        for kind, key in (("skill", "skill_ids"), ("mcp", "mcp_ids")):
            allowed = self.bound_resource_ids(scope, key)
            result[key] = [{"id": item["id"], "name": item["name"], "enabled": item["enabled"], "description": item["config"].get("description") or (skill_market.PACKAGES.get(item["config"].get("package"), (item["name"], item["content"][:160]))[1] if kind == "skill" else ""), "source": "官方" if item["config"].get("package") else "自定义"}
                           for item in self.list(user_id, kind) if allowed is None or item["id"] in allowed]
        return result

    def agents(self, user_id: str) -> list[dict]:
        from .runtime import MAIN_AGENT_NAME
        presets = official_agents()
        # Shared roles resolve capabilities separately for each account. Never
        # embed another user's skill or MCP IDs in a shared definition.
        bindings = {key: [item["id"] for item in self.list(user_id, kind) if item["enabled"]]
                    for key, kind in (("skill_ids", "skill"), ("mcp_ids", "mcp"))}
        for preset in presets:
            preset["config"].update({key: list(ids) for key, ids in bindings.items()})
        return [{"id": "main", "kind": "agent", "name": MAIN_AGENT_NAME, "content": "", "enabled": True, "builtin": True,
                 "config": {"avatar": "✦", "description": "通用任务助手", "max_iters": 8, "context_trigger": 0.75}}] + [
                     {**item, "builtin": False} for item in self.list(user_id, "agent")] + presets

    def agent(self, user_id: str, agent_id: str) -> dict:
        agent = next((item for item in self.agents(user_id) if item["id"] == agent_id), None)
        if not agent:
            raise ValueError("智能体不存在或无权访问。")
        return agent

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

    def resource_snapshot(self, user_id: str, session_id: str) -> list[dict]:
        scope = self.session_config(user_id, session_id) or {}
        result = []
        for key, kind in (("skill_ids", "skill"), ("mcp_ids", "mcp")):
            for identity in scope.get(key, []):
                item = self.get(user_id, identity)
                result.append({"id": identity, "kind": kind, "name": item["name"]})
        return result

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

    @staticmethod
    def schedule_resource_available(item):
        # Locally created resources predate the review lifecycle and remain usable.
        return item['enabled']

    def related_schedules(self, user_id: str, kind: str, resource_id: str) -> list[dict]:
        if kind == 'agent':
            self.agent(user_id, resource_id)
        elif kind == 'skill':
            if self.get(user_id, resource_id)['kind'] != 'skill':
                raise ValueError('请选择技能。')
        else:
            raise ValueError('请选择智能体或技能。')
        return [item for item in self.list(user_id, 'schedule') if item['status'] == 'active' and (
            item['config'].get('agent_id', 'main') == resource_id if kind == 'agent'
            else resource_id in item['config'].get('skill_ids', []))]

    def schedule_options(self, user_id: str) -> dict:
        def choices(items):
            return [{**item, 'enabled': self.schedule_resource_available(item)} for item in items]
        return {"agents": choices(self.agents(user_id)),
                "skills": choices(self.list(user_id, "skill")), "mcps": self.list(user_id, "mcp"), "shops": self.shop_options(user_id)}

    @staticmethod
    def bound_resource_ids(scope: dict | None, key: str) -> set[str] | None:
        """Configured agents cannot be extended by a per-turn selection."""
        if scope is None:
            return None
        config = scope.get("agent_config", {})
        if key in config:
            return set(config[key])
        if scope.get("agent_id", "main") != "main":
            return set()  # Missing bindings on custom agents never grant all resources.
        if "agent_id" not in scope and key in scope:
            return set(scope[key])  # Preserve explicit scopes for older task integrations.
        return None  # Built-in general assistant: all owned, enabled resources.

    def mcp_clients(self, user_id: str, session_id: str | None = None) -> list[MCPClient]:
        scope = self.session_config(user_id, session_id)
        selected = self.bound_resource_ids(scope, "mcp_ids")
        if scope is not None and "mcp_ids" in scope and not (session_id or "").startswith(("run-", "channel-")):
            explicit = set(scope["mcp_ids"])
            selected = explicit if selected is None else selected & explicit
        return [MCPClient(
            name=f"mcp_{item['id'][:12]}", is_stateful=False,
            mcp_config=HttpMCPConfig(url=item["config"]["url"], timeout=15), execution_timeout=30,
        ) for item in self.list(user_id, "mcp") if item["enabled"] and (selected is None or item["id"] in selected)]

    async def test_mcp(self, user_id: str, resource_id: str) -> dict:
        item = self.get(user_id, resource_id)
        if item["kind"] != "mcp":
            raise ValueError("请选择 MCP 资源。")
        client = MCPClient(name="connection_test", is_stateful=False,
                           mcp_config=HttpMCPConfig(url=item["config"]["url"], timeout=10))
        async with asyncio.timeout(20):
            tools = await client.list_raw_tools()
        return {"tools": [{"name": tool.name, "description": tool.description or ""} for tool in tools], "message": f"连接成功，发现 {len(tools)} 个工具。"}

    def runs(self, user_id: str, kind: str | None = None) -> list[dict]:
        with self.store._lock:
            rows = self.store._conn.execute("SELECT * FROM console_runs WHERE user_id=? AND (? IS NULL OR json_extract(snapshot_json, '$.kind')=? OR resource_id IN (SELECT id FROM console_resources WHERE kind=? AND user_id=?)) ORDER BY created_at DESC LIMIT 50", (user_id, kind, kind, kind, user_id)).fetchall()
        return [{key: value for key, value in dict(row).items() if key not in {"user_id", "snapshot_json", "deleted_at"}} | {"kind": json.loads(row["snapshot_json"]).get("kind", ""), "status": {"waiting_approval": "running", "interrupted": "failed"}.get(row["status"], row["status"])} for row in rows]

    def start_run(self, user: AuthUser, resource_id: str, *, automatic=False) -> dict:
        item = self.get(user.id, resource_id)
        if item["kind"] not in {"workflow", "schedule"}:
            raise ValueError("该资源不能运行。")
        if not self.store.get_default_model_setting(user.id) and not item["config"].get("model_id"):
            raise ValueError("请先在模型设置中配置默认模型。")
        if item["kind"] == "schedule":
            if not automatic and item['status'] != 'active':
                raise ValueError('仅运行中的任务支持立即执行。')
            config = item["config"]
            available_shops = {shop["id"]: shop for shop in self.shop_options(user.id)}
            if any(shop_id not in available_shops or not available_shops[shop_id]["authorized"] for shop_id in config.get("shop_ids", [])):
                raise ValueError("任务指定店铺授权已失效，请重新配置任务。")
            for key, kind in (("skill_ids", "skill"), ("mcp_ids", "mcp")):
                for selected_id in config.get(key, []):
                    selected = self.get(user.id, selected_id)
                    if selected["kind"] != kind or not self.schedule_resource_available(selected):
                        raise ValueError("任务引用的技能或 MCP 已失效，请编辑任务。")
            if config.get("agent_id", "main") != "main":
                agent = self.agent(user.id, config["agent_id"])
                if agent["kind"] != "agent" or not self.schedule_resource_available(agent):
                    raise ValueError("任务智能体已失效，请编辑任务。")
                item["config"]["agent_name"] = agent["name"]
                item["config"]["agent_prompt"] = agent["content"]
                item["config"]["agent_avatar"] = agent["config"].get("avatar", "✦")
                item["config"]["agent_config"] = agent["config"]
                for key in ("skill_ids", "mcp_ids"):
                    if not set(config.get(key, [])).issubset(agent["config"].get(key, [])):
                        raise ValueError("任务指定能力不在智能体配置范围内，请先编辑智能体配置。")
        run_id = uuid.uuid4().hex
        session_id = f"run-{run_id}"
        now = utc_now()
        with self.store._lock:
            if self.store._conn.execute("SELECT 1 FROM console_runs WHERE resource_id=? AND status IN ('running','waiting_approval')", (resource_id,)).fetchone():
                raise ValueError("任务正在执行，请稍后重试。")
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
        self._finish(row["id"], "failed", "用户停止了运行。")

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
            self._finish(run_id, "failed", "服务停止，任务已中断。")
            raise
        except Exception as error:
            self._finish(run_id, "failed", self.runtime._safe_error_message(error))

    def after_approval(self, user, session_id, approved, completed, failed_detail=""):
        with self.store._lock:
            row = self.store._conn.execute("SELECT * FROM console_runs WHERE user_id=? AND session_id=? AND status='waiting_approval'", (user.id, session_id)).fetchone()
        if not row:
            return
        if not approved:
            self._finish(row["id"], "failed", "用户拒绝了工具调用，后续步骤停止。")
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
            item = json.loads(row["snapshot_json"]) or self.get(user.id, row["resource_id"])
        except ValueError:
            self._finish(row["id"], "failed", "资源已删除，停止后续步骤。")
            return
        self._finish(row["id"], "running", "确认已完成，继续后续步骤。")
        task = asyncio.create_task(self.execute(user, item, row["id"], session_id, row["step_index"] + 1))
        self.track_task(row["id"], task)

    async def scheduler(self):
        # Persist interrupted state on restart; do not silently rerun unfinished writes.
        with self.store._lock:
            self.store._conn.execute("UPDATE console_runs SET status='failed', detail='服务重启，运行或确认点已中断' WHERE status IN ('running','waiting_approval')")
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
                config['ended'] = following is None or expired
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
                        self.start_run(AuthUser(**dict(user_row)), row["id"], automatic=True)
                except Exception as error:
                    run_id = uuid.uuid4().hex
                    session_id = f'run-{run_id}'
                    self.store.ensure_session(session_id, row['user_id'])
                    self.store.add_message(session_id, 'user', item['content'])
                    self.store.add_message(session_id, 'assistant', f"任务执行失败：{error}")
                    with self.store._lock:
                        self.store._conn.execute("INSERT INTO console_runs (id,user_id,resource_id,name,session_id,status,detail,created_at,updated_at,snapshot_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (run_id, row["user_id"], row["id"], item["name"], session_id, "failed", str(error), utc_now(), utc_now(), json.dumps(item)))
                        self.store._conn.commit()
            await asyncio.sleep(5)

    async def close(self):
        tasks = list(self.tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
