"""Exercise bundled models with real raster text, including an image-only PDF."""

import tempfile
import unittest
import hashlib
import hmac
import os
import httpx
from pathlib import Path

import pymupdf
from PIL import Image
from fastapi.testclient import TestClient
from unittest.mock import patch

from service import file_processing as processing
from service.ocr_service import engine
from service.ocr_service.main import app


FIXTURE = Path(__file__).parent / "fixtures" / "ocr-invoice.png"


class OCRTests(unittest.IsolatedAsyncioTestCase):
    def assert_invoice(self, text):
        for value in ("2026", "128.50", "ABC123", "发票", "合计"):
            self.assertIn(value, text)

    async def test_image_attachment_recognizes_chinese_and_english(self):
        result = await processing.extract(FIXTURE, "invoice.png")
        self.assert_invoice(result["text"])
        self.assertIn("OCR", result["notice"])

    async def test_scanned_pdf_and_native_text_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "scan.pdf"
            with pymupdf.open() as doc:
                page = doc.new_page(width=1100, height=460)
                page.insert_image(page.rect, filename=str(FIXTURE))
                page = doc.new_page()
                page.insert_text((72, 72), "Native text remains readable")
                doc.save(path)
            result = await processing.extract(path, "scan.pdf")
        self.assert_invoice(result["text"])
        self.assertIn("Native text remains readable", result["text"])
        self.assertIn("OCR", result["notice"])

    async def test_transparent_image_and_engine_reuse(self):
        with Image.open(FIXTURE) as picture:
            transparent = picture.convert("RGBA")
            self.assert_invoice(processing.ocr(transparent))
            instance = engine._ocr_engine
            self.assert_invoice(processing.ocr(picture))
            self.assertIs(engine._ocr_engine, instance)

    async def test_private_service_requires_signature_and_reads_real_image(self):
        data = FIXTURE.read_bytes()
        with patch.dict(os.environ, {"AGENTSCOPE_FILE_KEY": "ocr-test-key"}):
            with TestClient(app) as client:
                self.assertEqual(client.post("/recognize", content=data).status_code, 401)
                signature = hmac.new(b"ocr-test-key", b"ocr-v1:" + data, hashlib.sha256).hexdigest()
                result = client.post("/recognize", content=data, headers={"X-OCR-Signature": signature})
                self.assertEqual(result.status_code, 200)
                self.assert_invoice(result.json()["text"])

    async def test_backend_uses_private_binding(self):
        def forward(url, *, content, headers, timeout):
            with TestClient(app) as client:
                result = client.post("/recognize", content=content, headers=headers)
                return httpx.Response(result.status_code, json=result.json(), request=httpx.Request("POST", url))

        with patch.dict(os.environ, {"AGENTSCOPE_OCR_URL": "https://ocr.internal", "AGENTSCOPE_FILE_KEY": "ocr-test-key"}):
            with patch("httpx.post", side_effect=forward):
                with Image.open(FIXTURE) as picture:
                    self.assert_invoice(processing.ocr(picture))


if __name__ == "__main__":
    unittest.main()
