"""Bundled Chinese/English OCR with bounded CPU inference."""

import threading

_ocr_engine = None
_ocr_lock = threading.Lock()


def recognize(image):
    """Reuse bundled CPU models; serialize inference to bound serverless memory."""
    global _ocr_engine
    try:
        from PIL import Image, ImageOps
        from rapidocr_onnxruntime import RapidOCR
    except (ImportError, OSError) as e:
        raise ValueError("OCR 引擎加载失败，请检查服务端 OCR 依赖是否完整。") from e

    picture = ImageOps.exif_transpose(image)
    if picture.mode in {"RGBA", "LA"} or "transparency" in picture.info:
        rgba = picture.convert("RGBA")
        picture = Image.new("RGB", rgba.size, "white")
        picture.paste(rgba, mask=rgba.getchannel("A"))
    else:
        picture = picture.convert("RGB")
    picture.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
    with _ocr_lock:
        if _ocr_engine is None:
            _ocr_engine = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
        # PIL input lets RapidOCR perform the correct RGB -> BGR conversion.
        results, _ = _ocr_engine(picture)
        return "\n".join(
            item[1] + (" [识别不确定]" if float(item[2]) < 0.75 else "")
            for item in (results or [])
        )

