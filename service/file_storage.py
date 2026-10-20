"""Durable, encrypted objects. Public Supabase buckets never receive plaintext."""

from __future__ import annotations
import base64
import hmac
import os
import shutil
import struct
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import quote
import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class ObjectStorage:
    CHUNK = 1024 * 1024
    MAGIC = b"XIXIFILE1"

    def __init__(self, root: Path):
        self.root = root / "objects"
        self.root.mkdir(parents=True, exist_ok=True)
        self.url = os.getenv(
            "SUPABASE_URL", "https://bmfppeqixqhinyklhbzo.supabase.co"
        ).rstrip("/")
        self.bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "xixi-agentscope-studio")
        self.secret = os.getenv("SUPABASE_SECRET_KEY") or os.getenv(
            "SUPABASE_SERVICE_ROLE_KEY", ""
        )
        self.mode = os.getenv(
            "AGENTSCOPE_FILE_STORAGE", "supabase" if self.secret else "local"
        )
        if self.mode == "supabase" and not self.secret:
            raise ValueError("Supabase 文件存储缺少服务端密钥。")
        key = os.getenv("AGENTSCOPE_FILE_KEY")
        key_path = root / "file-storage.key"
        if key:
            self.key = base64.urlsafe_b64decode(key)
        else:
            if not key_path.exists():
                # Exclusive creation avoids different keys in simultaneous workers.
                try:
                    fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    with os.fdopen(fd, "wb") as f:
                        f.write(os.urandom(32))
                except FileExistsError:
                    pass
            self.key = key_path.read_bytes()
        if len(self.key) != 32:
            raise ValueError(
                "AGENTSCOPE_FILE_KEY 必须是 32 字节的 URL-safe Base64 密钥。"
            )

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError("非法对象路径。")
        return path

    def _endpoint(self, key: str) -> str:
        return f'{self.url}/storage/v1/object/{quote(self.bucket, safe="")}/{quote(key, safe="/")}'

    def _headers(self):
        return (
            {"apikey": self.secret}
            if self.secret.startswith("sb_secret_")
            else {"Authorization": f"Bearer {self.secret}", "apikey": self.secret}
        )

    def put(self, key: str, source: Path):
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as work:
            encrypted = Path(work) / "object"
            aes = AESGCM(hmac.digest(self.key, key.encode(), "sha256"))
            nonce = os.urandom(8)
            with source.open("rb") as src, encrypted.open("wb") as dst:
                dst.write(self.MAGIC + nonce)
                index = 0
                while True:
                    chunk = src.read(self.CHUNK)
                    # An authenticated final empty chunk detects truncation.
                    enc = aes.encrypt(
                        nonce + struct.pack(">I", index), chunk, key.encode()
                    )
                    dst.write(struct.pack(">I", len(enc)) + enc)
                    index += 1
                    if not chunk:
                        break
            if self.mode == "supabase":
                with encrypted.open("rb") as body, httpx.Client(timeout=300) as client:
                    response = client.post(
                        self._endpoint(key),
                        headers={
                            **self._headers(),
                            "Content-Type": "application/octet-stream",
                            "x-upsert": "false",
                            "Content-Length": str(encrypted.stat().st_size),
                        },
                        content=iter(lambda: body.read(self.CHUNK), b""),
                    )
                    if not response.is_success:
                        raise ValueError(
                            f"文件存储失败（HTTP {response.status_code}）。"
                        )
            else:
                target = self._path(key)
                target.parent.mkdir(parents=True, exist_ok=True)
                temp = target.with_suffix(".pending")
                shutil.copyfile(encrypted, temp)
                temp.replace(target)

    @contextmanager
    def materialize(self, key: str, storage: str):
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as work:
            encrypted, plain = Path(work) / "encrypted", Path(work) / "plain"
            if storage == "supabase":
                if not self.secret:
                    raise ValueError("文件暂无法查看。")
                with httpx.stream(
                    "GET", self._endpoint(key), headers=self._headers(), timeout=300
                ) as response:
                    if not response.is_success:
                        raise ValueError("文件暂无法查看。")
                    with encrypted.open("wb") as out:
                        for chunk in response.iter_bytes():
                            out.write(chunk)
            else:
                encrypted = self._path(key)
            try:
                with encrypted.open("rb") as src, plain.open("wb") as dst:
                    if src.read(len(self.MAGIC)) != self.MAGIC:
                        raise ValueError("文件暂无法查看。")
                    nonce = src.read(8)
                    aes = AESGCM(hmac.digest(self.key, key.encode(), "sha256"))
                    index = 0
                    while True:
                        size = src.read(4)
                        if len(size) != 4:
                            raise ValueError("文件暂无法查看。")
                        length = struct.unpack(">I", size)[0]
                        if length < 16 or length > self.CHUNK + 16:
                            raise ValueError("文件暂无法查看。")
                        chunk = aes.decrypt(
                            nonce + struct.pack(">I", index),
                            src.read(length),
                            key.encode(),
                        )
                        index += 1
                        if not chunk:
                            if src.read(1):
                                raise ValueError("文件暂无法查看。")
                            break
                        dst.write(chunk)
            except Exception as error:
                if isinstance(error, ValueError):
                    raise
                raise ValueError("文件暂无法查看。") from error
            yield plain

    def delete(self, key: str, storage: str):
        if storage == "supabase":
            if not self.secret:
                raise ValueError("文件删除失败，请重试。")
            response = httpx.request(
                "DELETE",
                f'{self.url}/storage/v1/object/{quote(self.bucket, safe="")}',
                headers=self._headers(),
                json={"prefixes": [key]},
                timeout=30,
            )
            if not response.is_success:
                raise ValueError("文件删除失败，请重试。")
        else:
            self._path(key).unlink(missing_ok=True)
