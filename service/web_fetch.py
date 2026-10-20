"""Bounded, anonymous public-web reads. No scripts, cookies, local network or proxy access."""
from __future__ import annotations

import asyncio
import ipaddress
import socket
from datetime import datetime, timezone
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup, UnicodeDammit

MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 5
TOTAL_TIMEOUT = 25
TRANSITION_NETWORKS = tuple(ipaddress.ip_network(value) for value in (
    "64:ff9b::/96", "64:ff9b:1::/48", "2002::/16", "2001::/32",
))


def public_ip(value: str) -> bool:
    address = ipaddress.ip_address(value)
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        return False
    return address.is_global and not any(address in network for network in TRANSITION_NETWORKS if address.version == network.version)


def validate_url(value: str) -> httpx.URL:
    if not isinstance(value, str) or len(value) > 4096 or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("网页地址无效或过长。")
    try:
        url = httpx.URL(value)
        host = (url.host or "").rstrip(".").lower()
        if url.scheme not in {"http", "https"} or not host or url.userinfo:
            raise ValueError("只允许不含账号密码的 HTTP/HTTPS 公开网页地址。")
        if url.port not in (None, 80 if url.scheme == "http" else 443):
            raise ValueError("只允许访问公开网页的标准 HTTP/HTTPS 端口。")
        if "%" in host or host == "localhost" or host.endswith((".localhost", ".local", ".internal", ".home", ".lan")):
            raise ValueError("不允许访问本机或内网地址。")
        try:
            literal = ipaddress.ip_address(host)
        except ValueError:
            if "." not in host:
                raise ValueError("请提供完整的公开网页域名。")
        else:
            if not public_ip(str(literal)):
                raise ValueError("不允许访问本机、内网或保留地址。")
        return url.copy_with(fragment=None)
    except (httpx.InvalidURL, UnicodeError) as error:
        raise ValueError("网页地址无效。") from error


async def resolve_public(host: str, port: int) -> str:
    try:
        records = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as error:
        raise ValueError("无法解析网页域名。") from error
    addresses = list(dict.fromkeys(record[4][0] for record in records))
    if not addresses or any(not public_ip(address) for address in addresses):
        raise ValueError("网页域名解析到了本机、内网或保留地址，已拒绝访问。")
    return addresses[0]


def extract_content(body: bytes, content_type: str, encoding: str | None) -> tuple[str, str]:
    try:
        text = body.decode(encoding) if encoding else UnicodeDammit(body).unicode_markup
    except (LookupError, UnicodeError):
        text = body.decode("utf-8", errors="replace")
    text = text or ""
    if content_type in {"text/html", "application/xhtml+xml"}:
        soup = BeautifulSoup(text, "html.parser")
        title = soup.title.get_text(" ", strip=True) if soup.title else ""
        for element in soup(["script", "style", "noscript", "template", "svg", "iframe"]):
            element.decompose()
        root = soup.find("main") or soup.find("article") or soup.body or soup
        text = root.get_text("\n", strip=True)
    else:
        title = ""
    return title[:500], "\n".join(line.strip() for line in text.splitlines() if line.strip())


async def fetch_webpage(url: str, offset: int = 0, limit: int = 12000) -> dict:
    """GET a public URL, returning a bounded page of extracted text, never executing HTML."""
    if offset < 0 or not 1 <= limit <= 24000:
        raise ValueError("offset 需为非负整数，limit 需为 1–24000。")
    original = validate_url(url)
    try:
        async with asyncio.timeout(TOTAL_TIMEOUT):
            # A new client per call prevents account/session cookie or connection sharing.
            async with httpx.AsyncClient(trust_env=False, follow_redirects=False, timeout=httpx.Timeout(10, connect=5)) as client:
                current = original
                for hop in range(MAX_REDIRECTS + 1):
                    current = validate_url(str(current))
                    address = await resolve_public(current.host, current.port or (443 if current.scheme == "https" else 80))
                    # Connect to the validated IP; preserve Host and TLS SNI. No second DNS lookup.
                    target = current.copy_with(host=address)
                    client.cookies.clear()
                    async with client.stream("GET", target, headers={
                        "Host": current.netloc.decode("ascii"), "User-Agent": "AgentScope-WebFetch/1.0",
                        "Accept": "text/html,text/plain,application/xhtml+xml,application/json,application/xml",
                        "Accept-Encoding": "identity",
                    }, extensions={"sni_hostname": current.host}) as response:
                        if response.status_code in {301, 302, 303, 307, 308}:
                            location = response.headers.get("location")
                            if not location or hop >= MAX_REDIRECTS:
                                raise ValueError("网页重定向无效或次数过多。")
                            current = validate_url(urljoin(str(current), location))
                            continue
                        if response.status_code >= 400:
                            raise ValueError(f"网页访问失败（HTTP {response.status_code}）。登录、验证码或访问限制不能通过此工具绕过。")
                        if not 200 <= response.status_code < 300:
                            raise ValueError(f"网页返回非成功状态（HTTP {response.status_code}）。")
                        content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                        if content_type not in {"text/html", "text/plain", "text/markdown", "application/xhtml+xml", "application/json", "application/xml", "text/xml"}:
                            raise ValueError("该地址不是支持的网页或文本内容；不支持二进制文件下载。")
                        if response.headers.get("content-encoding", "identity").lower() not in {"", "identity"}:
                            raise ValueError("网页未返回请求的未压缩文本，无法安全读取。")
                        length = response.headers.get("content-length")
                        if length and length.isdigit() and int(length) > MAX_BYTES:
                            raise ValueError("网页内容超过 2 MB 读取上限。")
                        data = bytearray()
                        async for chunk in response.aiter_raw():
                            if len(data) + len(chunk) > MAX_BYTES:
                                raise ValueError("网页内容超过 2 MB 读取上限。")
                            data.extend(chunk)
                        encoding = response.encoding if "charset=" in response.headers.get("content-type", "").lower() else None
                        title, text = extract_content(bytes(data), content_type, encoding)
                        if not text:
                            raise ValueError("网页没有可读取正文，可能需要 JavaScript 渲染或登录。")
                        end = min(offset + limit, len(text))
                        return {"url": str(current), "requested_url": str(original), "title": title,
                                "content_type": content_type, "content": text[offset:end], "offset": offset,
                                "total_characters": len(text), "next_offset": end if end < len(text) else None,
                                "retrieved_at": datetime.now(timezone.utc).isoformat(),
                                "untrusted_content": True}
    except (TimeoutError, httpx.TimeoutException) as error:
        raise ValueError("网页读取超时，请稍后重试。") from error
    except httpx.HTTPError as error:
        raise ValueError("网页连接失败，请检查地址或稍后重试。") from error
    raise ValueError("网页读取失败。")
