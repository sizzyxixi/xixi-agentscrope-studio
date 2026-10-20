"""Bundled, pinned-on-disk skill packages. Never execute package scripts."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "skills"
PACKAGES = {
    "pdf": ("PDF", "读取、提取、合并和处理 PDF 文档"),
    "docx": ("Word 文档", "创建、编辑和分析 Word 文档"),
    "xlsx": ("Excel 表格", "处理电子表格、公式和数据分析"),
    "pptx": ("PowerPoint 演示", "创建、编辑和分析演示文稿"),
    "frontend-design": ("前端设计", "设计有辨识度的网页与前端界面"),
    "mcp-builder": ("MCP 构建", "设计和构建 MCP 工具服务"),
}


def content_category(content: str) -> str | None:
    frontmatter = re.match(r"^---\r?\n(.*?)\r?\n---(?:\r?\n|$)", content, re.S)
    if not frontmatter:
        return None
    category = re.search(r"^category:[ \t]*([^\r\n]*)$", frontmatter[1], re.M)
    if not category:
        return None
    return category[1].strip().strip("\"'")[:80] or None


def package_path(slug: str) -> Path:
    if slug not in PACKAGES:
        raise ValueError("技能包不存在。")
    return ROOT / slug


def catalog() -> list[dict]:
    result = []
    for slug, (title, description) in PACKAGES.items():
        root = package_path(slug)
        entry = root / "SKILL.md"
        if not entry.is_file():
            continue
        result.append({"slug": slug, "title": title, "description": description, "category": content_category(entry.read_text()),
                       "source": f"https://github.com/anthropics/skills/tree/main/skills/{slug}",
                       "sha256": hashlib.sha256(entry.read_bytes()).hexdigest(),
                       "files": files(slug)})
    return result


def files(slug: str) -> list[str]:
    root = package_path(slug).resolve()
    return sorted(p.relative_to(root).as_posix() for p in root.rglob("*")
                  if p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(root)
                  and not any(part.startswith(".") or part == "__pycache__" for part in p.relative_to(root).parts))


def read(slug: str, path: str) -> str:
    root = package_path(slug).resolve()
    candidate = Path(path)
    if candidate.is_absolute() or ".." in candidate.parts or "\\" in path:
        raise ValueError("只能读取当前技能目录内的文件。")
    normalized = candidate.as_posix()
    available = files(slug)
    if normalized not in available:
        # Some upstream instructions use FORMS.md/REFERENCE.md for lowercase files.
        matches = [name for name in available if name.casefold() == normalized.casefold()]
        if len(matches) == 1:
            normalized = matches[0]
    target = (root / normalized).resolve()
    if not target.is_relative_to(root) or normalized not in available:
        raise ValueError("技能文件不存在或不允许访问。")
    if target.stat().st_size > 2_000_000:
        raise ValueError("文件过大，不能作为技能文本读取。")
    try:
        data = target.read_bytes()
        if b"\x00" in data:
            raise ValueError("此文件为二进制资源，请查看文件清单。")
        return data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("此文件不是 UTF-8 文本，请查看文件清单。") from error
