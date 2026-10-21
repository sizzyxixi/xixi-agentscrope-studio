"""Exercise bundled models with real raster text, including an image-only PDF."""

import tempfile
import unittest
from pathlib import Path

import pymupdf
from PIL import Image

from service import file_processing as processing


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
            engine = processing._ocr_engine
            self.assert_invoice(processing.ocr(picture))
            self.assertIs(processing._ocr_engine, engine)


if __name__ == "__main__":
    unittest.main()
