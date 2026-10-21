"""Private OCR service, deployed separately to fit Vercel's function limit."""

import hashlib
import hmac
import io
import os

from fastapi import FastAPI, HTTPException, Request
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

try:
    from .engine import recognize
except ImportError:
    from engine import recognize

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
MAX_BODY = 4_000_000


@app.post("/recognize")
async def read_image(request: Request):
    key = os.getenv("AGENTSCOPE_FILE_KEY", "")
    if not key:
        raise HTTPException(503, "OCR authentication is not configured")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BODY:
            raise HTTPException(413, "Image is too large")
    signature = hmac.new(key.encode(), b"ocr-v1:" + data, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(request.headers.get("X-OCR-Signature", ""), signature):
        raise HTTPException(401, "Invalid OCR signature")
    try:
        with Image.open(io.BytesIO(data)) as picture:
            if picture.width * picture.height > 2400 * 2400:
                raise HTTPException(413, "Image dimensions are too large")
            text = await run_in_threadpool(recognize, picture)
        return {"text": text}
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as e:
        raise HTTPException(422, "Image could not be recognized") from e
