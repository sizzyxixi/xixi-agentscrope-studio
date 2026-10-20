"""DeepSeek public Search API; credentials are resolved only from the current account."""
from __future__ import annotations

import asyncio
import json
import math
from datetime import datetime, timezone
from urllib.parse import urlsplit

import httpx

from .store import StudioStore
from .web_fetch import validate_url

SEARCH_URL = "https://api.deepseek.com/v1/tools/search"
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_TEXT_CHARACTERS = 60000


def official_deepseek(provider: str, endpoint: str) -> bool:
    if provider.lower() != "deepseek":
        return False
    try:
        url = urlsplit(endpoint or "https://api.deepseek.com")
        return (url.scheme == "https" and url.hostname == "api.deepseek.com" and url.port in (None, 443)
                and not url.username and not url.password and not url.query and not url.fragment
                and url.path.rstrip("/") in ("", "/v1"))
    except ValueError:
        return False


def resolve_search_key(store: StudioStore, user_id: str, preferred_model_id: str | None = None) -> str:
    """Do not fall back to server environment keys or another user's saved models."""
    if preferred_model_id:
        preferred = store.get_model_setting(user_id, preferred_model_id)
        if not preferred:
            raise ValueError("当前模型配置已删除或无权访问，请重新选择模型。")
        if official_deepseek(preferred.provider, preferred.endpoint) and preferred.api_key:
            return preferred.api_key
    default = store.get_default_model_setting(user_id)
    if default and official_deepseek(default.provider, default.endpoint) and default.api_key:
        return default.api_key
    candidates = [item for item in store.list_model_settings(user_id)
                  if official_deepseek(item["provider"], item["endpoint"])]
    if not candidates:
        raise ValueError("网页搜索需要本账号的 DeepSeek 官方 API Key，请先在模型设置中添加 DeepSeek 官方配置。")
    if len(candidates) != 1:
        raise ValueError("本账号有多份 DeepSeek 官方配置，请将要用于搜索的配置设为默认，或在当前会话选择该配置。")
    stored = store.get_model_setting(user_id, candidates[0]["id"])
    if not stored or not stored.api_key:
        raise ValueError("DeepSeek 搜索凭据不可用，请检查模型配置。")
    return stored.api_key


async def search_web(api_key: str, query: str, count: int = 5, need_content: bool = False) -> dict:
    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 128:
        raise ValueError("搜索词需为 1～128 个字符，不能全为空白。")
    if type(count) is not int or not 1 <= count <= 50:
        raise ValueError("搜索结果数量需为 1～50 的整数。")
    if type(need_content) is not bool:
        raise ValueError("need_content 需为布尔值。")
    if not api_key:
        raise ValueError("缺少 DeepSeek 搜索凭据。")
    query = query.strip()
    errors = {400: "搜索参数无效，请调整搜索词或数量。", 401: "DeepSeek API Key 无效，请检查本账号的模型配置。",
              402: "DeepSeek 账号余额不足，暂时无法搜索。", 403: "DeepSeek 拒绝了本次搜索请求。",
              429: "DeepSeek 搜索请求过于频繁，请稍后重试。"}
    try:
        async with asyncio.timeout(30):
            async with httpx.AsyncClient(timeout=httpx.Timeout(25, connect=5), trust_env=False, follow_redirects=False) as client:
                async with client.stream("POST", SEARCH_URL, headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
                                         json={"query": query, "count": count, "need_content": need_content}) as response:
                    if response.status_code != 200:
                        raise ValueError(errors.get(response.status_code, "DeepSeek 搜索服务暂时不可用，请稍后重试。"))
                    data = bytearray()
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        if len(data) + len(chunk) > MAX_RESPONSE_BYTES:
                            raise ValueError("搜索响应过大，请减少结果数量或关闭正文返回。")
                        data.extend(chunk)
                    payload = json.loads(data)
    except (TimeoutError, httpx.TimeoutException) as error:
        raise ValueError("DeepSeek 搜索超时，请稍后重试。") from error
    except httpx.HTTPError as error:
        raise ValueError("无法连接 DeepSeek 搜索服务，请稍后重试。") from error
    except (json.JSONDecodeError, UnicodeError) as error:
        raise ValueError("DeepSeek 搜索返回了无效数据。") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise ValueError("DeepSeek 搜索返回的结果格式无效。")
    results = []
    truncated = len(payload['results']) > count
    per_result_budget = MAX_TEXT_CHARACTERS // count
    for item in payload["results"][:count]:
        if not isinstance(item, dict) or not isinstance(item.get("url"), str):
            continue
        try:
            url = str(validate_url(item["url"]))
        except ValueError:
            continue
        result = {"url": url}
        budget = per_result_budget
        result_truncated = False
        for field, maximum in (("title", 500), ("snippet", 1500), ("summary", 4000), ("content", 12000)):
            value = item.get(field) if field != "content" or need_content else ""
            value = value if isinstance(value, str) else ""
            size = min(maximum, budget)
            result[field] = value[:size]
            result_truncated |= len(value) > size
            budget -= len(result[field])
        for field, maximum in (("site_name", 200), ("date", 128)):
            value = item.get(field)
            result[field] = value[:maximum] if isinstance(value, str) else None
        for field in ("rerank_score", "authority"):
            value = item.get(field)
            result[field] = value if type(value) in (float, int) and math.isfinite(value) else None
        result["truncated"] = result_truncated
        truncated |= result_truncated
        results.append(result)
    return {"provider": "deepseek", "query": query, "results": results, "truncated": truncated,
            "retrieved_at": datetime.now(timezone.utc).isoformat(), "untrusted_content": True}
