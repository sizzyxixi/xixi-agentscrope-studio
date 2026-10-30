"""Package a generated, borderless 2x2 keyframe sheet as a looping WebP.

The original generated sheet is preserved. This only splits the grid, resizes
the frames for delivery and encodes a loop with eased transitions.
"""
import argparse
import math
from pathlib import Path
import shutil

from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument("key", choices=["product", "sales", "replica", "editing", "translation"])
parser.add_argument("source", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
destination = root / "public/creative/video-previews"
sources = root / "output/generated-assets/video-previews"
destination.mkdir(parents=True, exist_ok=True)
sources.mkdir(parents=True, exist_ok=True)
target = destination / f"{args.key}-v1.webp"
if target.exists():
    raise SystemExit(f"Refusing to overwrite {target}; use a new asset version.")
shutil.copy2(args.source, sources / f"{args.key}-keyframes-v1.png")
sheet = Image.open(args.source).convert("RGB")
width, height = sheet.size
frames = [
    sheet.crop((col * width // 2, row * height // 2,
                (col + 1) * width // 2, (row + 1) * height // 2))
    .resize((640, 360), Image.Resampling.LANCZOS)
    for row in range(2) for col in range(2)
]
frames[0].save(destination / f"{args.key}-poster-v1.jpg", quality=86, optimize=True)
loop = []
for index, frame in enumerate(frames):
    following = frames[(index + 1) % len(frames)]
    for tick in range(12):
        # Brief keyframe hold, followed by an eased transition to the next pose.
        progress = max(0.0, min(1.0, (tick - 3) / 8))
        eased = (1 - math.cos(progress * math.pi)) / 2
        loop.append(Image.blend(frame, following, eased))
temporary = destination / f".{args.key}-encoding-v1.webp"
loop[0].save(temporary, save_all=True, append_images=loop[1:], duration=100,
             loop=0, quality=76, method=6, minimize_size=True, allow_mixed=True)
temporary.replace(target)
with Image.open(target) as result:
    assert result.is_animated and result.n_frames > 1
    assert result.size == (640, 360)
    assert result.info.get("loop") == 0
    result.seek(0)
    first = result.convert("RGB")
    result.seek(result.n_frames // 2)
    assert ImageChops.difference(first, result.convert("RGB")).getbbox()
    print(f"{target.name}: {result.n_frames} frames, {target.stat().st_size // 1024} KiB")
