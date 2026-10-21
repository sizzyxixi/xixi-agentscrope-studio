"""Authenticated file API, mounted separately from JSON-only console proxy."""

import asyncio
import tempfile
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, Header, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import Response, FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
from .files import NOT_FOUND, UNAVAILABLE, UPLOAD_EXTENSIONS
from . import file_processing as processing


class DeleteFile(BaseModel):
    version: int


def file_router(runtime, require_user):
    router = APIRouter(prefix="/files")
    files = runtime.files

    def access(call):
        try:
            return call()
        except ValueError as e:
            raise HTTPException(
                status_code=409 if "文件已更新" in str(e) else 404, detail=str(e)
            ) from e

    @router.get("/capabilities")
    def capabilities(authorization: str | None = Header(default=None)):
        require_user(authorization)
        return files.capabilities()

    @router.get("/sessions/{session_id}")
    def list_files(
        session_id: str,
        artifacts: bool = False,
        authorization: str | None = Header(default=None),
    ):
        user = require_user(authorization)
        return {"files": access(lambda: files.list(user.id, session_id, artifacts))}

    @router.post("/upload")
    async def upload(
        session_id: str = Form(...),
        folder: bool = Form(False),
        file: UploadFile = File(...),
        authorization: str | None = Header(default=None),
    ):
        user = require_user(authorization)
        access(lambda: files.assert_scope(user.id, session_id))
        name = file.filename or ""
        suffix = processing.ext(name)
        if suffix not in UPLOAD_EXTENSIONS and name not in {
            "Dockerfile",
            "Makefile",
            ".env",
        }:
            raise HTTPException(400, "不支持此文件类型。")
        size = 0
        try:
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "upload"
                with path.open("wb") as out:
                    while chunk := await file.read(1024 * 1024):
                        size += len(chunk)
                        if size > (
                            100_000_000
                            if suffix in processing.IMAGES
                            else 1_000_000_000
                        ):
                            raise HTTPException(413, "文件超出大小限制。")
                        out.write(chunk)
                if folder:
                    entries = processing.safe_archive(path, max_total=1_000_000_000)
                    for entry in entries:
                        if (
                            processing.ext(entry["name"]) in processing.IMAGES
                            and entry["size"] > 100_000_000
                        ):
                            raise ValueError("文件夹中的图片超过 100 MB。")
                        if (
                            not entry["directory"]
                            and processing.ext(entry["name"]) not in UPLOAD_EXTENSIONS
                            and Path(entry["name"]).name
                            not in {"Dockerfile", "Makefile", ".env"}
                        ):
                            raise ValueError("文件夹中包含不支持的文件类型。")
                item = await asyncio.to_thread(
                    files.save,
                    user.id,
                    session_id,
                    name,
                    path,
                    kind="folder" if folder else "file",
                )
                return {"file": item}
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        finally:
            await file.close()

    @router.get("/{file_id}")
    def metadata(file_id: str, authorization: str | None = Header(default=None)):
        user = require_user(authorization)
        return {"file": access(lambda: files.public(files.get(user.id, file_id)))}

    @router.get("/{file_id}/content")
    def content(
        file_id: str,
        download: bool = False,
        preview_version: int | None = None,
        authorization: str | None = Header(default=None),
    ):
        user = require_user(authorization)
        item = access(lambda: files.get(user.id, file_id))
        # Download always resolves the latest version; preview may retain its snapshot.
        version = None if download else preview_version
        try:
            context = files.materialize(item, version)
            path = context.__enter__()
        except ValueError as e:
            raise HTTPException(404, NOT_FOUND if str(e) == NOT_FOUND else UNAVAILABLE) from e
        return FileResponse(
            path,
            media_type=item["mime"],
            background=BackgroundTask(context.__exit__, None, None, None),
            headers={
                "Content-Disposition": f'{"attachment" if download else "inline"}; filename*=UTF-8\'\'{quote(item["name"])}',
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; sandbox",
                "X-File-Version": str(item["version"]),
            },
        )

    @router.get("/{file_id}/text")
    async def extracted_text(
        file_id: str,
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=12000, ge=1, le=24000),
        authorization: str | None = Header(default=None),
    ):
        user = require_user(authorization)
        item = access(lambda: files.get(user.id, file_id))
        try:
            return await files.read(user.id, item["session_id"], file_id, offset, limit)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error

    @router.get("/{file_id}/thumbnail")
    def thumbnail(file_id: str, authorization: str | None = Header(default=None)):
        user = require_user(authorization)
        try:
            data = files.thumbnail(user.id, file_id)
        except Exception as error:
            raise HTTPException(404, NOT_FOUND if str(error) == NOT_FOUND else UNAVAILABLE) from error
        return Response(
            data, media_type="image/png", headers={"Cache-Control": "private, no-store"}
        )

    @router.get("/{file_id}/preview")
    async def preview(
        file_id: str,
        version: int | None = None,
        raw: bool = False,
        authorization: str | None = Header(default=None),
    ):
        user = require_user(authorization)
        try:
            result = await files.preview(user.id, file_id, version)
            if "data" in result:
                if raw:
                    return Response(
                        result["data"],
                        media_type=result["mime"],
                        headers={
                            "Cache-Control": "private, no-store",
                            "X-Content-Type-Options": "nosniff",
                        },
                    )
                del result["data"]
            return result
        except (ValueError, Exception) as e:
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(404, NOT_FOUND if str(e) == NOT_FOUND else UNAVAILABLE) from e

    @router.delete("/{file_id}")
    def delete(
        file_id: str, body: DeleteFile, authorization: str | None = Header(default=None)
    ):
        user = require_user(authorization)
        return access(lambda: files.delete(user.id, file_id, body.version))

    return router
